# Ramizom PowerMind

Ramizom PowerMind is a visual note workspace combining continuous documents, mind maps, handwriting, images, and formulas on one infinite canvas.

## Run locally

Serve this directory over HTTPS or localhost and open it in a current Chromium-based browser. PowerMind requires the File System Access API and stops before editing when safe direct-folder access is unavailable.

## Data and privacy

The user chooses a system folder before editing. PowerMind writes a visible `powermind.workspace.json` manifest and individual note files under `notes/`. Note content is not uploaded, no analytics or telemetry is included, and the application makes no third-party network requests.

Do not select this source repository as a personal notes folder. If selected accidentally, `.gitignore` excludes PowerMind workspace data from commits.

## PWA behavior

The Web App Manifest enables installation without a service worker. There is no application cache, so a stale offline shell cannot hide source updates. Regular icons retain the brand's rounded silhouette; full-bleed maskable icons allow Android and Chrome to apply the platform corner shape exactly once. The page updates `theme-color` before first paint and whenever the selected theme or accent changes.

## Quality checks

Run the dependency-free regression suite before release:

```text
node tests/regression.cjs
```

The suite checks syntax, editor invariants, PWA metadata and assets, platform gating, translations, unique IDs, import sanitization, folder persistence, ink geometry, touch/pen performance paths, and mind-map behavior.

## Release checklist

- Test folder selection, save, rename, reopen, and close-folder flows in Edge and Chrome.
- Test touch, stylus, print/PDF, and portrait navigation on target hardware.
- Confirm the installed app receives theme-color changes and uses the maskable launch icon.
- Keep source code and private note workspaces in separate folders.
- Serve production builds over HTTPS with restrictive security headers.
