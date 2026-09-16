import { App, Modal, Notice, Plugin, TFile, TFolder } from "obsidian";
import { DAView, VIEW_TYPE_DA } from "./DAView";

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

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
	async onload() {
		this.registerView(VIEW_TYPE_DA, (leaf) => new DAView(leaf));
		this.registerExtensions(["da"], VIEW_TYPE_DA);

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
