# DA-Tool

Discourse analysis (bracketing) tool for Bible passages. Two versions of the same tool:
- index.html at the root: the web app (sots1689.github.io/DA-Tool).
- obsidian-plugin/: the Obsidian plugin (.da files). Its own skill: da-tool-obsidian-plugin.

## Where things are
- obsidian-plugin/src/: main.ts (view, commands, settings), DAView.ts (the diagram engine), *Instructions.ts (in-app instructions).
- obsidian-plugin/INSTRUCTIONS_STYLE_SHEET.md: how to edit the in-app instructions.
- obsidian-plugin/PUBLISHING_PLAN.md: release steps and current status. Newest status lives here.
- obsidian-plugin/TESTING_AND_ROLLOUT.md: first-time build and manual install checklist (history).

## Rules
- Root README.md and obsidian-plugin/README.md must say the same thing. Change both.
- Root manifest.json is copied from obsidian-plugin/manifest.json by npm run build; commit both after a version bump.
- Add a versions.json line for every release.
