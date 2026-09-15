# Testing & Rollout Guide — DA-Tool Obsidian Plugin

Use this to pick up work from any device. Just `git pull` this repo and follow along.

## 0. Current status (check this first)

All source files are now written:

- `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs` — done.
- `src/main.ts` — done (registers the `.da` file extension/view, adds a ribbon icon + command to create a new Discourse Analysis file).
- `src/DAView.ts` — done. Full ported engine: propositions, brackets, SVG rendering, column/spine layout, drag-and-drop reordering, zoom, RTL, undo history, label editor, the Logical Relationships and Resources reference modals, and PNG export (via the `html2canvas` npm package, saving into the vault next to the `.da` file instead of triggering a browser download).
- `styles.css` — done. Hand-authored CSS scoped under `.da-tool-view` (not a Tailwind port — see limitations below).

**Important: the build has NOT been run or verified yet.** This machine has no Node.js/npm installed, so `npm install && npm run build` could not be executed here to confirm the TypeScript actually compiles cleanly. The code was written carefully and reviewed by hand (including fixing one known type mismatch: `createCornerBox`'s parameter needed to be `SVGElement`, not `SVGGElement`, to match what `document.createElementNS` actually returns), but **you must run the build yourself as the first step on a machine with Node** — see Step 1. Don't skip straight to installing into a vault before it builds cleanly.

What was intentionally simplified relative to the original `index.html`:
- The "💾 Save Project" button (which used to download a whole new standalone HTML file with embedded JSON) is now a "💾 Save" button that just calls Obsidian's save — file persistence is automatic/implicit now that the `.da` file IS the storage.
- The "Free" badge and "☕ Support" (Buy Me a Coffee) button from the original web tool's header were dropped as not applicable to a personal plugin.
- Visual styling is a hand-written, reasonable-fidelity approximation of the original Tailwind-based look (see "Known limitations" below) — not a utility-class-by-utility-class port.

## 1. Build

```bash
cd obsidian-plugin
npm install
npm run build
```

This should produce `main.js` in `obsidian-plugin/`. Fix any TypeScript errors `npm run build` reports before moving on — don't skip errors by loosening `tsconfig.json`.

For live-reload while developing, use `npm run dev` instead (esbuild watch mode) and reload the plugin in Obsidian after each change (Ctrl/Cmd+R reloads the whole app, or disable/re-enable the plugin in Settings → Community plugins).

## 2. Install into a test vault

Obsidian loads unpackaged plugins straight from `<vault>/.obsidian/plugins/<plugin-id>/`. Use a **test vault**, not your real sermon-prep vault, for the first round of testing.

1. Create or pick a test vault, e.g. `C:\Users\11tdr\Documents\ObsidianTestVault`.
2. Make the plugin folder: `<vault>\.obsidian\plugins\da-tool\`
3. Copy these three files into it:
   - `obsidian-plugin/manifest.json`
   - `obsidian-plugin/main.js` (the build output)
   - `obsidian-plugin/styles.css`
4. In Obsidian: Settings → Community plugins → turn off Restricted mode if needed → Reload plugins (or restart Obsidian) → find "Discourse Analysis Tool" in the list → enable it.

Tip for iterating quickly without re-copying files every time: instead of copying, create a symlink from the vault's plugin folder to `obsidian-plugin/` in this repo, so `npm run dev` rebuilds land directly where Obsidian reads them.

- Windows (PowerShell, run as admin or with Developer Mode enabled):
  ```powershell
  New-Item -ItemType SymbolicLink -Path "C:\path\to\TestVault\.obsidian\plugins\da-tool" -Target "C:\Users\11tdr\Documents\GitHub\DA-Tool\obsidian-plugin"
  ```
- macOS/Linux:
  ```bash
  ln -s /path/to/repo/obsidian-plugin /path/to/TestVault/.obsidian/plugins/da-tool
  ```

## 3. Manual test checklist

Work through this in the test vault before trusting it with real sermon-prep files.

**Creating & opening**
- [ ] Ribbon icon (or command palette → "Create new Discourse Analysis") creates a new `.da` file and opens it in the editor pane.
- [ ] Closing and reopening that file (click it again in the file explorer) restores the exact same state.
- [ ] Opening two `.da` files in separate panes/tabs at once — verify actions in one pane don't leak into or corrupt the other (this was the main reason the original code's `document.getElementById` calls had to be scoped per-view — confirm that fix actually holds).

**Core editing**
- [ ] Paste a passage into "Propositions" → Insert Propositions → text splits into rows.
- [ ] Add Two-Node Bracket / Add Single-Node Bracket after selecting propositions.
- [ ] Right-click a bracket corner → edit label → saves correctly.
- [ ] Drag to reorder propositions in the sidebar.
- [ ] Tab / Shift+Tab indent/outdent a selected proposition.
- [ ] Delete key removes a selected bracket/proposition.
- [ ] Ctrl+Z undo works for at least a few steps.
- [ ] Zoom in/out/reset controls work; RTL (Hebrew Mode) toggle flips layout correctly.
- [ ] Resizing the left/right sidebars via the drag handles works.

**Persistence**
- [ ] Make edits, close Obsidian entirely (not just the pane), reopen — changes are still there.
- [ ] Check the raw `.da` file in a text editor — it should be readable JSON (`propositions`, `brackets`, `zoomLevel`, `isRTL`, `timestamp`). This also matters for git-based vault syncing/versioning if you use that.

**Export**
- [ ] Export PNG produces an image file saved into the vault next to the `.da` file, and it visually matches the diagram.

**Cross-device**
- [ ] Sync the test vault (however you normally sync — Obsidian Sync, Syncthing, git, iCloud, etc.) to a second device with the plugin installed the same way, confirm a `.da` file opens and edits round-trip correctly both directions.

## 4. Rolling out to your real vault

Only after the checklist above passes:

1. Copy `manifest.json`, `main.js`, `styles.css` into `<your real vault>\.obsidian\plugins\da-tool\` (same as step 2).
2. Enable it in Settings → Community plugins.
3. Since this plugin isn't on the official Community Plugins list, you'll do this manually on every device you use — repeat step 2 per device, or symlink there too if that device also has this repo cloned.
4. Optional: commit `manifest.json`/`main.js`/`styles.css` build output somewhere your other devices can pull from (e.g. this repo), so "rolling out to a new device" is just a `git pull` + copy/symlink instead of rebuilding from source each time.

## 5. Known limitations (by design, for this first pass)

- Visual styling is a reasonable-fidelity hand-ported approximation of the original Tailwind-based look, not a pixel-perfect reproduction.
- No submission to the official Obsidian Community Plugins directory is planned yet — this is a manually-installed local plugin only.
- No automated tests — verification is the manual checklist above.
- **The build has not actually been run anywhere yet** (see Step 0/1) — treat the first `npm run build` as part of testing, not a formality. If you hit TypeScript errors, they're most likely narrow type-mismatch issues (e.g. a DOM API returning a more generic type than expected) rather than logic bugs, since the porting was done as a careful line-by-line translation of the original `index.html` engine (state model, SVG bracket/column layout math, drag-and-drop, etc. were preserved as-is) rather than a rewrite.
