# Publishing Plan — DA-Tool Obsidian Plugin → Community Plugins

Picks up where [TESTING_AND_ROLLOUT.md](TESTING_AND_ROLLOUT.md) leaves off. That doc gets the
plugin working as a manually-installed local plugin. This doc is the separate, later effort of
getting it listed in Obsidian's official Community Plugins directory so it installs/updates from
inside Obsidian on any device without manual file-copying.

**Do not start this until the manual-install checklist in TESTING_AND_ROLLOUT.md has passed** —
submitting an unreviewed, untested plugin wastes the reviewers' time and yours.

## 0. Current status

- [x] Manual-install checklist in TESTING_AND_ROLLOUT.md passed (confirmed by SotS1689,
      2026-09-16 — plugin has been in real use in the `CryptaMei` vault)
- [x] `README.md` added in `obsidian-plugin/`
- [x] `LICENSE` added in `obsidian-plugin/` (MIT, copyright SotS1689)
- [x] `versions.json` added in `obsidian-plugin/` (`"0.1.0": "1.4.0"`)
- [x] Plugin guidelines self-review (Step 3 below) done — see results inline below
- [ ] No GitHub Release has ever been cut for this plugin
- [ ] Not yet submitted via community.obsidian.md (see Step 6 — **the submission process
      changed from a PR against `obsidian-releases` to a web form**; this doc has been updated
      accordingly)

## 1. Required files to add (all live in `obsidian-plugin/`, alongside `manifest.json`)

### `README.md`
Obsidian's reviewers read this first, and it's what shows in the in-app plugin listing.
Should cover, in plain language:
- What the plugin does (discourse-analysis bracket diagrams for biblical texts, native `.da` files)
- A screenshot or two of the diagram view (drop images in an `obsidian-plugin/assets/` or similar
  folder and reference them with relative paths)
- How to create a new `.da` file and the basic editing workflow (propositions → brackets → labels)
- Any limitations worth flagging up front (see TESTING_AND_ROLLOUT.md §5)

### `LICENSE`
Community plugin submissions require an OSI-approved license. Pick one (MIT is the common default
for Obsidian plugins and keeps things simple) and add the standard license text with the correct
copyright holder/year. Check the license doesn't conflict with `html2canvas`'s own license (MIT —
compatible with MIT).

### `versions.json`
Maps plugin version → minimum required Obsidian app version, e.g.:
```json
{
  "0.1.0": "1.4.0"
}
```
Add a new entry here every time `manifest.json`'s `minAppVersion` changes for a new release. This
lets Obsidian offer the right plugin version to users on older app versions instead of just
refusing to install.

### `manifest.json` review
Already present and mostly fine — checked 2026-09-16:
- [x] `id` (`da-tool`) doesn't collide with an existing entry and doesn't contain the word
  `obsidian` (Obsidian's actual rule — checked against the live `community-plugins.json`)
- [x] `name` (`Discourse Analysis Tool`) doesn't contain the word "Obsidian"
- [x] `description` is one sentence, no marketing language
- [ ] Consider adding `"fundingUrl"` if desired (optional, not required)

## 2. Repo layout consideration

`community-plugins.json` (in `obsidian-releases`) points at a whole GitHub repo
(`SotS1689/DA-Tool`), and Obsidian pulls plugin files from that repo's **GitHub Releases**, not
from a specific path in the repo — so having `obsidian-plugin/` as a subfolder of the larger
DA-Tool repo (which also contains the standalone web app) is fine and does **not** require
splitting into a separate repo. Just make sure release assets (Step 4) are the bare plugin files,
built from `obsidian-plugin/`.

## 3. Plugin guidelines self-review

Before submitting, read the official guidelines in full and check this plugin against them:
https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

Known areas worth double-checking given how this plugin was built (ported from a standalone HTML
app — see TESTING_AND_ROLLOUT.md). Audited 2026-09-16:
- [x] `innerHTML` usages in `src/DAView.ts` (lines ~364, 772, 910, 912, 1079) are all static markup
      or `""`/empty-state strings — no user-supplied text is ever interpolated into HTML, so no
      injection risk.
- [x] All CSS selectors in `styles.css` are scoped under `.da-` classes — no global/leaking
      selectors.
- [x] PNG export (`exportPNG` in `DAView.ts`) uses `this.app.vault.createBinary` /
      `modifyBinary` — the vault adapter API — not raw `fs`/Node paths.
- [x] Ribbon icon and command are both named "Create new Discourse Analysis" — clear and specific.
- [x] `isDesktopOnly: false` left as-is; no mobile-specific blocker identified in code (drag/drop
      touch behavior not separately verified — note this if mobile issues are reported later).
- [x] No `fetch`/`XMLHttpRequest`/network calls anywhere in `src/` — confirmed via grep.
- [ ] `npx tsc --noEmit` passes for this plugin's own code (only pre-existing errors are inside
      `node_modules/obsidian/obsidian.d.ts` itself — a type-lib issue unrelated to this plugin —
      confirmed 2026-09-16). `npm run build` also completes cleanly.

