# Still — System Design

**Status:** Initial architecture baseline  
**Timezone:** `Asia/Tehran`  
**Application model:** Offline-first Progressive Web App  
**Scope:** Local persistence and session tracking. Remote synchronization and analytics are intentionally deferred.

## 1. Product goals

Still measures deliberate study time without counting unrelated activity or breaks.

The application must:

- Show a live clock in Iran time and a separate accumulated study timer.
- Support starting, pausing, resuming, and stopping sessions.
- Allow multiple independent sessions per calendar day, while allowing at most one running session at a time.
- Support editable session titles and notes.
- Persist every user change automatically.
- Restore a running session after application restart by asking whether time since its last checkpoint should count.
- Browse previous days and sessions.
- Work offline and install on Android, iOS, Windows, and Linux through supported browsers.
- Keep a clean boundary for future remote synchronization and analytics.

## 2. Non-goals for the first release

- Accounts, remote API, multi-device synchronization, and cloud backups.
- Analytics dashboards and goal-setting.
- Native mobile applications.
- Team, social, or shared sessions.

## 3. Architecture

The application is divided into four boundaries:

1. **Presentation:** React pages and components. It renders state and dispatches user actions.
2. **Domain:** Session lifecycle rules, interval calculations, timezone-aware day attribution, and formatting.
3. **Persistence:** Repository functions and Dexie-backed IndexedDB tables.
4. **Platform:** PWA manifest, service worker, cached static assets, and browser lifecycle events.

The UI must not issue IndexedDB queries directly. It calls repository methods. Domain calculations are pure TypeScript and are testable without React or a browser UI.

### Dependency direction

```text
React UI
   |
   v
Application / repository API
   |
   +------> Session domain rules
   |
   v
Dexie repositories
   |
   v
IndexedDB
```

A future remote repository/synchronization adapter can be added behind the repository boundary. IndexedDB remains the local source of truth for offline operation.

## 4. Session lifecycle

A session has one of three states:

| State | Meaning | Allowed transitions |
|---|---|---|
| Running | One active interval is open | Pause, Stop |
| Paused | No interval is open | Resume, Stop |
| Completed | Session is finalized | Read and edit title/note |

Start creates a session and its first interval in one IndexedDB transaction. Pause closes the open interval and changes the session to paused in one transaction. Resume creates a new interval and changes the session to running in one transaction. Stop closes the open interval, if present, and finalizes the session in one transaction.

A transaction checks for another running session before starting or resuming. This serializes competing read/write operations across tabs using IndexedDB transaction semantics.

The application permits many paused/completed sessions but at most one running session per local database.

## 5. Time accounting

A session is a logical activity. An interval represents one uninterrupted active period.

Duration is derived, never incremented and persisted every second:

```text
session duration = sum(interval end - interval start)
```

For an open interval, the current timestamp is used for display and live totals. The timer uses wall-clock timestamps, so browser throttling and suspended UI intervals do not lose elapsed time.

The UI may refresh frequently, but refreshes are not the source of truth and do not write a database record.

### Checkpoints and interrupted sessions

While a session is running, the application persists a checkpoint every 30 seconds. It also attempts a checkpoint on page hide and when the document becomes hidden.

On startup, if a running session with an open interval exists, the app blocks normal interaction and asks:

- **Count the time and continue:** keep the open interval and move the checkpoint to the recovery time.
- **Exclude the gap and pause:** close the interval at its last persisted checkpoint and change the session to paused.

Time before the checkpoint is retained in either case. The gap after the checkpoint is included only when the user explicitly chooses it.

A checkpoint is best-effort: browser/process termination can happen before a lifecycle callback runs. The recovery choice makes that uncertainty explicit.

## 6. Data model

### StudySession

