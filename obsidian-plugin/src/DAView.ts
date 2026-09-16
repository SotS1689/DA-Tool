import { TextFileView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import html2canvas from "html2canvas";

export const VIEW_TYPE_DA = "da-tool-view";

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

// A bracket's parent ids, regardless of whether they were recorded in the
// older singular parentBracketId/parentBracketId2 fields (two-node brackets)
// or the parentBracketIds array (single-node brackets, which can have >2 parents).
function getParentIds(b: Bracket): number[] {
	if (b.parentBracketIds && b.parentBracketIds.length) return b.parentBracketIds;
	return [b.parentBracketId, b.parentBracketId2].filter(x => x !== undefined) as number[];
}

interface ProjectData {
	propositions: Proposition[];
	brackets: Bracket[];
	zoomLevel: number;
	isRTL: boolean;
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
	return { propositions: [], brackets: [], zoomLevel: 1, isRTL: false, timestamp: new Date().toISOString() };
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

	private loaded = false;
	private domBuilt = false;
	private resizeObserver: ResizeObserver | null = null;
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

	// ---------- TextFileView contract ----------

	getViewData(): string {
		const data: ProjectData = {
			propositions: this.propositions,
			brackets: this.brackets,
			zoomLevel: this.zoomLevel,
			isRTL: this.isRTL,
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
		}
	}

	clear(): void {
		const empty = emptyProjectData();
		this.propositions = empty.propositions;
		this.brackets = empty.brackets;
		this.zoomLevel = empty.zoomLevel;
		this.isRTL = empty.isRTL;
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
		}
	}

	// renderCanvas() measures proposition row positions from the live DOM to lay
	// out the bracket SVG. Right after the view attaches (or a file loads into
	// it), the leaf isn't always laid out/painted yet — Obsidian can finish
	// sizing/revealing the leaf's container after onOpen/setViewData return, on
	// a timeline a fixed number of animation frames can't reliably catch — so
	// those measurements come back as zero and the canvas renders empty until
	// something else (e.g. a click causing a reflow) forces a re-render. Watch
	// the container's real size instead of guessing a delay: this also keeps
	// the diagram correctly laid out across later resizes (split panes, sidebar
	// toggles, window resize).
	private watchContainerResize(): void {
		this.resizeObserver?.disconnect();
		const container = this.byId("diagram-container");
		if (!container) return;
		this.resizeObserver = new ResizeObserver(() => this.renderCanvas());
		this.resizeObserver.observe(container);
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.domBuilt = false;
		this.contentEl.empty();
	}

	// ---------- DOM construction ----------

	private buildDom(): void {
		this.contentEl.empty();
		this.contentEl.addClass("da-tool-view");
		this.domBuilt = true;

		this.contentEl.innerHTML = `
<div class="da-header">
	<div class="da-header-left">
		<div class="da-logo">∴</div>
		<h1 class="da-title">Discourse Analysis</h1>
	</div>
	<div class="da-header-right">
		<button data-action="force-save" class="da-btn da-btn-primary">💾 Save</button>
		<button data-action="show-lr" class="da-btn">🔗 Logical Relations</button>
		<button data-action="show-resources" class="da-btn">📖 Resources</button>
		<button data-action="export-png" class="da-btn">📷 Export PNG</button>
		<span class="da-label">Theme Colors</span>
		<button id="theme-toggle" class="da-switch" role="switch" aria-checked="false">
			<span id="theme-thumb" class="da-switch-thumb"></span>
		</button>
		<span class="da-label">Hebrew Mode</span>
		<button id="rtl-toggle" class="da-switch" role="switch" aria-checked="false">
			<span id="rtl-thumb" class="da-switch-thumb"></span>
		</button>
		<button data-action="open-external" data-url="https://buymeacoffee.com/reformedretrieval" class="da-btn da-btn-support">☕ Support</button>
	</div>
</div>
<div class="da-body">
	<div id="left-sidebar" class="da-sidebar da-sidebar-left" style="width:288px;min-width:180px;max-width:600px;">
		<div class="da-sidebar-header">
			<h2 class="da-section-title">Propositions</h2>
			<textarea id="paste-area" rows="3" class="da-textarea" placeholder="Paste full passage here…"></textarea>
			<div class="da-row-gap">
				<button data-action="insert-props" class="da-btn da-btn-primary da-flex1">Insert Propositions</button>
				<button data-action="add-prop" class="da-btn-square">+</button>
			</div>
		</div>
		<div id="sidebar-prop-list" class="da-prop-list"></div>
		<div class="da-sidebar-footer">
			<div>Drag ⋮⋮ to reorder • Double-click in main area to split</div>
			<button data-action="clear-all" class="da-link-danger">Clear All</button>
		</div>
	</div>
	<div id="left-resizer" class="da-resizer"></div>
	<div class="da-workspace" id="workspace">
		<div id="diagram-container" class="da-diagram-container">
			<div class="da-overlay" data-action="deselect"></div>
			<div id="workspace-scaler" class="da-workspace-scaler">
				<svg id="bracket-svg" class="da-bracket-svg" width="365" height="1200"></svg>
				<div id="proposition-rows" class="da-proposition-rows"></div>
			</div>
		</div>
	</div>
	<div id="right-resizer" class="da-resizer"></div>
	<div id="right-sidebar" class="da-sidebar da-sidebar-right" style="width:288px;min-width:180px;max-width:600px;">
		<h2 class="da-section-title">Tools</h2>
		<button data-action="add-blank-bracket" class="da-btn da-btn-primary da-btn-block">
			<svg class="da-btn-icon" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<rect x="2" y="2" width="6" height="6" rx="1.5" />
				<rect x="2" y="14" width="6" height="6" rx="1.5" />
				<line x1="8" y1="5" x2="16" y2="5" />
				<line x1="8" y1="17" x2="16" y2="17" />
				<line x1="16" y1="5" x2="16" y2="17" />
				<line x1="16" y1="5" x2="19" y2="5" />
				<line x1="16" y1="17" x2="19" y2="17" />
			</svg>
			ADD TWO-NODE BRACKET
		</button>
		<button data-action="add-single-node-bracket" class="da-btn da-btn-primary da-btn-block">
			<svg class="da-btn-icon" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<rect x="2" y="8" width="6" height="6" rx="1.5" />
				<line x1="8" y1="11" x2="16" y2="11" />
				<line x1="16" y1="8" x2="16" y2="14" />
				<line x1="16" y1="8" x2="19" y2="8" />
				<line x1="16" y1="14" x2="19" y2="14" />
			</svg>
			ADD SINGLE-NODE BRACKET
		</button>
		<div class="da-zoom-row">
			<span class="da-label">Zoom</span>
			<button data-action="zoom-out" class="da-btn da-flex1">−</button>
			<span id="zoom-label" class="da-zoom-label">100%</span>
			<button data-action="zoom-in" class="da-btn da-flex1">+</button>
			<button data-action="zoom-reset" class="da-btn">↺</button>
		</div>
		<div class="da-instructions">
			<strong>Two-node bracket:</strong> Select 2 propositions/boxes → ADD TWO-NODE BRACKET<br><br>
			<strong>Single-node bracket:</strong> Select 2+ propositions/boxes → ADD SINGLE-NODE BRACKET<br><br>
			<strong>Operations:</strong><br>
			Right-click box = edit label<br>
			Select spine + Delete = remove bracket<br>
			Tab = indent selected proposition<br>
			Shift+Tab = decrease indent on selected proposition<br>
			Click whitespace (anywhere in work area) = deselect<br>
			Click + drag = pan workspace
		</div>
		<div class="da-row-gap">
			<button data-action="clear-brackets" class="da-btn da-flex1 da-btn-block da-btn-warn">Clear All Brackets</button>
			<button data-action="reset-all" class="da-btn da-flex1 da-btn-block da-btn-danger">Reset Everything</button>
		</div>
	</div>
</div>
<div id="label-editor" class="da-label-editor" style="display:none;">
	<div class="da-label-editor-title">EDIT LABEL</div>
	<input id="lei" type="text" class="da-label-editor-input">
	<div class="da-label-editor-actions">
		<button id="le-cancel" class="da-btn">Cancel</button>
		<button id="le-ok" class="da-btn da-btn-primary">OK</button>
	</div>
</div>
<div id="lr-modal" class="da-modal-backdrop hidden">
	<div class="da-modal">
		<div class="da-modal-header">
			<h2 class="da-modal-title">The 18 Logical Relationships</h2>
			<button data-action="hide-lr" class="da-modal-close">×</button>
		</div>
		<div class="da-modal-body">
			<div class="da-relationship-grid">
				${RELATIONSHIP_GROUPS.map(g => `
				<div>
					<div class="da-relationship-group-title" style="background:${g.color};">${g.title}</div>
					<div class="da-relationship-group-body">
						${g.items.map(it => `
						<div class="da-relationship-item">
							<p><span class="da-relationship-term">${it.term} <span style="color:${g.color};">(${it.abbr})</span>:</span> ${it.def}</p>
							<p class="da-relationship-conj"><span>Conjunctions:</span> ${it.conj}</p>
							<p class="da-relationship-example">${it.example}</p>
						</div>`).join("")}
					</div>
				</div>`).join("")}
			</div>
		</div>
	</div>
</div>
<div id="resource-modal" class="da-modal-backdrop hidden">
	<div class="da-modal">
		<div class="da-modal-header">
			<h2 class="da-modal-title">Discourse Analysis Resources</h2>
			<button data-action="hide-resources" class="da-modal-close">×</button>
		</div>
		<div class="da-modal-body">
			<div class="da-video-wrap">
				<iframe width="560" height="315" src="https://www.youtube.com/embed/videoseries?si=r6RdCwzI3MgUnvlX&amp;list=PLMcXGoRTAIpZApAOJBP-M0BeMdDU_02Rk" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
			</div>
			<div class="da-video-wrap">
				<iframe width="100%" height="100%" src="https://www.youtube.com/embed/videoseries?si=0xciDPsqyCsKt1GZ&amp;list=PLNbOazQtvR8fzM2-UhQRJicFMuf1VSoJO" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
			</div>
			${RESOURCE_LINKS.map(l => `<div class="da-resource-link-wrap"><button class="da-btn da-btn-accent" data-url="${l.url}" data-action="open-external">${l.label}</button></div>`).join("")}
		</div>
	</div>
</div>`;
	}

	// ---------- static event wiring (buttons that always exist) ----------

	private wireStaticEvents(): void {
		const on = (action: string, handler: (e: Event) => void) => {
			this.qsa(`[data-action="${action}"]`).forEach(el => this.registerDomEvent(el as HTMLElement, "click", handler));
		};

		on("force-save", () => { this.requestSave(); new Notice("Saved."); });
		on("show-lr", () => this.showLogicalRelationships());
		on("hide-lr", () => this.hideLogicalRelationships());
		on("show-resources", () => this.showResources());
		on("hide-resources", () => this.hideResources());
		on("export-png", () => this.exportPNG());
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
				if (confirm("Delete this bracket?")) {
					this.saveToHistory();
					const removedId = this.selectedBracketId;
					this.brackets = this.brackets.filter(b => b.id !== removedId);
					this.deparentReferencesTo([removedId as number]);
					this.selectedBracketId = null;
					this.selectedCorners = [];
					this.renderCanvas();
				}
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
					scaler.style.transform = `translateX(${tx}px) scale(${this.zoomLevel})`;
				} else {
					scaler.style.transform = `scale(${this.zoomLevel})`;
				}
			} else {
				scaler.style.transform = `scale(${this.zoomLevel})`;
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
		this.requestSave();
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
		this.requestSave();
	}

	undoLastAction(): void {
		if (this.historyStack.length === 0) return;
		const prev = JSON.parse(this.historyStack.pop() as string);
		this.propositions = prev.propositions || [];
		this.brackets = prev.brackets || [];
		this.selectedIndices = prev.selectedIndices || [];
		this.selectedBracketId = prev.selectedBracketId;
		this.selectedCorners = prev.selectedCorners || (prev.selectedCorner ? [prev.selectedCorner] : []);
		this.renderSidebarList();
		this.renderMainRows();
		this.renderCanvas();
		this.requestSave();
	}

	migrateSingleNodeBrackets(): void {
		this.brackets.forEach(b => {
			if (!b.singleNode) return;
			if (!b.nodes) {
				b.nodes = [b.start, b.end];
			}
			if (!b.parentBracketIds) {
				const ids = [b.parentBracketId, b.parentBracketId2].filter(x => x !== undefined) as number[];
				b.parentBracketIds = ids;
			}
		});
	}

	// ---------- sidebar list ----------

	renderSidebarList(): void {
		const container = this.byId("sidebar-prop-list");
		if (!container) return;
		container.innerHTML = this.propositions.length ? "" : `<div class="da-empty-hint">No propositions yet.<br>Paste and split above.</div>`;

		this.propositions.forEach((prop, i) => {
			const row = document.createElement("div");
			row.className = `da-prop-row${i === this.sidebarSelected ? " da-prop-row-selected" : ""}`;
			row.dataset.index = String(i);
			row.addEventListener("click", e => {
				e.stopImmediatePropagation();
				this.sidebarSelected = i;
				this.renderSidebarList();
				this.selectedIndices = [i];
				this.renderMainRows();
				this.renderCanvas();
			});

			const dragHandle = document.createElement("div");
			dragHandle.className = "da-drag-handle";
			dragHandle.textContent = "⋮⋮";
			dragHandle.title = "Drag to reorder";
			dragHandle.addEventListener("mousedown", e => e.stopPropagation());

			row.draggable = false;
			dragHandle.addEventListener("mousedown", () => { row.draggable = true; });
			row.addEventListener("dragend", () => { row.draggable = false; });

			row.addEventListener("dragstart", e => {
				this.dragSrcIndex = i;
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", String(i));
				}
				setTimeout(() => { row.style.opacity = "0.4"; }, 0);
			});

			row.addEventListener("dragend", () => {
				row.style.opacity = "";
				row.draggable = false;
				this.qsa("#sidebar-prop-list .da-prop-row").forEach(r => {
					(r as HTMLElement).style.borderTop = "";
					(r as HTMLElement).style.borderBottom = "";
				});
			});

			row.addEventListener("dragover", e => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				const rect = row.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;
				this.qsa("#sidebar-prop-list .da-prop-row").forEach(r => {
					(r as HTMLElement).style.borderTop = "";
					(r as HTMLElement).style.borderBottom = "";
				});
				if (e.clientY < midY) row.style.borderTop = "2px solid var(--da-accent)";
				else row.style.borderBottom = "2px solid var(--da-accent)";
			});

			row.addEventListener("dragleave", () => {
				row.style.borderTop = "";
				row.style.borderBottom = "";
			});

			row.addEventListener("drop", e => {
				e.preventDefault();
				e.stopImmediatePropagation();
				row.style.borderTop = "";
				row.style.borderBottom = "";
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
					b.start = this.remapIndex(b.start, this.dragSrcIndex as number, insertIndex);
					b.end = this.remapIndex(b.end, this.dragSrcIndex as number, insertIndex);
					if (b.attachToRow !== undefined) {
						b.attachToRow = this.remapIndex(b.attachToRow, this.dragSrcIndex as number, insertIndex);
					}
				});

				if (this.sidebarSelected === this.dragSrcIndex) this.sidebarSelected = insertIndex;
				this.selectedIndices = this.selectedIndices.map(idx => this.remapIndex(idx, this.dragSrcIndex as number, insertIndex));

				this.dragSrcIndex = null;
				this.renderSidebarList();
				this.renderMainRows();
				this.renderCanvas();
			});

			const numBadge = document.createElement("div");
			numBadge.className = "da-num-badge";
			numBadge.textContent = String(i + 1);

			const textEl = document.createElement("div");
			textEl.contentEditable = "true";
			textEl.spellcheck = false;
			textEl.dir = this.isRTL ? "rtl" : "ltr";
			textEl.className = "da-prop-text";
			textEl.textContent = prop.text;
			textEl.addEventListener("click", e => e.stopImmediatePropagation());
			textEl.addEventListener("focus", () => { this.sidebarSelected = i; this.selectedIndices = [i]; });
			textEl.addEventListener("blur", () => this.updatePropositionText(i, textEl.innerText));

			const delBtn = document.createElement("button");
			delBtn.className = "da-del-btn";
			delBtn.textContent = "✕";
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

	// ---------- main rows ----------

	renderMainRows(): void {
		const container = this.byId("proposition-rows");
		if (!container) return;
		container.innerHTML = "";
		if (this.propositions.length === 0) {
			container.innerHTML = `<div class="da-empty-hint da-empty-hint-main">Propositions appear here<br>Double-click any row to split at exact click location</div>`;
			return;
		}

		this.propositions.forEach((prop, i) => {
			const isSelected = this.selectedIndices.includes(i);
			const row = document.createElement("div");
			row.className = `da-proposition-box${isSelected ? " selected" : ""}`;
			row.style.marginInlineStart = `${prop.level * 48}px`;
			row.addEventListener("click", e => { e.stopImmediatePropagation(); this.handleMainRowClick(i); });
			row.addEventListener("dblclick", e => { e.stopImmediatePropagation(); this.splitProposition(i, e as MouseEvent); });

			const numEl = document.createElement("div");
			numEl.className = "da-row-num";
			numEl.textContent = String(i + 1);

			const textEl = document.createElement("div");
			textEl.contentEditable = "true";
			textEl.spellcheck = false;
			textEl.dir = this.isRTL ? "rtl" : "ltr";
			textEl.className = "da-row-text";
			textEl.textContent = prop.text;
			textEl.addEventListener("blur", () => this.updatePropositionText(i, textEl.innerText));

			const delBtn = document.createElement("button");
			delBtn.className = "da-row-del";
			delBtn.textContent = "×";
			delBtn.addEventListener("click", e => { e.stopImmediatePropagation(); this.deleteProposition(i); });

			row.appendChild(numEl);
			row.appendChild(textEl);
			row.appendChild(delBtn);
			container.appendChild(row);
		});
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
		svg.innerHTML = "";

		svg.style.left = this.isRTL ? "auto" : "0";
		svg.style.right = this.isRTL ? "0" : "auto";
		propRows.style.direction = this.isRTL ? "rtl" : "ltr";

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
		svg.style.width = `${svgWidth}px`;

		propRows.style.paddingLeft = isRTL ? "20px" : `${bracketPadding}px`;
		propRows.style.paddingRight = isRTL ? `${bracketPadding}px` : "20px";

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
				if (pi !== undefined && bracketLeftX[pi] !== null) parentXs.push(bracketLeftX[pi] as number);
			}

			if (parentXs.length === 0) {
				brackets.forEach((other, j) => {
					if (j === i || bracketLeftX[j] === null) return;
					const strictlyContains = b.start <= other.start && b.end >= other.end && (b.start < other.start || b.end > other.end);
					if (strictlyContains) parentXs.push(bracketLeftX[j] as number);
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
				if (parentOwns) return bracketLeftX[pi] as number;
			}

			for (let j = 0; j < brackets.length; j++) {
				if (j === bracketIdx) continue;
				const child = brackets[j];
				if (!getParentIds(child).includes(b.id)) continue;
				if (isRTL ? ((bracketLeftX[j] as number) >= (bracketLeftX[bracketIdx] as number)) : ((bracketLeftX[j] as number) <= (bracketLeftX[bracketIdx] as number))) continue;
				const childTopRow = child.attachToRow !== undefined ? child.attachToRow : child.start;
				if (childTopRow === endRow) return bracketLeftX[j] as number;
				if (!child.singleNode && child.end === endRow) return bracketLeftX[j] as number;
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
				if (parentOwns) return bracketLeftX[pi] as number;
			}

			for (let j = 0; j < brackets.length; j++) {
				if (j === bracketIdx) continue;
				const child = brackets[j];
				if (!getParentIds(child).includes(b.id)) continue;
				if (isRTL ? ((bracketLeftX[j] as number) >= (bracketLeftX[bracketIdx] as number)) : ((bracketLeftX[j] as number) <= (bracketLeftX[bracketIdx] as number))) continue;
				const childTopRow = child.attachToRow !== undefined ? child.attachToRow : child.start;
				if (childTopRow === row) return bracketLeftX[j] as number;
				if (!child.singleNode && child.end === row) return bracketLeftX[j] as number;
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

			const leftX = bracketLeftX[i] as number;
			const y1 = nodeY[i].top;
			const y2 = nodeY[i].bot;

			const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

			if (b.singleNode) {
				const yCenter = nodeY[i].center;

				const spineHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				spineHit.setAttribute("x", String(leftX - 12));
				spineHit.setAttribute("y", String(Math.min(y1, y2) - 2));
				spineHit.setAttribute("width", "24");
				spineHit.setAttribute("height", String(Math.max(Math.abs(y2 - y1), 4) + 4));
				spineHit.setAttribute("fill", "transparent");
				spineHit.setAttribute("pointer-events", "all");
				spineHit.addEventListener("click", e => { e.stopImmediatePropagation(); this.selectedBracketId = b.id; this.selectedCorners = []; this.renderCanvas(); });
				group.appendChild(spineHit);

				const vertical = document.createElementNS("http://www.w3.org/2000/svg", "line");
				vertical.setAttribute("x1", String(leftX)); vertical.setAttribute("y1", String(y1));
				vertical.setAttribute("x2", String(leftX)); vertical.setAttribute("y2", String(y2));
				vertical.setAttribute("stroke", "var(--da-muted)"); vertical.setAttribute("stroke-width", "2.5");
				group.appendChild(vertical);

				const nodeRows = (b.nodes && b.nodes.length >= 2) ? b.nodes : [b.start, b.end];
				nodeRows.forEach(row => {
					const armY = this.getInterpolatedRowY(rowYs, row);
					const aRightX = armEndXForRow(i, row);
					const arm = document.createElementNS("http://www.w3.org/2000/svg", "line");
					arm.setAttribute("x1", String(leftX)); arm.setAttribute("y1", String(armY));
					arm.setAttribute("x2", String(aRightX)); arm.setAttribute("y2", String(armY));
					arm.setAttribute("stroke", "var(--da-muted)"); arm.setAttribute("stroke-width", "2.5");
					group.appendChild(arm);
				});

				this.createCornerBox(group, b.centerLabel || "", leftX, yCenter, true, b.id);

				if (this.selectedBracketId === b.id || this.selectedCorners.some(c => c.bracketId === b.id)) {
					const highlight = document.createElementNS("http://www.w3.org/2000/svg", "line");
					highlight.setAttribute("x1", String(leftX)); highlight.setAttribute("y1", String(y1));
					highlight.setAttribute("x2", String(leftX)); highlight.setAttribute("y2", String(y2));
					highlight.setAttribute("stroke", "var(--da-accent)"); highlight.setAttribute("stroke-width", "4");
					group.appendChild(highlight);
				}
			} else {
				const aRight1 = armEndX(i, true);
				const aRight2 = armEndX(i, false);

				const spineHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				spineHit.setAttribute("x", String(leftX - 12));
				spineHit.setAttribute("y", String(Math.min(y1, y2)));
				spineHit.setAttribute("width", "24");
				spineHit.setAttribute("height", String(Math.abs(y2 - y1)));
				spineHit.setAttribute("fill", "transparent");
				spineHit.setAttribute("pointer-events", "all");
				spineHit.addEventListener("click", e => { e.stopImmediatePropagation(); this.selectedBracketId = b.id; this.selectedCorners = []; this.renderCanvas(); });
				group.appendChild(spineHit);

				const vertical = document.createElementNS("http://www.w3.org/2000/svg", "line");
				vertical.setAttribute("x1", String(leftX)); vertical.setAttribute("y1", String(y1));
				vertical.setAttribute("x2", String(leftX)); vertical.setAttribute("y2", String(y2));
				vertical.setAttribute("stroke", "var(--da-muted)"); vertical.setAttribute("stroke-width", "2.5");
				group.appendChild(vertical);

				const topArm = document.createElementNS("http://www.w3.org/2000/svg", "line");
				topArm.setAttribute("x1", String(leftX)); topArm.setAttribute("y1", String(y1));
				topArm.setAttribute("x2", String(aRight1)); topArm.setAttribute("y2", String(y1));
				topArm.setAttribute("stroke", "var(--da-muted)"); topArm.setAttribute("stroke-width", "2.5");
				group.appendChild(topArm);

				const bottomArm = document.createElementNS("http://www.w3.org/2000/svg", "line");
				bottomArm.setAttribute("x1", String(leftX)); bottomArm.setAttribute("y1", String(y2));
				bottomArm.setAttribute("x2", String(aRight2)); bottomArm.setAttribute("y2", String(y2));
				bottomArm.setAttribute("stroke", "var(--da-muted)"); bottomArm.setAttribute("stroke-width", "2.5");
				group.appendChild(bottomArm);

				this.createCornerBox(group, b.topLabel || "", leftX, y1, true, b.id);
				this.createCornerBox(group, b.bottomLabel || "", leftX, y2, false, b.id);

				if (this.selectedBracketId === b.id || this.selectedCorners.some(c => c.bracketId === b.id)) {
					const highlight = document.createElementNS("http://www.w3.org/2000/svg", "line");
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

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
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
			this.showLabelEditor((e as MouseEvent).clientX, (e as MouseEvent).clientY, text, bracketId, isTop);
		});
		group.appendChild(rect);

		if (text) {
			const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
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

		const connector = document.createElementNS("http://www.w3.org/2000/svg", "line");
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
		panel.style.display = "block";

		let lx = clientX + 10, ly = clientY + 10;
		panel.style.left = lx + "px";
		panel.style.top = ly + "px";
		requestAnimationFrame(() => {
			const r = panel.getBoundingClientRect();
			if (r.right > window.innerWidth) panel.style.left = (clientX - r.width - 10) + "px";
			if (r.bottom > window.innerHeight) panel.style.top = (clientY - r.height - 10) + "px";
		});
		input.focus();
		input.select();

		const oldOk = this.byId("le-ok") as HTMLButtonElement;
		const oldCan = this.byId("le-cancel") as HTMLButtonElement;
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
			panel.style.display = "none";
			input.removeEventListener("keydown", onKey);
			this.renderCanvas();
		};

		const cancelLabel = () => {
			panel.style.display = "none";
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
			alert("Select two propositions, OR select a corner box and one proposition, OR select two corner boxes, then click ADD BLANK BRACKET.");
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
			alert("For a single-node bracket: select two or more propositions and/or corner boxes.");
			return;
		}

		const cornerBracketIds = this.selectedCorners.map(c => c.bracketId);
		if (new Set(cornerBracketIds).size < cornerBracketIds.length) {
			alert("Cannot connect two corners from the same bracket.");
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
		this.renderMainRows();
	}

	deselectAll(): void {
		this.selectedIndices = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.renderMainRows();
		this.renderCanvas();
	}

	// ---------- proposition CRUD ----------

	splitIntoPropositions(): void {
		const ta = this.byId<HTMLTextAreaElement>("paste-area");
		if (!ta) return;
		const text = ta.value.trim();
		if (!text) return;
		this.saveToHistory();
		const parts = text.split(/(?<=[.?!;])\s+|\n+/g).map(p => p.trim()).filter(p => p.length > 0);
		this.propositions = parts.map((p, i) => ({ id: Date.now() + i, text: p, level: 0 }));
		this.brackets = [];
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
			this.propositions.splice(this.sidebarSelected + 1, 0, newProp);
			this.sidebarSelected++;
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
			this.renderSidebarList();
			this.renderMainRows();
			this.renderCanvas();
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
		if (!confirm("Delete this proposition?")) return;
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
			.filter(b => (b.singleNode ? (b.nodes as number[]).length < 2 : (b.start === i || b.end === i)))
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
	}

	splitProposition(index: number, event?: MouseEvent): void {
		this.saveToHistory();
		const text = this.propositions[index].text;
		let splitPos = Math.floor(text.length / 2);
		if (event && (document as any).caretRangeFromPoint) {
			const range = (document as any).caretRangeFromPoint(event.clientX, event.clientY);
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
		if (!confirm("Clear ALL brackets (propositions stay)?")) return;
		this.saveToHistory();
		this.brackets = [];
		this.selectedBracketId = null;
		this.selectedCorners = [];
		this.renderCanvas();
	}

	resetAll(): void {
		if (!confirm("Reset EVERYTHING (propositions + brackets)?")) return;
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
		const svg = scaler.querySelector("svg") as SVGSVGElement | null;
		const savedZoom = this.zoomLevel;

		const savedOverflow = container.style.overflow;
		const savedWidth = container.style.width;
		const savedHeight = container.style.height;
		const savedSvgW = svg ? svg.getAttribute("width") : null;

		scaler.style.transform = "scale(1)";
		scaler.style.transition = "none";

		await new Promise(r => requestAnimationFrame(r));
		await new Promise(r => requestAnimationFrame(r));

		const padding = 50;
		container.style.overflow = "visible";
		container.style.width = "max-content";
		container.style.height = "max-content";

		const contentW = scaler.scrollWidth;
		const contentH = scaler.scrollHeight;
		const fullW = contentW + padding * 2;
		const fullH = contentH + padding * 2;

		if (svg) {
			svg.setAttribute("width", String(contentW));
			svg.style.width = contentW + "px";
		}

		container.style.width = fullW + "px";
		container.style.height = fullH + "px";

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
			} as any);

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
				await this.app.vault.modifyBinary(existing, bytes.buffer as ArrayBuffer);
			} else {
				await this.app.vault.createBinary(path, bytes.buffer as ArrayBuffer);
			}
			new Notice(`Exported ${path}`);
		} catch (err) {
			console.error("DA-Tool: PNG export failed:", err);
			new Notice("PNG export failed — see console for details.");
		} finally {
			container.style.overflow = savedOverflow;
			container.style.width = savedWidth;
			container.style.height = savedHeight;
			if (svg) {
				if (savedSvgW !== null) svg.setAttribute("width", savedSvgW);
				svg.style.width = "";
			}
			scaler.style.transition = "";
			scaler.style.transform = `scale(${savedZoom})`;
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
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";

			const onMouseMove = (ev: MouseEvent) => {
				const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
				const newWidth = Math.min(
					parseInt(sidebar.style.maxWidth, 10),
					Math.max(parseInt(sidebar.style.minWidth, 10), startWidth + delta)
				);
				sidebar.style.width = newWidth + "px";
			};

			const onMouseUp = () => {
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
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
}
