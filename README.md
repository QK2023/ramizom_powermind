# Ramizom PowerMind Preview

Ramizom PowerMind Preview is a local-first visual notebook for continuous documents, mind maps, handwriting, images, and formulas on one infinite canvas. It is a dependency-free web application inspired by Microsoft Fluent and WinUI design.

> [!IMPORTANT]
> **AI-assisted project:** PowerMind is substantially designed and implemented with generative AI. Every contribution, whether human-written or AI-assisted, must still be reviewed and tested by a person. Maintainers and contributors remain responsible for security, privacy, accessibility, licensing, and correctness.

> [!WARNING]
> PowerMind is preview software. Keep regular exports of important work and validate the application on your target browser and hardware before using it for critical data.

## Features

- A continuous rich-text document experience with multiple movable editors in one note
- Mind maps with free positioning, multiline nodes, resizing, snapping, and automatic layout
- Low-latency mouse, touch, and pen input with pressure, lasso selection, and two eraser modes
- Workspaces, folders, notes, favorites, trash, search, naming, and configurable sorting
- Images, links, formulas, reading mode, printing, and PDF export
- Eight interface languages provided through `i18n.js`
- Installable PWA metadata without a service worker or offline asset cache
- Light and dark themes, selectable accent colors, and responsive desktop, tablet, and phone layouts
- No application analytics, accounts, advertising, or third-party runtime requests

## Data and storage

PowerMind selects its storage backend according to browser capabilities:

- Chrome and Edge use the File System Access API when it is available. The user chooses a system folder, and PowerMind writes a visible `powermind.workspace.json` manifest plus individual note files under `notes/`.
- Firefox, Safari, iOS, and iPadOS use IndexedDB with a current snapshot and a recovery snapshot. Portable full-workspace JSON import and export remain available in Settings.

Data stays on the device unless the user explicitly exports, copies, or synchronizes the selected folder with another service. Do not choose the source repository itself as a note workspace. Source code and personal notes should live in separate directories.

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari over HTTPS or localhost. Folder-backed workspaces require a browser that implements the File System Access API; other supported browsers automatically use the IndexedDB fallback.

Opening `index.html` directly through `file://` is unsupported because browser permissions, storage, modules, and PWA behavior differ from a secure HTTP origin.

## Run locally

The client has no runtime dependencies and does not require compilation. Serve the repository with any static HTTP server, for example:

```sh
npx serve .
```

Then open the printed localhost address. To validate the production assets and run the regression suite:

```sh
npm run check
```

## Deploy to Cloudflare Workers

PowerMind is published directly from the repository root. The checked-in `.assetsignore` is deny-by-default and allows Wrangler to upload only the client application files; dependencies, tests, documentation, Git metadata, and development tools are excluded.

Use these Workers Builds settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |
| Root directory | Leave blank |

`wrangler.jsonc` sets the asset directory to `.` and disables Wrangler telemetry for this project. Do not replace the deploy command with an unconfigured `wrangler deploy --assets .`; the checked-in command and configuration are the deployment source of truth.

For other static HTTPS hosts, publish only the files explicitly allowed by `.assetsignore`. Recommended production security headers are provided in `_headers` and explained in [SECURITY.md](SECURITY.md).

## Quality checks

The repository uses a dependency-free Node.js regression suite:

```sh
npm test
```

The suite checks JavaScript syntax, editor invariants, import sanitization, PWA metadata, localization coverage, storage behavior, ink geometry and performance paths, touch interactions, and mind-map behavior. The production validation command also rejects missing public assets and any individual asset larger than Cloudflare's 25 MiB limit.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Application shell, accessible markup, SVG symbols, and PWA metadata |
| `style.css` | Fluent visual system, responsive layouts, print styling, and interaction states |
| `app.js` | Application state, storage adapters, editors, canvas tools, and UI controllers |
| `i18n.js` | Localized client-facing copy and native language names |
| `manifest.webmanifest` | Installable PWA declaration; intentionally no service worker |
| `.assetsignore` | Deny-by-default Cloudflare asset allowlist |
| `wrangler.jsonc` | Cloudflare Workers root deployment configuration |
| `_headers` | Recommended security and cache headers for compatible static hosts |
| `tests/regression.cjs` | Dependency-free source and data regression tests |
| `tools/build.cjs` | Production asset presence and size validation |
| `docs/ARCHITECTURE.md` | Maintainer guide to persistence, rendering, state, and extension points |

## Contributing

Bug reports and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

- Keep source code, comments, tests, and project documentation in English.
- Keep translated client-facing copy in `i18n.js`.
- Clearly disclose meaningful AI assistance in contributions.
- Review generated code and content instead of treating AI output as authoritative.
- Preserve note layout and storage compatibility unless a migration is intentional and tested.
- Update the static asset query version and regression expectations after user-visible asset changes.

Security issues should be reported according to [SECURITY.md](SECURITY.md), not through a public issue.

## License

Ramizom PowerMind Preview is released under the [MIT License](LICENSE).
