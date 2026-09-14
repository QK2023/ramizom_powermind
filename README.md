# Ramizom PowerMind Preview

Ramizom PowerMind Preview is a local-first visual notebook that combines continuous documents, mind maps, handwriting, images, and formulas on one infinite canvas. Its interface follows Microsoft Fluent and WinUI design principles while remaining a dependency-free web application.

> [!IMPORTANT]
> This is preview software. Keep regular backups of important notes and test your target browser and hardware before relying on it for production data.

## Highlights

- Continuous rich-text documents with multiple movable editors per note
- Mind maps with free positioning, resizing, snapping, and automatic layout
- Low-latency pen and touch input with pressure, lasso selection, and erasers
- Workspaces, folders, notes, favorites, trash, search, and sorting
- Images, links, formulas, reading mode, printing, and PDF export
- Eight interface languages through `i18n.js`
- Installable PWA metadata without a service worker or offline application cache
- No analytics, telemetry, accounts, or third-party runtime requests

## Browser storage model

PowerMind selects the safest available local storage mode without changing the user experience:

- Chrome and Edge use the File System Access API when available. The user selects a folder, and PowerMind stores a visible `powermind.workspace.json` manifest plus individual files in `notes/`.
- Firefox, Safari, iOS, and iPadOS use IndexedDB with a current snapshot and a recovery snapshot. Full-workspace JSON import and export are available in Settings.

Do not select the source repository itself as a note workspace. Workspace data is ignored by Git as a safeguard, but source code and personal data should always live in separate directories.

## Run locally

No build step or package installation is required. Serve the repository over localhost:

```sh
npx serve .
```

Then open the printed local URL in a current Chrome, Edge, Firefox, or Safari release. Opening `index.html` directly through `file://` is unsupported because browser storage and security behavior differs from an HTTP origin.

Any static HTTPS host can serve the project in production. Configure restrictive security headers at the hosting layer; recommended policy examples are documented in [SECURITY.md](SECURITY.md).

### Cloudflare deployment

For Cloudflare Pages, use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `.` |
| Root directory | Leave blank |

The app is served directly from the repository root. The build command validates the public files, while `.assetsignore` prevents dependencies, tests, documentation, and repository metadata from being published.

For Cloudflare Workers Builds, the build and deploy commands are separate. Use:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |
| Root directory | Leave blank |

The checked-in `wrangler.jsonc` publishes the repository root and disables Wrangler telemetry for this project. The strict `.assetsignore` allowlist ensures that only the client application is uploaded, so packages such as `node_modules/workerd` never become static assets.

## Quality checks

Run the dependency-free regression suite:

```sh
npm test
```

The suite validates JavaScript syntax, editor invariants, import sanitization, PWA metadata, local assets, translation coverage, storage behavior, ink geometry, touch and pen performance paths, and mind-map interactions.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Application shell, accessible markup, SVG icon symbols, and PWA metadata |
| `style.css` | Fluent visual system, responsive layouts, print styling, and interaction states |
| `app.js` | Application state, storage adapters, editors, canvas tools, and UI controllers |
| `i18n.js` | All localized client-facing copy and native language names |
| `manifest.webmanifest` | Installable PWA declaration; intentionally no service worker |
| `tests/regression.cjs` | Dependency-free source and data regression tests |
| `tools/build.cjs` | Production asset and size validation for static hosts |
| `.assetsignore` | Root deployment allowlist that excludes dependencies and project files |
| `wrangler.jsonc` | Workers root-directory deployment configuration |
| `_headers` | Cloudflare Pages security and cache headers |
| `docs/ARCHITECTURE.md` | Maintainer guide to state, persistence, rendering, and extension points |

## Contributing

Bug reports and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing application behavior. In particular:

- Keep source code, comments, tests, and project documentation in English.
- Put all localized user-facing copy in `i18n.js`.
- Preserve existing note layout and storage compatibility unless a migration is deliberate and tested.
- Update the static asset query version in `index.html`, `manifest.webmanifest`, and the regression expectations after user-visible changes.

## AI development disclosure

This project is substantially designed and implemented with the assistance of generative AI. AI-assisted changes are treated like any other contribution: maintainers and contributors are responsible for reviewing, testing, licensing, security, accessibility, and correctness before release. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution policy.

## License

Ramizom PowerMind Preview is available under the [MIT License](LICENSE).
