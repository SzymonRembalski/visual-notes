# Backend and collaboration handoff

Updated September 14, 2026.

## Current checkpoint

- Work is on `dev`, based on pushed collaboration commit `046ef3b`. The requested small latest-save-wins fix is implemented but not yet committed/pushed. Account integration was committed as `b135071` and deployed. `main` received merge `2510536` and production Compose naming fix `5985646`; keep both branches and develop on `dev`.
- The user confirmed the server database and Google login are configured. Account controls and the initial Google redirect were verified on the test site after correcting an old deployed image. Do not repeat provider/setup questions.
- The user explicitly prioritized live collaboration and moved separate scheduled project backups to the next update. Manual per-project JSON download/import already works and preserves local originals.
- Backend: Node.js 24, PostgreSQL, verified Google identities, hashed persistent sessions, CSRF protection, owner/editor/viewer permissions, project row locks, string revisions, per-account camera views and retry-safe project creation. Existing migrations 001/002 are sufficient; collaboration adds no dependency or schema change.
- Live collaboration: automatic shared edits, named cursors, selected-object outlines, distinct per-tab UUIDs, viewer updates, reconnect recovery and personal undo/redo. Different objects/fields merge. The user requested latest-save-wins on shared fields; simultaneous same-field edits now converge without separate versions or conflict prompts. Character-level simultaneous text merging is not implemented.
- Live edits include pointer dragging, resizing, drawing strokes and title/body typing. Remote rendering keeps active input/drag objects, references and text selection. Camera position, zoom and drawing visibility stay personal. Account-board entity IDs use UUIDs; numeric connection-key assumptions were removed. Legacy stroke IDs are normalized deterministically.

## Implementation map

- `assets/js/server-api.js`: authenticated requests, explicit local imports and stable import IDs.
- `assets/js/server-save-queue.js`: copied snapshots and ordered write base, with its original tests retained.
- `assets/js/collaboration-document.js`: shared browser/server field diff, latest-save-wins merge, guarded undo and canonical equality. Each operation carries before/after values; retries whose after-values match are no-ops. Same-field edits use the latest value; undo retains strict guards. Invalid batches still fail atomically. Deleted notes cannot leave dangling edges.
- `assets/js/collaboration-queue.js`: apply acknowledgments/live state while preserving edits made in flight; checkpoint base and pending documents for recovery.
- `assets/js/server-board.js`: authenticated preload, drafts, save status, navigation protection, copy/download and viewer controls. Server boards explicitly use `storage=server`; missing/failed loads never become editable empty boards.
- `assets/js/board-collaboration.js`: SSE client, presence and selections, incremental preservation of active controls, inverse-operation undo and access-loss handling.
- `server/projects.mjs`: all persistent edits use the project row lock and recheck permissions. Whole-document PUT retains strict revision checks; POST edits merges independent field operations and returns the durable canonical document.
- `server/collaboration.mjs`: bounded authenticated SSE connections; ephemeral cursor state; database/session/access rechecks before updates. Document state stays in PostgreSQL.
- `server/http.mjs`: same-origin/CSRF protected edits and presence; streaming endpoint; orderly live-connection shutdown.
- `BoardStorage`, local imports, task manager and local/file:// behavior remain available. Tasks and preferences remain device-local.

## Persistence and recovery contract

`BoardStorage.getDocument/getView` return live references; the queue copies immediately. One writer per tab sends changes at roughly 150 ms intervals, and gesture/presence sampling runs every 180 ms. Server acknowledgments never clear newer pending edits. Remote state is rebased while retaining pending local edits for the next save. Shared-field writes use server arrival order; simultaneous edits no longer pause for conflict recovery. Late field edits to deleted objects are ignored.

Draft key: `visualDraft:<accountId>:<projectId>`. New drafts include the pending document, private view, base document and base revision. Restoring requires explicit retry/copy. Older drafts without a base may retry only against their exact server revision. Viewer/revoked-account drafts cannot overwrite shared documents. Navigation waits for saving; failed saves require confirmation plus a working recovery draft or matching download before leaving. Browser-close prompts protect pending edits. Storage failures are surfaced.

Undo/redo records only local operations. It preserves unrelated remote changes and refuses to overwrite a field another person subsequently changed. It is transient per tab and does not persist across reloads.

## Deployment

- `dev`: `visual-notes-dev:3000`, test database/env file. `main`: `visual-notes:3000`, production database/env file. Preserve branch-specific Compose identities during future merges.
- The development workflow targets Portainer stack 16, explicitly `refs/heads/dev`, with a private dev env-file path. Production targets stack 12 and `refs/heads/main`. Keep existing deployment workflows and credentials private.
- No new migration, dependency, or OAuth change for collaboration. Rebuild/redeploy the image and verify on the test origin after a user-requested commit/push. Never claim the new release is deployed from local tests alone.
- Live updates use SSE at `/api/projects/:id/live`, with authenticated POST edits/presence. No WebSocket setting is needed. Proxy streaming must not be buffered/cached; the endpoint emits `X-Accel-Buffering: no` and regular heartbeat/presence events.
- One backend process per deployment is supported, as in Compose. Presence is in memory and disappears on restart. Multiple replicas require shared presence transport before deployment; documents are durable in PostgreSQL.
- Limits: 50 live connections per project, eight per account, 500 per process. Session/role rechecks run on updates, with a periodic database check roughly every second. Slow consumers are disconnected when buffered output grows beyond the configured bound. Read `server/README.md` and `server/api.md` for routes and deployment details.

## Verification

- All 33 unit tests pass: existing 25 storage/config/validation/save-queue tests plus eight collaboration tests for disjoint merges, latest-field writes, retry behavior, legacy drawings, safe IDs, personal undo, in-flight edits and draft bases.
- `node tests/run-database-tests.mjs` passes: disposable PostgreSQL; nine backend scenarios, eight account/browser scenarios, and nine live collaboration scenarios; separate PostgreSQL restart durability check. Existing browser tests now target the edits route and deliberately pause their live stream when testing a stale save.
- New real-browser scenarios cover editor/viewer presence and cursors, independent cameras, concurrent UUID creation, focus-preserving remote changes, personal undo/redo, groups/strokes/connections/deletion, actual dragging and title typing before release, offline merge, simultaneous same-field convergence, permission revocation and session expiry. Tests seed temporary sessions and never use live Google credentials.
- Seven existing local browser scripts passed: gallery redesign, drawing, local backups, arrow movement, connection-preserving deletion, image export and cleanup regressions.
- Browser/database tests need escalation in this Windows sandbox. Node 24 and installed Chrome are available. The runner creates an isolated localhost PostgreSQL cluster, stops it and deletes only its verified temporary directory. Docker is unavailable here; deployed proxy streaming remains a server-side smoke test.

## Resume / next update

1. Implementation and final verification are complete, including a desktop cursor/selection visual check. Commit the small latest-save-wins follow-up on `dev` when requested. The user normally pushes unless explicitly asking us to push. Do not automatically deploy or merge to `main`.
2. After deployment, open a shared disposable board from two accounts on the test origin and verify cursors, live changes, viewer restrictions and reconnect behavior through the actual proxy.
3. Next planned release: independent scheduled server project backups, private backup destination/retention configuration, pre-restore snapshots, isolated restoration and a restore drill. Manual JSON downloads do not replace automatic backups.
4. Character-level text merging and multi-instance presence transport are possible later improvements, not part of this first collaboration release.
5. Keep progress documented. Check account allowance at milestones and reserve room for testing/handoff/commits. Never redeem reset credits without explicit authorization. The last check during this implementation showed 34% of the five-hour window used; do not treat that number as current indefinitely.
