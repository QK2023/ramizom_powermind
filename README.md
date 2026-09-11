# Ramizom PowerMind

Ramizom PowerMind is a visual note workspace for blocks, mind maps, handwriting, images, and formulas on one infinite canvas.

## Run locally

Serve this folder from a local static web server, then open it in a current Chromium-based browser such as Microsoft Edge or Google Chrome. A server is recommended because the File System Access API requires a secure context or localhost.

## Data and privacy

Before editing, choose a system folder for the workspace. PowerMind writes a visible `powermind.workspace.json` manifest and individual note files in `notes/`. This keeps notes available in File Explorer and independent of browser cache.

Do not choose this source repository as a personal notes folder. If it is selected accidentally, the included `.gitignore` prevents PowerMind workspace data from being committed.

## PWA behavior

The app includes a Web App Manifest and can be installed where the browser supports manifest-only installation. It intentionally does not register a Service Worker and does not cache the application shell.

If the File System Access API is unavailable, or the page is not served from HTTPS or localhost, the app stops before it renders the workspace and shows a localised notice instead of letting people edit notes that could never be saved. The notice explains the difference between an unsupported browser and an insecure origin, lists the browsers that work, and carries its own language selector so it can be read in any of the eight supported languages.

The manifest ships two icon families:

- `icon.svg`, `icon-192.png`, and `icon-512.png` carry the rounded brand art and are declared `purpose: "any"`.
- `icon-maskable-192.png` and `icon-maskable-512.png` are full-bleed and fully opaque, declared `purpose: "maskable"`, with the mark kept inside the 80% centre safe zone.

Maskable art must never contain transparent pixels. Launcher masks and the Chrome for Android splash screen composite an icon's transparent corners onto an opaque backdrop, which appears as black edges around the logo, so the rounded `any` art must not also be declared maskable. `apple-touch-icon.png` (180 px) is opaque for the same reason.

## Quality checks

Run the regression suite before a release:

```text
node tests/regression.cjs
```

The suite checks JavaScript syntax, unified editor invariants, PWA metadata and icon contracts, unsupported-platform copy in all eight languages, unique static IDs, local asset references, import integrity, folder-workspace persistence, and ink geometry.

## Release checklist

- Test folder selection, save, rename, reopen, and close-folder flows in Edge or Chrome.
- Test touch, pen, and print/PDF flows on the intended devices.
- Verify portrait navigation across workspace, note list, and editor.
- Confirm the installed app icon and launch splash show no black corners on Android.
- Keep source code and private note workspaces in separate folders.
- Confirm the browser meets the file-access floor: Edge/Chrome 105+ (Chrome for Android 132+); Firefox and Safari cannot save notes and are not supported.
