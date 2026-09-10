# Ramizom PowerMind

Ramizom PowerMind is a visual note workspace for blocks, mind maps, handwriting, images, and formulas on one infinite canvas.

## Run locally

Serve this folder from a local static web server, then open it in a current Chromium-based browser such as Microsoft Edge or Google Chrome. A server is recommended because the File System Access API requires a secure context or localhost.

## Data and privacy

Before editing, choose a system folder for the workspace. PowerMind writes a visible `powermind.workspace.json` manifest and individual note files in `notes/`. This keeps notes available in File Explorer and independent of browser cache.

Do not choose this source repository as a personal notes folder. If it is selected accidentally, the included `.gitignore` prevents PowerMind workspace data from being committed.

## PWA behavior

The app includes a Web App Manifest and can be installed where the browser supports manifest-only installation. It intentionally does not register a Service Worker and does not cache the application shell.

## Quality checks

Run the regression suite before a release:

```text
node tests/regression.cjs
```

The suite checks JavaScript syntax, unified editor invariants, PWA metadata, unique static IDs, local asset references, import integrity, folder-workspace persistence, and ink geometry.

## Release checklist

- Test folder selection, save, rename, reopen, and close-folder flows in Edge or Chrome.
- Test touch, pen, and print/PDF flows on the intended devices.
- Verify portrait navigation across workspace, note list, and editor.
- Keep source code and private note workspaces in separate folders.
