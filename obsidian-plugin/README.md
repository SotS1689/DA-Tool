# Discourse Analysis Tool

Create and edit visual discourse-analysis bracket diagrams for biblical texts, natively in your
vault. This plugin adds a new file type — `.da` — that Obsidian opens in a dedicated diagramming
view, so a passage's discourse structure lives alongside your other sermon-prep notes and syncs
with the rest of your vault.

## What it does

Discourse analysis (also called phrasing or bracketing) is a method of visually mapping how the
clauses/propositions of a biblical passage relate to one another — main lines, subordination,
logical relationships (ground, purpose, contrast, etc.) — using nested brackets. This plugin gives
you a canvas for building those diagrams:

- Paste in a passage and split it into individual propositions
- Select propositions and connect them with two-node or single-node brackets
- Label brackets with logical relationships (with a built-in reference for common relationship
  types)
- Indent/outdent, drag-and-drop reorder, and undo/redo your edits
- Zoom controls and a right-to-left mode for Hebrew text
- Export the diagram as a PNG saved directly into your vault
- Use the **Sentence Flow** tab for a Word-like text canvas to paste and format a passage's raw
  text (bold/italic/underline, Tab-aligned columns via a configurable default tab stop) outside
  the bracket diagram itself — including correct rendering of polytonic Greek accents

Everything is stored as plain JSON inside the `.da` file itself, so diagrams are portable,
diffable, and work with whatever sync method you already use for your vault (Obsidian Sync, git,
etc.).

## Example

A discourse analysis diagram for 1 Thessalonians 2:13, showing nested brackets with logical
relationship labels (G = ground, A = amplification, T = temporal, etc.):

![Discourse analysis diagram for 1 Thessalonians 2:13, showing propositions connected by nested labeled brackets](assets/screenshot-diagram.png)

## Usage

1. Click the bracket icon in the ribbon (or run **Create new Discourse Analysis** from the command
   palette) to create a new `.da` file and open it in the diagram view.
2. Paste your passage text into the Propositions panel and use **Insert Propositions** to split it
   into rows.
3. Select one or more propositions, then use **Add Two-Node Bracket** or **Add Single-Node
   Bracket** to connect them.
4. Right-click a bracket's corner to label it with a logical relationship.
5. Drag rows in the sidebar to reorder propositions, use Tab/Shift+Tab to indent/outdent, and
   Delete to remove a selected item.
6. Use the export button to save a PNG snapshot of the diagram next to your `.da` file.

The file saves automatically as part of Obsidian's normal save behavior — there's no separate
"save project" step.

## Known limitations

- Visual styling is a hand-ported, reasonable-fidelity approximation of the original web tool's
  look, not a pixel-perfect reproduction.
- No automated test suite; changes are verified through manual testing.

## Development

```bash
npm install
npm run dev    # esbuild watch mode
npm run build  # production build
```

See the source in [`src/`](src/) — `main.ts` registers the `.da` view and commands, `DAView.ts`
contains the diagramming engine.

## License

[MIT](LICENSE)