## 4. Cut a GitHub Release

Once the files above are in place and `npm run build` produces a clean `main.js`:

1. Bump `version` in `manifest.json` if needed (e.g. stays `0.1.0` for the first public release).
2. Add/confirm the matching entry in `versions.json`.
3. Commit those changes.
4. Create a GitHub Release on `SotS1689/DA-Tool`:
   - Tag name: **exactly** the version number, no `v` prefix (e.g. `0.1.0`, not `v0.1.0`)
   - Attach these three files as individual **binary release assets** (not zipped, not inside a
     folder):
     - `manifest.json`
     - `main.js`
     - `styles.css`

```bash
cd obsidian-plugin
npm run build
gh release create 0.1.0 manifest.json main.js styles.css --title "0.1.0" --notes "Initial release"
```

## 5. Beta-test via BRAT before submitting (recommended)

Install the community plugin "BRAT" (Beta Reviewers Auto-update Tester) in a test vault, add this
repo (`SotS1689/DA-Tool`) as a beta plugin source, and confirm it installs and updates correctly
from the Release created in Step 4. This catches release-packaging mistakes (wrong asset names,
missing files) before a reviewer ever sees them.

## 6. Submit to the Community Plugins directory

**This step changed since this plan was first written.** Submission is no longer a PR against
`obsidian-releases`/`community-plugins.json` — it's now a web form. (Confirmed against
https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin, checked 2026-09-16.)

1. Go to https://community.obsidian.md and sign in with an Obsidian account (create one if you
   don't have one — this is a regular account signup, not something to do on your behalf here).
2. Link your GitHub account (`SotS1689`) to that Obsidian account.
3. Add the plugin through the directory's submission interface, pointing it at
   `SotS1689/DA-Tool` (the repo — the plugin's files live in the `obsidian-plugin/` subfolder,
   which is fine since Obsidian pulls from Releases, not a repo path).
4. The site runs automated checks against your `manifest.json` and latest Release and shows
   guidance inline for anything that needs fixing.
5. A human reviewer will eventually review the plugin code itself and may request changes (this is
   normal and can take weeks to months — historically this queue is slow).
6. Once approved, the plugin becomes installable/searchable from Settings → Community plugins
   inside Obsidian, on any device, with in-app update notifications going forward.

This step requires your own Obsidian account credentials and GitHub OAuth consent, so it has to be
done by you directly in a browser rather than something done on your behalf.

## 7. After approval — ongoing maintenance

Every future release needs, in order:
1. Bump `version` in `manifest.json`
2. Add the new version → `minAppVersion` mapping to `versions.json`
3. `npm run build`
4. Cut a new GitHub Release tagged with the new version, with fresh `manifest.json`/`main.js`/
   `styles.css` assets
5. No further PR to `obsidian-releases` is needed for routine updates — only the very first
   listing (Step 6) requires a PR there. Obsidian picks up new releases automatically once listed.
