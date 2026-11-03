# Still

A minimal, offline-first study-time tracker.

Still records focused study time through explicit sessions and active intervals. Paused time is excluded. The first release is a locally persistent Progressive Web App; cross-device synchronization and analytics are planned separately.

## Project status

The repository is being initialized. See [System Design](docs/SYSTEM_DESIGN.md) for the product and architecture decisions.

## Development

Requirements: Node.js 22.12+ and npm.

```sh
npm install
npm run dev
npm run check
npm test
npm run build
```

## Deployment

The production deployment workflow publishes the static PWA to GitHub Pages on pushes to the repository's default branch (`main`). The repository's Pages source must be set to **GitHub Actions**, and the repository/account must support Pages for a private repository.

## Product decisions

- Local-first persistence with IndexedDB.
- One running session at a time; any number of paused or completed sessions.
- Sessions contain one or more active intervals.
- The reporting timezone initially defaults to `Asia/Tehran`.
- On recovery of an interrupted running session, the user decides whether to include time since the last checkpoint.
- Every user change is saved automatically.
- Analytics and remote synchronization are out of scope for the first release.
