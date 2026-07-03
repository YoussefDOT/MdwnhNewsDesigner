# MdwnhNewsDesign

Collaborative Arabic newspaper design studio for a small team writing a weekly
report ("صحيفة المدونة"). Everyone shares projects (issues) online; each has a
Writing tab and a Design tab.

## Stack

- Vite + React 18, no router (hash-based: `#/` chooser, `#/p/<id>` project)
- Firebase Realtime Database for all collaboration/storage — no backend server
- `html-to-image` for full-quality PNG export
- Arabic-first UI, RTL, font **Baloo Bhaijaan 2** (+ 5 alternates), brand
  accents `#E54B2A #F3C02B #41B9A6 #0B6EB9` on background `#f7f5ec`

Run: `npm run dev` (port 5188, see `.claude/launch.json`). Build: `npm run build`.

**Known env quirk:** the project lives on a mounted volume (`/Volumes/Sigma Drive/...`)
where Vite's file watcher sometimes doesn't fire. If edits don't show up after
reload, restart the dev server and clear `node_modules/.vite`.

## Firebase

`src/firebase.js` — config is hardcoded (this is a client-only app, no secrets
worth hiding). The RTDB instance (`nawafdatabase-default-rtdb`) is **shared
with another, unrelated project** — all data for this app must stay under the
root key `newsPaperStudio/`. Never read/write outside that root.

Structure: `newsPaperStudio/projects/{projectId}/{name, createdAt, updatedAt, writing, design, images}`.

- `writing.sections.{sectionId}` — `{title, body, order}`, max 4 sections
- `writing.saved` — bool, gates whether the Design tab unlocks
- `design` — see `src/model.js` `defaultDesign()` / `syncDesignWithWriting()`
- `images.{imageId}` — base64 data URLs (cropped photos), separate from
  `design.elements` so dragging elements never rewrites image blobs

## Core data model (`src/model.js`)

- Canvas is a fixed logical size `PAGE_W×PAGE_H = 2048×1365`, matching the
  background PNGs' native resolution
- `AREA` defines the safe content region measured from the backgrounds' baked-in
  header/footer margins — text layout must stay inside it
- `defaultLayout(sectionIds, hasPaper)` computes positions for headline/body/
  paper per section, flowing right-column-first (RTL newspaper feel): 4
  sections → 2 right + 2 left, fewer sections get adapted single/double layouts
- `syncDesignWithWriting(design, sections)` is the merge step run after Writing
  is saved: creates elements for new sections, updates text for changed
  sections, **never** touches elements a user has manually repositioned
  (`auto: false`), never resurrects a paper the user explicitly deleted
  (`deletedPapers`)
- `expandBodyAfterPaperDelete` re-flows a section's body text into the freed
  space when its default paper is deleted (only if body is still `auto`)

## Design tab (`src/components/DesignTab.jsx`)

The biggest file — a small Canva clone. Notable implementation details:

- All elements (text + taped "paper" photo frames) live in `design.elements`,
  keyed by id, positioned absolutely in canvas coordinates, rendered at `scale`
  to fit the viewport
- Dragging/resizing/rotating is done via raw pointer events (`startInteract`),
  not a library — rotation-aware resize math accounts for the element's
  current `rot`
- Undo/redo is a simple JSON-snapshot stack (`historyRef`), capped at 60 steps,
  wired to Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
- Manual text color/font edits are stored as **inline styles on that specific
  run of characters** (via `document.execCommand` on the contentEditable),
  so they survive background swaps — untouched text still flips between the
  background's default ink color (`--page-ink`, set per-background: bg1 =
  dark, bg2–4 = light)
- Font/color dropdowns in the toolbar render through a `Pop` component that
  portals to `document.body` — the toolbar itself has `overflow-x:auto` for
  small screens, which would otherwise clip any in-place dropdown
- Firebase writes are debounced (~450ms) and skipped while a remote update
  would clobber an in-progress drag/edit (`interactRef`, `editing` guards)

### PNG export

`exportPng()` uses `html-to-image`'s `toPng`. Two non-obvious fixes baked in:

1. **Fonts**: `html-to-image` can't read the cross-origin Google Fonts
   stylesheet (`SecurityError` on `cssRules`), which used to silently abort
   the *entire* capture. Fix: `buildFontEmbedCSS()` fetches the stylesheet and
   every referenced `.woff2`, inlines them as base64, and passes the result as
   `fontEmbedCSS` — this both avoids the cross-origin read and makes the
   Arabic fonts actually render in the exported PNG instead of a system
   fallback. Cached per session (`fontEmbedCache`).
2. Images are `.decode()`d and fonts awaited (`document.fonts.ready`) before
   capture, and the page is captured twice (first pass warms html-to-image's
   internal image cache) — otherwise the first snapshot can drop the
   background/shadow layer.

## Deployment (GitHub Pages)

`.github/workflows/static.yml` builds with `npm ci && npm run build` and
publishes `dist/` via `actions/upload-pages-artifact` — **do not** revert this
to uploading the repo root, that serves the dev `index.html` (which points at
raw `/src/main.jsx`) and produces a blank page.

**Push restriction:** GitHub tokens without the `workflow` scope cannot push
any commit that touches `.github/workflows/*`. If a push is rejected with
"refusing to allow a Personal Access Token to... without `workflow` scope",
that file must be edited directly in the GitHub UI by the repo owner instead.

`vite.config.js` sets `base: './'` (relative asset paths) so the build works
from a Pages project subpath.

## Testing conventions

Per user preference: verify the app loads/builds and smoke-test the touched
flow in the preview browser, but don't exhaustively test every feature —
the user tests functionality themselves.