| Field | Type | Meaning |
|---|---|---|
| id | UUID string | Stable identifier |
| activityId | UUID string | Stable canonical activity reference |
| title | string | Historical display-name snapshot; never rewritten by activity rename |
| note | string | User-authored session note |
| status | enum | running, paused, completed |
| startedAt | epoch milliseconds | First start instant |
| endedAt | epoch milliseconds or null | Stop instant |
| timezone | IANA timezone | Reporting timezone captured at creation |
| createdAt | epoch milliseconds | Record creation |
| updatedAt | epoch milliseconds | Last edit/transition |

### StudyActivity

| Field | Type | Meaning |
|---|---|---|
| id | UUID string | Stable activity identity |
| name | string | Canonical display name |
| normalizedName | string | Deterministic normalized unique key |
| createdAt / updatedAt | epoch milliseconds | Record timestamps |
| archivedAt | epoch milliseconds or null | Soft-archive timestamp |

### StudyInterval

| Field | Type | Meaning |
|---|---|---|
| id | UUID string | Stable identifier |
| sessionId | UUID string | Parent session |
| startedAt | epoch milliseconds | Active interval start |
| endedAt | epoch milliseconds or null | Active interval end; null while running |
| checkpointAt | epoch milliseconds | Last persisted recovery checkpoint |

All timestamps represent absolute instants (epoch milliseconds). The timezone is used for display and calendar attribution, not to reinterpret stored timestamps.

### Integrity invariants

- A session has zero or more intervals.
- A running session has exactly one open interval.
- A paused or completed session has no open intervals.
- An interval belongs to exactly one session.
- An interval end cannot precede its start.
- There is at most one running session in a local database.
- Session duration is derived from intervals.
- Title/note changes do not mutate time intervals.

### Activity catalog and migration

Activities are canonical categories; sessions remain independent timed records. The activity matcher is pure TypeScript and applies normalization, exact matching, prefix/token matching, and conservative Damerau-Levenshtein suggestions. Suggestions are never silently accepted. Unknown names can be created inline, and ambiguous matches require explicit selection.

The activities table enforces a unique normalized name. Renames retain activity identity, while session title snapshots remain unchanged. Activities are archived rather than deleted so historical sessions keep valid references. Their normalized names remain reserved while archived, preventing duplicate activity identities and allowing restoration without collisions. Session activity changes update the activity ID and title snapshot in a transaction and do not mutate intervals.

IndexedDB schema version 2 migrates existing sessions transactionally: equivalent normalized titles share one activity, each original title snapshot is preserved, and blank or unusable legacy titles point to an `Uncategorized` activity. Any failed migration rolls back with the schema transaction.

## 7. Calendar and timezone policy

The default reporting timezone is `Asia/Tehran`, independent of the device timezone. The current clock, date headings, history grouping, and daily totals use the configured reporting timezone.

Raw timestamps remain epoch instants. An interval crossing local midnight is split into daily slices for aggregation while remaining one interval in the original session.

The first release captures the reporting timezone on session creation. A future timezone setting will need a deliberate policy for reinterpreting historical day boundaries.

## 8. Local persistence

Dexie.js wraps IndexedDB. Initial schema:

- `sessions`: session records; indexes for activity, status, start, end, and update time.
- `intervals`: interval records; indexes for session, start, end, and checkpoint.
- `activities`: canonical activity records with a unique normalized-name index, display-name index, creation time, and archive timestamp.

All lifecycle transitions that touch both tables run in a single read/write transaction.

User changes are saved automatically. The PWA service worker caches application assets only; it is not the user-data database.

A JSON export/import feature is planned as a backup safeguard. Browser persistence is not equivalent to a guaranteed backup: users can clear site data, uninstall browsers, or lose devices.

## 9. PWA and platform strategy

One responsive React application is served as a PWA. Static app assets are cached for offline startup; IndexedDB stores sessions and intervals. The app must not rely on a network request to start, pause, resume, stop, or browse local history.

Installation and background behavior varies by browser and OS. The timer therefore does not rely on background JavaScript execution. It computes elapsed time from timestamps when the UI wakes.

## 10. Future synchronization boundary

Remote synchronization is deferred, but the local model uses stable UUIDs and update timestamps to support it.

