# Contributing

Thank you for helping improve Ramizom PowerMind Preview.

## Before opening a change

1. Search existing issues and keep each contribution focused on one problem.
2. For behavior or data-model changes, describe the user scenario and compatibility impact.
3. Never use a real note workspace or private note export as a test fixture.

## Development rules

- Keep source code, comments, tests, commit messages, and documentation in English.
- Keep all translated client copy in `i18n.js`. Do not branch application behavior by language.
- The project intentionally has no runtime dependencies and no service worker.
- Preserve note data and canvas layout. Add an explicit migration in `migrateDatabase()` when the stored schema changes.
- Sanitize imported HTML, images, identifiers, colors, filenames, and relationships at the trust boundary.
- Use pointer events for mouse, touch, and pen compatibility.
- Keep high-frequency pointer handlers allocation-light and coalesce visual work with `requestAnimationFrame`.
- Maintain keyboard access, visible focus, readable contrast, touch target sizes, and reduced-motion behavior.
- Bump the static asset query version consistently after user-visible code or style changes.

## Testing

Run:

```sh
npm test
```

Then complete the relevant manual scenarios in [tests/QA.md](tests/QA.md). A bug fix should include a regression assertion when the behavior can be checked without a full browser automation dependency.

## Pull requests

Include:

- The user-visible outcome
- The root cause
- Compatibility or migration notes
- Automated and manual checks performed
- Screenshots for visual changes

Do not include generated browser profiles, screenshots, personal workspaces, exported notes, environment files, logs, editor metadata, or credentials.

## AI-assisted contributions

AI-assisted contributions are welcome, but must be disclosed in the pull request when AI generated or materially transformed code, assets, translations, or documentation. The contributor remains responsible for:

- Understanding and reviewing the submitted change
- Confirming its license compatibility and provenance
- Testing correctness, security, privacy, accessibility, and browser behavior
- Removing fabricated claims, dead code, private data, and irrelevant generated output

AI output is not accepted as a substitute for review or testing.
