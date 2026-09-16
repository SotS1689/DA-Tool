# Publishing Plan — DA-Tool Obsidian Plugin → Community Plugins

Picks up where [TESTING_AND_ROLLOUT.md](TESTING_AND_ROLLOUT.md) leaves off. That doc gets the
plugin working as a manually-installed local plugin. This doc is the separate, later effort of
getting it listed in Obsidian's official Community Plugins directory so it installs/updates from
inside Obsidian on any device without manual file-copying.

**Do not start this until the manual-install checklist in TESTING_AND_ROLLOUT.md has passed** —
submitting an unreviewed, untested plugin wastes the reviewers' time and yours.

## 0. Current status

Not started. Nothing in this section has been done yet:

- [ ] No `README.md` in `obsidian-plugin/`
- [ ] No `LICENSE` file in `obsidian-plugin/`
- [ ] No `versions.json` in `obsidian-plugin/`
- [ ] No GitHub Release has ever been cut for this plugin
- [ ] Plugin guidelines self-review (Step 3 below) not done
- [ ] No PR opened against `obsidian-releases`

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
Already present and mostly fine — double-check before submitting:
- [ ] `id` (`da-tool`) doesn't collide with an existing entry in the community plugins list (search
  https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json for `da-tool`)
- [ ] `name` doesn't contain the word "Obsidian" (guideline violation)
- [ ] `description` is one sentence, no marketing language, ends without a period per convention
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
app — see TESTING_AND_ROLLOUT.md):
- [ ] No use of `innerHTML`/`outerHTML` with unsanitized content (the original web app's DOM code
      was ported fairly directly — audit `src/DAView.ts` for any raw HTML string construction,
      especially around label editing and the Resources/Logical Relationships reference modals)
- [ ] No global CSS selectors outside `.da-tool-view` scoping in `styles.css` (avoid leaking styles
      into the rest of the user's Obsidian UI)
- [ ] No hardcoded/absolute file paths — confirm PNG export (Step "Export" in the manual checklist)
      uses the vault adapter API, not `fs`/Node paths directly
- [ ] Commands and ribbon icons have clear, specific names (not generic "Open"/"Create")
- [ ] `isDesktopOnly` is actually correct — `html2canvas` should work fine on mobile, so `false` is
      likely right, but confirm by testing on Obsidian mobile (or explicitly decide mobile is
      out of scope and set this `true` with a note why)
- [ ] No telemetry/analytics/network calls added anywhere (there shouldn't be any — confirm)

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

1. Fork https://github.com/obsidianmd/obsidian-releases
2. Edit `community-plugins.json`, add an entry at the end of the array:
   ```json
   {
     "id": "da-tool",
     "name": "Discourse Analysis Tool",
     "author": "SotS1689",
     "description": "Create and edit visual discourse-analysis bracket diagrams for biblical texts, natively in your vault.",
     "repo": "SotS1689/DA-Tool"
   }
   ```
3. Open a PR against `obsidian-releases`. Their bot runs automated checks (manifest validity,
   release asset presence, etc.) — fix anything it flags.
4. A human reviewer will eventually review the plugin code itself and may request changes (this is
   normal and can take weeks to months — historically this queue is slow). Respond to review
   comments as a normal PR review cycle.
5. Once approved and merged, the plugin becomes installable/searchable from Settings → Community
   plugins inside Obsidian, on any device, with in-app update notifications going forward.

## 7. After approval — ongoing maintenance

Every future release needs, in order:
1. Bump `version` in `manifest.json`
2. Add the new version → `minAppVersion` mapping to `versions.json`
3. `npm run build`
4. Cut a new GitHub Release tagged with the new version, with fresh `manifest.json`/`main.js`/
   `styles.css` assets
5. No further PR to `obsidian-releases` is needed for routine updates — only the very first
   listing (Step 6) requires a PR there. Obsidian picks up new releases automatically once listed.
