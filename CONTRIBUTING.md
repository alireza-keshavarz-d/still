# Contributing to Still

## Development setup

- Node.js 22.12 or newer
- npm
- A modern browser with IndexedDB support

```sh
npm install
npm run dev
```

## Before opening a pull request

Run all quality checks:

```sh
npm run check
npm test
npm run build
```

Every push to a branch runs the CI workflow. Pull requests should target `main`; production deployment runs only after a successful push to `main`.

## Design and architecture rules

- Keep session lifecycle rules outside React components.
- Access IndexedDB through repository functions; do not query Dexie directly from UI components.
- Persist state transitions transactionally.
- Derive elapsed time from interval timestamps, not incrementing counters.
- Use `Asia/Tehran` for the initial reporting clock and day boundaries.
- Keep the app usable offline. Do not make core timer/history behavior depend on a network service.
- Do not add analytics or remote synchronization without an agreed design.
- Keep the dark interface restrained, responsive, accessible, and keyboard friendly.

## Pull requests

Use the default pull request template. For a bug fix, use the bug-fix template under `.github/PULL_REQUEST_TEMPLATE/bug_fix.md`.

A pull request should explain the user-visible behavior, architectural impact, tests performed, and any migration or deployment implications. Include screenshots for visual changes.

## Commit messages

Use concise imperative messages. Suggested prefixes:

- `feat:` new user-facing behavior
- `fix:` bug fix
- `docs:` documentation
- `test:` tests
- `refactor:` internal restructuring
- `chore:` tooling and maintenance

## Data integrity

Changes to session/interval transitions require tests for expected behavior and invalid transitions. Never silently discard an interval or reinterpret timestamps in the device timezone.