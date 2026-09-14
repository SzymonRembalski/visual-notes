# Backend delivery plan

## Current checkpoint

- Checkpoint updated September 14, 2026. Git branch `dev` is checked out at Docker-file commit `7b0f3a0`; the backend changes are uncommitted. The user explicitly wants `dev` as the server test environment, with `main` kept for production. No backend deployment, commit or push was performed.
- Implemented a runnable Node.js 24 backend: validated configuration, PostgreSQL pool/lifecycle, versioned migrations, Google OAuth sign-in with state/PKCE/nonce verification, hashed persistent sessions, CSRF protection and protected project/sharing/view routes. Pinned `pg` and `google-auth-library` dependencies and a lockfile are present. Google follows the user's earlier preference; the optional confirmation question had no reply. Live OAuth client configuration is still needed.
- The user confirmed Node.js support and PostgreSQL provisioned separately; our responsibility is to supply database setup/migration scripts. They require separate accounts from the first server release, with projects shareable among multiple accounts.
- Migrations 001 and 002, SQL verification and restricted-runtime grants are supplied in `server/db/`. They create application tables in an existing database, not databases or database logins. The Node migration runner applies them explicitly; startup only checks versions. The schema stores accounts, identities, owned projects, editor/viewer members, separate personal views, hashed sessions and short-lived login flows.
- Actual PostgreSQL 18.4 verification now passes using temporary localhost clusters from the development-only `embedded-postgres` package. Covered: migration reruns, constraints, project/account isolation, conflicting saves, revocation racing a save, retry-safe project creation, restricted runtime permissions, session behavior, HTTP protections and persistence across both backend-process and database restarts. Google responses are substituted in authentication-flow tests; live Google sign-in is not claimed tested.
- Docker on `dev` now runs the Node service as an unprivileged user, copies only intended files and exposes only allowed frontend paths. Compose uses a distinct project/service name `visual-notes-dev`, port 3000, a private runtime env file, read-only filesystem and the existing external proxy network. Configure the test hostname to target this service on port 3000; production's previous nginx service uses port 80. Docker is not installed here, so image build and proxy/branch routing remain server deployment checks.
- Configuration precedence is CLI > environment > explicitly selected `.env` file > defaults. The loader validates the listen address, port, environment and required PostgreSQL URL; the check command does not print database credentials or connect to a database. No file is loaded implicitly, and actual configuration files must live outside the public web directory.
- `visual-notes.js` no longer accesses `localStorage` or `ProjectManager` directly. `BoardStorage` owns board reads and writes. `ProjectManager` still handles the local project collection used by the gallery.
- `BoardStorage.getDocument(board)` returns title, notes, connections, shapes, drawings and coordinate version. `getView(board)` returns camera position, zoom, snapping and drawing visibility. Selection, tools, history and other temporary interaction state are excluded.
- Current browser storage and backup formats remain flat and compatible: the local adapter combines document and view when saving. The server API supports separate personal views, but the browser adapter is not connected to it yet.
- The gallery/canvas frontend is unchanged and still saves locally. Account/sharing UI, queued asynchronous saving, local import and per-project backups remain unfinished. The backend API itself is operational and documented in `server/api.md`; setup and deployment steps are in `server/README.md`.
- Existing local data is read when a board is opened, rather than when the controller script is evaluated. A valid named project can therefore open even if unrelated legacy-board JSON is malformed. Malformed active legacy data still raises an error and is not replaced.

## Storage contract and asynchronous transition

`BoardStorage.load(projectId)` reads a named project, or the legacy board when no project ID is supplied. Missing named projects return null. Legacy non-JSON values retain their old string/null representation; the controller preserves the distinct legacy and project migration rules.

`BoardStorage.save(projectId, document, view)` serializes synchronously. Existing named-project metadata is preserved and other projects are unchanged. Both data projections contain live arrays: they are not immutable snapshots. Before introducing network saving, copy the outgoing payload at enqueue time, serialize writes per project, retain edits made during requests and prevent stale responses from clearing newer dirty state.

The next phase must also make project list/create/load/delete and board initialization asynchronous, normalize the legacy adapter's raw values into a common backend model, surface load failures without saving empty defaults, and acknowledge server saves only after persistence succeeds. `saveBeforeNavigation`, manual saving, export and backup entry points need review under that asynchronous contract. Do not substitute an async function into the current synchronous lifecycle without these changes.

## Deployment isolation

1. Confirm production's deployed revision and the hosting/deployment mechanism.
2. `dev` is published; confirm/configure the test server to follow it.
3. Keep production on `main`. Use separate databases, credentials, backup destinations and session configuration in each environment.
4. Verify branch filters before the first deployment. Creating a branch does not configure deployment isolation.
5. Prepare commits for the user to push. Promote the tested release to `main` only when requested, with code/database recovery instructions.

## Three-day target

| Day | Work | Acceptance checkpoint |
| --- | --- | --- |
| 1 | Bounded cleanup; environment isolation; backend configuration and database migrations; account authentication and project permissions/API | A project saved through the protected API survives a backend restart |
| 2 | Frontend integration and local-data import; ordered saving, failure recovery and revision conflicts; individual project backups | Another authorized browser opens the saved board; one project restores independently |
| 3 | Failure/concurrency/permission tests, large boards and images, restore drill, deployment verification and release preparation | Tested release with setup and rollback instructions; contingency time retained |

