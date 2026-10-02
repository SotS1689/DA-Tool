# Style Sheet: In-App Instructions

How to write or edit the Text Flow, Sentence Flow, and Bracketing Instructions.

| File | What's in it |
|---|---|
| `src/textFlowInstructions.ts` | Text Flow Instructions (Blake Franze) |
| `src/sentenceFlowInstructions.ts` | Sentence Flow Instructions (Fuller / Beale) |
| `src/bracketingInstructions.ts` | Bracketing Instructions (Fuller / Beale) |

Each file is a list of **blocks**, one per line, written between `[` and `];`.
Every block is wrapped in `{ … },`; keep the comma at the end.

---

## 1. Block types

### Heading
```ts
{ h: "Fine Points" },
```

### Paragraph
```ts
{ p: "Plain paragraph." },
{ indent: true, p: "Paragraph whose first line is indented, like an essay paragraph." },
{ level: 1, p: "Paragraph sitting under a level-1 list item." },
```

### List item
```ts
{ marker: "1.", level: 0, li: "Top-level item." },
{ marker: "a.", level: 1, li: "Second level." },
{ marker: "i.", level: 2, li: "Third level." },
{ marker: "-",  level: 2, li: "Dash item at the third level." },
```
- `marker` is typed exactly as it should appear: `1.`, `a)`, `(1)`, `iv.`, `-`.
- `level` sets the indentation: 0 = flush left, and each step adds one indent (1.75 em).
- The marker hangs and wrapped lines align with the text, so you never add spaces yourself.

### Text Flow example (indented by tabs)
```ts
{ level: 1, flow: [
	"καὶ ἰδοὺ ἔκραξαν",
	"\tλέγοντες·",
	"\t\tΤί ἡμῖν καὶ σοί, υἱὲ τοῦ θεοῦ;",
	"",
	"ἑαυτοὺς πλανῶμεν (1 John 1:8)",
] },
```
- Each string is one line. Each `\t` at the start indents the line one tab step.
- `""` is a blank line.
- Wrapped lines stay aligned with their own first line.

### Sentence Flow diagram (placed by position)
```ts
{ sf: [
	[{ x: 0, t: "ὁ Ἰησοῦς" }, { x: 7.3, t: "~~εὑρίσκει~~" }, { x: 13.5, t: "αὐτόν" }],
	[{ x: 9, t: "μετὰ ταῦτα", from: 8 }],
	[{ x: 9, t: "ἐν τῷ ἱερῷ", from: 8 }],
	[],
] },
```
- Each `[ … ]` is one row. Each `{ x, t }` puts text `t` at `x` em from the left edge, so a word can sit under any other word.
- `from: 8` draws a dashed connector from a stem at 8 em down to this text. Consecutive rows that use the same `from` join into one continuous line, like the source's ├ and └.
- `[]` is a blank row.
- Add `compact: true` (`{ compact: true, sf: [ … ] }`) for single-spaced rows in long flows without connectors.
- To join a compound subject or object, use a right-hand brace:
  ```ts
  [{ x: 0.6, t: "οἱ ἀρχιερεῖς" },  { x: 8.6, w: 1.4, brace: "top" }],
  [{ x: 0,   t: "καί" },           { x: 8.6, w: 1.5, brace: "mid" }, { x: 10.4, t: "ἐπέστησαν" }],
  [{ x: 0.6, t: "οἱ γραμματεῖς" }, { x: 8.6, w: 1.2, brace: "bot" }],
  ```
  `x` is where the brace's vertical line sits, and `w` is how long its arm is.
- To measure positions from a PDF page: x ≈ (distance from the left margin in points) ÷ 10.

### Bracket symbols
```ts
{ level: 2, sym: [
	{ marker: "a.", term: "Way-End", top: "W", bot: "Ed", note: "W → Ed*" },
	{ marker: "b.", term: "Comparison", mid: "//", note: "// → *" },
] },
```
- `top`, `mid`, and `bot` are the labels at the bracket's top arm, middle, and bottom arm. Use `mid` alone for a single label.
- `note` is the grey summary notation shown to the right.

---

## 2. Inline formatting (inside any text)

| Type | Result |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `***bold italic***` | ***bold italic*** |
| `__underline__` | underlined |
| `~~governor~~` | dashed underline (sentence-flow governors) |
| `^5^` | superscript (verse numbers: `"^23^Καὶ ἐμβάντι…"`) |

- Formatting can nest: `"*italic with **bold** inside*"`.
- Markdown headings, `-` lists, links, and HTML tags are **not** supported; they appear as plain characters.

---

## 3. Typing rules

| Character | How to type it |
|---|---|
| Straight double quote `"` | Use curly quotes `“ ”` (house style), or `\"` |
| Backslash `\` | `\\` |
| Apostrophe / single quote | Type normally; curly `’` is house style |
| Tab at the start of a flow line | `\t` |
| Ellipsis | `…` (one character) |
| Dash in ranges or references | en dash `–` (`Matt 8:23–29`) |
| Therefore sign | `∴` |

Greek: use precomposed polytonic characters (as from SBLGNT or BibleWorks copy-paste).

---

## 4. After editing

1. **Plugin:** in `obsidian-plugin`, run `npm run build`. The build copies itself into the vault; then toggle DA-Tool off and on.
2. **Web tool:** `index.html` carries identical copies of these arrays (`TEXT_FLOW_INSTRUCTIONS`, `SENTENCE_FLOW_INSTRUCTIONS`, `BRACKETING_INSTRUCTIONS`). Copy the changed array over, or ask Claude to sync it and check that the two match.
3. **Sources:** the modal's "Source:" line comes from `TEXT_FLOW_SOURCE`, `SENTENCE_FLOW_SOURCE`, and `BRACKETING_SOURCE` at the top of each file. In the web tool it's the `tfi-source` line in each modal's header.
