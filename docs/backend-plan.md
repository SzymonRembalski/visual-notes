# Backend delivery plan

## Current checkpoint

- Cleanup is implemented on Git branch `dev`, created from `a13bb3a`. No branch push or deployment configuration has been performed at this checkpoint.
- `visual-notes.js` no longer accesses `localStorage` or `ProjectManager` directly. `BoardStorage` owns board reads and writes. `ProjectManager` still handles the local project collection used by the gallery.
- `BoardStorage.getDocument(board)` returns title, notes, connections, shapes, drawings and coordinate version. `getView(board)` returns camera position, zoom, snapping and drawing visibility. Selection, tools, history and other temporary interaction state are excluded.
- Current browser storage and backup formats remain flat and compatible: the local adapter combines document and view when saving. Personal views are not yet stored separately on the server.
- Loading/migration orchestration, rendering, undo/redo and save-status UI remain in the controller. No backend or database exists yet.
- Existing local data is read when a board is opened, rather than when the controller script is evaluated. A valid named project can therefore open even if unrelated legacy-board JSON is malformed. Malformed active legacy data still raises an error and is not replaced.

## Storage contract and asynchronous transition

`BoardStorage.load(projectId)` reads a named project, or the legacy board when no project ID is supplied. Missing named projects return null. Legacy non-JSON values retain their old string/null representation; the controller preserves the distinct legacy and project migration rules.

`BoardStorage.save(projectId, document, view)` serializes synchronously. Existing named-project metadata is preserved and other projects are unchanged. Both data projections contain live arrays: they are not immutable snapshots. Before introducing network saving, copy the outgoing payload at enqueue time, serialize writes per project, retain edits made during requests and prevent stale responses from clearing newer dirty state.

The next phase must also make project list/create/load/delete and board initialization asynchronous, normalize the legacy adapter's raw values into a common backend model, surface load failures without saving empty defaults, and acknowledge server saves only after persistence succeeds. `saveBeforeNavigation`, manual saving, export and backup entry points need review under that asynchronous contract. Do not substitute an async function into the current synchronous lifecycle without these changes.

## Deployment isolation

1. Confirm production's deployed revision and the hosting/deployment mechanism.
2. Publish `dev` when the user is ready; configure the test server to follow it.
3. Keep production on `main`. Use separate databases, credentials, backup destinations and session configuration in each environment.
4. Verify branch filters before the first deployment. Creating a branch does not configure deployment isolation.
5. Prepare commits for the user to push. Promote the tested release to `main` only when requested, with code/database recovery instructions.

## Three-day target

| Day | Work | Acceptance checkpoint |
| --- | --- | --- |
| 1 | Bounded cleanup; environment isolation; backend configuration and database migrations; restricted access and project API | A project saved through the API survives a backend restart |
| 2 | Frontend integration and local-data import; ordered saving, failure recovery and revision conflicts; individual project backups | Another authorized browser opens the saved board; one project restores independently |
| 3 | Failure/concurrency/permission tests, large boards and images, restore drill, deployment verification and release preparation | Tested release with setup and rollback instructions; contingency time retained |

Provisional backend: Node.js and PostgreSQL, pending hosting details. Keep backend configuration, API routes, persistence, migrations, backup jobs and tests separate. Start with one database row per project, containing board JSON, ownership, schema/revision numbers and timestamps. Keep personal view state separate. Check owner/access rights on every project and backup operation.

Configuration: command-line options override environment variables, then optional `.env`, then defaults. Use command-line flags for non-secret settings and configuration paths; secrets stay server-side in environment/configuration. Add startup validation, ignored secret files and a non-secret example configuration. Production and test use independent values.

Import existing browser data explicitly, preserve local originals, record completed imports to make retries safe, and retain existing node/connection IDs. Support old workspace-backup import. Confirm whether tasks and account settings are included in this deadline.

Backups: one versioned artifact per project ID/revision, including images; manual export, scheduled snapshots and retention; snapshot before destructive restoration; no unrelated projects or credentials. Store outside public/deployment folders with an independent recovery copy. Prove restoration of one project leaves the others unchanged.

## Concurrent access

For the first server-saving release, compare the client's expected project revision and update the database atomically. Reject stale saves, retain local edits, and offer reload or a separate copy. Do not silently overwrite another editor's work. Use restricted access until the production authentication model is confirmed.

Later: Google identity verified on the backend; stable internal user IDs linked to Google `sub`; owner/editor/viewer membership; secure sessions distinct from board connection IDs; presence/reconnect handling; individual editing operations; explicit same-field conflicts or a text-merging library. Collaborative undo must affect only the user's own operations. Before multiwriter editing, introduce globally unique entity IDs and migrate numeric-only connection-key assumptions.

## Verification and handoff

Run the portable storage tests with `node --test tests/board-storage.test.cjs` (Node.js; no third-party test dependencies). They cover payload separation, local/named round-trips, metadata and project isolation, legacy/named coordinate migration, malformed-data isolation, suspended persistence and failed writes.

Current cleanup verification: all 12 storage tests passed, along with nine existing browser checks covering backups, cleanup regressions, projects, drawings, PNG export, centering, arrow movement, connection-preserving deletion and project-title persistence. JavaScript syntax and whitespace checks passed.

Also run the existing browser regression checks for gallery navigation, backups, drawings/visibility, PNG export, camera migration, title persistence, undo/redo and connection-preserving deletion. Those older browser scripts currently live in the developer scratch workspace; migrate necessary coverage into portable repository tests as the backend tooling is introduced.

Keep each checkpoint working and reviewable. Check allowance at milestones and retain roughly 15% for testing, handoff and a user-requested commit. Do not redeem reset credits without authorization.

Unresolved before backend implementation: production/test hosting and available database, initial access model, inclusion of tasks/settings, backup destination and retention. These do not block the completed local-storage cleanup.
