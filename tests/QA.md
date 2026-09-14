# Quality assurance guide

This file records the repeatable checks expected before a preview release. It intentionally avoids becoming a chronological changelog; durable implementation decisions belong in `docs/ARCHITECTURE.md`, while release-specific changes belong in Git history or release notes.

## Automated checks

Run from the repository root:

```sh
npm test
```

The regression suite has no third-party dependencies and covers syntax, static assets, PWA metadata, editor behavior, imported-data normalization, storage adapters, ink geometry, pointer performance paths, and mind-map dragging.

## Desktop browser checks

- Connect a real folder in current Edge and Chrome.
- Create, rename, move, reorder, delete, restore, and permanently delete notes.
- Rename workspaces, folders, and note files; confirm changes are visible in the selected system folder.
- Reload and relaunch the installed application; confirm the last active workspace and note reopen.
- Insert and remove text formatting, links, images, formulas, dividers, checkboxes, and quotes.
- Confirm cross-paragraph selection, Backspace, Delete, Enter, Undo, and Redo preserve document order and formatting.
- Drag overlapping editors and verify the active editor comes to the front.
- Drag and resize mind-map nodes; verify every connector remains attached during the gesture.
- Draw with mouse and pen, then test pressure, both erasers, lasso selection, moving ink, Undo, and Redo.
- Print and export a representative mixed canvas in light and dark modes.

## Touch and mobile checks

- Test portrait navigation on a phone and a medium-width tablet; each navigation level must occupy the full viewport.
- Test toolbar horizontal scrolling without layout jumps when switching tools.
- Verify tap-away dismissal for menus, dialogs, and contextual surfaces.
- Test one-finger drawing, palm rejection after pen input, and two-finger canvas pan and zoom.
- Test image viewer pan and pinch zoom.
- Install the PWA and verify launch artwork, status-bar color, safe-area insets, and last-open restoration.

## Browser-storage checks

- In Firefox and Safari, create data in IndexedDB mode, reload, and verify persistence.
- Export a whole-workspace backup, delete local browser data, import the backup, and compare workspace, folder, note, editor, mind-map, image, formula, and ink content.
- Confirm a failed or interrupted write leaves the recovery snapshot usable.
- Confirm the application never claims that data is saved before the active revision is committed.

## Release blockers

Do not publish a release when any of these conditions is true:

- The regression suite fails.
- A supported browser cannot restore the last committed edit.
- Importing valid backup data loses or reorders content.
- A pointer gesture leaves a node, editor, selection, or canvas stuck to the cursor.
- Console errors occur during normal startup, editing, storage, or export flows.
- Private notes, local paths, credentials, generated profiles, or test artifacts are staged for commit.

Hardware-specific stylus behavior, installed-PWA icon refresh timing, very large notebooks, storage quota exhaustion, and multi-tab conflict behavior require dedicated manual testing before a stable release.
