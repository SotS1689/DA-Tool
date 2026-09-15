import { Plugin, TFile, Notice } from "obsidian";
import { DAView, VIEW_TYPE_DA } from "./DAView";

export default class DAToolPlugin extends Plugin {
	async onload() {
		this.registerView(VIEW_TYPE_DA, (leaf) => new DAView(leaf));
		this.registerExtensions(["da"], VIEW_TYPE_DA);

		this.addRibbonIcon("brackets", "Create new Discourse Analysis", async () => {
			await this.createAndOpenNewFile();
		});

		this.addCommand({
			id: "create-new-da-file",
			name: "Create new Discourse Analysis",
			callback: async () => {
				await this.createAndOpenNewFile();
			},
		});
	}

	onunload() {
		// Obsidian automatically detaches views registered via registerView.
	}

	private async createAndOpenNewFile() {
		const defaultData = {
			propositions: [],
			brackets: [],
			zoomLevel: 1,
			isRTL: false,
			timestamp: new Date().toISOString(),
		};

		const folder = this.app.fileManager.getNewFileParent("");
		let basePath = `${folder.path ? folder.path + "/" : ""}Untitled`;
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
