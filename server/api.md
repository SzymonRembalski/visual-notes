# Project API checkpoint

These routes belong to the Node server. The browser gallery/canvas integration is pending; existing local boards are not uploaded automatically.

## Authentication

Visit `GET /auth/google/start` in a browser to sign in. The backend checks one-use, cookie-bound state, PKCE and the verified ID token's nonce. Successful sign-in creates or reuses the internal account and rotates that browser's session.

`GET /api/session` returns `{ "user": null }` when signed out, or `{ "user": { "id", "displayName", "csrfToken" } }`. `id` is the account identifier another owner uses to share a project with this person. No email address or global account search is exposed.

Every project route requires the session cookie. Every write also requires the exact configured `Origin` and `X-CSRF-Token` from `/api/session`. Send JSON bodies with `Content-Type: application/json`. `POST /api/logout` revokes the session and clears its cookie. Cookies are HttpOnly; browser code must not read or store session tokens itself.

## Routes

| Method and route | Body / result | Access |
| --- | --- | --- |
| `GET /api/projects?offset=0` | `{ projects, nextOffset }`, at most 100 summaries; continue until `nextOffset` is null | Owned/shared projects only |
| `POST /api/projects` | `{ requestId, document }` → project | Signed-in account becomes owner |
| `GET /api/projects/:id` | Full project, document, personal view, role and revision | Owner/editor/viewer |
| `PUT /api/projects/:id` | `{ expectedRevision, document }` → `{ revision, modifiedAt }` | Owner/editor |
| `DELETE /api/projects/:id` | `{ expectedRevision }` | Owner |
| `PUT /api/projects/:id/view` | Personal camera/preference object | Owner/editor/viewer |
| `GET /api/projects/:id/members` | `{ ownerId, members }` | Owner |
| `PUT /api/projects/:id/members/:accountId` | `{ role: "editor" }` or `{ role: "viewer" }` | Owner |
| `DELETE /api/projects/:id/members/:accountId` | No body; removes access and that account's saved view | Owner |

Project/account IDs and creation request IDs are UUIDs. Reuse the same creation `requestId` when retrying a failed request/import: the same owner receives the original project, preserving subsequent edits. Use a new request ID for a new project or intentional copy. Owner, timestamps and revisions are controlled by the server.

Revisions are **decimal strings**, starting at `"1"`. Saves lock the project row, check current access and revision, then update atomically. A concurrent stale save gets HTTP 409 with `currentRevision`. Keep unsaved local edits until the user reloads or saves a separate copy; never silently resend against a newer revision. A successful save's revision must not clear edits made while that request was running.

Lists are paginated summaries (no full board arrays). Each full project includes `id`, `ownerId`, `document`, `view`, `revision`, `schemaVersion`, `createdAt`, `modifiedAt` and the caller's `role`. Sorting/pagination is by last modification; refresh from offset 0 if projects change during paging.

## Document and view

```json
{
  "title": "My project",
  "coordinateVersion": 2,
  "notes": [],
  "connections": [],
  "shapes": [],
  "drawings": []
}
```

Documents accept coordinate versions 1 and 2. The client still performs canvas migrations. Item IDs must be unique within notes/shapes and retain their existing values; connections must refer to existing notes. Coordinates/dimensions, text, image source prefixes, colors and drawings are validated. Limits: 1,000 title characters; 10,000 notes and shapes each; 50,000 connections; 20,000 strokes / 500,000 total points; 16 MB total HTTP JSON body. Invalid data is rejected rather than silently repaired. Import UI must surface validation failures and keep the original local data.

View fields are `panX`, `panY`, `zoom` (0.2–1), `snappingEnabled` and `drawingsVisible`. Views are stored per account and do not change the document revision. Separate tabs using one account share that account's latest saved view. Selection, tools and undo history remain transient client state.

## Errors and test-server checks

Errors use `{ "error": "message" }`: 400 invalid data, 401 signed out/expired session, 403 insufficient role/failed request verification, 404 missing/inaccessible resource, 409 revision conflict, 413 oversized request, 415 unsupported content type, 429 sign-in throttling, 500 unavailable operation. Private SQL, credentials and stack traces are never returned. `/readyz` returns 503 when database/schema checks fail.

After signing in on the **test** origin, this browser-console example creates a disposable empty board through the real API:

```js
const { user } = await fetch('/api/session').then(response => response.json());
const response = await fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrfToken },
  body: JSON.stringify({
    requestId: crypto.randomUUID(),
    document: { title: 'Test-server check', coordinateVersion: 2,
      notes: [], connections: [], shapes: [], drawings: [] }
  })
});
const project = await response.json();
console.log(response.status, project);
```

The browser supplies its own Origin and session cookie. Sign in from a second browser/account, copy its account ID, share the test project through the members route, and verify editor/viewer restrictions. Automated tests cover these rules against a temporary PostgreSQL database; live Google configuration and proxy routing must also be verified on the deployed test server.