Before synchronization ships, add:

- Account and device identity.
- A change outbox and incremental sync cursor.
- Soft deletion/tombstones.
- Record revisions and conflict policy.
- Server-side enforcement of one running session per account.
- Explicit handling of simultaneous offline sessions on separate devices.

A naive last-write-wins merge is not sufficient for interval histories. Concurrent edits to a session's note/title and concurrent interval transitions need distinct conflict policies.

## 11. Error and recovery behavior

- Database open or write failures are surfaced; the UI must not claim a change is saved if the transaction failed.
- An invalid running session without an open interval is repaired to paused on startup.
- A failed transition leaves the prior state unchanged because the update is transactional.
- The user is asked how to account for the uncheckpointed gap after a restart.
- The user can export local data before any future migration or synchronization operation.

## 12. Testing strategy

- Pure unit tests for duration, formatting, and timezone/day splitting.
- Repository tests against fake IndexedDB for lifecycle transactions, single-running-session invariant, and recovery.
- IndexedDB version-upgrade integration tests for transactional activity migration and interval preservation.
- React interaction tests for autocomplete selection, keyboard behavior, inline creation, and activity management.
- V8 coverage thresholds for activity domain, migration, and repository modules, enforced in CI.
- Component tests for user flows and keyboard behavior.
- Browser E2E tests for persistence through reload, offline operation, and responsive layouts.
- Manual install/recovery checks on iOS Safari, Android Chrome, desktop Chromium, and Firefox.

## 13. Deployment

GitHub Actions runs type-checking, tests, and a production build on every branch push and pull request. A successful push to the production branch (`main`) additionally deploys the built PWA to GitHub Pages. The repository Pages source must be configured as GitHub Actions, and private-repository Pages availability depends on the account plan.

## 14. Study planning and calendar

Study planning adds two IndexedDB tables in schema version 3: `studyPlans` and `plannedSessions`. Existing session, interval, and activity records are preserved by the additive migration. A planned session can be standalone or belong to one study plan. An actual tracked session links to at most one planned session through `plannedSessionId` and `studySessionId`.

A planned activity stores an ISO calendar date separately from its optional local wall-clock time and IANA timezone. Fixed dates are not changed by automatic recalculation. Relative activities require one predecessor and a positive whole-calendar-day offset. The pure scheduling domain validates the dependency graph and rejects missing nodes, self-links, and cycles. Completion of a linked actual session updates the planned activity and recalculates scheduled relative descendants in the same IndexedDB transaction.

Skipping asks whether to keep downstream dates or remove the skipped node from the dependency chain and recalculate. Rescheduling asks whether dependent relative activities should also move. Completed, skipped, and cancelled activities are not silently overwritten by normal recalculation.

The Calendar page provides month, week, and agenda views, quick standalone planning, and a sequence builder. A completed study session provides a follow-up entry point to create the next learning sequence. Planned activities can be started from the calendar; the existing session timer remains the source of truth for actual time.

### Reminders

Only pre-session reminders are supported. Timed sessions default to a reminder 15 minutes before their start; date-only sessions can specify a reminder time on that date. Reminder preferences and delivery state are stored locally. While the app is open, a lightweight monitor checks due reminders and uses the Notification API if permission has been granted, otherwise it shows an in-app reminder. Permission is requested only after the user selects the notification control.

A static offline-first PWA cannot guarantee delivery while completely closed. The application must not claim that local reminders will fire when the browser or PWA is not running. Reliable closed-app delivery requires a future server-backed Web Push service and is outside this release.

### Planning invariants

- A planned session belongs to at most one plan.
- A planned session produces at most one actual study session.
- A relative planned session has one existing predecessor and a positive integer interval.
- Dependency graphs are acyclic.
- Dates use calendar arithmetic, not fixed 24-hour millisecond increments.
- Completion and downstream recalculation are atomic with the actual session completion.
- Reminder side effects are best-effort and never affect session time accounting.
