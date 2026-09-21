import { App, Modal, TextFileView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import html2canvas from "html2canvas";

export const VIEW_TYPE_DA = "da-tool-view";

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

// Every color token the view's stylesheet exposes as a CSS custom property
// (see styles.css, both the standard and .da-theme-adopt token blocks). The
// settings tab (main.ts) renders one color picker per entry here so every
// color can be overridden manually, regardless of standard/theme mode.
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
	{ id: "success", cssVar: "--da-success", label: "Success", desc: "Support button and RTL/theme switch (on state)." },
	{ id: "successHover", cssVar: "--da-success-hover", label: "Success (hover)", desc: "" },
	{ id: "warnBg", cssVar: "--da-warn-bg", label: "Warning background", desc: "Clear All Brackets button." },
	{ id: "warnHover", cssVar: "--da-warn-hover", label: "Warning (hover)", desc: "" },
	{ id: "danger", cssVar: "--da-danger", label: "Danger", desc: "Delete icons and Clear All link." },
	{ id: "dangerHover", cssVar: "--da-danger-hover", label: "Danger (hover)", desc: "" },
	{ id: "dangerBg", cssVar: "--da-danger-bg", label: "Danger background", desc: "Reset Everything button." },
];

export interface DAToolSettings {
	useThemeColors: boolean;
	// Maps ColorToken.id -> a manual hex override. Absent/empty means "use the
	// standard or theme-adopted default for that token".
	colorOverrides: Record<string, string>;
}

export interface DAToolPluginHost {
	settings: DAToolSettings;
	saveSettings(): Promise<void>;
	refreshAllViews(): void;
}

interface Proposition {
	id: number;
	text: string;
	level: number;
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
}

function emptyNotesData(): NotesData {
	return { lines: [], defaultTabWidth: 24 };
}

// A bracket's parent ids, regardless of whether they were recorded in the
// older singular parentBracketId/parentBracketId2 fields (two-node brackets)
// or the parentBracketIds array (single-node brackets, which can have >2 parents).
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
			{ term: "Action-Manner", abbr: "A/Mn", def: "An action and a statement indicating the way or manner that action is carried out.", conj: "in that, by, with, participles.", example: "Walk in a manner worthy of the calling to which you have been called, with all humility and gentleness, with patience (Eph 1:1-2)" },
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

