# Still

A minimal, offline-first study-time tracker.

Still records focused study time through explicit sessions and active intervals. Paused time is excluded. The first release is a locally persistent Progressive Web App; cross-device synchronization and analytics are planned separately.

## Features

- Live clock and daily accounting in `Asia/Tehran`.
- Start, pause, resume, and stop study sessions.
- Multiple independent sessions per day; one running session per local database.
- Editable session names and notes with automatic local saving.
- Canonical activity catalog with normalized autocomplete, typo suggestions, and inline activity creation.
- Activity management in Settings, including rename, archive, and restore.
- Interrupted-session recovery: choose whether to include time since the last persisted checkpoint.
- Day-grouped history, including intervals split across Iran-local midnight.
- IndexedDB persistence and offline PWA application shell.
- Responsive dark interface for desktop and mobile browsers.

## Development

Requirements: Node.js 22.12+ and npm.

```sh
npm install
npm run dev
npm run check
npm test
npm run test:coverage
npm run build
```

## Architecture

See [System Design](docs/SYSTEM_DESIGN.md) and [Contributing](CONTRIBUTING.md).

The UI talks to a session repository. Dexie/IndexedDB stores sessions, active intervals, and canonical activities. Duration is calculated from timestamps, not a counter persisted every second.

## Deployment

GitHub Actions runs type-checking, tests, and a production build for every branch push and pull request. A successful push to `main` additionally deploys to GitHub Pages.

Set the repository's Pages source to **GitHub Actions**. This repository is public. GitHub Pages can be enabled in repository settings with GitHub Actions as the deployment source. If Pages is unavailable, the same `dist/` output can be hosted on any static HTTPS host.

## Product decisions

- Local-first persistence; no account or remote synchronization in the first release.
- One running session per local database; any number of paused/completed sessions.
- Sessions contain one or more active intervals.
- All timestamps are stored as epoch milliseconds; Iran time is used for reporting.
- On recovery, the user decides whether time since the last persisted checkpoint counts.
- Every user-facing change is automatically saved locally.
- Analytics, remote sync, and cloud backups are deferred.