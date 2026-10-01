import { addIcon, App, Modal, Scope, TextFileView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import html2canvas from "html2canvas";
import { TEXT_FLOW_INSTRUCTIONS, TextFlowBlock } from "./textFlowInstructions";

export const VIEW_TYPE_DA = "da-tool-view";

// The ribbon icon and the .da file tab both show this - a bolded "∴"
// ("therefore"), matching the logical-relationship notation the tool itself
// uses (see RELATIONSHIP_GROUPS below, where "∴" is the Inference abbreviation).
// Obsidian's addIcon wraps whatever's passed in a 0 0 100 100 viewBox <svg>,
// so the text is centered/sized against that box.
export const DA_TOOL_ICON = "da-tool-therefore";
addIcon(DA_TOOL_ICON, `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="82" font-weight="bold" fill="currentColor">∴</text>`);

// Obsidian runs in Electron, where the blocking native window.confirm()
// dialog can leave the workspace's keyboard focus broken afterward (typing
// stops working anywhere in the app until it's reloaded). Use this instead
// of confirm() for anything destructive.
class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });
		const buttonRow = contentEl.createDiv({ attr: { style: "display:flex; justify-content:flex-end; gap:8px; margin-top:12px;" } });

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = buttonRow.createEl("button", { text: "Confirm", cls: "mod-warning" });
		confirmBtn.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// Like ConfirmModal but with several named choices (plus Cancel); the
// first choice is styled as the warning/primary action.
class ChoiceModal extends Modal {
	constructor(app: App, private message: string, private choices: { label: string; onChoose: () => void }[]) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });
		const buttonRow = contentEl.createDiv({ attr: { style: "display:flex; justify-content:flex-end; gap:8px; margin-top:12px;" } });

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		this.choices.forEach((choice, i) => {
			const btn = buttonRow.createEl("button", { text: choice.label, cls: i === 0 ? "mod-warning" : "" });
			btn.addEventListener("click", () => {
				this.close();
				choice.onChoose();
			});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// Every color token the view's stylesheet exposes as a CSS custom property
// (see styles.css: the standard, .da-theme-adopt and .da-scheme-* token blocks). The
// settings tab (main.ts) renders one color picker per entry here so every
// color can be overridden manually, regardless of the chosen colour theme.
export interface ColorToken {
	id: string;
	cssVar: string;
	label: string;
	desc: string;
}

export const COLOR_TOKENS: ColorToken[] = [
	{ id: "bg", cssVar: "--da-bg", label: "Page background", desc: "Main canvas/workspace background." },
	{ id: "surface", cssVar: "--da-surface", label: "Panel background", desc: "Header, sidebars, modals, and buttons." },
	{ id: "rowBg", cssVar: "--da-row-bg", label: "Row background", desc: "Proposition rows in the sidebar list and unlabeled bracket nodes." },
	{ id: "text", cssVar: "--da-text", label: "Primary text", desc: "Main text and button labels." },
	{ id: "muted", cssVar: "--da-muted", label: "Muted text", desc: "Secondary labels and bracket lines." },
	{ id: "faint", cssVar: "--da-faint", label: "Faint text", desc: "Row numbers and least-prominent text." },
	{ id: "border", cssVar: "--da-border", label: "Border (light)", desc: "Subtle dividers and panel borders." },
	{ id: "borderStrong", cssVar: "--da-border-strong", label: "Border (strong)", desc: "Input borders and default button borders." },
	{ id: "accent", cssVar: "--da-accent", label: "Accent", desc: "Primary buttons, selection, and highlighted bracket lines." },
	{ id: "accentHover", cssVar: "--da-accent-hover", label: "Accent (hover)", desc: "Primary buttons on hover." },
	{ id: "accentSoftBg", cssVar: "--da-accent-soft-bg", label: "Accent (soft background)", desc: "Selected proposition/row background." },
	{ id: "onAccent", cssVar: "--da-on-accent", label: "Text on accent", desc: "Text drawn on top of accent-colored buttons." },
	{ id: "secondary", cssVar: "--da-secondary", label: "Secondary button", desc: "The single-node bracket / secondary action color." },
	{ id: "secondaryHover", cssVar: "--da-secondary-hover", label: "Secondary button (hover)", desc: "" },
	{ id: "success", cssVar: "--da-success", label: "Success", desc: "Support button and RTL switch (on state)." },
	{ id: "successHover", cssVar: "--da-success-hover", label: "Success (hover)", desc: "" },
	{ id: "warnBg", cssVar: "--da-warn-bg", label: "Warning background", desc: "Clear All Brackets button." },
	{ id: "warnHover", cssVar: "--da-warn-hover", label: "Warning (hover)", desc: "" },
	{ id: "danger", cssVar: "--da-danger", label: "Danger", desc: "Delete icons and Clear All link." },
	{ id: "dangerHover", cssVar: "--da-danger-hover", label: "Danger (hover)", desc: "" },
	{ id: "dangerBg", cssVar: "--da-danger-bg", label: "Danger background", desc: "Reset Everything button." },
	{ id: "mainPoint", cssVar: "--da-main-point", label: "Main point", desc: "Border of a label box double-clicked to mark it as the main point." },
	{ id: "mainPointSoftBg", cssVar: "--da-main-point-soft-bg", label: "Main point (soft background)", desc: "Fill of a label box marked as the main point." },
];

// The header dropdown / settings choices. "standard" is the tool's own
// palette, "obsidian" adopts the active Obsidian theme (.da-theme-adopt),
// and the rest are the BibleSearch colour schemes (.da-scheme-<id> in
// styles.css), whose light/dark variant follows Obsidian's own mode.
export const COLOR_THEMES: { id: string; label: string }[] = [
	{ id: "standard", label: "Standard" },
	{ id: "obsidian", label: "Theme" },
	{ id: "blue", label: "Blue" },
	{ id: "yellow", label: "Yellow" },
	{ id: "red", label: "Red" },
	{ id: "green", label: "Green" },
	{ id: "purple", label: "Purple" },
	{ id: "cream", label: "Cream" },
];

// The class(es) a view root needs for the given colour theme.
export function colorThemeClasses(theme: string): string[] {
	if (theme === "obsidian") return ["da-theme-adopt"];
	if (theme !== "standard" && COLOR_THEMES.some(t => t.id === theme)) return [`da-scheme-${theme}`];
	return [];
}

const ALL_COLOR_THEME_CLASSES = COLOR_THEMES.flatMap(t => colorThemeClasses(t.id));

export interface DAToolSettings {
	colorTheme: string;
	// Maps ColorToken.id -> a manual hex override. Absent/empty means "use the
	// standard or theme-adopted default for that token".
	colorOverrides: Record<string, string>;
	// The Brackets tab's left Propositions sidebar is collapsed away.
	sidebarHidden?: boolean;
	// Width (px, in the sidebar's own UI-scaled pixels) the Propositions
	// sidebar was last dragged to. Absent means the 288px default.
	sidebarWidth?: number;
	// Size multiplier for the tool's chrome (header, tab strip/toolbars,
	// Propositions sidebar, label editor, modals) - not the canvases, which
	// have their own zoom. One of UI_SCALE_STEPS.
	uiScale?: number;
}

export const UI_SCALE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];

export interface DAToolPluginHost {
	settings: DAToolSettings;
	saveSettings(): Promise<void>;
	refreshAllViews(): void;
}

interface Proposition {
	id: number;
	text: string;
	level: number;
	// The row label ("5a", "12c", ...) this proposition shows. Assigned by a
	// verse-numbered paste, by splitting/inserting next to a labeled row, or
	// by typing one in manually - see `verseLabelManual` for how those two
	// sources are kept from fighting each other. Undefined means "no label
	// assigned" - that row falls back to plain sequential numbering (see
	// computeRowLabels).
	verseLabel?: string;
	// True once a human has typed this row's label in directly. A manual
	// label is permanent: renumberVerseGroup skips it entirely, so nothing
	// auto-assigned ever overwrites it, no matter what else in its verse
	// group gets split or inserted later.
	verseLabelManual?: boolean;
	// Bold/italic/underline, as runs whose texts concatenate to exactly
	// `text` (carried over from Text Flow, or applied with Ctrl+B/I/U while
	// editing a row). `text` stays the plain source of truth: runs that no
	// longer match it (e.g. the file was edited in the web tool, which
	// doesn't know about them) are ignored - see propRuns.
	runs?: FormatRun[];
}

interface FormatRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
}

function sameFormat(a: FormatRun, b: FormatRun): boolean {
	return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline;
}

function propRuns(p: Proposition): FormatRun[] {
	if (p.runs && p.runs.map(r => r.text).join("") === p.text) return p.runs;
	return [{ text: p.text }];
}

// Coalesces adjacent same-format runs, drops empty ones, and returns
// undefined when nothing is formatted, so plain propositions don't carry a
// redundant runs array.
function tidyRuns(runs: FormatRun[]): FormatRun[] | undefined {
	const out: FormatRun[] = [];
	runs.forEach(r => {
		if (!r.text) return;
		const last = out[out.length - 1];
		if (last && sameFormat(last, r)) last.text += r.text;
		else out.push({ text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(r.underline ? { underline: true } : {}) });
	});
	return out.some(r => r.bold || r.italic || r.underline) ? out : undefined;
}

// Character range [start, end) of a run list, keeping formatting.
function sliceRuns(runs: FormatRun[], start: number, end: number): FormatRun[] {
	const out: FormatRun[] = [];
	let pos = 0;
	runs.forEach(r => {
		const s = Math.max(start, pos), e = Math.min(end, pos + r.text.length);
		if (s < e) out.push({ ...r, text: r.text.slice(s - pos, e - pos) });
		pos += r.text.length;
	});
	return out;
}

// Trims whitespace off both ends of a run list, returning the matching
// trimmed text alongside.
function trimRuns(runs: FormatRun[]): { text: string; runs: FormatRun[] } {
	const full = runs.map(r => r.text).join("");
	const start = full.length - full.trimStart().length;
	const end = full.trimEnd().length;
	return { text: full.slice(start, Math.max(start, end)), runs: sliceRuns(runs, start, end) };
}

// Re-applies a source line's per-character formatting to text derived from
// it (whitespace collapsed, verse numbers stripped or superscripted, ...):
// each output character takes the format of the next matching source
// character, or - for characters with no source counterpart, like a
// superscript made from "23" - the format of where the scan currently is.
function projectFormatting(source: FormatRun[], target: string): FormatRun[] {
	const chars: { ch: string; fmt: FormatRun }[] = [];
	source.forEach(r => { for (const ch of r.text) chars.push({ ch, fmt: r }); });
	const out: FormatRun[] = [];
	let j = 0;
	for (const ch of target) {
		let k = j;
		while (k < chars.length && k < j + 12 && chars[k].ch !== ch) k++;
		let fmt: FormatRun | undefined;
		if (k < chars.length && chars[k].ch === ch) { fmt = chars[k].fmt; j = k + 1; }
		else fmt = chars[Math.min(j, chars.length - 1)]?.fmt;
		out.push({ text: ch, bold: fmt?.bold, italic: fmt?.italic, underline: fmt?.underline });
	}
	return out;
}

// Fills a proposition text element with its runs as <b>/<i>/<u> nodes
// (same nesting as the flow canvases' renderNotesTab).
function renderRunsInto(el: HTMLElement, runs: FormatRun[]): void {
	el.empty();
	runs.forEach(r => {
		let node: Node = document.createTextNode(r.text);
		if (r.underline) { const u = document.createElement("u"); u.appendChild(node); node = u; }
		if (r.italic) { const i = document.createElement("i"); i.appendChild(node); node = i; }
		if (r.bold) { const b = document.createElement("b"); b.appendChild(node); node = b; }
		el.appendChild(node);
	});
}

