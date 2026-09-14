# Architecture

Ramizom PowerMind Preview is a dependency-free client application. The browser loads `index.html`, `style.css`, `i18n.js`, and `app.js` directly; there is no compilation step and no service worker.

## Runtime layers

1. **Early theme bootstrap** in `index.html` resolves the saved theme before first paint and updates browser chrome metadata.
2. **Localization** in `i18n.js` owns every translated string and native language label.
3. **Application state** in `app.js` keeps the active database, selection, canvas transform, history, storage mode, and transient gesture state.
4. **Render functions** project state into navigation, note lists, editors, mind-map nodes, SVG connectors, and ink canvases.
5. **Event binders** convert keyboard and pointer interactions into model updates, then call the smallest relevant renderer.
6. **Storage adapters** persist the same versioned database through either a user-selected folder or IndexedDB.

## Data model

The root database contains workspaces, folders, notes, and last-open metadata. A note owns:

- File metadata and workspace/folder relationships
- A primary document editor and zero or more peer editors
- Mind-map ideas with parent relationships and canvas coordinates
- Vector ink strokes and legacy raster ink when present
- Canvas layout and stacking information

`migrateDatabase()` is the compatibility boundary. It normalizes missing fields, repairs identifiers and relationships, sanitizes imported content, and upgrades old shapes before rendering. Never scatter stored-schema fixes through UI code.

## Persistence

The File System Access adapter writes a workspace manifest and separate note files. The IndexedDB adapter keeps a current snapshot and the previous valid snapshot as recovery data. Both modes use the same normalized in-memory model.

Changes increment a revision and enter a debounced save queue. Page visibility and teardown events flush pending work. The interface may show a saved state only after the active revision commits.

## Editing

Each document is rendered as a continuous editing surface backed by an ordered block model for compatibility with existing notes. Atomic media such as images, formulas, and dividers remain model items, while keyboard handlers provide cross-item selection, deletion, merging, and caret restoration.

All primary and additional editors use the same renderer and binder. Feature changes must remain shared rather than introducing a second editor implementation.

## Canvas and input

The infinite canvas uses one world transform for editors, mind maps, connections, and ink. High-frequency pan, zoom, drag, and pen paths are coalesced to animation frames. Node coordinates and SVG connections must be updated in the same frame.

Pen input prefers raw and coalesced pointer events when available. Persistent ink is vector-based; raster canvases are render targets and must not become the source of truth.

## Localization

Application logic calls `t(key)` and must not contain locale-specific branches or translated literals. Add every new user-facing key to all supported locales in `i18n.js`. English text in static HTML is the no-script and first-parse fallback.

## Versioning

Static asset query parameters prevent stale browser resources without introducing a service worker. Keep the version synchronized across `index.html`, `manifest.webmanifest`, and `tests/regression.cjs`.

The persisted database version is separate from the static asset version. Increment it only with a deliberate, tested migration.