const EXAMPLE_PROPOSITIONS: Proposition[] = [
	{ id: 1, text: "And we also thank God constantly for this,", level: 0 },
	{ id: 2, text: "that when you received the word of God,", level: 0 },
	{ id: 3, text: "which you heard from us,", level: 0 },
	{ id: 4, text: "you accepted it", level: 0 },
	{ id: 5, text: "not as the word of men", level: 0 },
	{ id: 6, text: "but as what it really is, the word of God,", level: 0 },
	{ id: 7, text: "which is at work in you believers.", level: 0 },
];

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
	zoomLevel = 1;
	isRTL = false;
	dragSrcIndex: number | null = null;

	activeTab: "brackets" | "sentenceflow" = "brackets";
	notesLines: NotesLine[] = [];
	notesDefaultTabWidth = 24;

	private loaded = false;
	private domBuilt = false;
	private resizeObserver: ResizeObserver | null = null;
	private notesLayoutScheduled = false;
	private measureCtx: CanvasRenderingContext2D | null = null;
	private plugin: DAToolPluginHost;

	constructor(leaf: WorkspaceLeaf, plugin: DAToolPluginHost) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_DA;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Discourse Analysis";
	}

	getIcon(): string {
		return "brackets";
	}

	// ---------- scoped DOM helpers ----------

	private byId<T extends Element = HTMLElement>(id: string): T | null {
		return this.contentEl.querySelector("#" + id) as T | null;
	}

	private qsa<T extends Element = HTMLElement>(selector: string): T[] {
		return Array.from(this.contentEl.querySelectorAll(selector)) as T[];
	}

	private confirmAction(message: string, onConfirm: () => void): void {
		new ConfirmModal(this.app, message, onConfirm).open();
	}

	// ---------- TextFileView contract ----------

	getViewData(): string {
		// The Sentence Flow canvas's DOM is the live source of truth while
		// editing (browser-managed via execCommand), so pull it back into
		// notesLines before serializing - otherwise saves would miss whatever
		// was typed since the last sync.
		if (this.domBuilt) {
			this.notesLines = this.serializeNotesLines();
		}
		const data: ProjectData = {
			propositions: this.propositions,
			brackets: this.brackets,
			zoomLevel: this.zoomLevel,
			isRTL: this.isRTL,
			notes: { lines: this.notesLines, defaultTabWidth: this.notesDefaultTabWidth },
			timestamp: new Date().toISOString(),
		};
		return JSON.stringify(data, null, 2);
	}

	setViewData(data: string, clear: boolean): void {
		let parsed: Partial<ProjectData> = {};
		if (data && data.trim().length > 0) {
			try {
				parsed = JSON.parse(data);
			} catch (e) {
				console.error("DA-Tool: failed to parse file contents, starting empty.", e);
				parsed = {};
			}
		}
		this.propositions = parsed.propositions || [];
		this.brackets = parsed.brackets || [];
		this.zoomLevel = parsed.zoomLevel || 1;
		this.isRTL = parsed.isRTL || false;
		const notes = parsed.notes || emptyNotesData();
		this.notesLines = notes.lines || [];
		this.notesDefaultTabWidth = notes.defaultTabWidth || 24;
		this.migrateSingleNodeBrackets();
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.sidebarSelected = -1;
		this.historyStack = [];
		this.loaded = true;

		if (this.domBuilt) {
			this.syncRtlToggleUi();
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
			this.applyZoom();
			this.renderNotesTab();
		}
	}

	clear(): void {
		const empty = emptyProjectData();
		this.propositions = empty.propositions;
		this.brackets = empty.brackets;
		this.zoomLevel = empty.zoomLevel;
		this.isRTL = empty.isRTL;
		this.notesLines = [];
		this.notesDefaultTabWidth = 24;
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.sidebarSelected = -1;
		this.historyStack = [];
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

		const header = this.contentEl.createDiv({ cls: "da-header" });
		const headerLeft = header.createDiv({ cls: "da-header-left" });
		headerLeft.createDiv({ cls: "da-logo", text: "∴" });
		headerLeft.createEl("h1", { cls: "da-title", text: "Discourse Analysis" });

		const headerRight = header.createDiv({ cls: "da-header-right" });
		headerRight.createEl("button", { cls: "da-btn da-btn-primary", text: "💾", attr: { "data-action": "force-save", title: "Save", "aria-label": "Save" } });
		headerRight.createEl("button", { cls: "da-btn", text: "🔗", attr: { "data-action": "show-lr", title: "Logical Relations", "aria-label": "Logical Relations" } });
		headerRight.createEl("button", { cls: "da-btn", text: "📖", attr: { "data-action": "show-resources", title: "Resources", "aria-label": "Resources" } });
		headerRight.createEl("button", { cls: "da-btn", text: "📷", attr: { "data-action": "export-png", title: "Export PNG", "aria-label": "Export PNG" } });
		headerRight.createSpan({ cls: "da-label", text: "Colors" });
		headerRight.createEl("button", { cls: "da-switch", attr: { id: "theme-toggle", role: "switch", "aria-checked": "false" } }, btn => {
			btn.createSpan({ cls: "da-switch-thumb", attr: { id: "theme-thumb" } });
		});
		headerRight.createSpan({ cls: "da-label", text: "RTL" });
		headerRight.createEl("button", { cls: "da-switch", attr: { id: "rtl-toggle", role: "switch", "aria-checked": "false" } }, btn => {
			btn.createSpan({ cls: "da-switch-thumb", attr: { id: "rtl-thumb" } });
		});
		headerRight.createEl("button", { cls: "da-btn da-btn-support", text: "☕ Support", attr: { "data-action": "open-external", "data-url": "https://buymeacoffee.com/reformedretrieval" } });

		const tabStrip = this.contentEl.createDiv({ cls: "da-tab-strip" });
		tabStrip.createEl("button", { cls: "da-tab-btn da-tab-btn-active", text: "Brackets", attr: { "data-tab": "brackets" } });
		tabStrip.createEl("button", { cls: "da-tab-btn", text: "Sentence Flow", attr: { "data-tab": "sentenceflow" } });

		const bodyEl = this.contentEl.createDiv({ cls: "da-body da-tab-panel", attr: { id: "brackets-panel" } });

		const leftSidebar = bodyEl.createDiv({ cls: "da-sidebar da-sidebar-left", attr: { id: "left-sidebar", style: "width:288px;min-width:180px;max-width:600px;" } });
		const sidebarHeader = leftSidebar.createDiv({ cls: "da-sidebar-header" });
		sidebarHeader.createEl("h2", { cls: "da-section-title", text: "Propositions" });
		sidebarHeader.createEl("textarea", { cls: "da-textarea", attr: { id: "paste-area", rows: "3", placeholder: "Paste full passage here…" } });
		const insertRow = sidebarHeader.createDiv({ cls: "da-row-gap" });
		insertRow.createEl("button", { cls: "da-btn da-btn-primary da-flex1", text: "Insert Propositions", attr: { "data-action": "insert-props" } });
		insertRow.createEl("button", { cls: "da-btn-square", text: "+", attr: { "data-action": "add-prop" } });
		leftSidebar.createDiv({ cls: "da-prop-list", attr: { id: "sidebar-prop-list" } });
		const leftFooter = leftSidebar.createDiv({ cls: "da-sidebar-footer" });
		leftFooter.createDiv({ text: "Drag ⋮⋮ to reorder • Double-click in main area to split" });
		leftFooter.createEl("button", { cls: "da-link-danger", text: "Clear All", attr: { "data-action": "clear-all" } });

		bodyEl.createDiv({ cls: "da-resizer", attr: { id: "left-resizer" } });

		const workspace = bodyEl.createDiv({ cls: "da-workspace", attr: { id: "workspace" } });
		const diagramContainer = workspace.createDiv({ cls: "da-diagram-container", attr: { id: "diagram-container" } });
		diagramContainer.createDiv({ cls: "da-overlay", attr: { "data-action": "deselect" } });
		const workspaceScaler = diagramContainer.createDiv({ cls: "da-workspace-scaler", attr: { id: "workspace-scaler" } });
		workspaceScaler.createSvg("svg", { cls: "da-bracket-svg", attr: { id: "bracket-svg", width: "365", height: "1200" } });
		workspaceScaler.createDiv({ cls: "da-proposition-rows", attr: { id: "proposition-rows" } });

		bodyEl.createDiv({ cls: "da-resizer", attr: { id: "right-resizer" } });

		const rightSidebar = bodyEl.createDiv({ cls: "da-sidebar da-sidebar-right", attr: { id: "right-sidebar", style: "width:288px;min-width:180px;max-width:600px;" } });
		rightSidebar.createEl("h2", { cls: "da-section-title", text: "Tools" });

		const twoNodeBtn = rightSidebar.createEl("button", { cls: "da-btn da-btn-primary da-btn-block", attr: { "data-action": "add-blank-bracket" } });
		this.appendBracketIcon(twoNodeBtn, [
			{ tag: "rect", attr: { x: "2", y: "2", width: "6", height: "6", rx: "1.5" } },
			{ tag: "rect", attr: { x: "2", y: "14", width: "6", height: "6", rx: "1.5" } },
			{ tag: "line", attr: { x1: "8", y1: "5", x2: "16", y2: "5" } },
			{ tag: "line", attr: { x1: "8", y1: "17", x2: "16", y2: "17" } },
			{ tag: "line", attr: { x1: "16", y1: "5", x2: "16", y2: "17" } },
			{ tag: "line", attr: { x1: "16", y1: "5", x2: "19", y2: "5" } },
			{ tag: "line", attr: { x1: "16", y1: "17", x2: "19", y2: "17" } },
		]);
		twoNodeBtn.appendText("TWO-NODE BRACKET");

		const singleNodeBtn = rightSidebar.createEl("button", { cls: "da-btn da-btn-primary da-btn-block", attr: { "data-action": "add-single-node-bracket" } });
		this.appendBracketIcon(singleNodeBtn, [
			{ tag: "rect", attr: { x: "2", y: "8", width: "6", height: "6", rx: "1.5" } },
			{ tag: "line", attr: { x1: "8", y1: "11", x2: "16", y2: "11" } },
			{ tag: "line", attr: { x1: "16", y1: "3", x2: "16", y2: "19" } },
			{ tag: "line", attr: { x1: "16", y1: "3", x2: "19", y2: "3" } },
			{ tag: "line", attr: { x1: "16", y1: "19", x2: "19", y2: "19" } },
		]);
		singleNodeBtn.appendText("SINGLE-NODE BRACKET");

		const zoomRow = rightSidebar.createDiv({ cls: "da-zoom-row" });
		zoomRow.createSpan({ cls: "da-label", text: "Zoom" });
		zoomRow.createEl("button", { cls: "da-btn da-flex1", text: "−", attr: { "data-action": "zoom-out" } });
		zoomRow.createSpan({ cls: "da-zoom-label", text: "100%", attr: { id: "zoom-label" } });
		zoomRow.createEl("button", { cls: "da-btn da-flex1", text: "+", attr: { "data-action": "zoom-in" } });
		zoomRow.createEl("button", { cls: "da-btn", text: "↺", attr: { "data-action": "zoom-reset" } });

		const instructions = rightSidebar.createDiv({ cls: "da-instructions" });
		instructions.createEl("strong", { text: "Operations:" });
		instructions.createEl("br");
		instructions.appendText("Right-click box = edit label");
		instructions.createEl("br");
		instructions.appendText("Select spine + Delete = remove bracket");
		instructions.createEl("br");
		instructions.appendText("Tab = indent selected proposition");
		instructions.createEl("br");
		instructions.appendText("Shift+Tab = decrease indent on selected proposition");
		instructions.createEl("br");
		instructions.appendText("Click whitespace (anywhere in work area) = deselect");
		instructions.createEl("br");
		instructions.appendText("Click + drag = pan workspace");

		const bottomRow = rightSidebar.createDiv({ cls: "da-row-gap" });
		bottomRow.createEl("button", { cls: "da-btn da-flex1 da-btn-block da-btn-warn", text: "Clear All Brackets", attr: { "data-action": "clear-brackets" } });
		bottomRow.createEl("button", { cls: "da-btn da-flex1 da-btn-block da-btn-danger", text: "Reset Everything", attr: { "data-action": "reset-all" } });

		this.buildSentenceFlowPanel();

		const labelEditor = this.contentEl.createDiv({ cls: "da-label-editor", attr: { id: "label-editor", style: "display:none;" } });
		labelEditor.createDiv({ cls: "da-label-editor-title", text: "EDIT LABEL" });
		labelEditor.createEl("input", { cls: "da-label-editor-input", attr: { id: "lei", type: "text" } });
		const labelEditorActions = labelEditor.createDiv({ cls: "da-label-editor-actions" });
		labelEditorActions.createEl("button", { cls: "da-btn", text: "Cancel", attr: { id: "le-cancel" } });
		labelEditorActions.createEl("button", { cls: "da-btn da-btn-primary", text: "OK", attr: { id: "le-ok" } });

		const lrModal = this.contentEl.createDiv({ cls: "da-modal-backdrop hidden", attr: { id: "lr-modal" } });
		const lrModalInner = lrModal.createDiv({ cls: "da-modal" });
		const lrModalHeader = lrModalInner.createDiv({ cls: "da-modal-header" });
		lrModalHeader.createEl("h2", { cls: "da-modal-title", text: "The 18 Logical Relationships" });
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
		const resourceModalInner = resourceModal.createDiv({ cls: "da-modal" });
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
	}

	// Builds the "Sentence Flow" tab: a Word-like scratch canvas for pasting
	// and editing a passage's raw text, where Tab always jumps to the next
	// multiple of the configurable default tab width (see layoutNotesTabs)
	// so tabbed text aligns into columns across lines, plus indent (Ctrl+M /
	// Ctrl+Shift+M) and basic bold/italic/underline formatting.
	private buildSentenceFlowPanel(): void {
		const panel = this.contentEl.createDiv({ cls: "da-tab-panel da-tab-panel-hidden da-sf-panel", attr: { id: "sentenceflow-panel" } });

		const toolbar = panel.createDiv({ cls: "da-sf-toolbar" });
		toolbar.createEl("button", { cls: "da-btn da-sf-fmt-btn", text: "B", attr: { "data-fmt": "bold", title: "Bold (Ctrl+B)", "aria-label": "Bold" } });
		toolbar.createEl("button", { cls: "da-btn da-sf-fmt-btn", text: "I", attr: { "data-fmt": "italic", title: "Italic (Ctrl+I)", "aria-label": "Italic" } });
		toolbar.createEl("button", { cls: "da-btn da-sf-fmt-btn", text: "U", attr: { "data-fmt": "underline", title: "Underline (Ctrl+U)", "aria-label": "Underline" } });

		const tabWidthWrap = toolbar.createDiv({ cls: "da-sf-tabwidth" });
		tabWidthWrap.createSpan({ text: "Default tab:" });
		tabWidthWrap.createEl("input", {
			cls: "da-sf-tabwidth-input",
			attr: { id: "notes-default-tab-width", type: "number", min: "0.1", step: "0.1" },
		});
		tabWidthWrap.createSpan({ text: "in" });

		const canvasWrap = panel.createDiv({ cls: "da-sf-canvas-wrap" });
		const canvas = canvasWrap.createDiv({ cls: "da-sf-canvas", attr: { id: "notes-canvas", contenteditable: "true", spellcheck: "false" } });
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
		on("export-png", () => { void this.exportPNG(); });
		on("insert-props", () => this.splitIntoPropositions());
		on("add-prop", () => this.addNewProposition());
		on("clear-all", () => this.clearAll());
		on("add-blank-bracket", () => this.addBlankBracket());
		on("add-single-node-bracket", () => this.addSingleNodeBracket());
		on("zoom-out", () => this.adjustZoom(-0.1));
		on("zoom-in", () => this.adjustZoom(0.1));
		on("zoom-reset", () => this.resetZoom());
		on("clear-brackets", () => this.clearBracketsOnly());
		on("reset-all", () => this.resetAll());
		on("deselect", () => this.deselectAll());
		this.qsa<HTMLButtonElement>('[data-action="open-external"]').forEach(el => {
			this.registerDomEvent(el, "click", () => window.open(el.dataset.url, "_blank"));
		});

		const rtlToggle = this.byId("rtl-toggle");
		if (rtlToggle) this.registerDomEvent(rtlToggle, "click", () => this.toggleRTL());

		const themeToggle = this.byId("theme-toggle");
		if (themeToggle) this.registerDomEvent(themeToggle, "click", () => this.toggleThemeColors());

		this.initializeCanvasClick();
		this.initializePanning();
		this.makeResizable("left-resizer", "left-sidebar", "left");
		this.makeResizable("right-resizer", "right-sidebar", "right");

		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => this.handleKeydown(e));

		this.qsa<HTMLButtonElement>(".da-tab-btn").forEach(btn => {
			this.registerDomEvent(btn, "click", () => this.switchTab(btn.dataset.tab === "sentenceflow" ? "sentenceflow" : "brackets"));
		});

		this.wireSentenceFlowEvents();
	}

	// ---------- Sentence Flow tab ----------

	private switchTab(tab: "brackets" | "sentenceflow"): void {
		this.activeTab = tab;
		this.qsa(".da-tab-btn").forEach(btn => btn.classList.toggle("da-tab-btn-active", btn.dataset.tab === tab));
		this.byId("brackets-panel")?.classList.toggle("da-tab-panel-hidden", tab !== "brackets");
		this.byId("sentenceflow-panel")?.classList.toggle("da-tab-panel-hidden", tab !== "sentenceflow");
		if (tab === "sentenceflow") {
			window.requestAnimationFrame(() => this.layoutNotesTabs());
		} else {
			window.requestAnimationFrame(() => this.renderCanvas());
		}
	}

	private wireSentenceFlowEvents(): void {
		const canvas = this.byId("notes-canvas");
		if (canvas) {
			this.registerDomEvent(canvas, "paste", (e: ClipboardEvent) => this.handleNotesPaste(e));
			this.registerDomEvent(canvas, "keydown", (e: KeyboardEvent) => this.handleNotesKeydown(e));
			this.registerDomEvent(canvas, "input", () => { this.scheduleNotesLayout(); this.requestSave(); });
		}

		this.qsa<HTMLButtonElement>("[data-fmt]").forEach(btn => {
			// Prevent the toolbar button from stealing focus/selection away
			// from the canvas before the click handler runs execCommand -
			// execCommand acts on whatever is currently selected, so losing
			// the selection first would make Bold/Italic/Underline no-ops.
			this.registerDomEvent(btn, "mousedown", (e: MouseEvent) => e.preventDefault());
			this.registerDomEvent(btn, "click", () => {
				document.execCommand(btn.dataset.fmt as string);
				this.updateNotesFormatButtonStates();
			});
		});

		this.registerDomEvent(document, "selectionchange", () => {
			if (this.activeTab === "sentenceflow" && document.activeElement?.id === "notes-canvas") {
				this.updateNotesFormatButtonStates();
			}
		});

		const tabWidthInput = this.byId<HTMLInputElement>("notes-default-tab-width");
		if (tabWidthInput) {
			this.registerDomEvent(tabWidthInput, "change", () => {
				const inches = parseFloat(tabWidthInput.value);
				if (!isNaN(inches) && inches > 0) this.notesDefaultTabWidth = Math.round(inches * 96);
				this.syncNotesToolbarUi();
				this.layoutNotesTabs();
				this.requestSave();
			});
		}
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

	private handleKeydown(e: KeyboardEvent): void {
		if (!this.focusIsWithinThisView()) return;

		// The Sentence Flow canvas handles its own Tab/Ctrl+Z/Ctrl+B etc. (see
		// handleNotesKeydown) and relies on the browser's native contentEditable
		// undo stack, so none of the Brackets-tab shortcuts below should run
		// while focus is inside it.
		const inNotesCanvas = !!(e.target as HTMLElement | null)?.closest?.("#notes-canvas");
		if (inNotesCanvas) return;

		if (e.key === "Tab" && (this.selectedIndices.length >= 1 || this.sidebarSelected >= 0)) {
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

		if (e.ctrlKey && e.key === "z") {
			e.preventDefault();
			this.undoLastAction();
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
			return;
		}
		this.applyZoom();
	}

	resetZoom(): void {
		this.zoomLevel = 1;
		const container = this.byId("diagram-container");
		if (!this.isRTL && container) {
			this.applyZoom();
			container.scrollLeft = 0;
			return;
		}
		this.applyZoom();
	}

	applyZoom(): void {
		const scaler = this.byId("workspace-scaler");
		const container = this.byId("diagram-container");
		if (scaler) {
			if (!this.isRTL && this.zoomLevel < 1 && container) {
				const containerW = container.clientWidth;
				const naturalW = scaler.offsetWidth;
				const scaledW = naturalW * this.zoomLevel;
				if (scaledW < containerW) {
					const tx = containerW - scaledW;
					scaler.setCssStyles({ transform: `translateX(${tx}px) scale(${this.zoomLevel})` });
				} else {
					scaler.setCssStyles({ transform: `scale(${this.zoomLevel})` });
				}
			} else {
				scaler.setCssStyles({ transform: `scale(${this.zoomLevel})` });
			}
		}
		const label = this.byId("zoom-label");
		if (label) label.textContent = Math.round(this.zoomLevel * 100) + "%";
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
		const notesCanvas = this.byId("notes-canvas");
		if (notesCanvas) {
			notesCanvas.dir = this.isRTL ? "rtl" : "ltr";
			this.layoutNotesTabs();
		}
		void this.save();
	}

	// ---------- theme coloring ----------

	// Applies the vault-wide theme-coloring preference and any manual color
	// overrides to this view's DOM and toggle switch. Called on open and after
	// any view/settings tab changes either setting, so every open DA view
	// stays in sync with the shared plugin settings.
	refreshTheming(): void {
		this.contentEl.classList.toggle("da-theme-adopt", this.plugin.settings.useThemeColors);
		this.syncThemeToggleUi();
		this.applyColorOverrides();
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

	private syncThemeToggleUi(): void {
		const btn = this.byId("theme-toggle");
		const thumb = this.byId("theme-thumb");
		if (!btn || !thumb) return;
		if (this.plugin.settings.useThemeColors) {
			btn.classList.add("da-switch-on");
			btn.setAttribute("aria-checked", "true");
		} else {
			btn.classList.remove("da-switch-on");
			btn.setAttribute("aria-checked", "false");
		}
	}

	toggleThemeColors(): void {
		this.plugin.settings.useThemeColors = !this.plugin.settings.useThemeColors;
		void this.plugin.saveSettings();
		this.plugin.refreshAllViews();
	}

	// ---------- history / persistence ----------

	saveToHistory(): void {
		this.historyStack.push(JSON.stringify({
			propositions: JSON.parse(JSON.stringify(this.propositions)),
			brackets: JSON.parse(JSON.stringify(this.brackets)),
			selectedIndices: this.selectedIndices,
			selectedBracketId: this.selectedBracketId,
			selectedCorners: this.selectedCorners,
		}));
		if (this.historyStack.length > 20) this.historyStack.shift();
		void this.save();
	}

	undoLastAction(): void {
		if (this.historyStack.length === 0) return;
		const prev = JSON.parse(this.historyStack.pop());
		this.propositions = prev.propositions || [];
		this.brackets = prev.brackets || [];
		this.selectedIndices = prev.selectedIndices || [];
		this.selectedBracketId = prev.selectedBracketId;
		this.selectedCorners = prev.selectedCorners || (prev.selectedCorner ? [prev.selectedCorner] : []);
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
		void this.save();
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

				this.brackets.forEach(b => {
					b.start = this.remapIndex(b.start, this.dragSrcIndex, insertIndex);
					b.end = this.remapIndex(b.end, this.dragSrcIndex, insertIndex);
					if (b.attachToRow !== undefined) {
						b.attachToRow = this.remapIndex(b.attachToRow, this.dragSrcIndex, insertIndex);
					}
					// Single-node brackets render from `nodes`, not start/end
					// (see renderCanvas's nodeRows), so it has to be remapped
					// in lockstep or the drawn anchors go stale after a drag.
					if (b.nodes) {
						b.nodes = b.nodes.map(r => this.remapIndex(r, this.dragSrcIndex, insertIndex));
					}
				});

				if (this.sidebarSelected === this.dragSrcIndex) this.sidebarSelected = insertIndex;
				this.selectedIndices = this.selectedIndices.map(idx => this.remapIndex(idx, this.dragSrcIndex, insertIndex));

				this.dragSrcIndex = null;
				this.renderSidebarList();
				this.renderMainRows();
				this.renderCanvas();
			});

			const numBadge = createDiv({ cls: "da-num-badge", text: String(i + 1) });

			const textEl = createDiv({ cls: "da-prop-text", text: prop.text });
			textEl.contentEditable = "true";
			textEl.spellcheck = false;
			textEl.dir = this.isRTL ? "rtl" : "ltr";
			textEl.addEventListener("click", e => e.stopImmediatePropagation());
			textEl.addEventListener("focus", () => {
				this.sidebarSelected = i;
				this.selectedIndices = [i];
				this.refreshSelectionHighlighting();
			});
			textEl.addEventListener("blur", () => this.updatePropositionText(i, textEl.innerText));

			const delBtn = createEl("button", { cls: "da-del-btn", text: "✕" });
			delBtn.addEventListener("click", e => { e.stopImmediatePropagation(); this.deleteProposition(i); });

			row.appendChild(dragHandle);
			row.appendChild(numBadge);
			row.appendChild(textEl);
			row.appendChild(delBtn);
			container.appendChild(row);
		});
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

		this.propositions.forEach((prop, i) => {
			const isSelected = this.selectedIndices.includes(i);
			const row = createDiv({ cls: `da-proposition-box${isSelected ? " selected" : ""}` });
			row.setCssStyles({ marginInlineStart: `${prop.level * 48}px` });
			row.addEventListener("click", e => { e.stopImmediatePropagation(); this.handleMainRowClick(i); });
			row.addEventListener("dblclick", e => { e.stopImmediatePropagation(); this.splitProposition(i, e); });

			const numEl = createDiv({ cls: "da-row-num", text: String(i + 1) });

			const textEl = createDiv({ cls: "da-row-text", text: prop.text });
			textEl.contentEditable = "true";
			textEl.spellcheck = false;
			textEl.dir = this.isRTL ? "rtl" : "ltr";
			textEl.addEventListener("blur", () => this.updatePropositionText(i, textEl.innerText));

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
		const remaining = new Set(brackets.map((_, i) => i));

		const parentsAssigned = (b: Bracket): boolean => {
			for (const pid of getParentIds(b)) {
				const pi = idToIdx[pid];
				if (pi === undefined || colOf[pi] === -1) return false;
			}
			return true;
		};

		let safetyLimit = n * n + 10;
		while (remaining.size > 0 && safetyLimit-- > 0) {
			let progress = false;
			for (const i of [...remaining]) {
				const b = brackets[i];
				if (!parentsAssigned(b)) continue;

				let minCol = 0;
				for (const pid of getParentIds(b)) {
					const pi = idToIdx[pid];
					if (pi !== undefined && colOf[pi] !== -1) minCol = Math.max(minCol, colOf[pi] + 1);
				}

				brackets.forEach((other, j) => {
					if (j === i || colOf[j] === -1) return;
					const s1 = b.start, e1 = b.end;
					const s2 = other.start, e2 = other.end;
					const strictlyContains = s1 <= s2 && e1 >= e2 && (s1 < s2 || e1 > e2);
					if (strictlyContains) minCol = Math.max(minCol, colOf[j] + 1);
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

				remaining.delete(i);
				progress = true;
			}
			if (!progress) {
				const i = [...remaining][0];
				colOf[i] = 0;
				remaining.delete(i);
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
		const offsetX = Math.max(60, -minLeft + 60);
		const baseRightX = 275 + offsetX;
		const svgWidth = baseRightX + 30;
		const bracketPadding = baseRightX + 5;

		svg.setAttribute("width", String(svgWidth));
		svg.setCssStyles({ width: `${svgWidth}px` });

		propRows.setCssStyles({
			paddingLeft: isRTL ? "20px" : `${bracketPadding}px`,
			paddingRight: isRTL ? `${bracketPadding}px` : "20px",
		});

		const COL_STEP = 72;

		const idToIdx: Record<number, number> = {};
		brackets.forEach((b, i) => { idToIdx[b.id] = i; });

		const bracketLeftX: (number | null)[] = new Array(brackets.length).fill(null);
		const order = brackets.map((b, i) => ({ i, col: colOf[i] >= 0 ? colOf[i] : 0 })).sort((a, b) => a.col - b.col);

		order.forEach(({ i }) => {
			const b = brackets[i];
			const col = colOf[i] >= 0 ? colOf[i] : 0;

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

			if (parentXs.length > 0) {
				if (!isRTL) {
					bracketLeftX[i] = Math.min(...parentXs) - COL_STEP;
				} else {
					bracketLeftX[i] = Math.max(...parentXs) + COL_STEP;
				}
			} else {
				let minIndent = Infinity;
				for (let r = Math.floor(b.start); r <= Math.ceil(b.end); r++) {
					const p = propositions[r];
					if (p !== undefined) minIndent = Math.min(minIndent, p.level);
				}
				if (minIndent === Infinity) minIndent = 0;
				const indentOffset = minIndent * 48;
				if (!isRTL) {
					bracketLeftX[i] = baseRightX - 12 - col * COL_STEP + indentOffset;
				} else {
					bracketLeftX[i] = 30 + 12 + col * COL_STEP - indentOffset;
				}
			}
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

			const leftX = bracketLeftX[i];
			const y1 = nodeY[i].top;
			const y2 = nodeY[i].bot;

			const group = createSvg("g");

			if (b.singleNode) {
				const yCenter = nodeY[i].center;

				const spineHit = createSvg("rect");
				spineHit.setAttribute("x", String(leftX - 12));
				spineHit.setAttribute("y", String(Math.min(y1, y2) - 2));
				spineHit.setAttribute("width", "24");
				spineHit.setAttribute("height", String(Math.max(Math.abs(y2 - y1), 4) + 4));
				spineHit.setAttribute("fill", "transparent");
				spineHit.setAttribute("pointer-events", "all");
				spineHit.addEventListener("click", e => { e.stopImmediatePropagation(); this.selectedBracketId = b.id; this.selectedCorners = []; this.renderCanvas(); });
				group.appendChild(spineHit);

				const vertical = createSvg("line");
				vertical.setAttribute("x1", String(leftX)); vertical.setAttribute("y1", String(y1));
				vertical.setAttribute("x2", String(leftX)); vertical.setAttribute("y2", String(y2));
				vertical.setAttribute("stroke", "var(--da-muted)"); vertical.setAttribute("stroke-width", "2.5");
				group.appendChild(vertical);

				const nodeRows = (b.nodes && b.nodes.length >= 2) ? b.nodes : [b.start, b.end];
				nodeRows.forEach(row => {
					const armY = this.getInterpolatedRowY(rowYs, row);
					const aRightX = armEndXForRow(i, row);
					const arm = createSvg("line");
					arm.setAttribute("x1", String(leftX)); arm.setAttribute("y1", String(armY));
					arm.setAttribute("x2", String(aRightX)); arm.setAttribute("y2", String(armY));
					arm.setAttribute("stroke", "var(--da-muted)"); arm.setAttribute("stroke-width", "2.5");
					group.appendChild(arm);
				});

				this.createCornerBox(group, b.centerLabel || "", leftX, yCenter, true, b.id);

				if (this.selectedBracketId === b.id || this.selectedCorners.some(c => c.bracketId === b.id)) {
					const highlight = createSvg("line");
					highlight.setAttribute("x1", String(leftX)); highlight.setAttribute("y1", String(y1));
					highlight.setAttribute("x2", String(leftX)); highlight.setAttribute("y2", String(y2));
					highlight.setAttribute("stroke", "var(--da-accent)"); highlight.setAttribute("stroke-width", "4");
					group.appendChild(highlight);
				}
			} else {
				const aRight1 = armEndX(i, true);
				const aRight2 = armEndX(i, false);

				const spineHit = createSvg("rect");
				spineHit.setAttribute("x", String(leftX - 12));
				spineHit.setAttribute("y", String(Math.min(y1, y2)));
				spineHit.setAttribute("width", "24");
				spineHit.setAttribute("height", String(Math.abs(y2 - y1)));
				spineHit.setAttribute("fill", "transparent");
				spineHit.setAttribute("pointer-events", "all");
				spineHit.addEventListener("click", e => { e.stopImmediatePropagation(); this.selectedBracketId = b.id; this.selectedCorners = []; this.renderCanvas(); });
				group.appendChild(spineHit);

				const vertical = createSvg("line");
				vertical.setAttribute("x1", String(leftX)); vertical.setAttribute("y1", String(y1));
				vertical.setAttribute("x2", String(leftX)); vertical.setAttribute("y2", String(y2));
				vertical.setAttribute("stroke", "var(--da-muted)"); vertical.setAttribute("stroke-width", "2.5");
				group.appendChild(vertical);

				const topArm = createSvg("line");
				topArm.setAttribute("x1", String(leftX)); topArm.setAttribute("y1", String(y1));
				topArm.setAttribute("x2", String(aRight1)); topArm.setAttribute("y2", String(y1));
				topArm.setAttribute("stroke", "var(--da-muted)"); topArm.setAttribute("stroke-width", "2.5");
				group.appendChild(topArm);

				const bottomArm = createSvg("line");
				bottomArm.setAttribute("x1", String(leftX)); bottomArm.setAttribute("y1", String(y2));
				bottomArm.setAttribute("x2", String(aRight2)); bottomArm.setAttribute("y2", String(y2));
				bottomArm.setAttribute("stroke", "var(--da-muted)"); bottomArm.setAttribute("stroke-width", "2.5");
				group.appendChild(bottomArm);

				this.createCornerBox(group, b.topLabel || "", leftX, y1, true, b.id);
				this.createCornerBox(group, b.bottomLabel || "", leftX, y2, false, b.id);

				if (this.selectedBracketId === b.id || this.selectedCorners.some(c => c.bracketId === b.id)) {
					const highlight = createSvg("line");
					highlight.setAttribute("x1", String(leftX)); highlight.setAttribute("y1", String(y1));
					highlight.setAttribute("x2", String(leftX)); highlight.setAttribute("y2", String(y2));
					highlight.setAttribute("stroke", "var(--da-accent)"); highlight.setAttribute("stroke-width", "4");
					group.appendChild(highlight);
				}
			}

			svg.appendChild(group);
		});
	}

	createCornerBox(group: SVGElement, text: string, spineX: number, y: number, isTop: boolean, bracketId: number): void {
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
		rect.setAttribute("fill", isSelected ? "var(--da-accent-soft-bg)" : (text ? "var(--da-surface)" : "var(--da-row-bg)"));
		rect.setAttribute("stroke", isSelected ? "var(--da-accent)" : (text ? "var(--da-muted)" : "var(--da-border-strong)"));
		rect.setAttribute("stroke-width", isSelected ? "2.5" : "1.5");
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
			txt.setAttribute("dominant-baseline", "middle");
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
		connector.setAttribute("stroke", "var(--da-faint)");
		connector.setAttribute("stroke-width", "1.5");
		group.appendChild(connector);
	}

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
		const rootRect = this.contentEl.getBoundingClientRect();
		let lx = clientX - rootRect.left, ly = clientY - rootRect.top;
		panel.setCssStyles({ left: `${lx}px`, top: `${ly}px` });
		window.requestAnimationFrame(() => {
			const r = panel.getBoundingClientRect();
			if (r.right > window.innerWidth) panel.setCssStyles({ left: `${lx - r.width}px` });
			if (r.bottom > window.innerHeight) panel.setCssStyles({ top: `${ly - r.height}px` });
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
			new Notice("Select two propositions, OR select a corner box and one proposition, OR select two corner boxes, then click ADD BLANK BRACKET.");
			return;
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

		this.saveToHistory();

		const propRows = [...this.selectedIndices];
		const parentBracketIds: number[] = [];
		const cornerRows = this.selectedCorners.map(c => {
			const parentBracket = this.brackets.find(b => b.id === c.bracketId);
			if (!parentBracket) return null;
			parentBracketIds.push(parentBracket.id);
			return this.getCornerRow(parentBracket, c.isTop);
		}).filter((r): r is number => r !== null);

		const allRows = [...propRows, ...cornerRows].sort((x, y) => x - y);
		if (allRows.length < 2) return;

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
		const parts = text
			.replace(/([.?!;])\s+/g, `$1${SPLIT_MARKER}`)
			.replace(/\n+/g, SPLIT_MARKER)
			.split(SPLIT_MARKER)
			.map(p => p.trim())
			.filter(p => p.length > 0);
		const newProps = parts.map((p, i) => ({ id: Date.now() + i, text: p, level: 0 }));
		this.propositions = this.propositions.concat(newProps);
		this.selectedIndices = [];
		this.sidebarSelected = -1;
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
		ta.value = "";
	}

	addNewProposition(): void {
		this.saveToHistory();
		const newProp: Proposition = { id: Date.now(), text: "New proposition…", level: 0 };
		if (this.sidebarSelected >= 0) {
			const insertedAt = this.sidebarSelected + 1;
			this.propositions.splice(insertedAt, 0, newProp);
			this.shiftReferencesForInsertion(insertedAt);
			this.sidebarSelected = insertedAt;
		} else {
			this.propositions.push(newProp);
			this.sidebarSelected = this.propositions.length - 1;
		}
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
	}

	updatePropositionText(index: number, newText: string): void {
		if (this.propositions[index]) {
			this.saveToHistory();
			this.propositions[index].text = newText.trim();
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

	indentSidebar(i: number, delta: number): void {
		this.saveToHistory();
		this.propositions[i].level = Math.max(0, this.propositions[i].level + delta);
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
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
				const rowDiv = this.qsa("#proposition-rows > div")[index];
				if (rowDiv && rowDiv.contains(range.commonAncestorContainer)) splitPos = range.startOffset;
			}
		}
		const first = text.substring(0, splitPos).trim();
		const second = text.substring(splitPos).trim();
		if (first && second) {
			this.propositions[index].text = first;
			this.propositions.splice(index + 1, 0, { id: Date.now(), text: second, level: this.propositions[index].level });
		} else {
			const mid = Math.floor(text.length / 2);
			this.propositions[index].text = text.substring(0, mid).trim();
			this.propositions.splice(index + 1, 0, { id: Date.now(), text: text.substring(mid).trim(), level: this.propositions[index].level });
		}

		this.shiftReferencesForInsertion(index + 1);

		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
	}

	moveProposition(i: number, delta: number): void {
		const j = i + delta;
		if (j < 0 || j >= this.propositions.length) return;
		this.saveToHistory();
		[this.propositions[i], this.propositions[j]] = [this.propositions[j], this.propositions[i]];
		this.brackets.forEach(b => {
			if (b.singleNode && b.nodes) {
				b.nodes = b.nodes.map(r => (r === i ? j : r === j ? i : r));
				b.start = Math.min(...b.nodes);
				b.end = Math.max(...b.nodes);
				if (b.attachToRow === i) b.attachToRow = j;
				else if (b.attachToRow === j) b.attachToRow = i;
				return;
			}
			if (b.start === i) b.start = j; else if (b.start === j) b.start = i;
			if (b.end === i) b.end = j; else if (b.end === j) b.end = i;
			if (b.attachToRow === i) b.attachToRow = j;
			else if (b.attachToRow === j) b.attachToRow = i;
		});
		if (this.sidebarSelected === i) this.sidebarSelected = j;
		else if (this.sidebarSelected === j) this.sidebarSelected = i;
		this.selectedIndices = this.selectedIndices.map(idx => (idx === i ? j : idx === j ? i : idx));
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
		this.confirmAction("Reset EVERYTHING (propositions + brackets)?", () => {
			this.saveToHistory();
			this.propositions = [];
			this.brackets = [];
			this.selectedIndices = [];
			this.selectedBracketId = null;
			this.selectedCorners = [];
			this.sidebarSelected = -1;
			const ta = this.byId<HTMLTextAreaElement>("paste-area");
			if (ta) ta.value = "";
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
		});
	}

	clearAll(): void {
		this.resetAll();
	}

	loadThessaloniansExample(): void {
		this.saveToHistory();
		this.propositions = EXAMPLE_PROPOSITIONS.map(p => ({ ...p }));
		this.brackets = [];
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
	}

	// ---------- export ----------

	async exportPNG(): Promise<void> {
		const container = this.byId("diagram-container");
		const scaler = this.byId("workspace-scaler");
		if (!container || !scaler) return;
		const svg = scaler.querySelector("svg");
		const savedZoom = this.zoomLevel;

		const savedOverflow = container.style.overflow;
		const savedWidth = container.style.width;
		const savedHeight = container.style.height;
		const savedSvgW = svg ? svg.getAttribute("width") : null;

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

		try {
			const canvas = await html2canvas(scaler, {
				backgroundColor: "#ffffff",
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
			});

			const dataUrl = canvas.toDataURL("image/png");
			const base64 = dataUrl.split(",")[1];
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

			const basename = this.file ? this.file.basename : "discourse-analysis";
			const dir = this.file && this.file.parent ? this.file.parent.path : "";
			const path = (dir ? dir + "/" : "") + basename + ".png";

			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modifyBinary(existing, bytes.buffer);
			} else {
				await this.app.vault.createBinary(path, bytes.buffer);
			}
			new Notice(`Exported ${path}`);
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
		}
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

		this.registerDomEvent(diagramContainer, "mousedown", (e: MouseEvent) => {
			let isPanning = true;
			const startX = e.clientX;
			const startY = e.clientY;
			const scrollLeft = diagramContainer.scrollLeft;
			const scrollTop = diagramContainer.scrollTop;

			const mouseMoveHandler = (ev: MouseEvent) => {
				if (!isPanning) return;
				const dx = ev.clientX - startX;
				const dy = ev.clientY - startY;
				diagramContainer.scrollLeft = scrollLeft - dx;
				diagramContainer.scrollTop = scrollTop - dy;
			};

			const mouseUpHandler = () => {
				isPanning = false;
				diagramContainer.removeEventListener("mousemove", mouseMoveHandler);
				diagramContainer.removeEventListener("mouseup", mouseUpHandler);
			};

			diagramContainer.addEventListener("mousemove", mouseMoveHandler);
			diagramContainer.addEventListener("mouseup", mouseUpHandler);
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
				const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
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
	showResources(): void {
		this.byId("resource-modal")?.classList.remove("hidden");
	}
	hideResources(): void {
		this.byId("resource-modal")?.classList.add("hidden");
	}

	// ---------- Sentence Flow: editing ----------

	private handleNotesKeydown(e: KeyboardEvent): void {
		const mod = e.ctrlKey || e.metaKey;

		if (e.key === "Tab") {
			// Default contenteditable behavior for Tab moves focus to the next
			// focusable element rather than inserting anything, so it has to be
			// taken over entirely.
			e.preventDefault();
			this.insertNotesTabAtCaret();
			this.scheduleNotesLayout(true);
			this.requestSave();
			return;
		}
		if (mod && (e.key === "m" || e.key === "M")) {
			e.preventDefault();
			this.indentNotesParagraph(e.shiftKey ? -1 : 1);
			return;
		}
		// Bold/Italic/Underline already work via the browser's default
		// Ctrl+B/I/U in a contenteditable; nothing extra needed here.
	}

	// Increases/decreases the indent of whichever paragraph the caret is in,
	// snapping to the next/previous multiple of the default tab width -
	// mirroring Word's Increase/Decrease Indent behavior.
	private indentNotesParagraph(direction: 1 | -1): void {
		const line = this.getCurrentLine();
		if (!line) return;
		const current = this.getLineMarginPx(line);
		const target = direction > 0
			? this.nextStop(current, this.notesDefaultTabWidth)
			: this.prevStop(current, this.notesDefaultTabWidth);
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
		const canvas = this.byId("notes-canvas");
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
		const canvas = this.byId("notes-canvas");
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
	// folds every run of loose top-level nodes into a real wrapper <div> -
	// moving (not cloning) the nodes, so an active caret/selection inside
	// them stays intact - before any caller looks at the line list.
	private normalizeNotesCanvas(canvas: HTMLElement): void {
		const children = Array.from(canvas.childNodes);
		let run: ChildNode[] = [];
		const flush = (beforeNode: ChildNode | null) => {
			if (run.length === 0) return;
			const wrapper = document.createElement("div");
			canvas.insertBefore(wrapper, beforeNode);
			run.forEach(n => wrapper.appendChild(n));
			run = [];
		};
		for (const node of children) {
			const isDiv = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "DIV";
			if (isDiv) flush(node);
			else run.push(node);
		}
		flush(null);
	}

	private getNotesLines(canvas: HTMLElement): HTMLElement[] {
		this.normalizeNotesCanvas(canvas);
		const divs = Array.from(canvas.children).filter(c => c.tagName === "DIV") as HTMLElement[];
		return divs.length > 0 ? divs : [canvas];
	}

	private getLineMarginPx(line: HTMLElement): number {
		if (line.id === "notes-canvas") return 0;
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
	layoutNotesTabs(): void {
		const canvas = this.byId("notes-canvas");
		if (!canvas) return;
		if (!this.measureCtx) this.measureCtx = document.createElement("canvas").getContext("2d");
		const ctx = this.measureCtx;
		if (!ctx) return;

		const defaultWidth = this.notesDefaultTabWidth;

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

	private scheduleNotesLayout(immediate = false): void {
		if (immediate) { this.layoutNotesTabs(); return; }
		if (this.notesLayoutScheduled) return;
		this.notesLayoutScheduled = true;
		window.requestAnimationFrame(() => {
			this.notesLayoutScheduled = false;
			this.layoutNotesTabs();
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

	private syncNotesToolbarUi(): void {
		const input = this.byId<HTMLInputElement>("notes-default-tab-width");
		if (input) input.value = (this.notesDefaultTabWidth / 96).toFixed(2);
	}

	private updateNotesFormatButtonStates(): void {
		this.qsa<HTMLButtonElement>("[data-fmt]").forEach(btn => {
			const active = document.queryCommandState(btn.dataset.fmt as string);
			btn.classList.toggle("da-sf-fmt-btn-active", active);
		});
	}

	// ---------- Sentence Flow: load / save ----------

	// (Re)builds the canvas DOM from notesLines using the same createEl-style
	// DOM helpers as the rest of the view (no innerHTML), then re-runs the
	// layout pass so tab markers land on the default-tab-width grid.
	renderNotesTab(): void {
		const canvas = this.byId("notes-canvas");
		if (!canvas) return;
		canvas.empty();

		// Deliberately doesn't fall back to a placeholder empty line when
		// notesLines is empty: leaving the canvas with zero children for a
		// brand-new file matches what a plain, never-typed-into contenteditable
		// looks like, and getNotesLines already treats "no line divs yet" as
		// one implicit line (the canvas itself) for layout/serialization.
		this.notesLines.forEach(line => {
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
		this.syncNotesToolbarUi();
		window.requestAnimationFrame(() => this.layoutNotesTabs());
	}

	// Walks the live canvas DOM (as left behind by typing, execCommand
	// formatting, Tab markers, and paste) back into the persisted NotesLine
	// model. Adjacent text runs sharing the same bold/italic/underline state
	// are coalesced into one segment.
	private serializeNotesLines(): NotesLine[] {
		const canvas = this.byId("notes-canvas");
		if (!canvas) return this.notesLines;

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