Confirmed backend stack: Node.js and separately provisioned PostgreSQL. Hosting-specific deployment details remain to be confirmed. Keep backend configuration, API routes, persistence, migrations, backup jobs and tests separate. Use one database row per project, containing board JSON, ownership, schema/revision numbers and timestamps. Keep personal view state separate. Check owner/access rights on every project and backup operation. Separate accounts and sharing are required in the first release: owners manage access/deletion, editors can save, viewers can read. The database schema stores these roles; the protected API must enforce them.

Configuration: command-line options override environment variables, then optional `.env`, then defaults. Use command-line flags for non-secret settings and configuration paths; secrets stay server-side in environment/configuration. Add startup validation, ignored secret files and a non-secret example configuration. Production and test use independent values.

Import existing browser data explicitly, preserve local originals, record completed imports to make retries safe, and retain existing node/connection IDs. Support old workspace-backup import. Confirm whether tasks and account settings are included in this deadline.

Backups: one versioned artifact per project ID/revision, including images; manual export, scheduled snapshots and retention; snapshot before destructive restoration; no unrelated projects or credentials. Store outside public/deployment folders with an independent recovery copy. Prove restoration of one project leaves the others unchanged.

## Concurrent access

For the first server-saving release, compare the client's expected project revision and update the database atomically. Reject stale saves, retain local edits, and offer reload or a separate copy. Do not silently overwrite another editor's work. Implement account authentication and owner/editor/viewer enforcement before exposing saving. Serialize saves and sharing changes using a project row lock; recheck membership after taking the lock so revoked editors cannot save afterward.

Implemented authentication: backend-verified Google identities linked to stable internal account IDs and secure sessions. Public HTTPS requires secure host-only cookies; HTTP localhost uses separate development cookies. Only `openid profile` scopes are requested. The sharing API grants access by existing account ID; no email/global-account search or invitations are implemented. Build clear account-ID sharing controls in the frontend unless the user requests an invitation flow.

Later: presence/reconnect handling with connection IDs distinct from authentication sessions; individual editing operations; explicit same-field conflicts or a text-merging library. Collaborative undo must affect only the user's own operations. Before operation-level multiwriter editing, introduce globally unique entity IDs and migrate numeric-only connection-key assumptions. Until then, whole-document saves must reject stale revisions and retain local edits.

## Verification and handoff

Install dependencies with `npm ci`. `npm test` passes all 20 storage/configuration/payload tests. `npm run test:database` passes nine database/API scenarios (10 tests including their parent) and a separate database restart durability check. It provisions/removes a temporary local PostgreSQL cluster; no server credentials are required. Dependency installation reported zero audit vulnerabilities. Docker and live Google tests remain pending deployment configuration.

Workspace tooling: Node is available, but npm is not on PATH. A temporary npm CLI was obtained at `C:/Users/szymo/AppData/Local/Temp/visual-notes-npm/package/bin/npm-cli.js`; use `node` with that path if still present, or a normal npm installation. Database integration tests require escalation in this Windows sandbox because PostgreSQL cannot initialize under its sandbox account. No host database service or OS user is installed. All helper processes launch hidden; tests shut down and delete only their own temporary cluster. A Windows signaled-process cleanup hang was fixed and the full expanded suite rerun successfully.

Current cleanup verification: all 12 storage tests passed, along with nine existing browser checks covering backups, cleanup regressions, projects, drawings, PNG export, centering, arrow movement, connection-preserving deletion and project-title persistence. JavaScript syntax and whitespace checks passed.

Also run the existing browser regression checks for gallery navigation, backups, drawings/visibility, PNG export, camera migration, title persistence, undo/redo and connection-preserving deletion. Those older browser scripts currently live in the developer scratch workspace; migrate necessary coverage into portable repository tests as the backend tooling is introduced.

Keep each checkpoint working and reviewable. Check allowance at milestones and retain roughly 15% for testing, handoff and a user-requested commit. Do not redeem reset credits without authorization.

## Resume here

Node.js, separately provisioned PostgreSQL, separate accounts, project sharing and `dev` as the test environment are confirmed. Do not ask these questions again. Google OAuth credentials, deployment routing, tasks/settings scope and backup destination/retention still need resolution at their relevant steps. Never request credentials in chat; use private environment files/deployment secrets.

1. Read this checkpoint and inspect the working tree on `dev`. Preserve the uncommitted backend. Check usage before selecting the next batch. Keep production/main unchanged.
2. Connect the browser gallery/canvas to the existing API: sign-in/out/account controls; local/server project distinction; paginated summaries; create/open/delete/share; readonly viewer behavior; async initial load that never overwrites on failure; copied/ordered save queues and revision conflicts retaining local edits. Revisions are decimal strings. See `server/api.md` for the exact contract.
3. Review manual-save, save-before-navigation, export, undo and backup interactions under asynchronous saving. Do not claim Saved until persistence succeeds, or let an older response clear newer dirty state. Preserve file:// operation and existing local projects.
4. Add explicit retry-safe local import using a stable request UUID per imported project; preserve local originals, legacy coordinate behavior, images and drawings. Invalid payloads must surface errors without losing local data. Server validation rejects duplicate IDs, dangling connections and malformed geometry; import may need a reviewed normalization step.
5. Add independent per-project backups, storage/retention configuration, snapshot-before-restore, scheduled/manual backup and restore isolation tests. This is still required by the original three-day target. Then use the deployment instructions for the configured test database, Google client, Docker image and proxy. No live credentials or deployment access have been supplied yet.
6. Update this document with implementation decisions, commands/test outcomes, remaining work and any blockers before handing off. Commit when the user requests it; the user handles pushes unless explicitly requesting otherwise.
