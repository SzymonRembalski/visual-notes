# Backend delivery plan

## Current checkpoint

- Updated September 14, 2026. Work is on `dev`, based on pushed merge `18d2bcb` (backend commit `d8ff86c`). The browser integration is implemented but uncommitted; no push/deployment was performed for this checkpoint. Keep `main` unchanged.
- The user confirms the server database and Google login are configured. Do not repeat setup/provider questions. The user redeemed a reset themselves; do not consume the remaining reset credit without explicit authorization.
- Backend: Node.js 24, PostgreSQL, verified Google identities, hashed persistent sessions, CSRF protection, owner/editor/viewer permissions, atomic revision checking, private per-account views and retry-safe project creation. Migrations 001/002 are unchanged by this frontend checkpoint.
- Browser integration: Projects offers My account / On this device, Google sign-in/out, account sharing codes, owned/shared project lists, create/open/delete/share, explicit local imports and individual project-file imports. Account cards use summaries instead of downloading entire boards for thumbnails. Tasks and application preferences remain local.
- `server-api.js` owns account requests and import IDs; `server-save-queue.js` owns copied snapshots and ordered writes; `server-board.js` owns remote preload, recovery, save status/navigation, per-project download and viewer restrictions. `BoardStorage` retains the synchronous local path and delegates server boards explicitly selected by `storage=server`.
- Account boards are loaded before canvas initialization. Missing/failed/unauthenticated loads remain noneditable, without creating empty replacement projects. Views save separately. Viewers can use camera/export controls, but cannot edit the shared document.
- The save queue debounces requests, allows one writer per board, tracks string revisions and never clears newer pending edits on an older acknowledgment. Failed/conflicting writes retain the latest draft under the account/project key. Restoring a draft requires explicit retry/copy; stale revisions remain rejected. A recovered draft after downgrade to viewer can only be copied/downloaded.
- Save/Ctrl+S on account boards flushes to the server. Navigation waits for saving; failure offers recovery actions and confirmation before leaving with a draft/download. Recovery-storage failures are surfaced. PNG export uses the current canvas. File:// and existing local backup behavior are preserved.
- Manual per-project JSON download/import is available and keeps images/drawings/shapes. Scheduled independent server snapshots, retention, snapshot-before-restore and in-place restoration remain outstanding.
- Test deployment uses the existing `visual-notes-dev` Node service on port 3000. The new frontend needs no additional migration or OAuth configuration. Redeploy after a user-requested commit/push, then verify on the configured test origin. No live server credentials or deployment access were used by these tests.

## Storage contract and asynchronous transition

Local `BoardStorage.load/save` remains synchronous and keeps existing formats/migration behavior. For a URL containing `storage=server`, `ServerBoard.open()` loads the session and project before `VisualNotes.init()`; the controller then reads the preloaded board through the adapter. Failed preload stops initialization.

`BoardStorage.getDocument/getView` still returns live references. The remote queue serializes snapshots immediately, compares them with acknowledged values and sends document/view writes in order. Local writes retain their original behavior. Revisions are strings; a failed view save after a successful document save retains the new document revision for retry.

Recovery drafts are scoped as `visualDraft:<accountId>:<projectId>`. Import request IDs are stored before sending so retries do not duplicate/overwrite projects. Local originals remain intact. Invalid legacy data is rejected with an error rather than silently repaired; old workspace backups can be restored locally and then imported project by project.

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

- `npm test`: 25 storage, configuration, validation and save-queue tests passed.
- `npm run test:database`: nine backend/database scenarios and eight real-browser scenarios pass, plus a separate PostgreSQL restart durability check. Tests cover account project creation/reopen, image/drawing/group persistence, viewer sharing, conflicts/draft recovery, local/file import, offline/navigation recovery, signed-out access and failed initial loads.
- Seven existing local browser scripts passed: projects redesign, drawing layer, local backups, arrow movement, connection-preserving deletion, PNG export and cleanup regressions. Desktop/mobile account-gallery screenshots were inspected; mobile content fits the viewport.
- Tests use isolated temporary PostgreSQL 18.4 clusters and browser profiles. Google-flow tests substitute the provider, and browser tests seed temporary sessions; they do not use the deployed Google client or server data. Docker/proxy rollout still needs verification on the test server.
- Node is available locally; npm can be run through `C:/Users/szymo/AppData/Local/Temp/visual-notes-npm/package/bin/npm-cli.js` while that temporary CLI exists. Dev dependencies include embedded PostgreSQL and Playwright. Use installed Chrome on Windows, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or `npx playwright install chromium`. Database/browser tests require escalation in this Windows sandbox. Helpers run hidden and remove only their own temporary cluster.
- Scratch browser regressions and screenshots live under `C:/Users/szymo/.codex/visualizations/2026/09/09/01a086b7-5dd8-77b3-bdeb-ef6577744c88`. Portable new coverage is under `tests/`.
- Keep each checkpoint working and reviewable. Check allowance at milestones and retain roughly 15% for verification/handoff/commits. Never redeem reset credits without authorization.

## Resume here

1. Review the implemented frontend checkpoint and commit on `dev` when requested. The user handles pushes unless explicitly authorizing one. Pushing dev triggers the existing Portainer workflow; its configured credential destination was explicitly approved earlier.
2. After redeployment, verify real Google sign-in, account project saving/reopening and sharing on the configured test origin. Existing environment and migrations remain sufficient.
3. Complete the original remaining priority: independent server project backups, private storage/retention configuration, scheduling, pre-restore snapshots and isolated restoration tests. Manual browser downloads/imports are not a substitute for independent scheduled server backups.
4. Resolve backup destination/retention when implementing that stage. Tasks and account settings still use local storage; confirm scope before moving them server-side.
5. Live presence/operation-level collaboration and collaborative undo remain later work. Whole-document saves currently use conflict rejection; users refresh to see others' updates. Keep preserving unsaved edits and migrate numeric entity-ID assumptions before introducing operation-level multiwriter editing.
6. Update this checkpoint after implementation, verification, commit and deployment changes. Do not restart completed backend/browser integration work.
