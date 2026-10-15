// Clipboard formats for copying out of the Sentence Flow / Text Flow tabs.
// Indentation in a flow is a margin (Ctrl+M) plus tab markers that the
// layout pass resizes onto a fixed grid - neither survives the browser's
// own copy - so a copy is put on the clipboard in several forms, each read
// by a different paste target:
// - FLOW_CLIPBOARD_TYPE: the lines themselves, for pasting back into a flow
//   (any .da file) exactly as they were.
// - text/html: for Word and other rich-text apps. Paragraph indent becomes
//   a left margin, tabs become real tabs, and the paragraph gets tab stops
//   on the same grid, so columns line up as they did in the flow.
// - text/plain: one tab character per tab and per indent step.
// - Markdown (flowLinesToMarkdown): used by main.ts when pasting into an
//   Obsidian note, where tabs would turn a line into a code block.

// A single run of text in a flow line, or a tab marker that the layout pass
// (layoutNotesTabs) resizes to land on the next tab stop.
export type NotesSegment =
	| { kind: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean }
	| { kind: "tab" };

export interface NotesLine {
	indent: number; // px, snapped to a tab-width multiple by indentNotesParagraph
	segments: NotesSegment[];
}

export interface FlowClipboard {
	lines: NotesLine[];
	tabWidth: number; // px; the source flow's default tab width
}

export const FLOW_CLIPBOARD_TYPE = "application/x-da-flow";

export function segmentsLength(segments: NotesSegment[]): number {
	return segments.reduce((n, s) => n + (s.kind === "tab" ? 1 : s.text.length), 0);
}

// The part of a line between two character offsets (a tab counts as one).
export function sliceSegments(segments: NotesSegment[], from: number, to: number): NotesSegment[] {
	const out: NotesSegment[] = [];
	let pos = 0;
	for (const s of segments) {
		const len = s.kind === "tab" ? 1 : s.text.length;
		const a = Math.max(from, pos);
		const b = Math.min(to, pos + len);
		if (a < b) out.push(s.kind === "tab" ? { kind: "tab" } : { ...s, text: s.text.slice(a - pos, b - pos) });
		pos += len;
	}
	return out;
}

export function parseFlowClipboard(data: DataTransfer | null): FlowClipboard | null {
	const raw = data?.getData(FLOW_CLIPBOARD_TYPE);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as FlowClipboard;
		return Array.isArray(parsed.lines) && parsed.tabWidth > 0 ? parsed : null;
	} catch {
		return null;
	}
}

const indentTabs = (line: NotesLine, tabWidth: number) => Math.round(line.indent / tabWidth);
const visibleText = (text: string) => text.replace(/​/g, "");

export function flowLinesToPlain(lines: NotesLine[], tabWidth: number): string {
	return lines.map(line => "\t".repeat(indentTabs(line, tabWidth))
		+ line.segments.map(s => s.kind === "tab" ? "\t" : visibleText(s.text)).join("")).join("\n");
}

const escapeHtml = (text: string) => text
	.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function flowLinesToHtml(lines: NotesLine[], tabWidth: number, font: { family: string; sizePx: number }, rtl: boolean): string {
	const pt = (px: number) => `${(px * 0.75).toFixed(1)}pt`;
	// Word's paragraph tab stops (`tab-stops`), on the flow's grid out to
	// about 7.5" - past the last one Word falls back to its own default stops.
	const stops: string[] = [];
	for (let x = tabWidth; x <= 720 && stops.length < 60; x += tabWidth) stops.push(pt(x));
	const side = rtl ? "right" : "left";
	const fontCss = `font-family:${escapeHtml(font.family)};font-size:${pt(font.sizePx)}`;

	const body = lines.map(line => {
		const style = `margin:0;margin-${side}:${pt(indentTabs(line, tabWidth) * tabWidth)};tab-stops:${stops.join(" ")};white-space:pre-wrap;${fontCss}`;
		const content = line.segments.map(s => {
			// mso-tab-count is what Word reads; the tab character itself is
			// for everything else.
			if (s.kind === "tab") return `<span style="mso-tab-count:1;white-space:pre">\t</span>`;
			let html = escapeHtml(visibleText(s.text));
			if (s.underline) html = `<u>${html}</u>`;
			if (s.italic) html = `<i>${html}</i>`;
			if (s.bold) html = `<b>${html}</b>`;
			return html;
		}).join("");
		return `<p dir="${rtl ? "rtl" : "ltr"}" style="${style}">${content || "&nbsp;"}</p>`;
	}).join("");
	return `<html><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`;
}

// Markdown can't express tab stops, and a leading tab or four spaces makes a
// line a code block, so indentation and tabs become em/en spaces (which
// Markdown leaves alone) adding up to the tab width at Obsidian's default
// 16px text. Mid-line tabs therefore indent rather than align to a column.
export function flowLinesToMarkdown(lines: NotesLine[], tabWidth: number): string {
	const halfEms = Math.max(1, Math.round(tabWidth / 8));
	const tab = " ".repeat(Math.floor(halfEms / 2)) + " ".repeat(halfEms % 2);
	const escape = (text: string) => text.replace(/[\\`*_[\]<>#|~=$]/g, "\\$&");

	return lines.map(line => {
		let md = tab.repeat(indentTabs(line, tabWidth));
		for (const s of line.segments) {
			if (s.kind === "tab") { md += tab; continue; }
			const text = visibleText(s.text);
			// Markers have to hug the text: "** word**" isn't bold.
			const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
			if (!m[2]) { md += text; continue; }
			const open = (s.bold ? "**" : "") + (s.italic ? "*" : "") + (s.underline ? "<u>" : "");
			const close = (s.underline ? "</u>" : "") + (s.italic ? "*" : "") + (s.bold ? "**" : "");
			md += m[1] + open + escape(m[2]) + close + m[3];
		}
		return md;
	}).join("\n");
}