// Reads an edited proposition element back into trimmed text + runs. Also
// honors inline font-weight/style/decoration, which Chromium's execCommand
// can leave behind when un-formatting part of a run.
function readRunsFrom(el: HTMLElement): { text: string; runs: FormatRun[] } {
	const runs: FormatRun[] = [];
	const walk = (node: ChildNode, bold: boolean, italic: boolean, underline: boolean) => {
		if (node.nodeType === Node.TEXT_NODE) {
			runs.push({ text: (node.textContent || "").replace(/\n/g, " "), bold, italic, underline });
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const e = node as HTMLElement;
		if (e.tagName === "BR") { runs.push({ text: " " }); return; }
		if (e.tagName === "DIV" && runs.length) runs.push({ text: " " }); // an Enter-created line
		let b = bold || e.tagName === "B" || e.tagName === "STRONG";
		let i = italic || e.tagName === "I" || e.tagName === "EM";
		let u = underline || e.tagName === "U";
		const fw = e.style.fontWeight;
		if (fw) b = fw === "bold" || fw === "bolder" || parseInt(fw, 10) >= 600;
		if (e.style.fontStyle) i = e.style.fontStyle === "italic";
		const td = e.style.textDecorationLine || e.style.textDecoration;
		if (td) u = td.includes("underline");
		Array.from(e.childNodes).forEach(c => walk(c, b, i, u));
	};
	Array.from(el.childNodes).forEach(n => walk(n, false, false, false));
	return trimRuns(runs);
}

function nextVerseLetter(letterIdx: number): string {
	return letterIdx < 26
		? String.fromCharCode(97 + letterIdx)
		: String.fromCharCode(97 + Math.floor(letterIdx / 26) - 1) + String.fromCharCode(97 + (letterIdx % 26));
}

// Splits a label into its verse-group identity (`base`) and trailing letters,
// e.g. "5b" -> { base: "5", letters: "b" }. A label with no trailing letters
// (a bare manual label like "5", or arbitrary text like "Intro") is its own
// base with no letters.
function splitVerseLabel(label: string): { base: string; letters: string } {
	const m = label.match(/^(.*?)([a-z]+)$/);
	return m ? { base: m[1], letters: m[2] } : { base: label, letters: "" };
}

// Re-letters every non-manual label sharing `base`, in row order, so they
// always read a, b, c, ... top to bottom - regardless of what order their
// propositions were split or inserted in. This is the fix for splitting
// "5a" twice in different orders (tail first, then what's left of the head)
// each independently proposing "5b" and colliding: instead of guessing a
// sibling's letter from where it came from, every creation event just drops
// a placeholder into the group and calls this to make the whole group
// consistent again. Manually-typed labels (verseLabelManual) are left
// completely alone, including their letter being reserved so an auto label
// never lands on top of them.
function renumberVerseGroup(props: Proposition[], base: string): void {
	const reserved = new Set(
		props
			.filter(p => p.verseLabelManual && p.verseLabel !== undefined && splitVerseLabel(p.verseLabel).base === base)
			.map(p => p.verseLabel as string)
	);
	let letterIdx = -1;
	props.forEach(p => {
		if (p.verseLabelManual || p.verseLabel === undefined) return;
		if (splitVerseLabel(p.verseLabel).base !== base) return;
		let candidate: string;
		do {
			candidate = `${base}${nextVerseLetter(++letterIdx)}`;
		} while (reserved.has(candidate));
		p.verseLabel = candidate;
	});
}

// Row numbers/labels are always read straight off the proposition, with the
// only computed fallback being plain 1-based position for rows that never
// got a label (see the `verseLabel` field comment for why nothing here is
// recomputed from adjacency).
function computeRowLabels(props: Proposition[]): string[] {
	return props.map((p, i) => p.verseLabel ?? String(i + 1));
}

// ---------- passage-paste verse detection ----------
//
// splitIntoPropositions used to only recognize one paste shape: a bare
// "6 text..." prefix per line. Real copies out of Bible software carry verse
// numbers in several other shapes - superscripted, embedded mid-sentence, or
// with a "Rom 3:21" prefix instead of a bare number - and the reference
// itself often rides along as a header/trailer line or a "(Rom 3:21-26)"
// citation that would otherwise get imported as a bogus extra proposition.
// This section detects all of those and reduces them to one canonical shape,
// a "[ref] text" marker in front of each verse, which splitIntoPropositions
// then walks exactly as it always has (splitting each verse's text into
// sentences and lettering them within that verse group).
//
// Detection escalates through strategies exactly like a human eye would,
// each firing only when it can prove the numbers it found are really verses
// (a book name that resolves in BOOK_NAMES, or a consecutive numeric run)
// rather than list numbering, clock times, or footnote markers - so
// non-passage text (sermon notes, arbitrary paragraphs) safely falls through
// to "no verse info detected" and behaves exactly as before.

const BOOK_NAMES: Record<string, string> = {
	gen: "Genesis", genesis: "Genesis",
	exod: "Exodus", exodus: "Exodus", ex: "Exodus",
	lev: "Leviticus", leviticus: "Leviticus",
	num: "Numbers", numbers: "Numbers",
	deut: "Deuteronomy", deuteronomy: "Deuteronomy", dt: "Deuteronomy",
	josh: "Joshua", joshua: "Joshua",
	judg: "Judges", judges: "Judges",
	ruth: "Ruth",
	"1sam": "1 Samuel", "1samuel": "1 Samuel",
	"2sam": "2 Samuel", "2samuel": "2 Samuel",
	"1kgs": "1 Kings", "1kings": "1 Kings",
	"2kgs": "2 Kings", "2kings": "2 Kings",
	"1chr": "1 Chronicles", "1chron": "1 Chronicles", "1chronicles": "1 Chronicles",
	"2chr": "2 Chronicles", "2chron": "2 Chronicles", "2chronicles": "2 Chronicles",
	ezra: "Ezra",
	neh: "Nehemiah", nehemiah: "Nehemiah",
	esth: "Esther", esther: "Esther", est: "Esther",
	job: "Job",
	ps: "Psalm", psa: "Psalm", psalm: "Psalm", psalms: "Psalm", pss: "Psalm",
	prov: "Proverbs", proverbs: "Proverbs",
	eccl: "Ecclesiastes", ecc: "Ecclesiastes", ecclesiastes: "Ecclesiastes",
	song: "Song of Solomon", songofsolomon: "Song of Solomon", songofsongs: "Song of Solomon", sos: "Song of Solomon",
	isa: "Isaiah", isaiah: "Isaiah",
	jer: "Jeremiah", jeremiah: "Jeremiah",
	lam: "Lamentations", lamentations: "Lamentations",
	ezek: "Ezekiel", ezekiel: "Ezekiel",
	dan: "Daniel", daniel: "Daniel",
	hos: "Hosea", hosea: "Hosea",
	joel: "Joel",
	amos: "Amos",
	obad: "Obadiah", obadiah: "Obadiah",
	jonah: "Jonah",
	mic: "Micah", micah: "Micah",
	nah: "Nahum", nahum: "Nahum",
	hab: "Habakkuk", habakkuk: "Habakkuk",
	zeph: "Zephaniah", zephaniah: "Zephaniah",
	hag: "Haggai", haggai: "Haggai",
	zech: "Zechariah", zechariah: "Zechariah",
	mal: "Malachi", malachi: "Malachi",
	matt: "Matthew", matthew: "Matthew", mt: "Matthew",
	mark: "Mark", mk: "Mark", mr: "Mark",
	luke: "Luke", lk: "Luke",
	john: "John", jn: "John", jhn: "John",
	acts: "Acts", ac: "Acts",
	rom: "Romans", romans: "Romans", ro: "Romans",
	"1cor": "1 Corinthians", "1corinthians": "1 Corinthians",
	"2cor": "2 Corinthians", "2corinthians": "2 Corinthians",
	gal: "Galatians", galatians: "Galatians",
	eph: "Ephesians", ephesians: "Ephesians",
	phil: "Philippians", php: "Philippians", philippians: "Philippians",
	col: "Colossians", colossians: "Colossians",
	"1thess": "1 Thessalonians", "1thessalonians": "1 Thessalonians",
	"2thess": "2 Thessalonians", "2thessalonians": "2 Thessalonians",
	"1tim": "1 Timothy", "1timothy": "1 Timothy",
	"2tim": "2 Timothy", "2timothy": "2 Timothy",
	titus: "Titus", tit: "Titus",
	phlm: "Philemon", philemon: "Philemon",
	heb: "Hebrews", hebrews: "Hebrews",
	jas: "James", james: "James",
	"1pet": "1 Peter", "1peter": "1 Peter",
	"2pet": "2 Peter", "2peter": "2 Peter",
	"1jn": "1 John", "1john": "1 John",
	"2jn": "2 John", "2john": "2 John",
	"3jn": "3 John", "3john": "3 John",
	jude: "Jude",
	rev: "Revelation", revelation: "Revelation", re: "Revelation",
};

// Superscript digits/letters paste from Logos/Accordance where the on-screen
// verse number was superscripted. A digit run only counts as a verse number
// in verse position - at the start of text or after a space/opening quote,
// with the verse's text following ("²¹But now"). Superscript letters are
// footnote/cross-reference markers and are always stripped.
const SUPERSCRIPT_DIGITS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
// No lookbehind (unsupported on iOS < 16.4): the boundary char is captured in
// group 1 instead and re-emitted by the replace callback below.
const SUPERSCRIPT_VERSE_RUN = /(^|[\s"'“‘(])([⁰¹²³⁴-⁹]+)(?=\s?["'“‘(]?\p{L})/gu;
const SUPERSCRIPT_DIGIT_RUN = /[⁰¹²³⁴-⁹]+/g;
const SUPERSCRIPT_LETTERS = /[ʰ-ʸᵃ-ᵪᶜ-ᶿⁱⁿ]+/g;

// Clean pasted text and convert unambiguous verse signals into [n] markers so
// every detection path funnels into the one marker-splitting routine below.
function normalizePaste(raw: string): string {
	return String(raw)
		.replace(/[​‌‍﻿]/g, "") // zero-width chars / BOM
		.replace(/\r\n?/g, "\n")
		.replace(/ /g, " ")
		.replace(/¶/g, " ") // pilcrows (Accordance paragraph marks)
		.replace(SUPERSCRIPT_LETTERS, "")
		// Single [a]-style footnote letters only - two-letter brackets are
		// KJV/NKJV italic supplied words like "[is]" and must survive.
		.replace(/\[[a-z]\]/g, "")
		.replace(SUPERSCRIPT_VERSE_RUN, (_m, pre: string, run: string) => `${pre}[${run.split("").map(c => SUPERSCRIPT_DIGITS[c] ?? "").join("")}] `)
		.replace(SUPERSCRIPT_DIGIT_RUN, "") // remaining runs are footnote numbers
		.replace(/[^\S\n　]+/g, " "); // collapse whitespace, keep U+3000 (CJK reverence space) intact
}

interface ParsedRef {
	bookKey: string;
	bookName: string;
	chapter: number;
	startVerse: number | null;
	endVerse: number | null;
	refString: string;
}

// Parse one candidate reference string ("Rom 3:21-26", "1 Cor. 13", with an
// optional translation tag like "ESV" tacked on). Returns null unless the
// book resolves in BOOK_NAMES - that table lookup is the false-positive gate
// that keeps "Meeting notes 3:21" from being read as a reference.
function parseReferenceText(text: string): ParsedRef | null {
	const cleaned = String(text)
		.replace(/[‐‑‒–—―−]/g, "-") // dashes → hyphen
		// Trailing translation tag ("ESV", "(NASB 2020)"), only after digits
		// exist; the optional second token covers edition years.
		.replace(/[,;]?\s*\(?[A-Z][A-Za-z0-9]{1,7}(?:\s+[A-Z0-9]{2,8})?\)?\s*$/, (tag, offset: number, s: string) => (/\d/.test(s.slice(0, offset)) ? "" : tag))
		.trim();
	const m = cleaned.match(/^([1-3]?\s*[A-Za-z][A-Za-z.\s]*?)\s*(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
	if (!m) return null;

	const bookKey = m[1].trim().toLowerCase().replace(/[.\s]+/g, "");
	if (!(bookKey in BOOK_NAMES)) return null;

	const bookName = BOOK_NAMES[bookKey];
	const chapter = parseInt(m[2], 10);
	const startVerse = m[3] ? parseInt(m[3], 10) : null;
	const endVerse = m[4] ? parseInt(m[4], 10) : startVerse;

	let refString = `${bookName} ${chapter}`;
	if (startVerse) refString += `:${startVerse}` + (endVerse !== startVerse ? `-${endVerse}` : "");
	return { bookKey, bookName, chapter, startVerse, endVerse, refString };
}

// Pull a reference out of a header line ("Romans 3:21-26" on its own line
// before the text), an own-line trailing citation ("Romans 3:21-22 (ESV)" as
// the last line), or a parenthesized trailing citation ("…more. (Rom
// 3:21-26)"). All three are consumed from the body even when more than one is
// present; the header wins as the ref. Returns { ref, body } where body is
// the text with the references consumed - otherwise they'd get imported as
// bogus extra propositions.
function extractReference(text: string): { ref: ParsedRef | null; body: string } {
	let ref: ParsedRef | null = null;
	let body = text;

	const newline = body.indexOf("\n");
	if (newline !== -1) {
		const headerRef = parseReferenceText(body.slice(0, newline));
		if (headerRef && body.slice(newline + 1).trim()) {
			ref = headerRef;
			body = body.slice(newline + 1);
		}
	}

	const lastBreak = body.lastIndexOf("\n");
	if (lastBreak !== -1) {
		const lastLineRef = parseReferenceText(body.slice(lastBreak + 1));
		if (lastLineRef && body.slice(0, lastBreak).trim()) {
			ref = ref || lastLineRef;
			body = body.slice(0, lastBreak);
		}
	}

	const trailer = body.match(/\(([^()\n]{2,60})\)\s*$/);
	if (trailer) {
		const trailerRef = parseReferenceText(trailer[1]);
		if (trailerRef && body.slice(0, trailer.index).trim()) {
			ref = ref || trailerRef;
			body = body.slice(0, trailer.index);
		}
	}

	return { ref, body };
}

// One verse's worth of text after marker-splitting, with its detected ref
// ("21", or "3:21" when the passage spans a chapter boundary) - or ref
// undefined for text no detection stage could anchor to a verse.
interface MarkedVerse {
	ref: string | undefined;
	text: string;
}

// The single splitting routine: one chunk per [n]/[n:m] marker. Text before
// the first marker (or the whole body, when no marker fired at all) comes
// back as one ref-less chunk.
function splitOnMarkers(text: string): MarkedVerse[] {
	const parts = text.split(/(?=\[\d+(?::\d+)?\])/);
	const chunks: MarkedVerse[] = [];
	for (const part of parts) {
		const m = part.match(/^\[(\d+)(?::(\d+))?\]\s*(.*)$/s);
		if (m) {
			const ref = m[2] ? `${m[1]}:${m[2]}` : m[1];
			const content = m[3].trim();
			if (content) chunks.push({ ref, text: content });
		} else if (part.trim()) {
			chunks.push({ ref: undefined, text: part.trim() });
		}
	}
	return chunks;
}

interface LineCandidate {
	bookKey?: string;
	chapter?: number;
	verse?: number;
	text: string;
	explicit?: boolean;
}

// Line mode: each verse on its own line, prefixed with "Rom 3:21", "3:21", or
// a bare number ("21 But now…" - Logos CBV one-verse-per-line style).
// Book-prefixed lines are self-evidently verse references (the book-table
// lookup is the gate); bare numbers and bare "c:v" prefixes prove nothing
// alone (list numbering, schedule times), so they must form a coherent run of
// at least two lines - each continuing the chapter (verse + 1) or opening the
// next chapter at verse 1. A single bare-number line falls through to flow
// mode, which can tell one verse from a paragraph with more verse numbers
// embedded in it. Returns { marked, derivedRef } or null. keepLeading keeps
// the lines before the first verse line instead of dropping them (Text Flow
// conversion, where every line is a proposition the user wrote).
function detectVerseLines(body: string, keepLeading = false): { marked: string; derivedRef?: string } | null {
	const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
	if (!lines.length) return null;

	const parsed: LineCandidate[] = lines.map((line) => {
		let m = line.match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]*?)\s+(\d{1,3}):(\d{1,3})\s+(\S.*)$/s);
		if (m) {
			const bookKey = m[1].trim().toLowerCase().replace(/[.\s]+/g, "");
			if (bookKey in BOOK_NAMES) {
				return { bookKey, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10), text: m[4], explicit: true };
			}
		}
		m = line.match(/^(\d{1,3}):(\d{1,3})\s+(\S.*)$/s);
		if (m) return { chapter: parseInt(m[1], 10), verse: parseInt(m[2], 10), text: m[3], explicit: false };
		m = line.match(/^(\d{1,3})\s+(\S.*)$/s); // no "1." / "1)" - that's list numbering, not a verse
		if (m) return { verse: parseInt(m[1], 10), text: m[2], explicit: false };
		return { text: line };
	});

	const candidates = parsed.filter(p => p.verse !== undefined);
	if (!candidates.length) return null;
	if (candidates.some(c => (c.verse as number) < 1 || c.chapter === 0)) return null; // no verse/chapter zero

	if (!candidates.every(c => c.explicit)) {
		if (candidates.length < 2) return null;
		const coherent = candidates.every((c, i) => {
			if (i === 0) return true;
			const prev = candidates[i - 1];
			const sameChapter = c.chapter === undefined || prev.chapter === undefined || c.chapter === prev.chapter;
			if (sameChapter && c.verse === (prev.verse as number) + 1) return true;
			return c.chapter !== undefined && prev.chapter !== undefined && c.chapter === prev.chapter + 1 && c.verse === 1;
		});
		if (!coherent) return null;
	}

	const chapters = new Set(candidates.filter(c => c.chapter !== undefined).map(c => c.chapter));
	const multiChapter = chapters.size > 1;
	// Lines before the first verse line (pericope headings, "New
	// International Version") can't be verse content - drop them. Later
	// verse-less lines still join the previous verse.
	const firstVerseIdx = parsed.findIndex(p => p.verse !== undefined);
	const marked = parsed.slice(keepLeading ? 0 : firstVerseIdx).map((p) => {
		if (p.verse === undefined) return p.text; // continuation line — joins the previous verse
		const ref = multiChapter && p.chapter !== undefined ? `${p.chapter}:${p.verse}` : String(p.verse);
		return `[${ref}] ${p.text}`;
	}).join("\n");

	// Accordance's per-verse "Rom 3:21 …" prefixes carry the passage
	// reference even without a header/citation - reconstruct it from the
	// first book line.
	let derivedRef: string | undefined;
	const firstBook = parsed.find(p => p.bookKey);
	if (firstBook && !multiChapter && firstBook.bookKey) {
		const bookName = BOOK_NAMES[firstBook.bookKey] || firstBook.bookKey;
		const first = candidates[0].verse as number;
		const last = candidates[candidates.length - 1].verse as number;
		derivedRef = `${bookName} ${firstBook.chapter}:${first}` + (last !== first ? `-${last}` : "");
	}
	return { marked, derivedRef };
}

interface FlowAccept {
	start: number;
	end: number;
	delimStart: number;
	delim: string;
	chapter: number | null;
	verse: number;
}

// Flow mode: verse numbers embedded in running text ("…the Prophets— 22 the
// righteousness of God…"). A number bounded by whitespace and followed by a
// word only counts once a consecutive chain is established from the anchor -
// the detected reference's start verse, or, with no reference, a number at
// the very start of the text. "c:v" tokens are c:v-shaped like clock times
// and cross-references ("see 16:25"), so they only count when they
// corroborate the chain: the reference's own chapter as the anchor, or a
// restart at the next chapter's verse 1. Rejected numbers stay as ordinary
// text. Returns marked-up text or null.
//
// Ported without the regex /d (indices) flag - this plugin's TS target
// predates it - by capturing the leading delimiter in its own group instead
// of a lookbehind, so match/group offsets can be computed with plain
// .index + length arithmetic.
//
// keepLeading: see detectVerseLines.
function detectVerseFlow(body: string, expectedStart: number | null, expectedChapter: number | null, keepLeading = false): string | null {
	const tokenRegex = /(^|[\s"'“‘(])(\d{1,3})(?::(\d{1,3}))?(?=\s+["'“‘(]?\p{L})/gu;
	const OPENING_DELIMS = new Set(["\"", "'", "“", "‘", "("]);
	const accepted: FlowAccept[] = [];
	let expected = expectedStart;
	let currentChapter = expectedChapter;
	let multiChapter = false;
	let sawLeadingText = false;

	for (const m of body.matchAll(tokenRegex)) {
		const delim = m[1] ?? "";
		const delimStart = m.index as number;
		const numStart = delimStart + delim.length;
		const numEnd = delimStart + m[0].length;
		const chapter = m[3] ? parseInt(m[2], 10) : null;
		const verse = m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10);
		if (verse < 1 || chapter === 0) continue; // no verse/chapter zero

		if (!accepted.length) {
			sawLeadingText = body.slice(0, numStart).trim().length > 0;
			if (chapter !== null) {
				// A "c:v" anchor must corroborate the detected reference: its
				// own chapter, or - when leading text is the tail of an
				// unnumbered first verse - the next chapter starting over at
				// verse 1.
				const ownChapter = expectedChapter !== null && chapter === expectedChapter &&
					(expected === null || verse === expected || (sawLeadingText && verse === (expected as number) + 1));
				const nextChapter = expectedChapter !== null && sawLeadingText &&
					chapter === expectedChapter + 1 && verse === 1;
				if (!ownChapter && !nextChapter) continue;
			} else if (expected !== null) {
				// Anchor: must match the reference (allowing +1 when text
				// precedes it - a copy that starts mid-verse).
				if (verse !== expected && !(sawLeadingText && verse === expected + 1)) continue;
			} else if (sawLeadingText) {
				continue; // no reference to anchor on - only trust a number at the very start
			}
		} else if (chapter !== null) {
			// Mid-chain "c:v": the next chapter starting over at verse 1
			// (chapter boundaries in long copies) or a redundant prefix on
			// the expected verse - anything else ("see 16:25") is ordinary
			// text.
			const restart = (currentChapter === null || chapter === currentChapter + 1) && verse === 1;
			const redundant = (currentChapter === null || chapter === currentChapter) && verse === expected;
			if (!restart && !redundant) continue;
		} else if (verse !== expected) {
			continue; // not the next verse - an ordinary number in the text
		}
		if (chapter !== null) {
			if (currentChapter !== null && chapter !== currentChapter) multiChapter = true;
			currentChapter = chapter;
		}
		accepted.push({ start: numStart, end: numEnd, delimStart, delim, chapter: currentChapter, verse });
		expected = verse + 1;
	}

	const strongEnough = accepted.length >= 2 || (accepted.length === 1 && expectedStart !== null);
	if (!strongEnough) return null;

	let out = "";
	let pos = 0;
	let firstMarkerAt = 0;
	accepted.forEach((a, idx) => {
		const ref = multiChapter && a.chapter !== null ? `${a.chapter}:${a.verse}` : String(a.verse);
		// An opening quote/paren immediately before the number belongs to
		// the verse that follows it, not to the previous verse's text.
		const opensVerse = OPENING_DELIMS.has(a.delim);
		const cut = opensVerse ? a.delimStart : a.start;
		if (idx === 0) firstMarkerAt = out.length + (cut - pos);
		out += body.slice(pos, cut) + `[${ref}] ` + (opensVerse ? a.delim : "");
		pos = a.end;
		if (opensVerse && body[pos] === " ") pos += 1; // "“22 even" → "[22] “even"
	});
	out += body.slice(pos);

	if (sawLeadingText) {
		const a0 = accepted[0];
		const continuesRef = expectedStart !== null &&
			(a0.verse === expectedStart + 1 ||
				(a0.chapter !== null && expectedChapter !== null && a0.chapter === expectedChapter + 1 && a0.verse === 1));
		if (continuesRef) {
			// Text before the first number is the reference's own first verse.
			const headRef = multiChapter && expectedChapter !== null
				? `${expectedChapter}:${expectedStart}` : String(expectedStart);
			out = `[${headRef}] ${out}`;
		} else if (!keepLeading) {
			// Leading text at the reference's own start verse can't be verse
			// content (a pericope heading, "New International Version") -
			// drop it.
			out = out.slice(firstMarkerAt);
		}
	}
	return out;
}

// Parse pasted passage text into verse-marked chunks, escalating through
// detection strategies until one proves itself (see section comment above).
// Backward compatible with plain non-passage paste: 'none' detection returns
// the whole body as a single ref-less chunk, exactly like today's fallback.
function parsePastedText(raw: string): { chunks: MarkedVerse[]; passageRef?: string; detection: "markers" | "lines" | "flow" | "none" } {
	const normalized = normalizePaste(raw);
	const { ref, body } = extractReference(normalized);
	const passageRef = ref ? ref.refString : undefined;
	const expectedStart = ref?.startVerse ?? null;
	const expectedChapter = ref?.chapter ?? null;

	if (/\[\d+(?::\d+)?\]/.test(body)) {
		return { chunks: splitOnMarkers(deduceLeadingVerse(body, expectedStart)), passageRef, detection: "markers" };
	}

	// Line and flow modes keep text ahead of the first verse number so
	// deduceLeadingVerse can number it; whatever it can't number is dropped
	// as before (a pericope heading, "New International Version").
	const dropUnnumberedLead = (chunks: MarkedVerse[]) =>
		chunks.length > 1 && chunks[0].ref === undefined ? chunks.slice(1) : chunks;

	const lineResult = detectVerseLines(body, true);
	if (lineResult !== null) {
		const chunks = dropUnnumberedLead(splitOnMarkers(deduceLeadingVerse(lineResult.marked, expectedStart)));
		return { chunks, passageRef: passageRef || lineResult.derivedRef, detection: "lines" };
	}

	const flowMarked = detectVerseFlowAnchored(body, expectedStart, expectedChapter, true);
	if (flowMarked !== null) {
		return { chunks: dropUnnumberedLead(splitOnMarkers(deduceLeadingVerse(flowMarked, expectedStart))), passageRef, detection: "flow" };
	}

	const trimmed = body.trim();
	return { chunks: trimmed ? [{ ref: undefined, text: trimmed }] : [], passageRef, detection: "none" };
}

// When text precedes the first verse marker, it's the tail of the verse
// before that one: "…apart from the law, [22] the righteousness" → the lead
// is verse 21. Skipped when the first marker is a verse 1 (the previous
// verse is unknowable), or when a detected reference's start verse
// disagrees (then the lead is a heading, not verse text).
function deduceLeadingVerse(marked: string, expectedStart: number | null): string {
	if (/^\s*\[\d+(?::\d+)?\]/.test(marked)) return marked;
	const first = marked.match(/\[(\d+)(?::(\d+))?\]/);
	if (!first) return marked;
	const verse = parseInt(first[2] ?? first[1], 10) - 1;
	if (verse < 1) return marked;
	if (expectedStart !== null && verse !== expectedStart) return marked;
	const ref = first[2] ? `${first[1]}:${verse}` : String(verse);
	return `[${ref}] ${marked.trimStart()}`;
}

// detectVerseFlow only anchors on a number at the very start of the text
// when there's no reference to anchor on. When text comes first, retry
// with each later number as the anchor, accepting the first one that starts
// a consecutive chain of at least two verses (a lone number mid-text could
// be anything - "the 12 disciples").
function detectVerseFlowAnchored(body: string, expectedStart: number | null, expectedChapter: number | null, keepLeading = false): string | null {
	const direct = detectVerseFlow(body, expectedStart, expectedChapter, keepLeading);
	if (direct !== null || expectedStart !== null) return direct;
	const tried = new Set<number>();
	for (const m of body.matchAll(/(^|[\s"'“‘(])(\d{1,3})(?=\s+["'“‘(]?\p{L})/gu)) {
		const verse = parseInt(m[2], 10);
		if (verse < 1 || tried.has(verse)) continue;
		tried.add(verse);
		const result = detectVerseFlow(body, verse, null, keepLeading);
		if (result !== null && (result.match(/\[\d+(?::\d+)?\]/g) ?? []).length >= 2) return result;
	}
	return null;
}

// ---------- Text Flow -> Brackets conversion ----------

const SUPERSCRIPT_OUT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function toSuperscript(digits: string): string {
	return digits.replace(/\d/g, d => SUPERSCRIPT_OUT[parseInt(d, 10)]);
}

// Turns Text Flow lines (plain text plus the tab stop each line starts at)
// into propositions: one per line, never split into sentences. Levels are
// the line's tab stop compacted to its rank among the distinct stops in use,
// so a modifier tabbed far over to sit under the word it modifies is still
// just one level deeper than its head line. Verses run through the same
// detection stages as a passage paste (keepLeading, so no line is ever
// dropped), then are walked line by line: a line opening with a verse number
// starts that verse, a line without one continues the current verse, and a
// verse number mid-line stays in the text as a superscript (the line keeps
// the label of the verse it starts in; the next line continues the new one).
// Labels come back with a placeholder letter - the caller settles them with
// renumberVerseGroup. Each line's bold/italic/underline is carried onto its
// final text with projectFormatting.
function flowLinesToPropositions(lines: { runs: FormatRun[]; stop: number }[]): { text: string; level: number; verseLabel?: string; runs?: FormatRun[] }[] {
	let rows = lines
		.map(l => ({ text: normalizePaste(l.runs.map(r => r.text).join("")).replace(/\n/g, " ").trim(), stop: l.stop, runs: l.runs }))
		.filter(r => r.text);

	// A reference on its own first/last line, or a "(Rom 3:21-26)" trailer,
	// sets the starting verse and isn't imported as a proposition.
	let ref: ParsedRef | null = null;
	if (rows.length > 1) {
		const r = parseReferenceText(rows[0].text);
		if (r) { ref = r; rows = rows.slice(1); }
	}
	if (rows.length > 1) {
		const r = parseReferenceText(rows[rows.length - 1].text);
		if (r) { ref = ref || r; rows = rows.slice(0, -1); }
	}
	if (rows.length) {
		const last = rows[rows.length - 1];
		const m = last.text.match(/\(([^()\n]{2,60})\)\s*$/);
		const r = m ? parseReferenceText(m[1]) : null;
		if (m && r && last.text.slice(0, m.index).trim()) {
			ref = ref || r;
			last.text = last.text.slice(0, m.index).trim();
		}
	}
	if (!rows.length) return [];

	const body = rows.map(r => r.text).join("\n");
	let marked = body;
	if (!/\[\d+(?::\d+)?\]/.test(body)) {
		const lineResult = detectVerseLines(body, true);
		marked = lineResult ? lineResult.marked : (detectVerseFlowAnchored(body, ref?.startVerse ?? null, ref?.chapter ?? null, true) ?? body);
	}
	// Lines ahead of the first verse number are the verse before it; with
	// no numbers at all under a header (a one-verse passage), they're the
	// header's start verse.
	if (/\[\d+(?::\d+)?\]/.test(marked)) marked = deduceLeadingVerse(marked, ref?.startVerse ?? null);
	else if (ref?.startVerse) marked = `[${ref.startVerse}] ${marked}`;
	let markedLines = marked.split("\n");
	if (markedLines.length !== rows.length) markedLines = rows.map(r => r.text); // shouldn't happen; fall back to no verse info

	const LEAD_MARKER = /^\s*\[(\d+)(?::(\d+))?\]\s*/;

	let current: string | undefined;
	const out = markedLines.map((line, i) => {
		let text = line;
		const lead = text.match(LEAD_MARKER);
		if (lead) {
			current = lead[2] ? `${lead[1]}:${lead[2]}` : lead[1];
			text = text.slice(lead[0].length);
		}
		const label = current;
		text = text.replace(/(\s*)\[(\d+)(?::(\d+))?\]\s*/g, (_m, sp: string, a: string, b: string | undefined) => {
			current = b ? `${a}:${b}` : a;
			return (sp ? " " : "") + toSuperscript(b ?? a);
		});
		text = text.trim();
		return { text, stop: rows[i].stop, verseLabel: label !== undefined ? `${label}a` : undefined, runs: tidyRuns(projectFormatting(rows[i].runs, text)) };
	}).filter(p => p.text);

	const stops = Array.from(new Set(out.map(p => p.stop))).sort((a, b) => a - b);
	return out.map(p => ({ text: p.text, level: stops.indexOf(p.stop), verseLabel: p.verseLabel, runs: p.runs }));
}

interface Bracket {
	id: number;
	start: number;
	end: number;
	topLabel?: string;
	bottomLabel?: string;
	centerLabel?: string;
	singleNode?: boolean;
	nodes?: number[];
	attachToRow?: number;
	parentBracketId?: number;
	parentBracketId2?: number;
	parentBracketIds?: number[];
	// Set by double-clicking a logical label box (createCornerBox); toggled
	// off the same way. Paired with topLabel/bottomLabel the same way those
	// two fields are - a single-node bracket only ever has one label box
	// (createCornerBox is always called with isTop=true for it, see
	// centerLabel's call site), so mainPointTop alone covers that case too.
	mainPointTop?: boolean;
	mainPointBottom?: boolean;
}

interface Corner {
	bracketId: number;
	isTop: boolean;
}

// A single run of text in a Sentence Flow line, or a tab marker that the
// layout pass (layoutNotesTabs) resizes to land on the next tab stop.
type NotesSegment =
	| { kind: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean }
	| { kind: "tab" };

interface NotesLine {
	indent: number; // px, snapped to a tab-width multiple by indentNotesParagraph
	segments: NotesSegment[];
}

interface NotesData {
	lines: NotesLine[];
	defaultTabWidth: number; // px; the fixed grid Tab/indent snap to
	zoomLevel: number;
}

function emptyNotesData(): NotesData {
	return { lines: [], defaultTabWidth: 24, zoomLevel: 1 };
}

// Sentence Flow and Text Flow are two independent instances of the same
// Word-like canvas. Each keeps its own lines, tab width and zoom; the
// "notes" methods act on the active flow tab unless given an explicit key.
type FlowKey = "sentenceflow" | "textflow";
const FLOW_KEYS: FlowKey[] = ["sentenceflow", "textflow"];

interface FlowState extends NotesData {
	canvasId: string;
	zoomLabelId: string;
	tabInputId: string;
	layoutScheduled: boolean;
}

function isFlowTab(tab: string): tab is FlowKey {
	return (FLOW_KEYS as string[]).includes(tab);
}

// A bracket's parent ids, regardless of whether they were recorded in the
// older singular parentBracketId/parentBracketId2 fields (two-node brackets)
// or the parentBracketIds array (single-node brackets, which can have >2 parents).
// Even-width (2px) bracket strokes are only crisp when centered on a whole
// pixel; a half-pixel center leaves both edges half-covered and blurred.
function crisp(v: number): number {
	return Math.round(v);
}

function getParentIds(b: Bracket): number[] {
	if (b.parentBracketIds && b.parentBracketIds.length) return b.parentBracketIds;
	return [b.parentBracketId, b.parentBracketId2].filter(x => x !== undefined);
}

interface ProjectData {
	propositions: Proposition[];
	brackets: Bracket[];
	zoomLevel: number;
	isRTL: boolean;
	notes: NotesData;
	textFlow?: NotesData;
	timestamp: string;
}

interface RelationshipItem {
	term: string;
	abbr: string;
	def: string;
	conj: string;
	example: string;
}

interface RelationshipGroup {
	title: string;
	color: string;
	items: RelationshipItem[];
}

const RELATIONSHIP_GROUPS: RelationshipGroup[] = [
	{
		title: "Coordinate Relationships", color: "#4a7c59", items: [
			{ term: "Series", abbr: "S", def: "Each proposition makes its own independent contribution to a whole.", conj: "and, moreover, likewise, neither, nor, καί, δέ.", example: "warning everyone and teaching everyone with all wisdom (Col 1:28)" },
			{ term: "Progression", abbr: "P", def: "Like series, but each proposition is a further step toward a climax.", conj: "then, and, moreover, furthermore, καί, δέ.", example: "first the blade, then the ear, then the full grain (Mark 4:28)" },
			{ term: "Alternative", abbr: "A", def: "Each proposition expresses a different possibility arising from a situation.", conj: "or, but, while, on the other hand, δέ, ἤ, μέν.", example: "Are you the one who is to come, or shall we look for another? (Matt 11:3)" },
		]
	},
	{
		title: "Support by Contrary Statement", color: "#b45309", items: [
			{ term: "Concessive", abbr: "Csv", def: "A main clause that stands despite a contrary statement.", conj: "although, though, yet, nevertheless, but, however, δέ, πλήν.", example: "I intend always to remind you of these qualities, though you know them (2 Pet 1:12)" },
			{ term: "Situation-Response", abbr: "Sit/R", def: "A situation and its surprising or counter-intuitive response.", conj: "and.", example: "How often would I have gathered your children … and you were not willing! (Matt 23:37)" },
		]
	},
	{
		title: "Support by Distinct Statement", color: "#1e40af", items: [
			{ term: "Ground", abbr: "G", def: "A statement and the argument or reason for that statement (supporting proposition follows).", conj: "for, because, since, γάρ, ὅτι, ἐπεί, διότι.", example: "Blessed are the poor in spirit, for theirs is the kingdom of heaven (Matt 5:3)" },
			{ term: "Inference", abbr: "∴", def: "A statement and the argument or reason for that statement (supporting proposition precedes).", conj: "therefore, accordingly, οὖν, διό, ὅπως.", example: "The end of all things is at hand; therefore be self-controlled (1 Pet 4:7)" },
			{ term: "Bilateral", abbr: "BL", def: "A proposition that supports two other propositions, one preceding and one following.", conj: "for, because, therefore, so, γάρ, ὅτι, οὖν, διό.", example: "the mind set on the flesh is hostile to God, for it does not submit… (Rom 8:7-8)" },
			{ term: "Action-Result", abbr: "Ac/Res", def: "An action and a consequence or result which accompanies that action.", conj: "so that, that, with the result that, ὥστε.", example: "there arose a great storm, so that the boat was being swamped (Matt 8:24)" },
			{ term: "Action-Purpose", abbr: "Ac/Pur", def: "An action and its intended result.", conj: "in order that, so that, that, lest, ἵνα, εἰς τὸ.", example: "I say this in order that no one may delude you (Col 2:4)" },
			{ term: "Action-Means", abbr: "Ac/M", def: "An action and the means by which it is carried out or accomplished.", conj: "in that, by, participles.", example: "He emptied Himself by taking the form of a servant (Phil 2:7)" },
			{ term: "Conditional", abbr: "If/Th", def: "Like Action-Result except that the existence of the action is only potential and the result is contingent upon it.", conj: "if…then, provided that, except, unless, εἰ, ἐάν, εἴτε, ἆρα.", example: "if there is harm, then you shall pay life for life (Exod 21:23)" },
			{ term: "Temporal", abbr: "T", def: "A statement and the occasion when it is true or can occur.", conj: "when, whenever, after, before, ὅταν, ὅτε, πρίν.", example: "when you fast, do not look gloomy (Matt 6:16)" },
			{ term: "Locative", abbr: "L", def: "A statement and the place where it is true or can occur.", conj: "where, wherever, ὅπου.", example: "For where you go I will go (Ruth 1:16)" },
		]
	},
	{
		title: "Support by Restatement", color: "#7c3aed", items: [
			{ term: "General-Specific", abbr: "G/S", def: "A proposition stating the whole and one or more which set forth the parts of the whole.", conj: "which, that is, namely.", example: "you received the word of God which you heard from us (1 Thess 2:13)" },
			{ term: "Action-Manner", abbr: "A/Mn", def: "An action and a statement indicating the way or manner that action is carried out.", conj: "in that, by, with, participles.", example: "Walk in a manner worthy of the calling to which you have been called, with all humility and gentleness, with patience (Eph 4:1-2)" },
			{ term: "Comparison", abbr: "//", def: "An action and a statement that clarifies that action by showing what it is like.", conj: "even as, as…so, like, just as, ὡς, καθώς.", example: "Be imitators of me, as I am of Christ (1 Cor 11:1)" },
			{ term: "Negative-Positive", abbr: "-/+", def: "Two statements, one of which is denied so that the other is enforced. Also for contrasting statements.", conj: "not…but, ἀλλά.", example: "do not be foolish, but understand what the will of the Lord is (Eph 5:17)" },
			{ term: "Idea-Explanation", abbr: "Id/Exp", def: "The relationship between an original statement and one clarifying its meaning.", conj: "that is, in other words, ὅτι, γάρ, ἵνα.", example: "Blessed are those whose lawless deeds are forgiven… blessed is the man against whom the Lord will not count his sin (Rom 4:7-8)" },
			{ term: "Question-Answer", abbr: "Q/A", def: "The statement of a question and the answer to that question.", conj: "question mark.", example: "what does the Scripture say? Abraham believed God… (Rom 4:3)" },
		]
	},
];

const RESOURCE_LINKS: { label: string; url: string }[] = [
	{ label: "Bible Logic Course (Free)", url: "https://equip.biblearc.com/course/bible-logic" },
	{ label: "Discourse Analysis for Preaching", url: "https://wels.net/ptw-discourse-analysis-for-preaching/" },
	{ label: "A Classic Method for New Testament Exegesis (Podcast with G. K. Beale)", url: "https://www.gkbeale.com/post/a-classic-method-for-new-testament-exegesis" },
	{ label: "Biblical Exegesis by John Piper", url: "https://cdn.desiringgod.org/pdf/booklets/BTBX.pdf" },
];

// ---------- in-app instructions ----------
//
// Text uses a tiny markup: **bold**, `code` and [[key]] (a keyboard key).
// An item with `sub` gets a nested list.
type InstructionItem = string | { text: string; sub: string[] };
interface InstructionSection { heading?: string; items: InstructionItem[] }

const BRACKETS_INSTRUCTIONS: InstructionSection[] = [
	{ heading: "Getting started", items: [
		{ text: "**Paste a passage** into the Propositions box, then click **Insert**. It is split into sentences, and each gets a verse label (5a, 5b, 5c…).", sub: [
			"Verse numbers are found automatically, whether at the start of lines, in superscript, as [5] or [3:5], or run into the text.",
			"A reference like \"Romans 3:21–26\" on the first or last line, or in parentheses at the end, is recognized and removed from the text.",
			"Insert always **adds to** the propositions you already have. It never replaces them.",
		] },
		"**+** (next to Insert) adds a blank proposition after the selected sidebar row, or at the end.",
		"**Double-click a proposition** to split it where you click. The new half keeps the same indent and verse, and the letters are updated.",
		"**Click a proposition's text** to edit it. [[Ctrl]]+[[B]] / [[I]] / [[U]] make the selected words bold, italic, or underlined.",
		"**Click a row's label** (e.g. \"5a\") to rename it. [[Enter]] saves and [[Esc]] cancels. A label you type yourself is kept as is; clearing it goes back to automatic numbering.",
		"**Drag ⋮⋮** in the Propositions list to reorder. Labels travel with their propositions.",
		"**×** on a row deletes that proposition (after you confirm). Any bracket that depended on it is removed too.",
		"[[Tab]] / [[Shift]]+[[Tab]] indents or outdents the selected propositions.",
	] },
	{ heading: "Selecting", items: [
		"**Click a proposition** in the work area to select it; click again to deselect. Select as many as you need.",
		"**Click a corner box** (the small square beside a bracket) to select it. You can select several.",
		"**Click a bracket's line** (its spine or arms) to select the whole bracket. It gets an accent-colored outline.",
		"**Click empty space** in the work area to deselect everything.",
	] },
	{ heading: "Building brackets", items: [
		{ text: "**Add Two-Node Bracket** (first toolbar button). First select one of:", sub: [
			"two propositions",
			"a corner box and a proposition (the new bracket attaches to that box)",
			"a selected bracket and a proposition (the new bracket wraps around both)",
			"two corner boxes from **different** brackets (the new bracket joins them)",
		] },
		"**Add Single-Node Bracket** (second toolbar button). First select **two or more** propositions and/or corner boxes. Two corners of the same bracket can't be used together.",
		"Then click the button. The layout is worked out for you, so brackets never cross.",
	] },
	{ heading: "Labels and main point", items: [
		"**Right-click a corner box** to type its label (e.g. G, Inf, ∴). [[Enter]]/OK saves; [[Esc]]/Cancel closes.",
		"**Double-click a corner box** to mark it as the passage's **main point** (shown in the main-point color). Double-click again to unmark it.",
		"Type `\tf` or `\therefore` in any label or text to get ∴. The command **Insert ∴ (therefore)** does the same.",
		"🔗 in the header lists the logical relationships with their abbreviations.",
	] },
	{ heading: "Deleting, undo and redo", items: [
		"**Select a bracket, then press [[Delete]]** (or [[Backspace]]) to remove it after you confirm. Brackets attached to it stay, but become free-standing.",
		"**Clear Brackets** removes every bracket and keeps your propositions.",
		"**Reset All** clears everything: propositions, brackets, Text Flow, and Sentence Flow.",
		"[[Ctrl]]+[[Z]] (or ↶) undoes your last change, up to 20 steps. [[Ctrl]]+[[Y]] or [[Ctrl]]+[[Shift]]+[[Z]] (or ↷) redoes it. While you're typing in a text box, these undo and redo your typing instead.",
	] },
	{ heading: "Moving around", items: [
		"**Click and drag** on empty space to pan the diagram.",
		"**− / + / ↺** zoom out, zoom in, and reset (30%–300%).",
		"The panel button at the far left of the tab bar (or the command **Toggle propositions sidebar**) hides or shows the Propositions list. Drag the list's edge to resize it; the width is remembered.",
	] },
	{ heading: "Header buttons", items: [
		"**💾** saves the .da file. Obsidian also saves automatically.",
		"**📷 Export PNG** saves <file name>.png next to the .da file. If one is already there, you're asked whether to replace it or keep both.",
		"**🔗** opens the logical relationships reference. **📖** opens videos and reading on discourse analysis.",
		"**RTL** mirrors the diagram right-to-left for Hebrew.",
		"The **color theme** menu includes \"Theme\", which follows your Obsidian theme. UI size and custom colors are under **Settings → Discourse Analysis Tool**; UI size is also available through the commands Increase / Decrease / Reset UI size.",
	] },
];

const FLOW_INSTRUCTIONS: InstructionSection[] = [
	{ items: [
		"[[Tab]] moves the text to the next tab stop, so clauses line up in columns. [[Shift]]+[[Tab]] removes the tab just before the cursor.",
		"[[Ctrl]]+[[M]] / [[Ctrl]]+[[Shift]]+[[M]] indents or outdents the whole line.",
		"[[Enter]] starts a new line with the same indent as the one above, so you can flow a passage with just Enter and Tab.",
		"[[Ctrl]]+[[B]] / [[Ctrl]]+[[I]] / [[Ctrl]]+[[U]] make text bold, italic, or underlined.",
		"**Default tab** sets the tab-stop spacing in inches (0.25 by default).",
		"Each tab has its own zoom.",
		"Pasting gives plain text; tabs in the pasted text become tab stops.",
		"[[Ctrl]]+[[Z]] undoes typing here separately from the Brackets tab.",
		"**→** (Text Flow) copies each line into the Brackets tab as a proposition. How far a line is indented sets the proposition's indent, and verse numbers become labels. If Brackets already has content, you'll be asked whether to **Replace** it (this also clears the brackets) or **Append** to it.",
		"**Instructions** (Text Flow) opens Blake Franze's Text Flow Instructions.",
	] },
];

function appendInstructionText(parent: HTMLElement, text: string): void {
	for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/)) {
		if (!part) continue;
		if (part.startsWith("**")) appendInstructionText(parent.createEl("strong"), part.slice(2, -2));
		else if (part.startsWith("`")) parent.createEl("code", { text: part.slice(1, -1) });
		else if (part.startsWith("[[")) parent.createEl("kbd", { text: part.slice(2, -2) });
		else parent.appendText(part);
	}
}

function renderInstructionSections(container: HTMLElement, sections: InstructionSection[]): void {
	for (const section of sections) {
		if (section.heading) container.createEl("h3", { text: section.heading });
		const list = container.createEl("ul");
		for (const item of section.items) {
			const li = list.createEl("li");
			if (typeof item === "string") { appendInstructionText(li, item); continue; }
			appendInstructionText(li, item.text);
			const sub = li.createEl("ul");
			for (const line of item.sub) appendInstructionText(sub.createEl("li"), line);
		}
	}
}

// Inline markup for the Text Flow Instructions: **bold**, *italic*,
// ***bold italic***, __underline__, ^superscript^ (nestable).
function appendTextFlowInline(parent: HTMLElement, text: string): void {
	const markers: [string, keyof HTMLElementTagNameMap][] = [["***", "strong"], ["**", "strong"], ["__", "u"], ["*", "em"], ["^", "sup"]];
	let plain = "";
	let i = 0;
	while (i < text.length) {
		const m = markers.find(([mk]) => text.startsWith(mk, i));
		// A lone "*" closes only on a lone "*", so italics can contain **bold**.
		let close = -1;
		if (m) {
			for (let j = i + m[0].length; j < text.length; j++) {
				if (m[0] === "*" && text.startsWith("**", j)) { j++; continue; }
				if (text.startsWith(m[0], j)) { close = j; break; }
			}
		}
		if (!m || close < 0) { plain += text[i++]; continue; }
		if (plain) { parent.appendText(plain); plain = ""; }
		let el = parent.createEl(m[1]);
		if (m[0] === "***") el = el.createEl("em");
		appendTextFlowInline(el, text.slice(i + m[0].length, close));
		i = close + m[0].length;
	}
	if (plain) parent.appendText(plain);
}

function renderTextFlowInstructions(container: HTMLElement, blocks: TextFlowBlock[]): void {
	for (const b of blocks) {
		if ("h" in b) { container.createEl("h3", { text: b.h }); continue; }
		if ("li" in b) {
			const row = container.createDiv({ cls: "da-tfi-li" });
			row.style.setProperty("--da-tfi-level", String(b.level));
			row.createSpan({ cls: "da-tfi-marker", text: b.marker });
			appendTextFlowInline(row.createSpan(), b.li);
			continue;
		}
		if ("p" in b) {
			const p = container.createEl("p", { cls: b.indent ? "da-tfi-p da-tfi-indent" : "da-tfi-p" });
			p.style.setProperty("--da-tfi-level", String(b.level ?? 0));
			appendTextFlowInline(p, b.p);
			continue;
		}
		const flow = container.createDiv({ cls: "da-tfi-flow" });
		flow.style.setProperty("--da-tfi-level", String(b.level ?? 0));
		for (const line of b.flow) {
			const tabs = /^\t*/.exec(line)![0].length;
			const div = flow.createDiv({ cls: line ? "da-tfi-line" : "da-tfi-gap" });
			div.style.setProperty("--da-tfi-tabs", String(tabs));
			if (line) appendTextFlowInline(div, line.slice(tabs));
		}
	}
}

const HISTORY_LIMIT = 20;

function emptyProjectData(): ProjectData {
	return { propositions: [], brackets: [], zoomLevel: 1, isRTL: false, notes: emptyNotesData(), timestamp: new Date().toISOString() };
}

export class DAView extends TextFileView {
	propositions: Proposition[] = [];
	brackets: Bracket[] = [];
	selectedIndices: number[] = [];
	selectedBracketId: number | null = null;
	selectedCorners: Corner[] = [];
	sidebarSelected = -1;
	historyStack: string[] = [];
	redoStack: string[] = [];
	zoomLevel = 1;
	isRTL = false;
	dragSrcIndex: number | null = null;

	activeTab: "brackets" | FlowKey = "brackets";
	flows: Record<FlowKey, FlowState> = {
		sentenceflow: { canvasId: "notes-canvas", zoomLabelId: "sf-zoom-label", tabInputId: "notes-default-tab-width", layoutScheduled: false, ...emptyNotesData() },
		textflow: { canvasId: "textflow-canvas", zoomLabelId: "tf-zoom-label", tabInputId: "textflow-default-tab-width", layoutScheduled: false, ...emptyNotesData() },
	};

	private loaded = false;
	// Set when the file's contents couldn't be parsed: the view opens empty,
	// and getViewData hands back the original text untouched so nothing
	// overwrites the damaged file until it's fixed.
	private unreadableData: string | null = null;
	private domBuilt = false;
	private resizeObserver: ResizeObserver | null = null;
	private measureCtx: CanvasRenderingContext2D | null = null;
	private plugin: DAToolPluginHost;

	constructor(leaf: WorkspaceLeaf, plugin: DAToolPluginHost) {
		super(leaf);
		this.plugin = plugin;

		// A plain DOM keydown listener on the canvas isn't enough: Obsidian's
		// own Keymap intercepts Mod+B/Mod+I/Mod+U at the document level (to
		// check them against global commands like core's "Toggle bold", bound
		// to Mod+B by default) before the event ever reaches an element-level
		// bubble listener. Assigning this.scope is the sanctioned override -
		// Obsidian gives the active view's scope first refusal on key events,
		// ahead of global command hotkeys, while the view has focus.
		this.scope = new Scope(this.app.scope);
		const bindFormatKey = (key: string, command: string) => {
			this.scope!.register(["Mod"], key, (evt) => {
				// Also formats a proposition's text while it's being edited in
				// the Brackets tab (sidebar or canvas row); saved on blur via
				// readRunsFrom.
				const active = document.activeElement as HTMLElement | null;
				if (active?.matches(".da-row-text, .da-prop-text")) {
					evt.preventDefault();
					this.applySentenceFlowFormat(command);
					return false;
				}
				if (!isFlowTab(this.activeTab)) return;
				evt.preventDefault();
				this.applySentenceFlowFormat(command);
				this.updateNotesFormatButtonStates();
				return false;
			});
		};
		bindFormatKey("b", "bold");
		bindFormatKey("i", "italic");
		bindFormatKey("u", "underline");

		// Same interception problem affects Mod+X: Obsidian's Keymap grabs it
		// before the contenteditable's native cut handling ever sees it (Mod+C
		// and Mod+V happen to pass through untouched). Unlike the format keys,
		// cut is useful anywhere text is edited in this view - the Sentence
		// Flow canvas, proposition text, bracket label editors - not just the
		// Sentence Flow tab, so this checks for any focused editable element
		// instead of gating on activeTab.
		this.scope.register(["Mod"], "x", (evt) => {
			const active = document.activeElement as HTMLElement | null;
			const editable = !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
			if (!editable) return;
			evt.preventDefault();
			document.execCommand("cut");
			if (active?.classList.contains("da-sf-canvas") && isFlowTab(this.activeTab)) this.scheduleNotesLayout(true);
			this.requestSave();
			return false;
		});
	}

	getViewType(): string {
		return VIEW_TYPE_DA;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Discourse Analysis";
	}

	getIcon(): string {
		return DA_TOOL_ICON;
	}

	// ---------- scoped DOM helpers ----------

	private byId<T extends Element = HTMLElement>(id: string): T | null {
		return this.contentEl.querySelector("#" + id) as T | null;
	}

	private qsa<T extends Element = HTMLElement>(selector: string): T[] {
		return Array.from(this.contentEl.querySelectorAll(selector)) as T[];
	}

	private curFlowKey(): FlowKey {
		return this.activeTab === "textflow" ? "textflow" : "sentenceflow";
	}

	private flowCanvas(key: FlowKey = this.curFlowKey()): HTMLElement | null {
		return this.byId(this.flows[key].canvasId);
	}

	private flowToJson(key: FlowKey): NotesData {
		const f = this.flows[key];
		return { lines: f.lines, defaultTabWidth: f.defaultTabWidth, zoomLevel: f.zoomLevel };
	}

	private loadFlowFromJson(key: FlowKey, data: Partial<NotesData> | undefined): void {
		const f = this.flows[key];
		f.lines = data?.lines || [];
		f.defaultTabWidth = data?.defaultTabWidth || 24;
		f.zoomLevel = data?.zoomLevel || 1;
	}

	private confirmAction(message: string, onConfirm: () => void): void {
		new ConfirmModal(this.app, message, onConfirm).open();
	}

	// ---------- TextFileView contract ----------

	getViewData(): string {
		if (this.unreadableData !== null) return this.unreadableData;
		// The flow canvases' DOM is the live source of truth while editing
		// (browser-managed via execCommand), so pull it back into each flow's
		// lines before serializing - otherwise saves would miss whatever was
		// typed since the last sync.
		if (this.domBuilt) {
			FLOW_KEYS.forEach(key => { this.flows[key].lines = this.serializeNotesLines(key); });
		}
		const data: ProjectData = {
			propositions: this.propositions,
			brackets: this.brackets,
			zoomLevel: this.zoomLevel,
			isRTL: this.isRTL,
			notes: this.flowToJson("sentenceflow"),
			textFlow: this.flowToJson("textflow"),
			timestamp: new Date().toISOString(),
		};
		return JSON.stringify(data, null, 2);
	}

	setViewData(data: string, clear: boolean): void {
		let parsed: Partial<ProjectData> = {};
		this.unreadableData = null;
		if (data && data.trim().length > 0) {
			try {
				parsed = JSON.parse(data);
				if (!parsed || typeof parsed !== "object") throw new Error("not a DA project object");
			} catch (e) {
				console.error("DA-Tool: failed to parse file contents.", e);
				// Keep the damaged text as-is (see getViewData) instead of
				// letting the next save overwrite it with an empty diagram.
				this.unreadableData = data;
				parsed = {};
				new Notice(`DA-Tool couldn't read "${this.file?.name ?? "this file"}" (it isn't valid DA data). The file has been left unchanged; edits made here won't be saved until it's fixed.`, 12000);
			}
		}
		this.propositions = parsed.propositions || [];
		this.brackets = parsed.brackets || [];
		this.zoomLevel = parsed.zoomLevel || 1;
		this.isRTL = parsed.isRTL || false;
		this.loadFlowFromJson("sentenceflow", parsed.notes);
		this.loadFlowFromJson("textflow", parsed.textFlow);
		this.migrateSingleNodeBrackets();
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.sidebarSelected = -1;
		this.historyStack = [];
		this.redoStack = [];
		this.loaded = true;

		if (this.domBuilt) {
			this.syncRtlToggleUi();
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
			this.applyZoom();
			this.renderNotesTab();
			this.applyNotesZoom();
		}
	}

	clear(): void {
		const empty = emptyProjectData();
		this.propositions = empty.propositions;
		this.brackets = empty.brackets;
		this.zoomLevel = empty.zoomLevel;
		this.isRTL = empty.isRTL;
		FLOW_KEYS.forEach(key => this.loadFlowFromJson(key, undefined));
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.sidebarSelected = -1;
		this.historyStack = [];
		this.redoStack = [];
		this.unreadableData = null;
	}

	async onOpen(): Promise<void> {
		this.buildDom();
		this.wireStaticEvents();
		this.watchContainerResize();
		this.refreshTheming();
		if (this.loaded) {
			this.syncRtlToggleUi();
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
			this.applyZoom();
			this.renderNotesTab();
			this.applyNotesZoom();
		}

		// Edits call this.save() without waiting for the write to finish, so a
		// quit that lands right after the last action can race the file write
		// and lose it. Obsidian holds app quit open for any promise registered
		// here, so make sure the in-memory state is actually flushed to disk
		// before quitting proceeds.
		this.registerEvent(this.app.workspace.on("quit", (tasks) => {
			tasks.addPromise(this.save());
		}));
	}

	// renderCanvas() measures proposition row positions from the live DOM to lay
	// out the bracket SVG. Right after the view attaches (or a file loads into
	// it), the leaf isn't always laid out/painted yet — Obsidian can finish
	// sizing/revealing the leaf's container after onOpen/setViewData return, on
	// a timeline a fixed number of animation frames can't reliably catch — so
	// those measurements come back as zero (or based on not-yet-final row
	// metrics, e.g. before fonts finish loading) and the canvas renders empty
	// or misaligned until something else (e.g. a click causing a reflow, via
	// deselectAll()) forces a re-render. Watch both the container's own size
	// (catches pane resizes: split panes, sidebar toggles, window resize) and
	// the row list's content size (catches the row metrics themselves settling
	// independently of the container, e.g. font/CSS load) instead of guessing
	// a delay.
	private watchContainerResize(): void {
		this.resizeObserver?.disconnect();
		const container = this.byId("diagram-container");
		const propRows = this.byId("proposition-rows");
		if (!container) return;
		this.resizeObserver = new ResizeObserver(() => this.renderCanvas());
		this.resizeObserver.observe(container);
		if (propRows) this.resizeObserver.observe(propRows);
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.domBuilt = false;
		this.contentEl.empty();
	}

	// ---------- DOM construction ----------

	private appendBracketIcon(button: HTMLElement, shapes: Array<{ tag: keyof SVGElementTagNameMap; attr: Record<string, string> }>): void {
		button.createSvg("svg", {
			cls: "da-btn-icon",
			attr: { viewBox: "0 0 22 22", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" },
		}, svg => {
			for (const shape of shapes) svg.createSvg(shape.tag, { attr: shape.attr });
		});
	}

	private buildDom(): void {
		this.contentEl.empty();
		this.contentEl.addClass("da-tool-view");
		this.domBuilt = true;

		const header = this.contentEl.createDiv({ cls: "da-header da-ui-scaled" });
		const headerLeft = header.createDiv({ cls: "da-header-left" });
		headerLeft.createDiv({ cls: "da-logo", text: "∴" });
		headerLeft.createEl("h1", { cls: "da-title", text: "Discourse Analysis" });

		const headerRight = header.createDiv({ cls: "da-header-right" });
		headerRight.createEl("button", { cls: "da-btn da-btn-primary", text: "💾", attr: { "data-action": "force-save", title: "Save", "aria-label": "Save" } });
		headerRight.createEl("button", { cls: "da-btn", text: "🔗", attr: { "data-action": "show-lr", title: "Logical Relations", "aria-label": "Logical Relations" } });
		headerRight.createEl("button", { cls: "da-btn", text: "📖", attr: { "data-action": "show-resources", title: "Resources", "aria-label": "Resources" } });
		headerRight.createEl("button", { cls: "da-btn", text: "📷", attr: { "data-action": "export-png", title: "Export PNG", "aria-label": "Export PNG" } });
		headerRight.createEl("select", { cls: "da-theme-select", attr: { id: "theme-select", title: "Color theme", "aria-label": "Color theme" } }, sel => {
			for (const t of COLOR_THEMES) sel.createEl("option", { text: t.label, attr: { value: t.id } });
		});
		headerRight.createSpan({ cls: "da-label", text: "RTL" });
		headerRight.createEl("button", { cls: "da-switch", attr: { id: "rtl-toggle", role: "switch", "aria-checked": "false" } }, btn => {
			btn.createSpan({ cls: "da-switch-thumb", attr: { id: "rtl-thumb" } });
		});
		headerRight.createEl("button", { cls: "da-btn da-btn-support", attr: { "data-action": "open-external", "data-url": "https://buymeacoffee.com/reformedretrieval" } }, btn => {
			// Coffee mug icon, same as BibleSearch's Support button.
			btn.createSvg("svg", { cls: "da-support-icon", attr: { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" } }, svg => {
				svg.createSvg("path", { attr: { d: "M2 21h18a1 1 0 0 1 0 2H2a1 1 0 0 1 0-2zM20.242 11.022a1 1 0 0 0-.242-.688 2.99 2.99 0 0 0-2-.734H16V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2.022h2a3 3 0 0 0 3-3V11.02a1 1 0 0 0-.758-.998zM14 16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v10zm4-4.022V11.6h-2v-2h2a1 1 0 0 1 1 1v1.378a1 1 0 0 1-1 1z" } });
			});
			btn.createSpan({ text: "Support" });
		});

		const tabStrip = this.contentEl.createDiv({ cls: "da-tab-strip da-ui-scaled" });
		const tabStripTabs = tabStrip.createDiv({ cls: "da-tab-strip-tabs" });
		const sidebarToggle = tabStripTabs.createEl("button", { cls: "da-sidebar-toggle", attr: { id: "sidebar-toggle", "data-action": "toggle-sidebar" } });
		this.appendBracketIcon(sidebarToggle, [
			{ tag: "rect", attr: { x: "3", y: "4", width: "16", height: "14", rx: "2" } },
			{ tag: "line", attr: { x1: "8.5", y1: "4", x2: "8.5", y2: "18" } },
		]);
		tabStripTabs.createEl("button", { cls: "da-tab-btn da-tab-btn-active", text: "Brackets", attr: { "data-tab": "brackets" } });
		tabStripTabs.createEl("button", { cls: "da-tab-btn", text: "Text Flow", attr: { "data-tab": "textflow" } });
		tabStripTabs.createEl("button", { cls: "da-tab-btn", text: "Sentence Flow", attr: { "data-tab": "sentenceflow" } });

		const tabToolbar = tabStrip.createDiv({ cls: "da-tab-toolbar", attr: { id: "brackets-toolbar" } });

		const twoNodeBtn = tabToolbar.createEl("button", { cls: "da-btn da-btn-primary da-btn-icon-only", attr: { "data-action": "add-blank-bracket", title: "Add Two-Node Bracket", "aria-label": "Add Two-Node Bracket" } });
		this.appendBracketIcon(twoNodeBtn, [
			{ tag: "rect", attr: { x: "2", y: "2", width: "6", height: "6", rx: "1.5" } },
			{ tag: "rect", attr: { x: "2", y: "14", width: "6", height: "6", rx: "1.5" } },
			{ tag: "line", attr: { x1: "8", y1: "5", x2: "16", y2: "5" } },
			{ tag: "line", attr: { x1: "8", y1: "17", x2: "16", y2: "17" } },
			{ tag: "line", attr: { x1: "16", y1: "5", x2: "16", y2: "17" } },
			{ tag: "line", attr: { x1: "16", y1: "5", x2: "19", y2: "5" } },
			{ tag: "line", attr: { x1: "16", y1: "17", x2: "19", y2: "17" } },
		]);

		const singleNodeBtn = tabToolbar.createEl("button", { cls: "da-btn da-btn-primary da-btn-icon-only", attr: { "data-action": "add-single-node-bracket", title: "Add Single-Node Bracket", "aria-label": "Add Single-Node Bracket" } });
		this.appendBracketIcon(singleNodeBtn, [
			{ tag: "rect", attr: { x: "2", y: "8", width: "6", height: "6", rx: "1.5" } },
			{ tag: "line", attr: { x1: "8", y1: "11", x2: "16", y2: "11" } },
			{ tag: "line", attr: { x1: "16", y1: "3", x2: "16", y2: "19" } },
			{ tag: "line", attr: { x1: "16", y1: "3", x2: "19", y2: "3" } },
			{ tag: "line", attr: { x1: "16", y1: "19", x2: "19", y2: "19" } },
		]);

		tabToolbar.createEl("button", { cls: "da-btn da-btn-icon-only", text: "↶", attr: { "data-action": "undo", title: "Undo (Ctrl+Z)", "aria-label": "Undo" } });
		tabToolbar.createEl("button", { cls: "da-btn da-btn-icon-only", text: "↷", attr: { "data-action": "redo", title: "Redo (Ctrl+Y or Ctrl+Shift+Z)", "aria-label": "Redo" } });

		const zoomRow = tabToolbar.createDiv({ cls: "da-zoom-row" });
		zoomRow.createEl("button", { cls: "da-btn da-btn-icon-only", text: "−", attr: { "data-action": "zoom-out", title: "Zoom Out", "aria-label": "Zoom Out" } });
		zoomRow.createSpan({ cls: "da-zoom-label", text: "100%", attr: { id: "zoom-label" } });
		zoomRow.createEl("button", { cls: "da-btn da-btn-icon-only", text: "+", attr: { "data-action": "zoom-in", title: "Zoom In", "aria-label": "Zoom In" } });
		zoomRow.createEl("button", { cls: "da-btn da-btn-icon-only", text: "↺", attr: { "data-action": "zoom-reset", title: "Reset Zoom", "aria-label": "Reset Zoom" } });

		tabToolbar.createEl("button", { cls: "da-btn da-btn-warn", text: "Clear Brackets", attr: { "data-action": "clear-brackets", title: "Clear All Brackets" } });
		tabToolbar.createEl("button", { cls: "da-btn da-btn-danger", text: "Reset All", attr: { "data-action": "reset-all", title: "Reset Everything" } });

		tabToolbar.createEl("button", { cls: "da-btn da-btn-icon-only", text: "?", attr: { "data-action": "show-instructions", title: "Instructions", "aria-label": "Instructions" } });

		this.buildFlowToolbar(tabStrip, "textflow", "tf");
		this.buildFlowToolbar(tabStrip, "sentenceflow", "sf");

		const bodyEl = this.contentEl.createDiv({ cls: "da-body da-tab-panel", attr: { id: "brackets-panel" } });

		const sidebarWidth = Math.min(600, Math.max(180, this.plugin.settings.sidebarWidth || 288));
		const leftSidebar = bodyEl.createDiv({ cls: "da-sidebar da-sidebar-left da-ui-scaled", attr: { id: "left-sidebar", style: `width:${sidebarWidth}px;min-width:180px;max-width:600px;` } });
		const sidebarHeader = leftSidebar.createDiv({ cls: "da-sidebar-header" });
		sidebarHeader.createEl("h2", { cls: "da-section-title", text: "Propositions" });
		sidebarHeader.createEl("textarea", { cls: "da-textarea", attr: { id: "paste-area", rows: "3", placeholder: "Paste full passage here…" } });
		const insertRow = sidebarHeader.createDiv({ cls: "da-row-gap" });
		insertRow.createEl("button", { cls: "da-btn da-btn-primary da-flex1 da-btn-insert", text: "Insert", attr: { "data-action": "insert-props" } });
		insertRow.createEl("button", { cls: "da-btn-square", text: "+", attr: { "data-action": "add-prop" } });
		leftSidebar.createDiv({ cls: "da-prop-list", attr: { id: "sidebar-prop-list" } });

		bodyEl.createDiv({ cls: "da-resizer", attr: { id: "left-resizer" } });

		const workspace = bodyEl.createDiv({ cls: "da-workspace", attr: { id: "workspace" } });
		const diagramContainer = workspace.createDiv({ cls: "da-diagram-container", attr: { id: "diagram-container" } });
		diagramContainer.createDiv({ cls: "da-overlay", attr: { "data-action": "deselect" } });
		const workspaceScaler = diagramContainer.createDiv({ cls: "da-workspace-scaler", attr: { id: "workspace-scaler" } });
		workspaceScaler.createSvg("svg", { cls: "da-bracket-svg", attr: { id: "bracket-svg", width: "365", height: "1200" } });
		workspaceScaler.createDiv({ cls: "da-proposition-rows", attr: { id: "proposition-rows" } });

		this.buildFlowPanel("textflow");
		this.buildFlowPanel("sentenceflow");

		const labelEditor = this.contentEl.createDiv({ cls: "da-label-editor da-ui-scaled", attr: { id: "label-editor", style: "display:none;" } });
		labelEditor.createDiv({ cls: "da-label-editor-title", text: "EDIT LABEL" });
		labelEditor.createEl("input", { cls: "da-label-editor-input", attr: { id: "lei", type: "text" } });
		const labelEditorActions = labelEditor.createDiv({ cls: "da-label-editor-actions" });
		labelEditorActions.createEl("button", { cls: "da-btn", text: "Cancel", attr: { id: "le-cancel" } });
		labelEditorActions.createEl("button", { cls: "da-btn da-btn-primary", text: "OK", attr: { id: "le-ok" } });

		const lrModal = this.contentEl.createDiv({ cls: "da-modal-backdrop hidden", attr: { id: "lr-modal" } });
		const lrModalInner = lrModal.createDiv({ cls: "da-modal da-ui-scaled" });
		const lrModalHeader = lrModalInner.createDiv({ cls: "da-modal-header" });
		lrModalHeader.createEl("h2", { cls: "da-modal-title", text: "The Logical Relationships" });
		lrModalHeader.createEl("button", { cls: "da-modal-close", text: "×", attr: { "data-action": "hide-lr" } });
		const lrModalBody = lrModalInner.createDiv({ cls: "da-modal-body" });
		const relationshipGrid = lrModalBody.createDiv({ cls: "da-relationship-grid" });
		for (const group of RELATIONSHIP_GROUPS) {
			const groupEl = relationshipGrid.createDiv();
			groupEl.createDiv({ cls: "da-relationship-group-title", text: group.title, attr: { style: `background:${group.color};` } });
			const groupBody = groupEl.createDiv({ cls: "da-relationship-group-body" });
			for (const item of group.items) {
				const itemEl = groupBody.createDiv({ cls: "da-relationship-item" });
				const termPara = itemEl.createEl("p");
				const termSpan = termPara.createSpan({ cls: "da-relationship-term" });
				termSpan.appendText(`${item.term} `);
				termSpan.createSpan({ text: `(${item.abbr})`, attr: { style: `color:${group.color};` } });
				termSpan.appendText(":");
				termPara.appendText(` ${item.def}`);
				const conjPara = itemEl.createEl("p", { cls: "da-relationship-conj" });
				conjPara.createEl("span", { text: "Conjunctions:" });
				conjPara.appendText(` ${item.conj}`);
				itemEl.createEl("p", { cls: "da-relationship-example", text: item.example });
			}
		}

		const resourceModal = this.contentEl.createDiv({ cls: "da-modal-backdrop hidden", attr: { id: "resource-modal" } });
		const resourceModalInner = resourceModal.createDiv({ cls: "da-modal da-ui-scaled" });
		const resourceModalHeader = resourceModalInner.createDiv({ cls: "da-modal-header" });
		resourceModalHeader.createEl("h2", { cls: "da-modal-title", text: "Discourse Analysis Resources" });
		resourceModalHeader.createEl("button", { cls: "da-modal-close", text: "×", attr: { "data-action": "hide-resources" } });
		const resourceModalBody = resourceModalInner.createDiv({ cls: "da-modal-body" });
		resourceModalBody.createDiv({ cls: "da-video-wrap" }).createEl("iframe", {
			attr: {
				width: "560", height: "315",
				src: "https://www.youtube.com/embed/videoseries?si=r6RdCwzI3MgUnvlX&list=PLMcXGoRTAIpZApAOJBP-M0BeMdDU_02Rk",
				title: "YouTube video player", frameborder: "0",
				allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
				referrerpolicy: "strict-origin-when-cross-origin", allowfullscreen: "true",
			},
		});
		resourceModalBody.createDiv({ cls: "da-video-wrap" }).createEl("iframe", {
			attr: {
				width: "100%", height: "100%",
				src: "https://www.youtube.com/embed/videoseries?si=0xciDPsqyCsKt1GZ&list=PLNbOazQtvR8fzM2-UhQRJicFMuf1VSoJO",
				title: "YouTube video player", frameborder: "0",
				allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
				referrerpolicy: "strict-origin-when-cross-origin", allowfullscreen: "true",
			},
		});
		for (const link of RESOURCE_LINKS) {
			resourceModalBody.createDiv({ cls: "da-resource-link-wrap" })
				.createEl("button", { cls: "da-btn da-btn-accent", text: link.label, attr: { "data-url": link.url, "data-action": "open-external" } });
		}

		const instructionsModal = this.contentEl.createDiv({ cls: "da-modal-backdrop hidden", attr: { id: "instructions-modal" } });
		const instructionsModalInner = instructionsModal.createDiv({ cls: "da-modal da-modal-medium da-ui-scaled" });
		const instructionsModalHeader = instructionsModalInner.createDiv({ cls: "da-modal-header" });
		instructionsModalHeader.createEl("h2", { cls: "da-modal-title", text: "Instructions" });
		instructionsModalHeader.createEl("button", { cls: "da-modal-close", text: "×", attr: { "data-action": "hide-instructions" } });
		const instructionsModalBody = instructionsModalInner.createDiv({ cls: "da-modal-body" });
		const instructions = instructionsModalBody.createDiv({ cls: "da-instructions" });
		renderInstructionSections(instructions, BRACKETS_INSTRUCTIONS);

		const flowHelpModal = this.contentEl.createDiv({ cls: "da-modal-backdrop hidden", attr: { id: "flow-help-modal" } });
		const flowHelpInner = flowHelpModal.createDiv({ cls: "da-modal da-modal-medium da-ui-scaled" });
		const flowHelpHeader = flowHelpInner.createDiv({ cls: "da-modal-header" });
		flowHelpHeader.createEl("h2", { cls: "da-modal-title", text: "Using this editor" });
		flowHelpHeader.createEl("button", { cls: "da-modal-close", text: "×", attr: { "data-action": "hide-flow-help" } });
		renderInstructionSections(flowHelpInner.createDiv({ cls: "da-modal-body" }).createDiv({ cls: "da-instructions" }), FLOW_INSTRUCTIONS);

		const tfModal = this.contentEl.createDiv({ cls: "da-modal-backdrop hidden", attr: { id: "textflow-instructions-modal" } });
		const tfModalInner = tfModal.createDiv({ cls: "da-modal da-modal-tfi da-ui-scaled" });
		const tfModalHeader = tfModalInner.createDiv({ cls: "da-modal-header" });
		tfModalHeader.createEl("h2", { cls: "da-modal-title", text: "Text Flow Instructions" });
		tfModalHeader.createEl("button", { cls: "da-modal-close", text: "×", attr: { "data-action": "hide-textflow-instructions" } });
		renderTextFlowInstructions(tfModalInner.createDiv({ cls: "da-modal-body" }).createDiv({ cls: "da-instructions da-tf-instructions" }), TEXT_FLOW_INSTRUCTIONS);
	}

	// Toolbar for a flow tab (Text Flow or Sentence Flow - identical apart
	// from the Text Flow Instructions button). zoomPrefix namespaces the zoom
	// buttons' data-actions ("sf-zoom-in", "tf-zoom-in", ...).
	private buildFlowToolbar(tabStrip: HTMLElement, key: FlowKey, zoomPrefix: string): void {
		const f = this.flows[key];
		const toolbar = tabStrip.createDiv({ cls: "da-tab-toolbar da-sf-toolbar da-tab-toolbar-hidden", attr: { id: `${key}-toolbar` } });
		toolbar.createEl("button", { cls: "da-btn da-sf-fmt-btn", text: "B", attr: { "data-fmt": "bold", title: "Bold (Ctrl+B)", "aria-label": "Bold" } });
		toolbar.createEl("button", { cls: "da-btn da-sf-fmt-btn", text: "I", attr: { "data-fmt": "italic", title: "Italic (Ctrl+I)", "aria-label": "Italic" } });
		toolbar.createEl("button", { cls: "da-btn da-sf-fmt-btn", text: "U", attr: { "data-fmt": "underline", title: "Underline (Ctrl+U)", "aria-label": "Underline" } });

		const tabWidthWrap = toolbar.createDiv({ cls: "da-sf-tabwidth" });
		tabWidthWrap.createSpan({ text: "Default tab:" });
		tabWidthWrap.createEl("input", {
			cls: "da-sf-tabwidth-input",
			attr: { id: f.tabInputId, "data-flow": key, type: "number", min: "0.1", step: "0.1" },
		});
		tabWidthWrap.createSpan({ text: "in" });

		const zoomRow = toolbar.createDiv({ cls: "da-zoom-row" });
		zoomRow.createEl("button", { cls: "da-btn da-btn-icon-only", text: "−", attr: { "data-action": `${zoomPrefix}-zoom-out`, title: "Zoom Out", "aria-label": "Zoom Out" } });
		zoomRow.createSpan({ cls: "da-zoom-label", text: "100%", attr: { id: f.zoomLabelId } });
		zoomRow.createEl("button", { cls: "da-btn da-btn-icon-only", text: "+", attr: { "data-action": `${zoomPrefix}-zoom-in`, title: "Zoom In", "aria-label": "Zoom In" } });
		zoomRow.createEl("button", { cls: "da-btn da-btn-icon-only", text: "↺", attr: { "data-action": `${zoomPrefix}-zoom-reset`, title: "Reset Zoom", "aria-label": "Reset Zoom" } });

		if (key === "textflow") {
			toolbar.createEl("button", { cls: "da-btn da-btn-icon-only", text: "→", attr: { "data-action": "textflow-to-brackets", title: "Copy each line to the Brackets canvas as a proposition", "aria-label": "Copy lines to Brackets" } });
			toolbar.createEl("button", { cls: "da-btn", text: "Instructions", attr: { "data-action": "show-textflow-instructions", title: "Text Flow Instructions", "aria-label": "Text Flow Instructions" } });
		}
		toolbar.createEl("button", { cls: "da-btn da-btn-icon-only", text: "?", attr: { "data-action": "show-flow-help", title: "Using this editor", "aria-label": "Using this editor" } });
	}

	// Builds a flow tab's panel: a Word-like scratch canvas for pasting and
	// editing a passage's raw text, where Tab always jumps to the next
	// multiple of the configurable default tab width (see layoutNotesTabs)
	// so tabbed text aligns into columns across lines, plus indent (Ctrl+M /
	// Ctrl+Shift+M) and basic bold/italic/underline formatting.
	private buildFlowPanel(key: FlowKey): void {
		const panel = this.contentEl.createDiv({ cls: "da-tab-panel da-tab-panel-hidden da-sf-panel", attr: { id: `${key}-panel` } });

		const canvasWrap = panel.createDiv({ cls: "da-sf-canvas-wrap" });
		const canvas = canvasWrap.createDiv({ cls: "da-sf-canvas", attr: { id: this.flows[key].canvasId, contenteditable: "true", spellcheck: "false" } });
		canvas.tabIndex = 0;
	}

	// ---------- static event wiring (buttons that always exist) ----------

	private wireStaticEvents(): void {
		const on = (action: string, handler: (e: Event) => void) => {
			this.qsa(`[data-action="${action}"]`).forEach(el => this.registerDomEvent(el, "click", handler));
		};

		on("force-save", () => { void this.save().then(() => new Notice("Saved.")); });
		on("show-lr", () => this.showLogicalRelationships());
		on("hide-lr", () => this.hideLogicalRelationships());
		on("show-resources", () => this.showResources());
		on("hide-resources", () => this.hideResources());
		on("show-instructions", () => this.showInstructions());
		on("show-textflow-instructions", () => this.showTextFlowInstructions());
		on("hide-textflow-instructions", () => this.hideTextFlowInstructions());
		on("textflow-to-brackets", () => this.convertTextFlowToBrackets());
		on("hide-instructions", () => this.hideInstructions());
		on("show-flow-help", () => this.byId("flow-help-modal")?.classList.remove("hidden"));
		on("hide-flow-help", () => this.byId("flow-help-modal")?.classList.add("hidden"));
		on("undo", () => this.undoLastAction());
		on("redo", () => this.redoLastAction());
		// Clicking a dialog's dimmed backdrop (outside the dialog) closes it.
		this.qsa(".da-modal-backdrop").forEach(backdrop => {
			this.registerDomEvent(backdrop, "click", (e: MouseEvent) => {
				if (e.target === backdrop) backdrop.classList.add("hidden");
			});
		});
		// Clicking outside the label editor closes it without saving.
		this.registerDomEvent(document, "mousedown", (e: MouseEvent) => {
			const le = this.byId("label-editor");
			if (le && le.style.display !== "none" && !le.contains(e.target as Node)) this.hideLabelEditor();
		}, { capture: true });
		on("export-png", () => { void this.exportPNG(); });
		on("insert-props", () => this.splitIntoPropositions());
		on("add-prop", () => this.addNewProposition());
		on("add-blank-bracket", () => this.addBlankBracket());
		on("add-single-node-bracket", () => this.addSingleNodeBracket());
		on("zoom-out", () => this.adjustZoom(-0.1));
		on("zoom-in", () => this.adjustZoom(0.1));
		on("zoom-reset", () => this.resetZoom());
		on("sf-zoom-out", () => this.adjustNotesZoom(-0.1));
		on("sf-zoom-in", () => this.adjustNotesZoom(0.1));
		on("sf-zoom-reset", () => this.resetNotesZoom());
		on("tf-zoom-out", () => this.adjustNotesZoom(-0.1));
		on("tf-zoom-in", () => this.adjustNotesZoom(0.1));
		on("tf-zoom-reset", () => this.resetNotesZoom());
		on("clear-brackets", () => this.clearBracketsOnly());
		on("reset-all", () => this.resetAll());
		on("toggle-sidebar", () => this.toggleSidebar());
		on("deselect", () => this.deselectAll());
		this.qsa<HTMLButtonElement>('[data-action="open-external"]').forEach(el => {
			this.registerDomEvent(el, "click", () => window.open(el.dataset.url, "_blank"));
		});

		const rtlToggle = this.byId("rtl-toggle");
		if (rtlToggle) this.registerDomEvent(rtlToggle, "click", () => this.toggleRTL());

		const themeSelect = this.byId("theme-select") as HTMLSelectElement | null;
		if (themeSelect) this.registerDomEvent(themeSelect, "change", () => this.setColorTheme(themeSelect.value));

		this.initializeCanvasClick();
		this.initializePanning();
		this.makeResizable("left-resizer", "left-sidebar", "left");
		this.applySidebarHidden();

		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => this.handleKeydown(e));
		this.registerDomEvent(document, "input", (e: Event) => this.expandTherefore(e.target));

		this.qsa<HTMLButtonElement>(".da-tab-btn").forEach(btn => {
			this.registerDomEvent(btn, "click", () => {
				const tab = btn.dataset.tab ?? "";
				this.switchTab(isFlowTab(tab) ? tab : "brackets");
			});
		});

		this.wireSentenceFlowEvents();
	}

	// ---------- left sidebar show/hide ----------

	// Remembered across files and restarts (plugin settings), and applied to
	// every open DA view so they all agree.
	toggleSidebar(): void {
		this.plugin.settings.sidebarHidden = !this.plugin.settings.sidebarHidden;
		void this.plugin.saveSettings();
		this.plugin.refreshAllViews();
	}

	applySidebarHidden(): void {
		const hidden = !!this.plugin.settings.sidebarHidden;
		this.byId("left-sidebar")?.classList.toggle("da-sidebar-collapsed", hidden);
		this.byId("left-resizer")?.classList.toggle("da-sidebar-collapsed", hidden);
		const btn = this.byId("sidebar-toggle");
		if (btn) {
			const label = hidden ? "Show sidebar" : "Hide sidebar";
			btn.setAttribute("title", label);
			btn.setAttribute("aria-label", label);
			btn.setAttribute("aria-pressed", String(!hidden));
			btn.classList.toggle("da-sidebar-toggle-active", !hidden);
		}
	}

	// ---------- Text Flow / Sentence Flow tabs ----------

	private switchTab(tab: "brackets" | FlowKey): void {
		this.activeTab = tab;
		this.qsa(".da-tab-btn").forEach(btn => btn.classList.toggle("da-tab-btn-active", btn.dataset.tab === tab));
		this.byId("brackets-toolbar")?.classList.toggle("da-tab-toolbar-hidden", tab !== "brackets");
		this.byId("sidebar-toggle")?.classList.toggle("da-tab-toolbar-hidden", tab !== "brackets");
		this.byId("brackets-panel")?.classList.toggle("da-tab-panel-hidden", tab !== "brackets");
		FLOW_KEYS.forEach(key => {
			this.byId(`${key}-toolbar`)?.classList.toggle("da-tab-toolbar-hidden", tab !== key);
			this.byId(`${key}-panel`)?.classList.toggle("da-tab-panel-hidden", tab !== key);
		});
		if (isFlowTab(tab)) {
			window.requestAnimationFrame(() => this.layoutNotesTabs());
		} else {
			window.requestAnimationFrame(() => this.renderCanvas());
		}
	}

	// Both flow canvases share these handlers; they act on whichever flow tab
	// is active (only its canvas is visible, so it's the only one that can
	// hold focus).
	private wireSentenceFlowEvents(): void {
		FLOW_KEYS.forEach(key => {
			const canvas = this.flowCanvas(key);
			if (!canvas) return;
			this.registerDomEvent(canvas, "paste", (e: ClipboardEvent) => this.handleNotesPaste(e));
			this.registerDomEvent(canvas, "keydown", (e: KeyboardEvent) => this.handleNotesKeydown(e));
			this.registerDomEvent(canvas, "input", () => { this.scheduleNotesLayout(false, key); this.requestSave(); });
		});

		this.qsa<HTMLButtonElement>("[data-fmt]").forEach(btn => {
			// Prevent the toolbar button from stealing focus/selection away
			// from the canvas before the click handler runs execCommand -
			// execCommand acts on whatever is currently selected, so losing
			// the selection first would make Bold/Italic/Underline no-ops.
			this.registerDomEvent(btn, "mousedown", (e: MouseEvent) => e.preventDefault());
			this.registerDomEvent(btn, "click", () => {
				this.applySentenceFlowFormat(btn.dataset.fmt as string);
				this.updateNotesFormatButtonStates();
			});
		});

		this.registerDomEvent(document, "selectionchange", () => {
			if (isFlowTab(this.activeTab) && document.activeElement === this.flowCanvas()) {
				this.updateNotesFormatButtonStates();
			}
		});

		this.qsa<HTMLInputElement>(".da-sf-tabwidth-input").forEach(tabWidthInput => {
			const key = tabWidthInput.dataset.flow as FlowKey;
			this.registerDomEvent(tabWidthInput, "change", () => {
				const inches = parseFloat(tabWidthInput.value);
				if (!isNaN(inches) && inches > 0) this.flows[key].defaultTabWidth = Math.round(inches * 96);
				this.syncNotesToolbarUi(key);
				this.layoutNotesTabs(key);
				this.requestSave();
			});
		});
	}

	private focusIsWithinThisView(): boolean {
		const active = document.activeElement;
		if (!active) return false;
		if (this.contentEl.contains(active)) return true;
		// Also treat "nothing meaningfully focused" (body) as belonging to whichever
		// view the mouse most recently interacted with; we approximate by checking
		// the leaf is the active leaf in the workspace.
		return this.leaf === this.app.workspace.activeLeaf;
	}

	// Typing "\tf" or "\therefore" in any text field of this view turns into
	// "∴" as soon as the last character is typed (LaTeX-style, so it can't
	// collide with normal text). Undo (Ctrl+Z) in a contenteditable restores
	// the typed text.
	private expandTherefore(target: EventTarget | null): void {
		const el = target as HTMLElement | null;
		if (!el || !this.containerEl.contains(el)) return;
		const triggers = ["\\therefore", "\\tf"];

		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
			const pos = el.selectionStart;
			if (pos === null || pos !== el.selectionEnd) return;
			const before = el.value.slice(0, pos);
			const trig = triggers.find(t => before.endsWith(t));
			if (!trig) return;
			el.setRangeText("∴", pos - trig.length, pos, "end");
			el.dispatchEvent(new Event("input", { bubbles: true }));
			return;
		}

		if (!el.isContentEditable) return;
		const sel = window.getSelection();
		if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return;
		const node = sel.anchorNode as Text;
		const before = (node.data ?? "").slice(0, sel.anchorOffset);
		const trig = triggers.find(t => before.endsWith(t));
		if (!trig) return;
		const range = document.createRange();
		range.setStart(node, sel.anchorOffset - trig.length);
		range.setEnd(node, sel.anchorOffset);
		sel.removeAllRanges();
		sel.addRange(range);
		document.execCommand("insertText", false, "∴");
	}

	// For the "Insert ∴" command (bindable to a hotkey): types "∴" at the
	// caret of whatever text field in this view has focus. Returns false if
	// nothing editable is focused.
	insertTherefore(): boolean {
		const active = document.activeElement as HTMLElement | null;
		if (!active || !this.containerEl.contains(active)) return false;
		if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
			const start = active.selectionStart ?? active.value.length;
			const end = active.selectionEnd ?? start;
			active.setRangeText("∴", start, end, "end");
			active.dispatchEvent(new Event("input", { bubbles: true }));
			return true;
		}
		if (!active.isContentEditable) return false;
		document.execCommand("insertText", false, "∴");
		return true;
	}

	// Is focus in a text field the browser should keep its own keys for
	// (native Tab / undo / redo)? A proposition's text counts only once it has
	// actually been edited - right after clicking a row to select it, Ctrl+Z
	// still means "undo the last diagram change".
	private focusedTextFieldOwnsKeys(): boolean {
		const active = document.activeElement as HTMLElement | null;
		if (!active) return false;
		if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT") return true;
		if (!active.isContentEditable) return false;
		if (active.matches(".da-row-text, .da-prop-text")) {
			const prop = this.propositions[Number(active.dataset.index)];
			return !prop || readRunsFrom(active).text !== prop.text;
		}
		return true;
	}

	private closeTopModal(): boolean {
		const open = this.qsa(".da-modal-backdrop:not(.hidden)");
		if (!open.length) return false;
		open[open.length - 1].classList.add("hidden");
		return true;
	}

	private handleKeydown(e: KeyboardEvent): void {
		if (!this.focusIsWithinThisView()) return;

		if (e.key === "Escape") {
			const le = this.byId("label-editor");
			if (le && le.style.display !== "none") { this.hideLabelEditor(); e.preventDefault(); return; }
			if (this.closeTopModal()) { e.preventDefault(); return; }
		}

		// The flow canvases handle their own Tab/Ctrl+Z/Ctrl+B etc. (see
		// handleNotesKeydown) and rely on the browser's native contentEditable
		// undo stack, so none of the Brackets-tab shortcuts below should run
		// while focus is inside one.
		const inNotesCanvas = !!(e.target as HTMLElement | null)?.closest?.(".da-sf-canvas");
		if (inNotesCanvas) return;
		if (this.qsa(".da-modal-backdrop:not(.hidden)").length) return;

		const mod = e.ctrlKey || e.metaKey;
		const key = (e.key || "").toLowerCase();
		if (mod && !e.altKey && (key === "z" || key === "y")) {
			if (this.focusedTextFieldOwnsKeys()) return; // native text undo/redo
			e.preventDefault();
			if (key === "y" || e.shiftKey) this.redoLastAction();
			else this.undoLastAction();
			return;
		}

		if (this.activeTab !== "brackets") return;

		if (e.key === "Tab" && (this.selectedIndices.length >= 1 || this.sidebarSelected >= 0)) {
			const active = document.activeElement as HTMLElement | null;
			// Leave Tab alone in the paste box, label editors, etc.
			if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.classList.contains("da-row-num"))) return;
			e.preventDefault();
			if (this.selectedIndices.length >= 1) {
				this.saveToHistory();
				this.selectedIndices.forEach(idx => {
					if (this.propositions[idx] !== undefined) {
						this.propositions[idx].level = Math.max(0, this.propositions[idx].level + (e.shiftKey ? -1 : 1));
					}
				});
				this.renderSidebarList(); this.renderMainRows(); this.renderCanvas();
			} else if (this.sidebarSelected >= 0 && this.propositions[this.sidebarSelected] !== undefined) {
				this.saveToHistory();
				this.propositions[this.sidebarSelected].level = Math.max(0, this.propositions[this.sidebarSelected].level + (e.shiftKey ? -1 : 1));
				this.renderSidebarList(); this.renderMainRows(); this.renderCanvas();
			}
			return;
		}

		if ((e.key === "Delete" || e.key === "Backspace") && this.selectedBracketId !== null) {
			const active = document.activeElement as HTMLElement | null;
			const tag = active ? active.tagName : "";
			const isEditable = active ? active.isContentEditable : false;
			if (tag !== "INPUT" && tag !== "TEXTAREA" && !isEditable) {
				e.preventDefault();
				this.confirmAction("Delete this bracket?", () => {
					this.saveToHistory();
					const removedId = this.selectedBracketId;
					this.brackets = this.brackets.filter(b => b.id !== removedId);
					this.deparentReferencesTo([removedId]);
					this.selectedBracketId = null;
					this.selectedCorners = [];
					this.renderCanvas();
				});
			}
		}
	}

	// ---------- zoom ----------

	adjustZoom(delta: number): void {
		const oldZoom = this.zoomLevel;
		this.zoomLevel = Math.min(3, Math.max(0.3, Math.round((this.zoomLevel + delta) * 10) / 10));
		const container = this.byId("diagram-container");
		if (!this.isRTL && container) {
			if (this.zoomLevel >= 1) {
				const clientWidth = container.clientWidth;
				const oldScrollLeft = container.scrollLeft;
				this.applyZoom();
				const newScrollLeft = (oldScrollLeft + clientWidth) * (this.zoomLevel / oldZoom) - clientWidth;
				container.scrollLeft = Math.max(0, newScrollLeft);
			} else {
				this.applyZoom();
				container.scrollLeft = 0;
			}
			this.requestSave();
			return;
		}
		this.applyZoom();
		this.requestSave();
	}

	resetZoom(): void {
		this.zoomLevel = 1;
		const container = this.byId("diagram-container");
		if (!this.isRTL && container) {
			this.applyZoom();
			container.scrollLeft = 0;
			this.requestSave();
			return;
		}
		this.applyZoom();
		this.requestSave();
	}

	applyZoom(): void {
		// workspace-scaler has min-width:100% (see styles.css), so it always
		// spans at least the full container width even when the diagram
		// itself is narrower - a plain scale() from a fixed corner is enough
		// to keep that corner pinned at every zoom level, LTR or RTL. This
		// used to also translateX() the scaler to flush it against the
		// opposite edge whenever the zoomed-out diagram got narrower than the
		// container, which made the pinned corner visibly jump around as you
		// zoomed - removed in favor of a single consistent anchor.
		const scaler = this.byId("workspace-scaler");
		if (scaler) {
			scaler.setCssStyles({
				transformOrigin: this.isRTL ? "top right" : "top left",
				transform: `scale(${this.zoomLevel})`,
			});
		}
		const label = this.byId("zoom-label");
		if (label) label.textContent = Math.round(this.zoomLevel * 100) + "%";
	}

	// Each flow tab has its own independent zoom level (flows[key].zoomLevel), kept
	// separate from the bracket workspace's zoomLevel since they're different
	// canvases. The canvas's own width always fills its wrap (see
	// .da-sf-canvas), so unlike the bracket workspace's variable-width
	// diagram, a plain CSS transform-origin is enough to pin the anchor
	// corner - no translateX/scroll bookkeeping needed: top-left in normal
	// mode, top-right in Hebrew (RTL) mode, matching each mode's reading
	// direction.
	adjustNotesZoom(delta: number): void {
		const key = this.curFlowKey();
		const f = this.flows[key];
		f.zoomLevel = Math.min(3, Math.max(0.3, Math.round((f.zoomLevel + delta) * 10) / 10));
		this.applyNotesZoom(key);
		this.requestSave();
	}

	resetNotesZoom(): void {
		const key = this.curFlowKey();
		this.flows[key].zoomLevel = 1;
		this.applyNotesZoom(key);
		this.requestSave();
	}

	// With no key, applies every flow canvas's zoom (e.g. after load or an
	// RTL toggle, which changes each canvas's anchor corner).
	applyNotesZoom(key?: FlowKey): void {
		(key ? [key] : FLOW_KEYS).forEach(k => {
			const f = this.flows[k];
			const canvas = this.flowCanvas(k);
			if (canvas) {
				canvas.setCssStyles({
					transformOrigin: this.isRTL ? "top right" : "top left",
					transform: `scale(${f.zoomLevel})`,
				});
			}
			const label = this.byId(f.zoomLabelId);
			if (label) label.textContent = Math.round(f.zoomLevel * 100) + "%";
		});
	}

	private syncRtlToggleUi(): void {
		const btn = this.byId("rtl-toggle");
		const thumb = this.byId("rtl-thumb");
		if (!btn || !thumb) return;
		if (this.isRTL) {
			btn.classList.add("da-switch-on");
			btn.setAttribute("aria-checked", "true");
		} else {
			btn.classList.remove("da-switch-on");
			btn.setAttribute("aria-checked", "false");
		}
	}

	toggleRTL(): void {
		this.isRTL = !this.isRTL;
		this.syncRtlToggleUi();
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
		FLOW_KEYS.forEach(key => {
			const flowEl = this.flowCanvas(key);
			if (flowEl) {
				flowEl.dir = this.isRTL ? "rtl" : "ltr";
				this.layoutNotesTabs(key);
			}
		});
		this.applyNotesZoom();
		this.applyZoom();
		void this.save();
	}

	// ---------- theme coloring ----------

	// Applies the vault-wide colour theme and any manual color overrides to
	// this view's DOM and theme dropdown. Called on open and after any
	// view/settings tab changes either setting, so every open DA view stays
	// in sync with the shared plugin settings.
	refreshTheming(): void {
		this.contentEl.classList.remove(...ALL_COLOR_THEME_CLASSES);
		this.contentEl.classList.add(...colorThemeClasses(this.plugin.settings.colorTheme));
		this.syncThemeSelectUi();
		this.applyColorOverrides();
		this.applySidebarHidden();
		this.contentEl.style.setProperty("--da-ui-scale", String(this.uiScale()));
	}

	private uiScale(): number {
		return this.plugin.settings.uiScale || 1;
	}

	private applyColorOverrides(): void {
		const overrides = this.plugin.settings.colorOverrides;
		for (const token of COLOR_TOKENS) {
			const value = overrides[token.id];
			if (value) {
				this.contentEl.style.setProperty(token.cssVar, value);
			} else {
				this.contentEl.style.removeProperty(token.cssVar);
			}
		}
	}

	private syncThemeSelectUi(): void {
		const sel = this.byId("theme-select") as HTMLSelectElement | null;
		if (sel) sel.value = this.plugin.settings.colorTheme;
	}

	setColorTheme(theme: string): void {
		this.plugin.settings.colorTheme = COLOR_THEMES.some(t => t.id === theme) ? theme : "standard";
		void this.plugin.saveSettings();
		this.plugin.refreshAllViews();
	}

	// ---------- history / persistence ----------

	// A snapshot of the undoable Brackets-tab state. The flow tabs keep their
	// own native (contenteditable) undo, so their content is only captured
	// for actions that change it (Reset All) - restoring it on every undo
	// would throw away typing done since.
	private historySnapshot(includeFlows: boolean): string {
		const snap: Record<string, unknown> = {
			propositions: JSON.parse(JSON.stringify(this.propositions)),
			brackets: JSON.parse(JSON.stringify(this.brackets)),
			selectedIndices: [...this.selectedIndices],
			selectedBracketId: this.selectedBracketId,
			selectedCorners: [...this.selectedCorners],
		};
		if (includeFlows) {
			if (this.domBuilt) FLOW_KEYS.forEach(key => { this.flows[key].lines = this.serializeNotesLines(key); });
			snap.flows = {
				sentenceflow: JSON.parse(JSON.stringify(this.flowToJson("sentenceflow"))),
				textflow: JSON.parse(JSON.stringify(this.flowToJson("textflow"))),
			};
		}
		return JSON.stringify(snap);
	}

	// Call right before an undoable change. The save is deferred until the
	// change itself has been applied - saving here would write the state
	// from before it.
	saveToHistory(includeFlows = false): void {
		this.historyStack.push(this.historySnapshot(includeFlows));
		if (this.historyStack.length > HISTORY_LIMIT) this.historyStack.shift();
		this.redoStack = [];
		this.saveSoon();
	}

	private saveSoon(): void {
		window.setTimeout(() => { void this.save(); }, 0);
	}

	private restoreSnapshot(json: string): void {
		const prev = JSON.parse(json);
		this.propositions = prev.propositions || [];
		this.brackets = prev.brackets || [];
		this.selectedIndices = prev.selectedIndices || [];
		this.selectedBracketId = prev.selectedBracketId ?? null;
		this.selectedCorners = prev.selectedCorners || (prev.selectedCorner ? [prev.selectedCorner] : []);
		if (this.sidebarSelected >= this.propositions.length) this.sidebarSelected = -1;
		if (prev.flows) {
			FLOW_KEYS.forEach(key => this.loadFlowFromJson(key, prev.flows[key]));
			this.renderNotesTab();
			this.applyNotesZoom();
		}
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
		this.saveSoon();
	}

	undoLastAction(): void {
		const prev = this.historyStack.pop();
		if (prev === undefined) return;
		this.redoStack.push(this.historySnapshot(!!JSON.parse(prev).flows));
		if (this.redoStack.length > HISTORY_LIMIT) this.redoStack.shift();
		this.restoreSnapshot(prev);
	}

	redoLastAction(): void {
		const next = this.redoStack.pop();
		if (next === undefined) return;
		this.historyStack.push(this.historySnapshot(!!JSON.parse(next).flows));
		if (this.historyStack.length > HISTORY_LIMIT) this.historyStack.shift();
		this.restoreSnapshot(next);
	}

	migrateSingleNodeBrackets(): void {
		this.brackets.forEach(b => {
			if (!b.singleNode) return;
			if (!b.nodes) {
				b.nodes = [b.start, b.end];
			}
			if (!b.parentBracketIds) {
				const ids = [b.parentBracketId, b.parentBracketId2].filter(x => x !== undefined);
				b.parentBracketIds = ids;
			}
		});
	}

	// ---------- sidebar list ----------

	// Toggling which proposition is selected doesn't change any row's text or
	// layout, only its highlight - so update that in place instead of going
	// through a full render*() rebuild. A full rebuild replaces every row's
	// DOM node, which always steals focus away from whatever the user just
	// clicked into (breaking mid-click selection, or immediately un-focusing
	// a row you meant to start editing) whether it runs synchronously or
	// deferred a tick.
	private refreshSelectionHighlighting(): void {
		const sidebarContainer = this.byId("sidebar-prop-list");
		if (sidebarContainer) {
			Array.from(sidebarContainer.children).forEach((child, i) => {
				child.classList.toggle("da-prop-row-selected", i === this.sidebarSelected);
			});
		}
		const mainContainer = this.byId("proposition-rows");
		if (mainContainer) {
			Array.from(mainContainer.children).forEach((child, i) => {
				child.classList.toggle("selected", this.selectedIndices.includes(i));
			});
		}
	}

	renderSidebarList(): void {
		const container = this.byId("sidebar-prop-list");
		if (!container) return;
		container.empty();
		if (this.propositions.length === 0) {
			const hint = container.createDiv({ cls: "da-empty-hint" });
			hint.createSpan({ text: "No propositions yet." });
			hint.createEl("br");
			hint.createSpan({ text: "Paste and split above." });
		}

		const rowLabels = computeRowLabels(this.propositions);
		this.propositions.forEach((prop, i) => {
			const row = createDiv({ cls: `da-prop-row${i === this.sidebarSelected ? " da-prop-row-selected" : ""}` });
			row.dataset.index = String(i);
			row.addEventListener("click", e => {
				e.stopImmediatePropagation();
				this.sidebarSelected = i;
				this.selectedIndices = [i];
				this.refreshSelectionHighlighting();
			});

			const dragHandle = createDiv({ cls: "da-drag-handle", text: "⋮⋮", attr: { title: "Drag to reorder" } });
			dragHandle.addEventListener("mousedown", e => e.stopPropagation());

			row.draggable = false;
			dragHandle.addEventListener("mousedown", () => { row.draggable = true; });
			row.addEventListener("dragend", () => { row.draggable = false; });

			const clearDragBorders = (el: HTMLElement) => el.setCssStyles({ borderTop: "", borderBottom: "" });

			row.addEventListener("dragstart", e => {
				this.dragSrcIndex = i;
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", String(i));
				}
				window.setTimeout(() => { row.setCssStyles({ opacity: "0.4" }); }, 0);
			});

			row.addEventListener("dragend", () => {
				row.setCssStyles({ opacity: "" });
				row.draggable = false;
				this.qsa("#sidebar-prop-list .da-prop-row").forEach(r => clearDragBorders(r));
			});

			row.addEventListener("dragover", e => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				const rect = row.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;
				this.qsa("#sidebar-prop-list .da-prop-row").forEach(r => clearDragBorders(r));
				if (e.clientY < midY) row.setCssStyles({ borderTop: "2px solid var(--da-accent)" });
				else row.setCssStyles({ borderBottom: "2px solid var(--da-accent)" });
			});

			row.addEventListener("dragleave", () => clearDragBorders(row));

			row.addEventListener("drop", e => {
				e.preventDefault();
				e.stopImmediatePropagation();
				clearDragBorders(row);
				if (this.dragSrcIndex === null || this.dragSrcIndex === i) return;

				const rect = row.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;
				const dropIndex = e.clientY < midY ? i : i + 1;
				const insertIndex = this.dragSrcIndex < dropIndex ? dropIndex - 1 : dropIndex;
				if (insertIndex === this.dragSrcIndex) return;

				this.saveToHistory();

				const moved = this.propositions.splice(this.dragSrcIndex, 1)[0];
				this.propositions.splice(insertIndex, 0, moved);

				const from = this.dragSrcIndex as number;
				this.brackets.forEach(b => {
					// Single-node brackets render from `nodes`, not start/end
					// (see renderCanvas's nodeRows), so it has to be remapped
					// in lockstep or the drawn anchors go stale after a drag.
					if (b.singleNode && b.nodes) {
						b.nodes = b.nodes.map(r => this.remapRow(r, from, insertIndex)).sort((x, y) => x - y);
						b.start = b.nodes[0];
						b.end = b.nodes[b.nodes.length - 1];
					} else {
						b.start = this.remapRow(b.start, from, insertIndex);
						b.end = this.remapRow(b.end, from, insertIndex);
						// Moving a row past its bracket's other end flips the span.
						if (b.start > b.end) [b.start, b.end] = [b.end, b.start];
					}
					if (b.attachToRow !== undefined) {
						b.attachToRow = this.remapRow(b.attachToRow, from, insertIndex);
					}
				});

				if (this.sidebarSelected === this.dragSrcIndex) this.sidebarSelected = insertIndex;
				this.selectedIndices = this.selectedIndices.map(idx => this.remapIndex(idx, this.dragSrcIndex, insertIndex));

				this.dragSrcIndex = null;
				this.renderSidebarList();
				this.renderMainRows();
				this.renderCanvas();
			});

			const numBadge = createDiv({ cls: "da-num-badge", text: rowLabels[i] });

			const textEl = createDiv({ cls: "da-prop-text" });
			textEl.dataset.index = String(i);
			renderRunsInto(textEl, propRuns(prop));
			textEl.contentEditable = "true";
			textEl.spellcheck = false;
			textEl.dir = this.isRTL ? "rtl" : "ltr";
			textEl.addEventListener("click", e => e.stopImmediatePropagation());
			textEl.addEventListener("focus", () => {
				this.sidebarSelected = i;
				this.selectedIndices = [i];
				this.refreshSelectionHighlighting();
			});
			textEl.addEventListener("blur", () => this.updatePropositionText(i, textEl));

			const delBtn = createEl("button", { cls: "da-del-btn", text: "✕" });
			delBtn.addEventListener("click", e => { e.stopImmediatePropagation(); this.deleteProposition(i); });

			row.appendChild(dragHandle);
			row.appendChild(numBadge);
			row.appendChild(textEl);
			row.appendChild(delBtn);
			container.appendChild(row);
		});
	}

	// remapIndex for a possibly fractional row (a single-node bracket's
	// corner row is its midpoint, which other brackets can attach to).
	remapRow(r: number, from: number, to: number): number {
		if (Number.isInteger(r)) return this.remapIndex(r, from, to);
		const lo = Math.floor(r), hi = Math.ceil(r);
		const a = this.remapIndex(lo, from, to), b = this.remapIndex(hi, from, to);
		return a + (b - a) * (r - lo);
	}

	remapIndex(idx: number, from: number, to: number): number {
		if (idx === from) return to;
		if (from < to) {
			if (idx > from && idx <= to) return idx - 1;
		} else {
			if (idx >= to && idx < from) return idx + 1;
		}
		return idx;
	}

	// Inserting a proposition at `insertedAt` shifts every proposition from
	// that position onward up by one - brackets (start/end/attachToRow/nodes,
	// the latter used directly by single-node bracket rendering, see
	// renderCanvas's nodeRows) and the current selection have to shift with
	// them or they end up pointing at the wrong row.
	private shiftReferencesForInsertion(insertedAt: number): void {
		const shift = (idx: number) => (idx >= insertedAt ? idx + 1 : idx);
		this.brackets.forEach(b => {
			b.start = shift(b.start);
			b.end = shift(b.end);
			if (b.attachToRow !== undefined) b.attachToRow = shift(b.attachToRow);
			if (b.nodes) b.nodes = b.nodes.map(shift);
		});
		this.selectedIndices = this.selectedIndices.map(shift);
		if (this.sidebarSelected >= insertedAt) this.sidebarSelected = shift(this.sidebarSelected);
	}

	// ---------- main rows ----------

	renderMainRows(): void {
		const container = this.byId("proposition-rows");
		if (!container) return;

		// Emptying the container mid-rebuild briefly collapses its height,
		// which can make the scrollable workspace clamp its scroll position
		// to fit the (temporarily) shorter content - showing up as the pan
		// position jumping every time a row is clicked/edited/reordered.
		// Save and restore it around the rebuild so panning is unaffected.
		const scrollContainer = this.byId("diagram-container");
		const savedScroll = scrollContainer ? { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop } : null;
		const restoreScroll = () => {
			if (scrollContainer && savedScroll) {
				scrollContainer.scrollLeft = savedScroll.left;
				scrollContainer.scrollTop = savedScroll.top;
			}
		};

		container.empty();
		if (this.propositions.length === 0) {
			const hint = container.createDiv({ cls: "da-empty-hint da-empty-hint-main" });
			hint.createSpan({ text: "Propositions appear here" });
			hint.createEl("br");
			hint.createSpan({ text: "Double-click any row to split at exact click location" });
			restoreScroll();
			window.requestAnimationFrame(restoreScroll);
			return;
		}

		const rowLabels = computeRowLabels(this.propositions);
		this.propositions.forEach((prop, i) => {
			const isSelected = this.selectedIndices.includes(i);
			const row = createDiv({ cls: `da-proposition-box${isSelected ? " selected" : ""}` });
			row.setCssStyles({ marginInlineStart: `${prop.level * 48}px` });
			// Toggling selection on "mousedown" rather than "click" matters when
			// another row's text is currently focused: focus-shift (and this
			// row's own blur handler, which fully rebuilds this list) happens as
			// part of the browser's mousedown default action, *before* "click" is
			// dispatched. If that rebuild replaces this row's element (which it
			// does - it's a full renderMainRows()) between mousedown and mouseup,
			// the browser can no longer deliver a "click" to it at all, since its
			// mousedown target has been detached from the DOM. That made
			// selecting a new row while another was being edited silently eat the
			// first click (it only blurred the old row) and require a second one.
			// Running the toggle on mousedown - before that rebuild happens -
			// avoids the race entirely.
			row.addEventListener("mousedown", e => { e.stopPropagation(); this.handleMainRowClick(i); });
			row.addEventListener("dblclick", e => { e.stopImmediatePropagation(); this.splitProposition(i, e); });

			const numEl = createDiv({ cls: "da-row-num", text: rowLabels[i], attr: { title: "Click to edit this row's label" } });
			// Click-to-edit this row's label (e.g. "5a") directly, as free
			// text - whatever's typed is stored verbatim and wins over
			// anything auto-detected (see the `verseLabel` field comment).
			// Stop the row's own mousedown/dblclick handlers from firing so
			// this doesn't also toggle selection or split the proposition.
			numEl.addEventListener("mousedown", e => e.stopPropagation());
			numEl.addEventListener("dblclick", e => e.stopImmediatePropagation());
			let cancelled = false;
			numEl.addEventListener("click", e => {
				e.stopImmediatePropagation();
				if (numEl.isContentEditable) return;
				cancelled = false;
				numEl.contentEditable = "true";
				numEl.innerText = prop.verseLabel ?? "";
				numEl.focus();
			});
			numEl.addEventListener("keydown", e => {
				if (e.key === "Enter") { e.preventDefault(); numEl.blur(); }
				else if (e.key === "Escape") { e.preventDefault(); cancelled = true; numEl.blur(); }
			});
			numEl.addEventListener("blur", () => {
				numEl.contentEditable = "false";
				if (cancelled) { numEl.innerText = rowLabels[i]; return; }
				this.updatePropositionVerseLabel(i, numEl.innerText);
			});

			const textEl = createDiv({ cls: "da-row-text" });
			textEl.dataset.index = String(i);
			renderRunsInto(textEl, propRuns(prop));
			textEl.contentEditable = "true";
			textEl.spellcheck = false;
			textEl.dir = this.isRTL ? "rtl" : "ltr";
			textEl.addEventListener("blur", () => this.updatePropositionText(i, textEl));

			// Focusing a contenteditable element makes the browser auto-scroll
			// its nearest scrollable ancestor (the panned workspace) to bring
			// it fully into view. That's disorienting when panned far from the
			// origin, so snap the pan position back to what it was right
			// before the click-triggered focus. Some browsers apply that
			// auto-scroll synchronously, others defer it a frame, so restore
			// it both immediately and again on the next frame to catch either
			// case.
			let scrollBeforeFocus: { left: number; top: number } | null = null;
			textEl.addEventListener("mousedown", () => {
				const container = this.byId("diagram-container");
				scrollBeforeFocus = container ? { left: container.scrollLeft, top: container.scrollTop } : null;
			});
			textEl.addEventListener("focus", () => {
				const saved = scrollBeforeFocus;
				scrollBeforeFocus = null;
				if (!saved) return;
				const restore = () => {
					const container = this.byId("diagram-container");
					if (container) {
						container.scrollLeft = saved.left;
						container.scrollTop = saved.top;
					}
				};
				restore();
				window.requestAnimationFrame(restore);
			});

			const delBtn = createEl("button", { cls: "da-row-del", text: "×" });
			// Selection now toggles on the row's mousedown (see above), so this
			// has to stop that event from bubbling up too, or pressing delete
			// would toggle this row into the selection an instant before
			// deleting it.
			delBtn.addEventListener("mousedown", e => e.stopPropagation());
			delBtn.addEventListener("click", e => { e.stopImmediatePropagation(); this.deleteProposition(i); });

			row.appendChild(numEl);
			row.appendChild(textEl);
			row.appendChild(delBtn);
			container.appendChild(row);
		});

		restoreScroll();
		window.requestAnimationFrame(restoreScroll);
	}

	// ---------- column assignment ----------

	// Does bracket i strictly contain bracket j by row range? Ties (identical
	// spans) break toward the earlier-created bracket staying "outer", same
	// tie-break a nested-brackets renderer uses when two spans coincide.
	private bracketStrictlyContains(i: number, j: number): boolean {
		if (i === j) return false;
		const brackets = this.brackets;
		const bi = brackets[i], bj = brackets[j];
		if (bi.start <= bj.start && bi.end >= bj.end) {
			if (bi.start === bj.start && bi.end === bj.end) return j < i;
			return true;
		}
		return false;
	}

	// The nesting depth implied by structure alone: 1 + the deepest depth of
	// any bracket i strictly contains (by row range) or is explicitly
	// parented to (a corner-linked bilateral bracket bridging two sibling
	// brackets, which row ranges alone can't express). Computed once via
	// post-order DFS - each bracket is only visited after everything it
	// depends on is finalized - so, unlike hunting for a free column by
	// trial and error in array-index order, a container can never be
	// finalized before something nested inside it. That ordering bug was
	// latent in the old crossing-search loop: a bracket processed before its
	// own child (whenever the child had a higher array index) picked its
	// column without ever seeing the child, since the child's column was
	// still unassigned at that point.
	//
	// This alone isn't sufficient for placement, because this bracket model
	// - unlike a strict discourse-tree of nested spans - also allows
	// non-nesting bridges (a bracket parented to two sibling brackets'
	// corners, for a bilateral relationship) that can genuinely cross one
	// another on screen. assignColumns resolves those with its existing
	// crossing/corner-clearance search, just seeded from this depth instead
	// of from 0.
	bracketNestingDepth(): number[] {
		const brackets = this.brackets;
		const n = brackets.length;
		const idToIdx: Record<number, number> = {};
		brackets.forEach((b, i) => { idToIdx[b.id] = i; });

		const depth = new Array(n).fill(0);
		const state = new Array<0 | 1 | 2>(n).fill(0); // 0 unvisited, 1 in progress, 2 done
		const visit = (i: number) => {
			if (state[i] !== 0) return; // done, or a cycle (shouldn't happen via the UI) — treat as a leaf
			state[i] = 1;
			let d = 0;
			for (let j = 0; j < n; j++) {
				if (this.bracketStrictlyContains(i, j)) {
					visit(j);
					d = Math.max(d, depth[j] + 1);
				}
			}
			for (const pid of getParentIds(brackets[i])) {
				const pi = idToIdx[pid];
				if (pi !== undefined && pi !== i) {
					visit(pi);
					d = Math.max(d, depth[pi] + 1);
				}
			}
			depth[i] = d;
			state[i] = 2;
		};
		for (let i = 0; i < n; i++) visit(i);
		return depth;
	}

	assignColumns(): number[] {
		const brackets = this.brackets;
		const n = brackets.length;
		if (n === 0) return [];

		const idToIdx: Record<number, number> = {};
		brackets.forEach((b, i) => { idToIdx[b.id] = i; });

		const COL_STEP = 72;
		const INDENT_STEP = 48;
		const BOX_CLEARANCE = 44;

		const minIndents = brackets.map(b => {
			let minIndent = Infinity;
			for (let r = Math.floor(b.start); r <= Math.ceil(b.end); r++) {
				const p = this.propositions[r];
				if (p !== undefined) minIndent = Math.min(minIndent, p.level);
			}
			return minIndent === Infinity ? 0 : minIndent;
		});

		const colOf = new Array(n).fill(-1);

		// Process brackets in ascending nesting-depth order (children/parents
		// before their dependents) instead of raw array order, so every
		// minCol computation below always sees real, already-assigned
		// columns for anything it depends on.
		const depth = this.bracketNestingDepth();
		const order = brackets.map((_, i) => i).sort((a, b) => depth[a] - depth[b]);

		for (const i of order) {
			const b = brackets[i];

			let minCol = 0;
			for (const pid of getParentIds(b)) {
				const pi = idToIdx[pid];
				if (pi !== undefined && colOf[pi] !== -1) minCol = Math.max(minCol, colOf[pi] + 1);
			}

			brackets.forEach((other, j) => {
				if (j === i || colOf[j] === -1) return;
				if (this.bracketStrictlyContains(i, j)) minCol = Math.max(minCol, colOf[j] + 1);
			});

			for (let col = minCol; ; col++) {
				const effPos_i = col * COL_STEP - minIndents[i] * INDENT_STEP;

				const crosses = brackets.some((other, j) => {
					if (j === i || colOf[j] === -1) return false;

					const s1 = b.start, e1 = b.end;
					const s2 = other.start, e2 = other.end;
					const overlaps = s1 < e2 && e1 > s2;
					const contained = (s1 >= s2 && e1 <= e2) || (s2 >= s1 && e2 <= e1);

					if (colOf[j] === col && overlaps && !contained) return true;

					const top1 = b.attachToRow !== undefined ? b.attachToRow : b.start;
					const top2 = other.attachToRow !== undefined ? other.attachToRow : other.start;
					const sharesCorner = top1 === top2 || top1 === e2 || e1 === top2 || e1 === e2;
					if (sharesCorner) {
						const effPos_j = colOf[j] * COL_STEP - minIndents[j] * INDENT_STEP;
						if (Math.abs(effPos_i - effPos_j) < BOX_CLEARANCE) return true;
					}

					return false;
				});

				if (!crosses) {
					colOf[i] = col;
					break;
				}
			}
		}

		return colOf;
	}

	getCornerRow(bracket: Bracket, isTop: boolean): number {
		if (bracket.singleNode) {
			return (bracket.start + bracket.end) / 2;
		}
		if (isTop && bracket.attachToRow !== undefined) {
			return bracket.attachToRow;
		}
		return isTop ? bracket.start : bracket.end;
	}

	getInterpolatedRowY(rowYs: number[], rowIndex: number): number {
		if (Number.isInteger(rowIndex)) {
			return rowYs[rowIndex] || 0;
		}
		const lower = Math.floor(rowIndex);
		const upper = Math.ceil(rowIndex);
		const lowerY = rowYs[lower];
		const upperY = rowYs[upper];
		if (lowerY === undefined) return upperY || 0;
		if (upperY === undefined) return lowerY || 0;
		return lowerY + (upperY - lowerY) * (rowIndex - lower);
	}

	// ---------- canvas rendering ----------

	renderCanvas(): void {
		const svg = this.byId<SVGSVGElement>("bracket-svg");
		const scaler = this.byId("workspace-scaler");
		const propRows = this.byId("proposition-rows");
		if (!svg || !scaler || !propRows) return;

		const h = Math.max(1200, scaler.scrollHeight);
		svg.setAttribute("height", String(h));
		svg.empty();

		svg.setCssStyles({ left: this.isRTL ? "auto" : "0", right: this.isRTL ? "0" : "auto" });
		propRows.setCssStyles({ direction: this.isRTL ? "rtl" : "ltr" });

		const rows = this.qsa<HTMLElement>("#proposition-rows > div");
		if (rows.length === 0) return;

		const getOffsetTopRelToScaler = (el: HTMLElement | null): number => {
			let top = 0;
			let cur: HTMLElement | null = el;
			while (cur && cur !== scaler) {
				top += cur.offsetTop;
				cur = cur.offsetParent as HTMLElement | null;
			}
			return top;
		};
		const rowYs = rows.map(row => Math.floor(getOffsetTopRelToScaler(row) + row.offsetHeight / 2));

		const brackets = this.brackets;
		const propositions = this.propositions;
		const isRTL = this.isRTL;
		const colOf = this.assignColumns();

		let minLeft = 275;
		brackets.forEach((b, i) => {
			if (b.start >= rowYs.length || b.end >= rowYs.length) return;
			const col = colOf[i];
			const thisLeft = 275 - 12 - col * 72;
			minLeft = Math.min(minLeft, thisLeft);
		});
		let baseRightX = 275 + Math.max(60, -minLeft + 60);

		const COL_STEP = 72;

		const idToIdx: Record<number, number> = {};
		brackets.forEach((b, i) => { idToIdx[b.id] = i; });

		// Positions are worked out in LTR coordinates and mirrored for RTL at
		// the end (RTL x = svgWidth - LTR x - the two layouts were already
		// exact mirror images of each other).
		const bracketLeftX: (number | null)[] = new Array(brackets.length).fill(null);
		const order = brackets.map((b, i) => ({ i, col: colOf[i] >= 0 ? colOf[i] : 0 })).sort((a, b) => a.col - b.col);

		order.forEach(({ i }) => {
			const b = brackets[i];
			const col = colOf[i] >= 0 ? colOf[i] : 0;

			// The rightmost a bracket may sit: just left of the least-indented
			// row it spans, since its vertical line runs past all of them.
			let minIndent = Infinity;
			for (let r = Math.floor(b.start); r <= Math.ceil(b.end); r++) {
				const p = propositions[r];
				if (p !== undefined) minIndent = Math.min(minIndent, p.level);
			}
			if (minIndent === Infinity) minIndent = 0;
			const rowLimitX = baseRightX - 12 + minIndent * 48;

			const parentXs: number[] = [];
			for (const pid of getParentIds(b)) {
				const pi = idToIdx[pid];
				if (pi !== undefined && bracketLeftX[pi] !== null) parentXs.push(bracketLeftX[pi]);
			}

			if (parentXs.length === 0) {
				brackets.forEach((other, j) => {
					if (j === i || bracketLeftX[j] === null) return;
					const strictlyContains = b.start <= other.start && b.end >= other.end && (b.start < other.start || b.end > other.end);
					if (strictlyContains) parentXs.push(bracketLeftX[j]);
				});
			}

			// One column left of the bracket(s) it grows out of - but never
			// past its own rows: with a parent two or more indent levels deeper
			// than this bracket's shallowest row (96px+ vs a 72px column), one
			// column left of the parent would still land inside that row.
			bracketLeftX[i] = parentXs.length > 0
				? Math.min(Math.min(...parentXs) - COL_STEP, rowLimitX)
				: rowLimitX - col * COL_STEP;
		});

		// The row-limit clamp can push brackets further left than the
		// column-based estimate above made room for; widen the gutter so the
		// leftmost bracket keeps the same 60px margin as before.
		const placed = bracketLeftX.filter((x): x is number => x !== null);
		const shift = placed.length ? Math.max(0, 60 - Math.min(...placed)) : 0;
		if (shift > 0) {
			baseRightX += shift;
			bracketLeftX.forEach((x, i) => { if (x !== null) bracketLeftX[i] = x + shift; });
		}

		const svgWidth = baseRightX + 30;
		const bracketPadding = baseRightX + 5;
		if (isRTL) bracketLeftX.forEach((x, i) => { if (x !== null) bracketLeftX[i] = svgWidth - x; });

		svg.setAttribute("width", String(svgWidth));
		svg.setCssStyles({ width: `${svgWidth}px` });

		propRows.setCssStyles({
			paddingLeft: isRTL ? "20px" : `${bracketPadding}px`,
			paddingRight: isRTL ? `${bracketPadding}px` : "20px",
		});

		const nodeY = brackets.map(b => {
			let top = this.getInterpolatedRowY(rowYs, b.start);
			const bot = this.getInterpolatedRowY(rowYs, b.end);
			if (b.attachToRow !== undefined) {
				top = this.getInterpolatedRowY(rowYs, b.attachToRow);
			}
			const center = (top + bot) / 2;
			return { top, bot, center };
		});

		// A single-node bracket's arms: one per node row, with the end arms
		// pinned to the spine's (possibly parent-snapped) ends so the corners
		// always meet.
		const singleNodeArmYs = (i: number): number[] => {
			const b = brackets[i];
			const nodeRows = (b.nodes && b.nodes.length >= 2) ? b.nodes : [b.start, b.end];
			return nodeRows.map((row, k) =>
				k === 0 ? nodeY[i].top
				: k === nodeRows.length - 1 ? nodeY[i].bot
				: this.getInterpolatedRowY(rowYs, row));
		};
		// The label sits mid-spine; when an arm lands just off that point the
		// connector meets the spine a few pixels from the arm and reads as a
		// jog - move the label onto the arm instead.
		const snapLabelToArm = (i: number) => {
			if (!brackets[i].singleNode) return;
			const c = nodeY[i].center;
			let best: number | null = null;
			for (const y of singleNodeArmYs(i)) {
				if (Math.abs(y - c) <= 10 && (best === null || Math.abs(y - c) < Math.abs(best - c))) best = y;
			}
			if (best !== null) nodeY[i].center = best;
		};
		brackets.forEach((_, i) => snapLabelToArm(i));

		brackets.forEach((b, i) => {
			const allParentIds = getParentIds(b);
			if (allParentIds.length === 0) return;

			const snapEndpointToParentCenter = (parentId?: number) => {
				if (parentId === undefined) return;
				const pi = brackets.findIndex(x => x.id === parentId);
				if (pi < 0) return;
				const parent = brackets[pi];
				if (!parent.singleNode) return;
				const pCenter = nodeY[pi].center;
				const topIsFromParent = b.start >= parent.start && b.start <= parent.end;
				const botIsFromParent = b.end >= parent.start && b.end <= parent.end;
				if (topIsFromParent) nodeY[i].top = pCenter;
				if (botIsFromParent) nodeY[i].bot = pCenter;
				nodeY[i].center = (nodeY[i].top + nodeY[i].bot) / 2;
				snapLabelToArm(i);
			};

			allParentIds.forEach(snapEndpointToParentCenter);
		});

		const armEndX = (bracketIdx: number, isTop: boolean): number => {
			const b = brackets[bracketIdx];
			const endRow = isTop ? b.start : b.end;

			const parentIds = getParentIds(b);

			for (const pid of parentIds) {
				const pi = brackets.findIndex(x => x.id === pid);
				if (pi < 0) continue;
				const parent = brackets[pi];
				let parentOwns = false;
				if (parent.singleNode) {
					parentOwns = endRow >= parent.start && endRow <= parent.end;
				} else {
					const parentTopRow = parent.attachToRow !== undefined ? parent.attachToRow : parent.start;
					parentOwns = endRow === parentTopRow || endRow === parent.end;
				}
				if (parentOwns) return bracketLeftX[pi];
			}

			for (let j = 0; j < brackets.length; j++) {
				if (j === bracketIdx) continue;
				const child = brackets[j];
				if (!getParentIds(child).includes(b.id)) continue;
				if (isRTL ? ((bracketLeftX[j]) >= (bracketLeftX[bracketIdx])) : ((bracketLeftX[j]) <= (bracketLeftX[bracketIdx]))) continue;
				const childTopRow = child.attachToRow !== undefined ? child.attachToRow : child.start;
				if (childTopRow === endRow) return bracketLeftX[j];
				if (!child.singleNode && child.end === endRow) return bracketLeftX[j];
			}

			const prop = propositions[Math.round(endRow)];
			const indent = (prop ? prop.level : 0) * 48;
			if (!isRTL) {
				return bracketPadding + indent - 4;
			} else {
				return 30 - indent - 4;
			}
		};

		const armEndXForRow = (bracketIdx: number, row: number): number => {
			const b = brackets[bracketIdx];

			const parentIds = getParentIds(b);
			for (const pid of parentIds) {
				const pi = brackets.findIndex(x => x.id === pid);
				if (pi < 0) continue;
				const parent = brackets[pi];
				let parentOwns = false;
				if (parent.singleNode) {
					parentOwns = row >= parent.start && row <= parent.end;
				} else {
					const parentTopRow = parent.attachToRow !== undefined ? parent.attachToRow : parent.start;
					parentOwns = row === parentTopRow || row === parent.end;
				}
				if (parentOwns) return bracketLeftX[pi];
			}

			for (let j = 0; j < brackets.length; j++) {
				if (j === bracketIdx) continue;
				const child = brackets[j];
				if (!getParentIds(child).includes(b.id)) continue;
				if (isRTL ? ((bracketLeftX[j]) >= (bracketLeftX[bracketIdx])) : ((bracketLeftX[j]) <= (bracketLeftX[bracketIdx]))) continue;
				const childTopRow = child.attachToRow !== undefined ? child.attachToRow : child.start;
				if (childTopRow === row) return bracketLeftX[j];
				if (!child.singleNode && child.end === row) return bracketLeftX[j];
			}

			const prop = propositions[Math.round(row)];
			const indent = (prop ? prop.level : 0) * 48;
			if (!isRTL) {
				return bracketPadding + indent - 4;
			} else {
				return 30 - indent - 4;
			}
		};

		const bracketOrder = brackets.map((b, i) => ({ i, col: colOf[i] })).sort((a, b) => b.col - a.col);

		bracketOrder.forEach(({ i }) => {
			const b = brackets[i];
			if (b.start >= rowYs.length || b.end >= rowYs.length) return;

			const leftX = crisp(bracketLeftX[i]!);
			const y1 = crisp(nodeY[i].top);
			const y2 = crisp(nodeY[i].bot);

			const group = createSvg("g");

			if (b.singleNode) {
				const yCenter = crisp(nodeY[i].center);


				// The outer arms and spine are one continuous stroke so the
				// corners are real joins; each inner arm is a subpath of the same
				// path, so the whole bracket is painted (and anti-aliased) as a
				// single shape with no seams where arms meet the spine.
				const nodeRows = (b.nodes && b.nodes.length >= 2) ? b.nodes : [b.start, b.end];
				const armYs = singleNodeArmYs(i);
				const arms = nodeRows.map((row, k) => ({ y: crisp(armYs[k]), x: crisp(armEndXForRow(i, row)) }));
				const first = arms[0];
				const last = arms[arms.length - 1];
				let d = `M ${first.x} ${first.y} H ${leftX} V ${last.y} H ${last.x}`;
				arms.slice(1, -1).forEach(a => { d += ` M ${leftX} ${a.y} H ${a.x}`; });
				this.appendBracketPath(group, d, b.id);

				this.createCornerBox(group, b.centerLabel || "", leftX, yCenter, true, b.id, !!b.mainPointTop);

				if (this.selectedBracketId === b.id) group.appendChild(this.createBracketHighlight(d));
			} else {
				const aRight1 = crisp(armEndX(i, true));
				const aRight2 = crisp(armEndX(i, false));


				// Top arm, spine and bottom arm as one continuous stroke, so the
				// corners are real joins rather than two line ends meeting.
				const d = `M ${aRight1} ${y1} H ${leftX} V ${y2} H ${aRight2}`;
				this.appendBracketPath(group, d, b.id);

				this.createCornerBox(group, b.topLabel || "", leftX, y1, true, b.id, !!b.mainPointTop);
				this.createCornerBox(group, b.bottomLabel || "", leftX, y2, false, b.id, !!b.mainPointBottom);

				if (this.selectedBracketId === b.id) group.appendChild(this.createBracketHighlight(d));
			}

			svg.appendChild(group);
		});
	}

	// The visible bracket plus a wide invisible copy of the same outline, so
	// clicking anywhere on the spine or an arm selects the bracket.
	appendBracketPath(group: SVGElement, d: string, bracketId: number): void {
		const hit = createSvg("path");
		hit.setAttribute("d", d);
		hit.setAttribute("fill", "none");
		hit.setAttribute("stroke", "transparent");
		hit.setAttribute("stroke-width", "16");
		hit.setAttribute("pointer-events", "stroke");
		hit.addEventListener("click", e => { e.stopImmediatePropagation(); this.selectedBracketId = bracketId; this.selectedCorners = []; this.renderCanvas(); });
		group.appendChild(hit);
		group.appendChild(this.createBracketPath(d));
	}

	// A selected bracket is highlighted along its whole outline, arms included.
	createBracketHighlight(d: string): SVGElement {
		const path = this.createBracketPath(d);
		path.setAttribute("stroke", "var(--da-accent)");
		path.setAttribute("stroke-width", "4");
		return path;
	}

	createBracketPath(d: string): SVGElement {
		const path = createSvg("path");
		path.setAttribute("d", d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", "var(--da-muted)");
		path.setAttribute("stroke-width", "2");
		path.setAttribute("stroke-linejoin", "miter");
		path.setAttribute("pointer-events", "none");
		return path;
	}

	createCornerBox(group: SVGElement,text: string, spineX: number, y: number, isTop: boolean, bracketId: number, isMainPoint: boolean): void {
		const size = 32;
		let boxX: number, connX1: number, connX2: number;

		if (!this.isRTL) {
			boxX = spineX - size - 12;
			connX1 = boxX + size;
			connX2 = spineX;
		} else {
			boxX = spineX + 12;
			connX1 = boxX;
			connX2 = spineX;
		}

		const rect = createSvg("rect");
		rect.setAttribute("x", String(boxX));
		rect.setAttribute("y", String(y - size / 2));
		rect.setAttribute("width", String(size));
		rect.setAttribute("height", String(size));
		rect.setAttribute("rx", "4");
		const isSelected = this.selectedCorners.some(c => c.bracketId === bracketId && c.isTop === isTop);
		// Selection (accent) wins when both apply - it's the active,
		// in-progress action; the main-point mark (its own configurable
		// color, distinct from accent - see COLOR_TOKENS "mainPoint"/
		// "mainPointSoftBg") is the persisted one and shows otherwise.
		if (isSelected) {
			rect.setAttribute("fill", "var(--da-accent-soft-bg)");
			rect.setAttribute("stroke", "var(--da-accent)");
			rect.setAttribute("stroke-width", "2.5");
		} else if (isMainPoint) {
			rect.setAttribute("fill", "var(--da-main-point-soft-bg)");
			rect.setAttribute("stroke", "var(--da-main-point)");
			rect.setAttribute("stroke-width", "2.5");
		} else {
			rect.setAttribute("fill", text ? "var(--da-surface)" : "var(--da-row-bg)");
			rect.setAttribute("stroke", text ? "var(--da-muted)" : "var(--da-border-strong)");
			rect.setAttribute("stroke-width", "1.5");
		}
		rect.setAttribute("pointer-events", "all");

		rect.addEventListener("click", e => {
			e.stopImmediatePropagation();
			const cornerObj: Corner = { bracketId, isTop };
			const existingIndex = this.selectedCorners.findIndex(c => c.bracketId === bracketId && c.isTop === isTop);
			if (existingIndex !== -1) {
				this.selectedCorners.splice(existingIndex, 1);
			} else {
				this.selectedCorners.push(cornerObj);
			}
			this.selectedBracketId = null;
			this.renderCanvas();
		});

		// Double-click marks/unmarks this label as the main point. The two
		// single clicks that compose the double-click still fire the
		// listener above and toggle selectedCorners twice, netting out to
		// whatever it was before - harmless, and how every other
		// click-to-toggle box in this canvas already behaves under a
		// double-click.
		rect.addEventListener("dblclick", e => {
			e.stopImmediatePropagation();
			e.preventDefault();
			const bracket = this.brackets.find(x => x.id === bracketId);
			if (!bracket) return;
			this.saveToHistory();
			if (isTop) bracket.mainPointTop = !bracket.mainPointTop;
			else bracket.mainPointBottom = !bracket.mainPointBottom;
			this.renderCanvas();
		});

		rect.addEventListener("contextmenu", e => {
			e.preventDefault();
			e.stopImmediatePropagation();
			this.showLabelEditor(e.clientX, e.clientY, text, bracketId, isTop);
		});
		group.appendChild(rect);

		if (text) {
			const txt = createSvg("text");
			txt.setAttribute("x", String(boxX + size / 2));
			txt.setAttribute("y", String(y));
			txt.setAttribute("text-anchor", "middle");
			// Center the capitals, not the x-height ("middle" would): sit on the
			// baseline and drop by half a cap height (~0.35em in most UI fonts).
			txt.setAttribute("dy", "0.35em");
			txt.setAttribute("fill", "var(--da-accent)");
			txt.setAttribute("font-size", "12");
			txt.setAttribute("font-weight", "700");
			txt.setAttribute("pointer-events", "none");
			txt.textContent = text;
			group.appendChild(txt);
		}

		const connector = createSvg("line");
		connector.setAttribute("x1", String(connX1));
		connector.setAttribute("y1", String(y));
		connector.setAttribute("x2", String(connX2));
		connector.setAttribute("y2", String(y));
		connector.setAttribute("stroke", "var(--da-muted)");
		connector.setAttribute("stroke-width", "2");
		group.appendChild(connector);
	}

	// Closes the open label editor without saving (Esc anywhere / clicking
	// outside it); showLabelEditor points it at the current editor.
	private hideLabelEditor: () => void = () => {};

	showLabelEditor(clientX: number, clientY: number, currentText: string, bracketId: number, isTop: boolean): void {
		const panel = this.byId("label-editor");
		const input = this.byId<HTMLInputElement>("lei");
		if (!panel || !input) return;

		input.value = currentText || "";
		panel.setCssStyles({ display: "block" });

		// The panel is positioned absolute within the view root rather than
		// fixed to the viewport, since Obsidian sometimes applies a CSS
		// transform to ancestors (e.g. during tab animations), which would
		// otherwise make `position: fixed` coordinates resolve against that
		// transformed ancestor instead of the viewport.
		// The panel is CSS-zoomed by the UI scale, which also multiplies its
		// left/top, so screen-pixel offsets are divided back down by it.
		const scale = this.uiScale();
		const rootRect = this.contentEl.getBoundingClientRect();
		const lx = clientX - rootRect.left, ly = clientY - rootRect.top;
		panel.setCssStyles({ left: `${lx / scale}px`, top: `${ly / scale}px` });
		window.requestAnimationFrame(() => {
			const r = panel.getBoundingClientRect();
			if (r.right > window.innerWidth) panel.setCssStyles({ left: `${(lx - r.width) / scale}px` });
			if (r.bottom > window.innerHeight) panel.setCssStyles({ top: `${(ly - r.height) / scale}px` });
		});
		input.focus();
		input.select();

		const oldOk = this.byId<HTMLButtonElement>("le-ok");
		const oldCan = this.byId<HTMLButtonElement>("le-cancel");
		const newOk = oldOk.cloneNode(true) as HTMLButtonElement;
		const newCan = oldCan.cloneNode(true) as HTMLButtonElement;
		oldOk.replaceWith(newOk);
		oldCan.replaceWith(newCan);

		const applyLabel = () => {
			const newLabel = input.value.trim();
			if (newLabel === (currentText || "")) { cancelLabel(); return; }
			this.saveToHistory();
			const bracket = this.brackets.find(b => b.id === bracketId);
			if (bracket) {
				if (bracket.singleNode) bracket.centerLabel = newLabel;
				else if (isTop) bracket.topLabel = newLabel;
				else bracket.bottomLabel = newLabel;
			}
			this.selectedCorners = [];
			panel.setCssStyles({ display: "none" });
			input.removeEventListener("keydown", onKey);
			this.renderCanvas();
		};

		const cancelLabel = () => {
			panel.setCssStyles({ display: "none" });
			input.removeEventListener("keydown", onKey);
		};
		this.hideLabelEditor = cancelLabel;

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Enter") { e.preventDefault(); applyLabel(); }
			if (e.key === "Escape") { cancelLabel(); }
		};

		newOk.addEventListener("click", applyLabel);
		newCan.addEventListener("click", cancelLabel);
		input.addEventListener("keydown", onKey);
	}

	// ---------- bracket creation ----------

	addBlankBracket(): void {
		const hasTwoProps = this.selectedIndices.length === 2;
		const hasCornerAndProp = this.selectedCorners.length === 1 && this.selectedIndices.length === 1;
		const hasBracketAndProp = this.selectedBracketId !== null && this.selectedIndices.length === 1;

		if (!(hasTwoProps || hasCornerAndProp || hasBracketAndProp || this.selectedCorners.length === 2)) {
			new Notice("To add a two-node bracket, first select one of these:\n• two propositions\n• a corner box and a proposition\n• a bracket (click its line) and a proposition\n• two corner boxes from different brackets\nThen click Add Two-Node Bracket.", 8000);
			return;
		}
		if (!hasTwoProps && !hasCornerAndProp && !hasBracketAndProp) {
			const [c1, c2] = this.selectedCorners;
			if (c1.bracketId === c2.bracketId) { new Notice("Pick two corner boxes from different brackets."); return; }
			if (!this.brackets.some(b => b.id === c1.bracketId) || !this.brackets.some(b => b.id === c2.bracketId)) return;
		}
		this.saveToHistory();

		let start = 0, end = 0, attachToRow: number | undefined, parentBracketId: number | undefined, parentBracketId2: number | undefined;

		if (hasTwoProps) {
			[start, end] = [...this.selectedIndices].sort((x, y) => x - y);
		} else if (hasCornerAndProp) {
			const parentBracket = this.brackets.find(b => b.id === this.selectedCorners[0].bracketId);
			if (!parentBracket) return;
			const cornerRow = this.getCornerRow(parentBracket, this.selectedCorners[0].isTop);
			const propRow = this.selectedIndices[0];
			start = Math.min(cornerRow, propRow);
			end = Math.max(cornerRow, propRow);
			if (cornerRow === start) attachToRow = cornerRow;
			parentBracketId = parentBracket.id;
		} else if (hasBracketAndProp) {
			const bracket = this.brackets.find(b => b.id === this.selectedBracketId);
			if (!bracket) return;
			const propRow = this.selectedIndices[0];
			start = Math.min(bracket.start, propRow);
			end = Math.max(bracket.end, propRow);
		} else if (this.selectedCorners.length === 2) {
			const corner1 = this.selectedCorners[0];
			const corner2 = this.selectedCorners[1];
			const b1 = this.brackets.find(b => b.id === corner1.bracketId);
			const b2 = this.brackets.find(b => b.id === corner2.bracketId);
			if (!b1 || !b2 || b1.id === b2.id) return;
			const row1 = this.getCornerRow(b1, corner1.isTop);
			const row2 = this.getCornerRow(b2, corner2.isTop);
			start = Math.min(row1, row2);
			end = Math.max(row1, row2);
			parentBracketId = b1.id;
			parentBracketId2 = b2.id;
		} else return;

		const newBracket: Bracket = { id: Date.now(), start, end, topLabel: "", bottomLabel: "" };
		if (attachToRow !== undefined) newBracket.attachToRow = attachToRow;
		if (parentBracketId !== undefined) newBracket.parentBracketId = parentBracketId;
		if (parentBracketId2 !== undefined) newBracket.parentBracketId2 = parentBracketId2;

		this.brackets.push(newBracket);

		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.renderMainRows();
		this.renderCanvas();
	}

	addSingleNodeBracket(): void {
		const totalSelected = this.selectedIndices.length + this.selectedCorners.length;
		if (totalSelected < 2) {
			new Notice("For a single-node bracket: select two or more propositions and/or corner boxes.");
			return;
		}

		const cornerBracketIds = this.selectedCorners.map(c => c.bracketId);
		if (new Set(cornerBracketIds).size < cornerBracketIds.length) {
			new Notice("Cannot connect two corners from the same bracket.");
			return;
		}

		const propRows = [...this.selectedIndices];
		const parentBracketIds: number[] = [];
		const cornerRows = this.selectedCorners.map(c => {
			const parentBracket = this.brackets.find(b => b.id === c.bracketId);
			if (!parentBracket) return null;
			parentBracketIds.push(parentBracket.id);
			return this.getCornerRow(parentBracket, c.isTop);
		}).filter((r): r is number => r !== null);

		// A proposition and a corner box on the same row are one node.
		const allRows = Array.from(new Set([...propRows, ...cornerRows])).sort((x, y) => x - y);
		if (allRows.length < 2) {
			new Notice("For a single-node bracket: select two or more propositions and/or corner boxes on different rows.");
			return;
		}

		this.saveToHistory();

		const start = allRows[0];
		const end = allRows[allRows.length - 1];

		const newBracket: Bracket = {
			id: Date.now(), start, end, nodes: allRows, parentBracketIds, singleNode: true, centerLabel: "",
		};

		this.brackets.push(newBracket);

		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.renderMainRows();
		this.renderCanvas();
	}

	handleMainRowClick(i: number): void {
		if (this.selectedIndices.includes(i)) this.selectedIndices = this.selectedIndices.filter(idx => idx !== i);
		else this.selectedIndices.push(i);
		this.refreshSelectionHighlighting();
	}

	deselectAll(): void {
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.refreshSelectionHighlighting();
		this.renderCanvas();
	}

	// ---------- proposition CRUD ----------

	splitIntoPropositions(): void {
		const ta = this.byId<HTMLTextAreaElement>("paste-area");
		if (!ta) return;
		const text = ta.value.trim();
		if (!text) return;
		this.saveToHistory();
		// Split after sentence-ending punctuation, or on line breaks. Written
		// without a lookbehind (unsupported on iOS < 16.4) by first marking the
		// split points, then splitting on the marker.
		const SPLIT_MARKER = "\u0000";
		// parsePastedText (see the "passage-paste verse detection" section
		// above) reduces whatever shape the paste arrived in - explicit [n]
		// markers, superscript verse numbers, "Rom 3:21" line prefixes, verse
		// numbers embedded mid-paragraph, or a detected reference
		// header/trailer that gets stripped rather than imported as a bogus
		// proposition - down to one chunk of text per verse, each carrying
		// its own verse ref (undefined when no detection stage could anchor
		// one). Each chunk is then split into sentences and lettered within
		// its verse group exactly as before.
		const { chunks } = parsePastedText(text);
		const newProps: Proposition[] = [];
		chunks.forEach(chunk => {
			let letterIdx = -1;
			chunk.text
				.replace(/([.?!;])\s+/g, `$1${SPLIT_MARKER}`)
				.replace(/\n/g, SPLIT_MARKER)
				.split(SPLIT_MARKER)
				.map(p => p.trim())
				.filter(p => p.length > 0)
				.forEach(p => {
					const verseLabel = chunk.ref !== undefined ? `${chunk.ref}${nextVerseLetter(++letterIdx)}` : undefined;
					newProps.push({ id: Date.now() + newProps.length, text: p, level: 0, verseLabel });
				});
		});
		this.propositions = this.propositions.concat(newProps);
		// Re-settle each verse this paste touched, in case it collides with
		// propositions from an earlier paste/edit sharing the same number
		// (see renumberVerseGroup's comment).
		const touchedBases = new Set(
			newProps.map(p => p.verseLabel).filter((l): l is string => l !== undefined).map(l => splitVerseLabel(l).base)
		);
		touchedBases.forEach(base => renumberVerseGroup(this.propositions, base));
		this.selectedIndices = [];
		this.sidebarSelected = -1;
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
		ta.value = "";
	}

	// Text Flow toolbar's → button: each Text Flow line becomes one
	// proposition at its indent level, verse-labeled where verse numbers are
	// detected (see flowLinesToPropositions).
	convertTextFlowToBrackets(): void {
		const f = this.flows.textflow;
		f.lines = this.serializeNotesLines("textflow");
		const tabWidth = f.defaultTabWidth > 0 ? f.defaultTabWidth : 48;
		const lines = f.lines.map(line => {
			// Start position = paragraph indent plus any leading tabs, each
			// snapping to the next stop exactly as layoutNotesTabs draws them.
			let x = line.indent;
			for (const seg of line.segments) {
				if (seg.kind === "tab") x = this.nextStop(x, tabWidth);
				else if (seg.text.replace(/[​-‍﻿]/g, "").trim() !== "") break;
			}
			const runs: FormatRun[] = line.segments.map(s => (s.kind === "tab" ? { text: " " } : { text: s.text, bold: s.bold, italic: s.italic, underline: s.underline }));
			return { runs, stop: Math.round(x / tabWidth) };
		});
		const converted = flowLinesToPropositions(lines);
		if (!converted.length) { new Notice("Text Flow is empty."); return; }

		const apply = (replace: boolean) => {
			this.saveToHistory();
			const baseId = Date.now();
			const newProps: Proposition[] = converted.map((c, i) => ({ id: baseId + i, text: c.text, level: c.level, verseLabel: c.verseLabel, ...(c.runs ? { runs: c.runs } : {}) }));
			if (replace) {
				this.propositions = newProps;
				this.brackets = [];
				this.selectedBracketId = null;
				this.selectedCorners = [];
			} else {
				this.propositions = this.propositions.concat(newProps);
			}
			const touchedBases = new Set(
				newProps.map(p => p.verseLabel).filter((l): l is string => l !== undefined).map(l => splitVerseLabel(l).base)
			);
			touchedBases.forEach(base => renumberVerseGroup(this.propositions, base));
			this.selectedIndices = [];
			this.sidebarSelected = -1;
			this.renderSidebarList();
			this.renderMainRows();
			this.switchTab("brackets");
			this.requestSave();
		};

		if (this.propositions.length === 0 && this.brackets.length === 0) { apply(true); return; }
		new ChoiceModal(this.app, "The Brackets canvas already has propositions. Replace them (this also clears all brackets), or append the Text Flow lines after them?", [
			{ label: "Replace", onChoose: () => apply(true) },
			{ label: "Append", onChoose: () => apply(false) },
		]).open();
	}

	addNewProposition(): void {
		this.saveToHistory();
		// New rows join the verse group of whatever they're inserted after,
		// then renumberVerseGroup settles the letters by row order (same
		// mechanism as splitProposition - see its comment). A row with no
		// labeled neighbor to join is left unlabeled.
		const after = this.sidebarSelected >= 0
			? this.propositions[this.sidebarSelected]
			: this.propositions[this.propositions.length - 1];
		const verseLabel = after?.verseLabel;
		const newProp: Proposition = { id: Date.now(), text: "New proposition…", level: 0, verseLabel };
		if (this.sidebarSelected >= 0) {
			const insertedAt = this.sidebarSelected + 1;
			this.propositions.splice(insertedAt, 0, newProp);
			this.shiftReferencesForInsertion(insertedAt);
			this.sidebarSelected = insertedAt;
		} else {
			this.propositions.push(newProp);
			this.sidebarSelected = this.propositions.length - 1;
		}
		if (verseLabel !== undefined) renumberVerseGroup(this.propositions, splitVerseLabel(verseLabel).base);
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
	}

	updatePropositionText(index: number, textEl: HTMLElement): void {
		const prop = this.propositions[index];
		if (prop) {
			const { text, runs } = readRunsFrom(textEl);
			// Only an actual change is recorded, so clicking in and out of
			// rows doesn't fill the undo history with no-op steps.
			if (text === prop.text && JSON.stringify(tidyRuns(propRuns(prop)) ?? null) === JSON.stringify(tidyRuns(runs) ?? null)) return;
			this.saveToHistory();
			prop.text = text;
			this.setPropRuns(prop, runs);
			// This runs from a 'blur' handler, which can itself fire
			// synchronously in the middle of the browser's native
			// mousedown -> focus-change -> mouseup -> click sequence for
			// whatever the user clicked next (e.g. a different proposition).
			// Rebuilding the row lists right here would replace the very DOM
			// node that sequence is still tracking, silently dropping that
			// click (its own selection update never runs, since the click
			// event no longer has anywhere to land). Defer the rebuild past
			// the current event so the in-flight click resolves normally
			// first, on stable DOM.
			window.setTimeout(() => {
				this.renderSidebarList();
				this.renderMainRows();
				this.renderCanvas();
			}, 0);
		}
	}

	private setPropRuns(prop: Proposition, runs: FormatRun[]): void {
		const tidy = tidyRuns(runs);
		if (tidy) prop.runs = tidy;
		else delete prop.runs;
	}

	// Commits a manual edit to a row's label (typed into the row-number badge
	// itself, see renderMainRows). Whatever is typed becomes the row's label
	// verbatim and sticks from then on - it's never recomputed by a paste,
	// a split, or a reorder (see the `verseLabel` field comment). Clearing it
	// drops the row back to plain sequential numbering.
	updatePropositionVerseLabel(index: number, raw: string): void {
		const prop = this.propositions[index];
		if (!prop) return;
		const trimmed = raw.trim();
		const next = trimmed === "" ? undefined : trimmed;
		if (next === prop.verseLabel && !!next === !!prop.verseLabelManual) { this.renderMainRows(); return; }
		this.saveToHistory();
		prop.verseLabel = next;
		// Clearing the label back to "unassigned" also releases the manual
		// lock, so a future split/paste is free to auto-label this row again.
		prop.verseLabelManual = next !== undefined;
		// Deferred for the same reason as updatePropositionText: this runs
		// from a 'blur' handler mid-way through the browser's native
		// mousedown -> focus-change -> click sequence for whatever was
		// clicked next, and rebuilding now would yank that target out from
		// under it.
		window.setTimeout(() => {
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
		}, 0);
	}

	deparentReferencesTo(removedIds: number[]): void {
		if (!removedIds || removedIds.length === 0) return;
		const removedSet = new Set(removedIds);
		this.brackets.forEach(b => {
			if (b.parentBracketId !== undefined && removedSet.has(b.parentBracketId)) {
				delete b.parentBracketId;
				delete b.attachToRow;
			}
			if (b.parentBracketId2 !== undefined && removedSet.has(b.parentBracketId2)) {
				delete b.parentBracketId2;
			}
			if (b.parentBracketIds) {
				b.parentBracketIds = b.parentBracketIds.filter(id => !removedSet.has(id));
			}
		});
	}

	deleteProposition(i: number): void {
		this.confirmAction("Delete this proposition?", () => {
			this.saveToHistory();
			this.propositions.splice(i, 1);

			this.brackets.forEach(b => {
				if (!b.singleNode) return;
				b.nodes = (b.nodes || [b.start, b.end]).filter(r => r !== i).map(r => (r > i ? r - 1 : r));
				if (b.nodes.length >= 2) {
					b.start = Math.min(...b.nodes);
					b.end = Math.max(...b.nodes);
				}
			});

			const removedIds = this.brackets
				.filter(b => (b.singleNode ? (b.nodes ?? []).length < 2 : (b.start === i || b.end === i)))
				.map(b => b.id);

			this.brackets = this.brackets
				.filter(b => !removedIds.includes(b.id))
				.map(b => {
					if (!b.singleNode) {
						if (b.start > i) b.start--;
						if (b.end > i) b.end--;
					}
					if (b.attachToRow !== undefined && b.attachToRow > i) b.attachToRow--;
					return b;
				});

			this.deparentReferencesTo(removedIds);

			if (this.sidebarSelected >= i) this.sidebarSelected = Math.max(-1, this.sidebarSelected - 1);
			this.selectedIndices = this.selectedIndices.filter(idx => idx !== i).map(idx => (idx > i ? idx - 1 : idx));
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
		});
	}

	splitProposition(index: number, event?: MouseEvent): void {
		// Double-clicking a row focuses its contenteditable text div first.
		// Rebuilding the row list below (renderMainRows) removes that focused
		// element from the DOM, which fires its blur handler synchronously and
		// re-saves its (unsplit) old text over whatever we just wrote here. Blur
		// it now, before splitting, so that stale write happens first and is a
		// harmless no-op instead of clobbering the split.
		const active = document.activeElement as HTMLElement | null;
		if (active && active.isContentEditable) active.blur();
		this.saveToHistory();
		const text = this.propositions[index].text;
		let splitPos = Math.floor(text.length / 2);
		// caretRangeFromPoint is a legacy WebKit/Blink API (Electron/Obsidian
		// runs on Chromium) with no standard TS lib declaration.
		const docWithCaretRange = document as Document & {
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		if (event && docWithCaretRange.caretRangeFromPoint) {
			const range = docWithCaretRange.caretRangeFromPoint(event.clientX, event.clientY);
			if (range) {
				// Offset from the start of the row's text element, not of
				// whichever text node was hit - a formatted row is several
				// text nodes (one per <b>/<i>/<u> run).
				const textEl = this.qsa("#proposition-rows > div")[index]?.querySelector(".da-row-text");
				if (textEl && textEl.contains(range.startContainer)) {
					const before = document.createRange();
					before.selectNodeContents(textEl);
					before.setEnd(range.startContainer, range.startOffset);
					splitPos = before.toString().length;
				}
			}
		}
		const runs = propRuns(this.propositions[index]);
		const splitAt = (pos: number) => [trimRuns(sliceRuns(runs, 0, pos)), trimRuns(sliceRuns(runs, pos, text.length))];
		let [head, tail] = splitAt(splitPos);
		if (!head.text || !tail.text) [head, tail] = splitAt(Math.floor(text.length / 2));
		// The original row keeps its own label (and its manual lock, if any)
		// untouched. The new sibling starts out sharing that same verse group
		// but with no letter decided yet - renumberVerseGroup below settles
		// every non-manual label in the group by row order right after the
		// insert, which is what keeps splits correct no matter what order
		// they happen in (see that function's comment) while never touching
		// anything reorder-only ever does (see the `verseLabel` field
		// comment).
		const origLabel = this.propositions[index].verseLabel;
		const verseLabel = origLabel;
		const orig = this.propositions[index];
		orig.text = head.text;
		this.setPropRuns(orig, head.runs);
		const sibling: Proposition = { id: Date.now(), text: tail.text, level: orig.level, verseLabel };
		this.setPropRuns(sibling, tail.runs);
		this.propositions.splice(index + 1, 0, sibling);
		if (origLabel !== undefined) renumberVerseGroup(this.propositions, splitVerseLabel(origLabel).base);

		this.shiftReferencesForInsertion(index + 1);

		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
	}

	clearBracketsOnly(): void {
		this.confirmAction("Clear ALL brackets (propositions stay)?", () => {
			this.saveToHistory();
			this.brackets = [];
			this.selectedBracketId = null;
			this.selectedCorners = [];
			this.renderCanvas();
		});
	}

	resetAll(): void {
		this.confirmAction("Reset EVERYTHING (propositions + brackets + Text Flow + Sentence Flow)? You can undo this with Ctrl+Z.", () => {
			// Flows included, so undo brings Text Flow / Sentence Flow back too.
			this.saveToHistory(true);
			this.propositions = [];
			this.brackets = [];
			this.selectedIndices = [];
			this.selectedBracketId = null;
			this.selectedCorners = [];
			this.sidebarSelected = -1;
			const ta = this.byId<HTMLTextAreaElement>("paste-area");
			if (ta) ta.value = "";
			FLOW_KEYS.forEach(key => this.loadFlowFromJson(key, undefined));
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
			this.renderNotesTab();
			this.applyNotesZoom();
		});
	}

	// ---------- export ----------

	async exportPNG(): Promise<void> {
		// The diagram lives on the Brackets tab; exporting from a flow tab
		// would capture a hidden (zero-size) panel.
		if (this.activeTab !== "brackets") {
			this.switchTab("brackets");
			await new Promise(r => window.requestAnimationFrame(r));
			await new Promise(r => window.requestAnimationFrame(r));
		}
		const container = this.byId("diagram-container");
		const scaler = this.byId("workspace-scaler");
		if (!container || !scaler) return;
		const svg = scaler.querySelector("svg");
		const savedZoom = this.zoomLevel;

		const savedOverflow = container.style.overflow;
		const savedWidth = container.style.width;
		const savedHeight = container.style.height;
		const savedSvgW = svg ? svg.getAttribute("width") : null;

		// Leave selection highlights and row × buttons out of the image.
		const savedSelection = { indices: this.selectedIndices, bracketId: this.selectedBracketId, corners: this.selectedCorners };
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.renderMainRows();
		this.renderCanvas();
		scaler.addClass("da-exporting");

		scaler.setCssStyles({ transform: "scale(1)", transition: "none" });

		await new Promise(r => window.requestAnimationFrame(r));
		await new Promise(r => window.requestAnimationFrame(r));

		const padding = 50;
		container.setCssStyles({ overflow: "visible", width: "max-content", height: "max-content" });

		const contentW = scaler.scrollWidth;
		const contentH = scaler.scrollHeight;
		const fullW = contentW + padding * 2;
		const fullH = contentH + padding * 2;

		if (svg) {
			svg.setAttribute("width", String(contentW));
			svg.setCssStyles({ width: `${contentW}px` });
		}

		container.setCssStyles({ width: `${fullW}px`, height: `${fullH}px` });

		// The image background is the diagram's own (themed) background, so
		// light text in a dark theme doesn't end up on white.
		const bgOf = (el: Element | null) => {
			const c = el ? getComputedStyle(el).backgroundColor : "";
			return c && c !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c) ? c : "";
		};
		const backgroundColor = bgOf(this.byId("workspace")) || bgOf(container) || bgOf(this.contentEl) || "#ffffff";

		let bytes: Uint8Array | null = null;
		try {
			const canvas = await html2canvas(scaler, {
				backgroundColor,
				scale: 2,
				useCORS: true,
				logging: false,
				width: fullW,
				height: fullH,
				x: -padding,
				y: -padding,
				windowWidth: document.documentElement.scrollWidth,
				windowHeight: document.documentElement.scrollHeight,
				scrollX: 0,
				scrollY: 0,
				// html2canvas rasterises the SVG on its own, where the theme's
				// CSS variables (var(--da-...) in stroke/fill) don't resolve, so
				// bake each element's computed colors into the cloned SVG.
				onclone: (clonedDoc: Document) => {
					const liveSvg = scaler.querySelector("svg");
					const clonedSvg = clonedDoc.getElementById("bracket-svg");
					if (!liveSvg || !clonedSvg) return;
					const live = liveSvg.querySelectorAll("*");
					const cloned = clonedSvg.querySelectorAll("*");
					live.forEach((el, n) => {
						const c = cloned[n];
						if (!c) return;
						const cs = getComputedStyle(el);
						if (el.hasAttribute("stroke")) c.setAttribute("stroke", cs.stroke);
						if (el.hasAttribute("fill")) c.setAttribute("fill", cs.fill);
					});
				},
			});

			const dataUrl = canvas.toDataURL("image/png");
			const binary = atob(dataUrl.split(",")[1]);
			bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		} catch (err) {
			console.error("DA-Tool: PNG export failed:", err);
			new Notice("PNG export failed — see console for details.");
		} finally {
			container.setCssStyles({ overflow: savedOverflow, width: savedWidth, height: savedHeight });
			if (svg) {
				if (savedSvgW !== null) svg.setAttribute("width", savedSvgW);
				svg.setCssStyles({ width: "" });
			}
			scaler.setCssStyles({ transition: "", transform: `scale(${savedZoom})` });
			scaler.removeClass("da-exporting");
			this.selectedIndices = savedSelection.indices;
			this.selectedBracketId = savedSelection.bracketId;
			this.selectedCorners = savedSelection.corners;
			this.renderMainRows();
			this.renderCanvas();
		}
		if (!bytes) return;
		const data = bytes.buffer as ArrayBuffer;

		const basename = this.file ? this.file.basename : "discourse-analysis";
		const dir = this.file && this.file.parent ? this.file.parent.path : "";
		const prefix = dir && dir !== "/" ? dir + "/" : "";
		const path = `${prefix}${basename}.png`;

		const writeNew = async (target: string) => {
			try {
				await this.app.vault.createBinary(target, data);
				new Notice(`Exported ${target}`);
			} catch (err) {
				console.error("DA-Tool: PNG export failed:", err);
				new Notice("PNG export failed — see console for details.");
			}
		};

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (!(existing instanceof TFile)) { await writeNew(path); return; }

		// An earlier export is already there: replace it, or keep both.
		new ChoiceModal(this.app, `"${path}" already exists. Replace it with this export, or keep both?`, [
			{ label: "Replace", onChoose: () => {
				void this.app.vault.modifyBinary(existing, data)
					.then(() => new Notice(`Exported ${path}`))
					.catch(err => { console.error("DA-Tool: PNG export failed:", err); new Notice("PNG export failed — see console for details."); });
			} },
			{ label: "Keep both", onChoose: () => {
				let n = 1;
				let target = `${prefix}${basename} ${n}.png`;
				while (this.app.vault.getAbstractFileByPath(target)) target = `${prefix}${basename} ${++n}.png`;
				void writeNew(target);
			} },
		]).open();
	}

	// ---------- misc UI wiring ----------

	private initializeCanvasClick(): void {
		const svg = this.byId("bracket-svg");
		const container = this.byId("diagram-container");
		if (svg) {
			this.registerDomEvent(svg, "click", (e: MouseEvent) => {
				if (e.target === svg) this.deselectAll();
			});
		}
		if (container) {
			this.registerDomEvent(container, "click", (e: MouseEvent) => {
				if ((e.target as HTMLElement).id === "diagram-container") this.deselectAll();
			});
		}
	}

	private initializePanning(): void {
		const diagramContainer = this.byId("diagram-container");
		if (!diagramContainer) return;

		// Move/up are tracked on the document, not the container, so letting
		// go outside the diagram still ends the pan instead of leaving it
		// stuck until the next click inside.
		this.registerDomEvent(diagramContainer, "mousedown", (e: MouseEvent) => {
			if (e.button !== 0) return;
			const startX = e.clientX;
			const startY = e.clientY;
			const scrollLeft = diagramContainer.scrollLeft;
			const scrollTop = diagramContainer.scrollTop;
			const doc = diagramContainer.ownerDocument;
			const win = doc.defaultView ?? window;

			const mouseMoveHandler = (ev: MouseEvent) => {
				diagramContainer.scrollLeft = scrollLeft - (ev.clientX - startX);
				diagramContainer.scrollTop = scrollTop - (ev.clientY - startY);
			};

			const mouseUpHandler = () => {
				doc.removeEventListener("mousemove", mouseMoveHandler);
				doc.removeEventListener("mouseup", mouseUpHandler);
				win.removeEventListener("blur", mouseUpHandler);
			};

			doc.addEventListener("mousemove", mouseMoveHandler);
			doc.addEventListener("mouseup", mouseUpHandler);
			win.addEventListener("blur", mouseUpHandler);
		});
	}

	private makeResizable(resizerId: string, sidebarId: string, side: "left" | "right"): void {
		const resizer = this.byId(resizerId);
		const sidebar = this.byId(sidebarId);
		if (!resizer || !sidebar) return;
		let startX = 0, startWidth = 0;

		this.registerDomEvent(resizer, "mousedown", (e: MouseEvent) => {
			startX = e.clientX;
			startWidth = parseInt(sidebar.style.width, 10);
			document.body.setCssStyles({ userSelect: "none", cursor: "col-resize" });

			const onMouseMove = (ev: MouseEvent) => {
				// The sidebar's width is in its own UI-scaled pixels.
				const delta = (side === "left" ? ev.clientX - startX : startX - ev.clientX) / this.uiScale();
				const newWidth = Math.min(
					parseInt(sidebar.style.maxWidth, 10),
					Math.max(parseInt(sidebar.style.minWidth, 10), startWidth + delta)
				);
				sidebar.setCssStyles({ width: `${newWidth}px` });
			};

			const onMouseUp = () => {
				document.body.setCssStyles({ userSelect: "", cursor: "" });
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				// Remembered across files and restarts (plugin settings).
				const width = parseInt(sidebar.style.width, 10);
				if (!isNaN(width) && width !== this.plugin.settings.sidebarWidth) {
					this.plugin.settings.sidebarWidth = width;
					void this.plugin.saveSettings();
				}
			};

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	showLogicalRelationships(): void {
		this.byId("lr-modal")?.classList.remove("hidden");
	}
	hideLogicalRelationships(): void {
		this.byId("lr-modal")?.classList.add("hidden");
	}
	showTextFlowInstructions(): void {
		this.byId("textflow-instructions-modal")?.classList.remove("hidden");
	}
	hideTextFlowInstructions(): void {
		this.byId("textflow-instructions-modal")?.classList.add("hidden");
	}
	showResources(): void {
		this.byId("resource-modal")?.classList.remove("hidden");
	}
	hideResources(): void {
		this.byId("resource-modal")?.classList.add("hidden");
	}
	showInstructions(): void {
		this.byId("instructions-modal")?.classList.remove("hidden");
	}
	hideInstructions(): void {
		this.byId("instructions-modal")?.classList.add("hidden");
	}

	// ---------- Sentence Flow: editing ----------

	private handleNotesKeydown(e: KeyboardEvent): void {
		const mod = e.ctrlKey || e.metaKey;

		if (e.key === "Tab") {
			// Default contenteditable behavior for Tab moves focus to the next
			// focusable element rather than inserting anything, so it has to be
			// taken over entirely. Shift+Tab takes back the tab just before
			// the caret.
			e.preventDefault();
			if (e.shiftKey) this.removeNotesTabBeforeCaret();
			else this.insertNotesTabAtCaret();
			this.scheduleNotesLayout(true);
			this.requestSave();
			return;
		}
		if (mod && (e.key === "m" || e.key === "M")) {
			e.preventDefault();
			this.indentNotesParagraph(e.shiftKey ? -1 : 1);
			return;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			// Handled manually rather than letting the browser's default
			// paragraph-insert action run: that action's own choice of whether
			// to carry the original line <div>'s marginInlineStart over to the
			// new <div> it creates isn't something this can rely on - it's
			// internal rich-editing behavior that varies across Chromium
			// versions, not a guaranteed contract (confirmed by testing: it
			// preserves the indent in one Chromium build and not in Obsidian's
			// bundled one). Splitting the DOM directly with Range.extractContents
			// - a plain, version-independent DOM operation - and copying the
			// indent onto the new line ourselves makes this deterministic
			// instead of hoping the default action happens to do it.
			e.preventDefault();
			this.splitNotesLineAtCaret();
			return;
		}
		// Bold/Italic/Underline are handled via this.scope (see the
		// constructor), not here - a DOM keydown listener on the canvas fires
		// too late to beat Obsidian's own Keymap, which intercepts Mod+B/I/U
		// at the document level first.
	}

	// Splits the current line at the caret into two <div> lines. Everything
	// from the caret to the end of the line is moved into a new line inserted
	// right after it. Uses Range.extractContents() rather than
	// execCommand("insertParagraph") (see the caller) - it correctly splits
	// nested bold/italic/underline runs at the boundary on its own, same as
	// the browser's default action would, without depending on that action's
	// undocumented behavior.
	private splitNotesLineAtCaret(): void {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const line = this.getCurrentLine();
		if (!line) return;

		const caretRange = sel.getRangeAt(0);
		if (!caretRange.collapsed) caretRange.deleteContents();

		const afterRange = document.createRange();
		afterRange.setStart(caretRange.startContainer, caretRange.startOffset);
		afterRange.setEnd(line, line.childNodes.length);
		const afterContent = afterRange.extractContents();

		// When the caret sits at the very start of the line, extraction takes
		// everything, leaving the original `line` with no children. A <br>-less
		// empty <div> collapses to zero height in a contenteditable, so the new
		// blank line above the (moved) text doesn't render at all - Enter looks
		// like it did nothing. Same fix as the newLine case below.
		if (line.childNodes.length === 0) line.appendChild(document.createElement("br"));

		const newLine = document.createElement("div");

		// The line's indent can come from two different places, and both need
		// to carry over to the new line, matching Word:
		// - a paragraph indent (Ctrl+M) is a style on the line <div> itself.
		// - a leading Tab press is actual line content (a da-tab marker span),
		//   not a style, so extractContents() above already left it behind in
		//   `line` (the caret was typed after it) - it has to be cloned across
		//   explicitly instead.
		if (line.style.marginInlineStart) newLine.style.marginInlineStart = line.style.marginInlineStart;
		for (const child of Array.from(line.childNodes)) {
			if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).classList.contains("da-tab")) {
				newLine.appendChild(child.cloneNode(true));
			} else {
				break;
			}
		}
		const tabPrefixCount = newLine.childNodes.length;
		newLine.appendChild(afterContent);

		// extractContents() can leave a spurious empty text node in the
		// fragment when the caret was exactly at the end of a text node (the
		// common case for pressing Enter at the end of a line) - strip it, or
		// the childNodes.length check below never sees an empty line and no
		// <br> gets added.
		Array.from(newLine.childNodes).forEach(n => {
			if (n.nodeType === Node.TEXT_NODE && n.textContent === "") n.remove();
		});
		// An empty <div> with no <br> doesn't reliably get a caret-visible line
		// box in a contenteditable - this combined with the above is what made
		// splitting at the very end of a line (nothing left to move over) look
		// like Enter did nothing at all.
		if (newLine.childNodes.length === 0) newLine.appendChild(document.createElement("br"));
		line.after(newLine);

		// Recomputed against newLine's final children (after the empty-text-
		// node cleanup above) rather than reusing a reference captured before
		// it - that cleanup can detach the exact node a caret was pointed at,
		// leaving the selection nowhere valid.
		const caretTarget = newLine.childNodes[tabPrefixCount] as ChildNode | undefined;
		const caret = document.createRange();
		// A caret "inside" an element such as the placeholder <br> isn't a
		// real text position - a following Tab would insert its marker into
		// the <br> itself, where it never renders - so sit before it instead.
		if (caretTarget && caretTarget.nodeType === Node.TEXT_NODE) caret.setStart(caretTarget, 0);
		else if (caretTarget) caret.setStartBefore(caretTarget);
		else caret.setStart(newLine, newLine.childNodes.length);
		caret.collapse(true);
		sel.removeAllRanges();
		sel.addRange(caret);

		this.scheduleNotesLayout(true);
		this.requestSave();
	}

	// Increases/decreases the indent of whichever paragraph the caret is in,
	// snapping to the next/previous multiple of the default tab width -
	// mirroring Word's Increase/Decrease Indent behavior.
	private indentNotesParagraph(direction: 1 | -1): void {
		const line = this.getCurrentLine();
		if (!line) return;
		const current = this.getLineMarginPx(line);
		const tabWidth = this.flows[this.curFlowKey()].defaultTabWidth;
		const target = direction > 0
			? this.nextStop(current, tabWidth)
			: this.prevStop(current, tabWidth);
		if (target > 0) line.style.marginInlineStart = `${target}px`;
		else line.style.removeProperty("margin-inline-start");
		this.scheduleNotesLayout(true);
		this.requestSave();
	}

	// Reads clipboard plain text only (formatting from other apps is
	// intentionally dropped - Sentence Flow only supports bold/italic/
	// underline, applied manually). Tab characters become da-tab markers so
	// they participate in the tab-width grid alignment instead of rendering
	// as a browser-default tab. Text runs go through execCommand("insertText"),
	// which natively turns embedded newlines into new paragraphs (matching
	// Enter) and stays in the native undo stack; tab markers are inserted
	// via insertNotesTabAtCaret (see its comment for why, not execCommand).
	private handleNotesPaste(e: ClipboardEvent): void {
		const canvas = this.flowCanvas();
		if (!canvas || !canvas.contains(window.getSelection()?.anchorNode ?? null)) return;
		const text = e.clipboardData?.getData("text/plain") ?? "";
		if (!text) return;
		e.preventDefault();

		const parts = text.split("\t");
		parts.forEach((part, i) => {
			if (part.length > 0) document.execCommand("insertText", false, part);
			if (i < parts.length - 1) this.insertNotesTabAtCaret();
		});
		this.scheduleNotesLayout(true);
		this.requestSave();
	}

	// Inserts a single da-tab marker span at the caret via direct Range/
	// Selection manipulation. This intentionally does NOT use
	// execCommand("insertHTML"): Chromium can "isolate" an atomic
	// (contenteditable=false) inline node inserted that way by promoting it
	// into its own block, which shows up as an unwanted line break - exactly
	// the bug this replaced (Tab appeared to insert a new line instead of a
	// tab stop).
	private insertNotesTabAtCaret(): void {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		range.deleteContents();

		const span = document.createElement("span");
		span.className = "da-tab";
		span.contentEditable = "false";
		span.textContent = "​";
		range.insertNode(span);

		const after = document.createRange();
		after.setStartAfter(span);
		after.collapse(true);
		sel.removeAllRanges();
		sel.addRange(after);
	}

	// Shift+Tab: removes the tab marker immediately before the caret
	// (stepping out of any b/i/u wrapper the caret sits at the start of).
	// Does nothing when the caret isn't right after a tab.
	private removeNotesTabBeforeCaret(): void {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
		const canvas = this.flowCanvas();
		const node = sel.anchorNode;
		const offset = sel.anchorOffset;
		if (!canvas || !node || !canvas.contains(node)) return;
		let prev: ChildNode | null = null;
		if (node.nodeType === Node.TEXT_NODE) {
			if (((node as Text).data || "").slice(0, offset).replace(/\u200B/g, "") !== "") return;
			let up: Node = node;
			prev = node.previousSibling;
			while (!prev && up.parentNode && up.parentNode !== canvas && !(up.parentNode.parentNode === canvas && (up.parentNode as HTMLElement).tagName === "DIV")) {
				up = up.parentNode;
				prev = up.previousSibling;
			}
		} else {
			prev = node.childNodes[offset - 1] ?? null;
		}
		while (prev && prev.nodeType === Node.ELEMENT_NODE && !(prev as HTMLElement).classList.contains("da-tab") && prev.lastChild) prev = prev.lastChild;
		if (!prev || prev.nodeType !== Node.ELEMENT_NODE || !(prev as HTMLElement).classList.contains("da-tab")) return;
		const parent = prev.parentNode as Node;
		const idx = Array.prototype.indexOf.call(parent.childNodes, prev) as number;
		prev.remove();
		const caret = document.createRange();
		caret.setStart(parent, Math.min(idx, parent.childNodes.length));
		caret.collapse(true);
		sel.removeAllRanges();
		sel.addRange(caret);
	}

	// Finds the <div> line (direct child of the canvas) containing the
	// caret. Before the first Enter/paste, typed content sits as loose nodes
	// directly under the canvas with no line div to indent - in that case,
	// wrap whatever's there into one now so indentation has somewhere to live.
	//
	// Deliberately checks selection containment (canvas.contains(...)) rather
	// than requiring `document.activeElement === canvas` by strict reference
	// - that equality check turned out to be unreliable in Obsidian's
	// Electron shell (it was the cause of Ctrl+M/Ctrl+Shift+M appearing to do
	// nothing at all: this returned null every time, silently).
	private getCurrentLine(): HTMLElement | null {
		const canvas = this.flowCanvas();
		if (!canvas) return null;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const startContainer = sel.getRangeAt(0).startContainer;
		if (!canvas.contains(startContainer)) return null;

		let node: Node | null = startContainer;
		while (node && node !== canvas) {
			if (node.parentElement === canvas && (node as HTMLElement).tagName === "DIV") {
				return node as HTMLElement;
			}
			node = node.parentNode;
		}

		// The caret's container isn't inside any line <div> - either there
		// are none yet, or (most commonly) the caret is sitting directly on
		// the canvas itself, e.g. right after a click into empty space below
		// the last line. Previously this unconditionally moved *every*
		// existing line into one brand-new div appended at the end, which
		// could silently scramble/duplicate the whole document (this was the
		// cause of a stray blank line appearing at the top after reopening
		// the file). Only fall back to wrapping when there truly are no line
		// divs at all; otherwise just pick the nearest existing one and
		// leave every line's div exactly where it already is.
		const divs = Array.from(canvas.children).filter(c => c.tagName === "DIV") as HTMLElement[];
		if (divs.length > 0) {
			if (startContainer === canvas) {
				const offset = sel.getRangeAt(0).startOffset;
				const atOrAfter = canvas.childNodes[offset] as HTMLElement | undefined;
				if (atOrAfter && atOrAfter.tagName === "DIV") return atOrAfter;
				const before = canvas.childNodes[offset - 1] as HTMLElement | undefined;
				if (before && before.tagName === "DIV") return before;
			}
			return divs[divs.length - 1];
		}

		if (canvas.childNodes.length === 0) {
			const empty = canvas.createDiv();
			const r = document.createRange();
			r.selectNodeContents(empty);
			r.collapse(false);
			sel.removeAllRanges();
			sel.addRange(r);
			return empty;
		}

		const div = document.createElement("div");
		while (canvas.firstChild) div.appendChild(canvas.firstChild);
		canvas.appendChild(div);
		const r = document.createRange();
		r.selectNodeContents(div);
		r.collapse(false);
		sel.removeAllRanges();
		sel.addRange(r);
		return div;
	}

	// Before the first Enter/paste, a line's content sits as loose nodes
	// (text, da-tab spans, b/i/u) directly under the canvas rather than
	// inside a <div> - most commonly true of the very first line. Since
	// getNotesLines only ever returns <div> elements (it has to: callers walk
	// each returned line's own childNodes independently), any such loose
	// content had no line to belong to and was silently invisible to both
	// serialization (dropped from what got saved - the "first line
	// disappears on reopen" bug) and the tab-stop layout pass (never
	// resized/aligned - the "Tab doesn't work on the first line" bug). This
	// folds every run of loose top-level nodes into a real wrapper <div>
	// before any caller looks at the line list. Moving a node out of the
	// canvas resets any caret/selection boundary inside or beside it (the DOM
	// collapses it onto the old parent), which made the first typed character
	// jump behind the caret ("This" -> "hisT") and broke indent carry-over on
	// a fresh first line - so the selection is re-anchored to the same nodes
	// and restored once they're wrapped.
	private normalizeNotesCanvas(canvas: HTMLElement): void {
		const children = Array.from(canvas.childNodes);
		const isLineDiv = (n: ChildNode) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === "DIV";
		if (children.every(isLineDiv)) return;

		type SavedPoint = { node: Node; offset: number } | { after: ChildNode } | { before: ChildNode };
		const sel = window.getSelection();
		const liveRange = sel && sel.rangeCount > 0 && canvas.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0) : null;
		// A boundary sitting directly on the canvas is stored as a child
		// index, which goes stale as nodes move - re-express it relative to a
		// neighboring node instead.
		const anchorPoint = (node: Node, offset: number): SavedPoint => {
			if (node !== canvas) return { node, offset };
			if (offset > 0) return { after: canvas.childNodes[offset - 1] };
			if (canvas.firstChild) return { before: canvas.firstChild };
			return { node, offset };
		};
		const savedStart = liveRange && anchorPoint(liveRange.startContainer, liveRange.startOffset);
		const savedEnd = liveRange && anchorPoint(liveRange.endContainer, liveRange.endOffset);

		let run: ChildNode[] = [];
		const flush = (beforeNode: ChildNode | null) => {
			if (run.length === 0) return;
			const wrapper = document.createElement("div");
			canvas.insertBefore(wrapper, beforeNode);
			run.forEach(n => wrapper.appendChild(n));
			run = [];
		};
		for (const node of children) {
			if (isLineDiv(node)) flush(node);
			else run.push(node);
		}
		flush(null);

		if (!sel || !savedStart || !savedEnd) return;
		const restored = document.createRange();
		const apply = (pt: SavedPoint, isStart: boolean) => {
			if ("after" in pt) isStart ? restored.setStartAfter(pt.after) : restored.setEndAfter(pt.after);
			else if ("before" in pt) isStart ? restored.setStartBefore(pt.before) : restored.setEndBefore(pt.before);
			else isStart ? restored.setStart(pt.node, pt.offset) : restored.setEnd(pt.node, pt.offset);
		};
		apply(savedStart, true);
		apply(savedEnd, false);
		sel.removeAllRanges();
		sel.addRange(restored);
	}

	private getNotesLines(canvas: HTMLElement): HTMLElement[] {
		this.normalizeNotesCanvas(canvas);
		const divs = Array.from(canvas.children).filter(c => c.tagName === "DIV") as HTMLElement[];
		return divs.length > 0 ? divs : [canvas];
	}

	private getLineMarginPx(line: HTMLElement): number {
		if (line.classList.contains("da-sf-canvas")) return 0;
		const n = parseFloat(line.style.marginInlineStart);
		return isNaN(n) ? 0 : n;
	}

	// ---------- Sentence Flow: tab-stop layout ----------

	// Real tab characters have no notion of "jump to this exact grid
	// position" in CSS, so each line's da-tab markers are manually resized
	// here: walk the line measuring text width with a canvas 2D context
	// (matching each run's actual font/weight/style), and set every da-tab
	// span's width so the running offset lands exactly on the next multiple
	// of the default tab width.
	layoutNotesTabs(key: FlowKey = this.curFlowKey()): void {
		const canvas = this.flowCanvas(key);
		if (!canvas) return;
		if (!this.measureCtx) this.measureCtx = document.createElement("canvas").getContext("2d");
		const ctx = this.measureCtx;
		if (!ctx) return;

		const defaultWidth = this.flows[key].defaultTabWidth;

		this.getNotesLines(canvas).forEach(line => {
			let x = this.getLineMarginPx(line);
			const walk = (node: ChildNode) => {
				if (node.nodeType === Node.TEXT_NODE) {
					const text = node.textContent || "";
					if (!text) return;
					const el = node.parentElement || line;
					const cs = getComputedStyle(el);
					ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
					x += ctx.measureText(text).width;
					return;
				}
				if (node.nodeType !== Node.ELEMENT_NODE) return;
				const el = node as HTMLElement;
				if (el.classList.contains("da-tab")) {
					const target = this.nextStop(x, defaultWidth);
					el.setCssStyles({ width: `${Math.max(4, target - x)}px` });
					x = target;
					return;
				}
				Array.from(el.childNodes).forEach(walk);
			};
			Array.from(line.childNodes).forEach(walk);
		});
	}

	private scheduleNotesLayout(immediate = false, key: FlowKey = this.curFlowKey()): void {
		if (immediate) { this.layoutNotesTabs(key); return; }
		const f = this.flows[key];
		if (f.layoutScheduled) return;
		f.layoutScheduled = true;
		window.requestAnimationFrame(() => {
			f.layoutScheduled = false;
			this.layoutNotesTabs(key);
		});
	}

	// Smallest/largest multiple of the default tab width strictly greater
	// than/less than x (floored at 0) - there's no ruler to set custom stops
	// on, so Tab and indent always snap to this fixed grid.
	private nextStop(x: number, defaultWidth: number): number {
		const EPS = 0.5;
		const w = defaultWidth > 0 ? defaultWidth : 48;
		return (Math.floor((x + EPS) / w) + 1) * w;
	}

	private prevStop(x: number, defaultWidth: number): number {
		const EPS = 0.5;
		const w = defaultWidth > 0 ? defaultWidth : 48;
		return Math.max(0, (Math.ceil((x - EPS) / w) - 1) * w);
	}

	private syncNotesToolbarUi(key?: FlowKey): void {
		(key ? [key] : FLOW_KEYS).forEach(k => {
			const input = this.byId<HTMLInputElement>(this.flows[k].tabInputId);
			if (input) input.value = (this.flows[k].defaultTabWidth / 96).toFixed(2);
		});
	}

	private updateNotesFormatButtonStates(): void {
		this.qsa<HTMLButtonElement>("[data-fmt]").forEach(btn => {
			const active = document.queryCommandState(btn.dataset.fmt as string);
			btn.classList.toggle("da-sf-fmt-btn-active", active);
		});
	}

	// Shared by the toolbar buttons and the Mod+B/I/U scope handlers. Underline
	// gets special treatment: applying it as-is to a double-click's "word plus
	// trailing space" selection (or any selection with trailing whitespace)
	// underlines that trailing space too, which looks wrong - Word and Google
	// Docs both exclude it. Bold/Italic don't have this problem visually, so
	// they're untouched.
	private applySentenceFlowFormat(command: string): void {
		if (command !== "underline" || document.queryCommandState("underline")) {
			// Only the turning-on case needs the trim - toggling underline off
			// again should clear it from the full selection as-is.
			document.execCommand(command);
			return;
		}
		const sel = window.getSelection();
		if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
			const range = sel.getRangeAt(0).cloneRange();
			this.trimTrailingWhitespaceFromRange(range);
			sel.removeAllRanges();
			sel.addRange(range);
		}
		document.execCommand("underline");
	}

	// Shrinks range's end past any trailing whitespace, so a following
	// execCommand("underline") skips it. Only trims from the very end of the
	// selection - whitespace between words stays included. Handles the common
	// case (the trailing space lives in the same text node as the selection
	// end, which is how a double-click "word " selection and most drag
	// selections land) and hops back across formatting-span boundaries (b/i/u)
	// under the canvas for the rarer case of a trailing run of whitespace split
	// across nodes.
	private trimTrailingWhitespaceFromRange(range: Range): void {
		// The editor holding the selection: a flow canvas, or a proposition's
		// text while it's edited in the Brackets tab.
		const endNode = range.endContainer;
		const endEl = endNode.nodeType === Node.ELEMENT_NODE ? endNode as Element : endNode.parentElement;
		const canvas = endEl?.closest(".da-sf-canvas, .da-row-text, .da-prop-text") ?? null;
		if (!canvas) return;

		let container = range.endContainer;
		let offset = range.endOffset;

		while (container.nodeType === Node.TEXT_NODE) {
			const text = container.textContent || "";
			let cut = offset;
			while (cut > 0 && /\s/.test(text[cut - 1])) cut--;

			if (cut > 0) {
				range.setEnd(container, cut);
				return;
			}
			if (cut === offset) return; // nothing whitespace here to trim

			if (container === range.startContainer && range.startOffset >= cut) return;

			const walker = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT);
			let prev: Text | null = null;
			let node: Node | null;
			while ((node = walker.nextNode())) {
				if (node === container) break;
				prev = node as Text;
			}
			if (!prev) { range.setEnd(container, 0); return; }
			container = prev;
			offset = (prev.textContent || "").length;
		}
	}

	// ---------- Sentence Flow: load / save ----------

	// (Re)builds a flow canvas's DOM from its saved lines using the same
	// createEl-style DOM helpers as the rest of the view (no innerHTML), then
	// re-runs the layout pass so tab markers land on the default-tab-width
	// grid. With no key, rebuilds every flow canvas.
	renderNotesTab(key?: FlowKey): void {
		if (!key) { FLOW_KEYS.forEach(k => this.renderNotesTab(k)); return; }
		const canvas = this.flowCanvas(key);
		if (!canvas) return;
		canvas.empty();

		// Deliberately doesn't fall back to a placeholder empty line when
		// the flow has no lines: leaving the canvas with zero children for a
		// brand-new file matches what a plain, never-typed-into contenteditable
		// looks like, and getNotesLines already treats "no line divs yet" as
		// one implicit line (the canvas itself) for layout/serialization.
		this.flows[key].lines.forEach(line => {
			const div = canvas.createDiv();
			if (line.indent > 0) div.style.marginInlineStart = `${line.indent}px`;
			line.segments.forEach(seg => {
				if (seg.kind === "tab") {
					const tab = div.createSpan({ cls: "da-tab" });
					tab.contentEditable = "false";
					tab.setText("​");
					return;
				}
				let node: Node = document.createTextNode(seg.text);
				if (seg.underline) { const u = document.createElement("u"); u.appendChild(node); node = u; }
				if (seg.italic) { const i = document.createElement("i"); i.appendChild(node); node = i; }
				if (seg.bold) { const b = document.createElement("b"); b.appendChild(node); node = b; }
				div.appendChild(node);
			});
		});

		canvas.dir = this.isRTL ? "rtl" : "ltr";
		this.syncNotesToolbarUi(key);
		window.requestAnimationFrame(() => this.layoutNotesTabs(key));
	}

	// Walks the live canvas DOM (as left behind by typing, execCommand
	// formatting, Tab markers, and paste) back into the persisted NotesLine
	// model. Adjacent text runs sharing the same bold/italic/underline state
	// are coalesced into one segment.
	private serializeNotesLines(key: FlowKey): NotesLine[] {
		const canvas = this.flowCanvas(key);
		if (!canvas) return this.flows[key].lines;

		return this.getNotesLines(canvas).map(lineEl => {
			const segments: NotesSegment[] = [];

			const walk = (node: ChildNode, bold: boolean, italic: boolean, underline: boolean) => {
				if (node.nodeType === Node.TEXT_NODE) {
					const text = node.textContent || "";
					if (!text) return;
					const last = segments[segments.length - 1];
					if (last && last.kind === "text" && !!last.bold === bold && !!last.italic === italic && !!last.underline === underline) {
						last.text += text;
					} else {
						segments.push({ kind: "text", text, bold, italic, underline });
					}
					return;
				}
				if (node.nodeType !== Node.ELEMENT_NODE) return;
				const el = node as HTMLElement;
				if (el.classList.contains("da-tab")) { segments.push({ kind: "tab" }); return; }
				if (el.tagName === "BR") return;

				const nextBold = bold || el.tagName === "B" || el.tagName === "STRONG";
				const nextItalic = italic || el.tagName === "I" || el.tagName === "EM";
				const nextUnderline = underline || el.tagName === "U";
				Array.from(el.childNodes).forEach(c => walk(c, nextBold, nextItalic, nextUnderline));
			};

			Array.from(lineEl.childNodes).forEach(n => walk(n, false, false, false));
			return { indent: this.getLineMarginPx(lineEl), segments };
		});
	}
}
