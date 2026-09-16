import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";
import { COLOR_TOKENS, DAToolSettings, DAView, VIEW_TYPE_DA } from "./DAView";
import { openColorPickerPopover } from "./ColorPicker";

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function defaultSettings(): DAToolSettings {
	return {
		useThemeColors: false,
		colorOverrides: {},
	};
}

// Resolves a token's current effective color (standard default, or the
// active Obsidian theme's mapped color when useThemeColors is on) as a hex
// string, by rendering it off-screen and letting the browser normalize
// whatever the CSS custom property resolves to (a literal hex, var(...), or
// a color-mix(...) expression) into an rgb() we can parse.
function resolveEffectiveColor(cssVar: string, useThemeColors: boolean): string {
	const probe = document.createElement("div");
	probe.className = "da-tool-view" + (useThemeColors ? " da-theme-adopt" : "");
	probe.style.position = "fixed";
	probe.style.top = "-9999px";
	probe.style.left = "-9999px";
	document.body.appendChild(probe);
	const raw = getComputedStyle(probe).getPropertyValue(cssVar).trim();
	document.body.removeChild(probe);
	return cssColorToHex(raw) || "#000000";
}

function cssColorToHex(cssColor: string): string {
	if (!cssColor) return "";
	const span = document.createElement("span");
	span.style.color = cssColor;
	document.body.appendChild(span);
	const rgb = getComputedStyle(span).color;
	document.body.removeChild(span);
	const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (!m) return "";
	const toHex = (n: string) => Number(n).toString(16).padStart(2, "0");
	return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

class NewDAFileModal extends Modal {
	private titleValue = "Untitled";
	private folderValue: string;
	private onSubmit: (title: string, folderPath: string) => void;

	constructor(app: App, defaultFolder: string, onSubmit: (title: string, folderPath: string) => void) {
		super(app);
		this.folderValue = defaultFolder;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "New Discourse Analysis" });

		contentEl.createEl("label", { text: "Title", attr: { style: "display:block; font-weight:600; margin-bottom:4px;" } });
		const titleInput = contentEl.createEl("input", {
			type: "text",
			value: this.titleValue,
			attr: { style: "width:100%; margin-bottom:16px;" },
		});
		titleInput.addEventListener("input", () => { this.titleValue = titleInput.value; });

		contentEl.createEl("label", { text: "Folder", attr: { style: "display:block; font-weight:600; margin-bottom:4px;" } });
		const folderSelect = contentEl.createEl("select", { attr: { style: "width:100%; margin-bottom:20px;" } });

		const folders: TFolder[] = [];
		const collect = (folder: TFolder) => {
			folders.push(folder);
			for (const child of folder.children) {
				if (child instanceof TFolder) collect(child);
			}
		};
		collect(this.app.vault.getRoot());

		folders
			.sort((a, b) => a.path.localeCompare(b.path))
			.forEach(folder => {
				const opt = folderSelect.createEl("option", {
					text: folder.path === "" ? "/ (vault root)" : folder.path,
					value: folder.path,
				});
				if (folder.path === this.folderValue) opt.selected = true;
			});
		folderSelect.addEventListener("change", () => { this.folderValue = folderSelect.value; });

		const buttonRow = contentEl.createDiv({ attr: { style: "display:flex; justify-content:flex-end; gap:8px;" } });

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const createBtn = buttonRow.createEl("button", { text: "Create", cls: "mod-cta" });
		const submit = () => {
			const cleanTitle = this.titleValue.replace(ILLEGAL_FILENAME_CHARS, "").trim() || "Untitled";
			this.close();
			this.onSubmit(cleanTitle, this.folderValue);
		};
		createBtn.addEventListener("click", submit);

		titleInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});

		window.setTimeout(() => {
			titleInput.focus();
			titleInput.select();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export default class DAToolPlugin extends Plugin {
	settings: DAToolSettings = defaultSettings();

	async onload() {
		const loaded = await this.loadData();
		this.settings = Object.assign(defaultSettings(), loaded, {
			colorOverrides: Object.assign({}, loaded?.colorOverrides),
		});

		this.registerView(VIEW_TYPE_DA, (leaf) => new DAView(leaf, this));
		this.registerExtensions(["da"], VIEW_TYPE_DA);
		this.addSettingTab(new DAToolSettingTab(this.app, this));

		this.addRibbonIcon("brackets", "Create new Discourse Analysis", async () => {
			this.openCreateFileModal();
		});

		this.addCommand({
			id: "create-new-da-file",
			name: "Create new Discourse Analysis",
			callback: () => {
				this.openCreateFileModal();
			},
		});
	}

	onunload() {
		// Obsidian automatically detaches views registered via registerView.
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// Re-applies theme mode + color overrides to every currently open DA view.
	// Called after any settings-tab change, so open files update live without
	// needing to be closed and reopened.
	refreshAllViews(): void {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_DA).forEach(leaf => {
			if (leaf.view instanceof DAView) leaf.view.refreshTheming();
		});
	}

	private openCreateFileModal() {
		const defaultFolder = this.app.fileManager.getNewFileParent("").path;
		new NewDAFileModal(this.app, defaultFolder, (title, folderPath) => {
			void this.createAndOpenNewFile(title, folderPath);
		}).open();
	}

	private async createAndOpenNewFile(title: string, folderPath: string) {
		const defaultData = {
			propositions: [],
			brackets: [],
			zoomLevel: 1,
			isRTL: false,
			timestamp: new Date().toISOString(),
		};

		if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
			try {
				await this.app.vault.createFolder(folderPath);
			} catch (err) {
				console.error("Failed to create destination folder:", err);
			}
		}

		const basePath = `${folderPath ? folderPath + "/" : ""}${title}`;
		let path = `${basePath}.da`;
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${basePath} ${i}.da`;
			i++;
		}

		try {
			const file: TFile = await this.app.vault.create(
				path,
				JSON.stringify(defaultData, null, 2)
			);
			await this.app.workspace.getLeaf(true).openFile(file);
		} catch (err) {
			console.error("Failed to create new Discourse Analysis file:", err);
			new Notice("Failed to create new Discourse Analysis file.");
		}
	}
}

class DAToolSettingTab extends PluginSettingTab {
	private plugin: DAToolPlugin;

	constructor(app: App, plugin: DAToolPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Adopt Obsidian theme colors")
			.setDesc("When on, the tool follows your current Obsidian theme instead of its own standard palette. Also toggleable per-file from the toolbar.")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.useThemeColors).onChange(async (value) => {
					this.plugin.settings.useThemeColors = value;
					await this.plugin.saveSettings();
					this.plugin.refreshAllViews();
					this.display();
				});
			});

		new Setting(containerEl).setName("Custom colors").setHeading();
		containerEl.createEl("p", {
			text: "Override any individual color. Colors left alone follow the standard/theme setting above; use the reset button to remove an override.",
			cls: "setting-item-description",
		});

		for (const token of COLOR_TOKENS) {
			const override = this.plugin.settings.colorOverrides[token.id];
			const effective = override || resolveEffectiveColor(token.cssVar, this.plugin.settings.useThemeColors);

			const setting = new Setting(containerEl)
				.setName(token.label);
			if (token.desc) setting.setDesc(token.desc);

			setting.addButton(button => {
				const swatchEl = button.buttonEl;
				swatchEl.addClass("da-color-swatch-btn");
				swatchEl.style.backgroundColor = effective;
				button.onClick(() => {
					openColorPickerPopover(swatchEl, effective, async (value) => {
						this.plugin.settings.colorOverrides[token.id] = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAllViews();
						this.display();
					});
				});
			});

			setting.addExtraButton(btn => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Reset to default")
					.setDisabled(!override)
					.onClick(async () => {
						delete this.plugin.settings.colorOverrides[token.id];
						await this.plugin.saveSettings();
						this.plugin.refreshAllViews();
						this.display();
					});
			});
		}
	}
}
