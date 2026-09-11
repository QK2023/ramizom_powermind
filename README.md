# Ramizom PowerMind

Ramizom PowerMind is a visual note workspace for blocks, mind maps, handwriting, images, and formulas on one infinite canvas.

## Run locally

Serve this folder from a local static web server, then open it in a current Chromium-based browser such as Microsoft Edge or Google Chrome. A server is recommended because the File System Access API requires a secure context or localhost.

## Data and privacy

Before editing, choose a system folder for the workspace. PowerMind writes a visible `powermind.workspace.json` manifest and individual note files in `notes/`. This keeps notes available in File Explorer and independent of browser cache.

Do not choose this source repository as a personal notes folder. If it is selected accidentally, the included `.gitignore` prevents PowerMind workspace data from being committed.

## PWA behavior

The app includes a Web App Manifest and can be installed where the browser supports manifest-only installation. `sw.js` registers an offline shell, but it answers **network-first**: while online every launch revalidates against the server and picks up new files, and the cache is used only when the network fails. A new release therefore reaches an installed app by simply reopening it, with no reinstall and no manual cache clearing, and no user is ever pinned to an older build.

The worker deliberately leaves `manifest.webmanifest` and every icon to the browser, because Chrome re-reads them in the background to refresh an installed app; caching them would freeze the app's name, colours and launcher/splash artwork.

If the File System Access API is unavailable, or the page is not served from HTTPS or localhost, the app stops before it renders the workspace and shows a localised notice instead of letting people edit notes that could never be saved. The notice explains the difference between an unsupported browser and an insecure origin, lists the browsers that work, and carries its own language selector so it can be read in any of the eight supported languages.

The manifest ships two icon families:

- `icon.svg`, `icon-192.png`, and `icon-512.png` carry the rounded brand art and are declared `purpose: "any"`.
- `icon-maskable-192.png` and `icon-maskable-512.png` keep the same rounded silhouette, are declared `purpose: "maskable"`, and scale the mark down so it stays inside the 80% centre safe zone.
- `apple-touch-icon.png` (180 px) carries the same rounded silhouette. iOS cannot save notes and is not a supported target, so the file is only there for icon metadata completeness.

Every icon in the set keeps **transparent rounded corners**, so the brand silhouette reads as rounded on every surface: an OS or launcher mask crops the tile to its own shape, and an unmasked surface — desktop shortcut, taskbar, or the Chrome launch splash — shows whatever sits behind the corner instead of a hard edge. An earlier revision instead painted the corners with the manifest `background_color`; that only looked right when the surface behind the icon happened to be exactly that colour, and everywhere else it read as a light square tile with a rounded logo inside it, so the corners are clear again. The clear corners let the launch splash backdrop show through, which is why `background_color` stays at the warm light `#f5eee9`.

## Quality checks

Run the regression suite before a release:

```text
node tests/regression.cjs
```

The suite checks JavaScript syntax, unified editor invariants, PWA metadata, icon and service-worker contracts, unsupported-platform copy in all eight languages, unique static IDs, local asset references, import integrity, folder-workspace persistence, and ink geometry.

## Release checklist

- Test folder selection, save, rename, reopen, and close-folder flows in Edge or Chrome.
- Test touch, pen, and print/PDF flows on the intended devices.
- Verify portrait navigation across workspace, note list, and editor.
- Confirm an installed app picks up a new release by reopening it, with no uninstall and no manual cache clearing.
- Confirm the installed app icon and launch splash show the rounded logo with no black corners on Android.
- Keep source code and private note workspaces in separate folders.
- Confirm the browser meets the file-access floor: Edge/Chrome 105+ (Chrome for Android 132+); Firefox and Safari cannot save notes and are not supported.
