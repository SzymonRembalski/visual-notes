# Server diagnostics

The application writes JSON diagnostic events to standard output, available in the server container's **Logs** in Portainer. With the development Compose environment configured, the same output is available using:

```sh
docker compose logs --since 30m visual-notes-dev
docker compose logs --follow visual-notes-dev
```

Rebuild and redeploy the updated image first. The Compose configuration rotates container logs at 10 MB and keeps up to three files. These are operational logs, not project backups or a permanent audit archive.

## Investigating a missing shared project

1. Record the project link, recipient's sharing code and approximate time. Confirm both people are using the same server and the recipient has **My account** selected with the search cleared.
2. Find `project.sharing` for the project ID. `userId` identifies the owner making the request; `memberId` identifies the recipient. Status `200` with role `editor` or `viewer` means the permission was saved. Role `removed` means access was revoked. A failed attempt records its HTTP status instead.
3. Find `projects.list` for the recipient's `userId`. Its bounded `projectIds` array records the projects returned on that page; `offset` identifies pagination. This distinguishes a missing server result from a displayed list or account problem.
4. If the friend opens the direct link, `project.open` records the result. `project.deleted` records deletion requests. An error in the sharing dialog shows a reference matching the log's `requestId`, also returned in the `X-Request-ID` response header.

Common statuses: `400` invalid input, `401` sign-in required, `403` insufficient access or rejected request origin/CSRF token, `404` unavailable project/account, and `5xx` server/database failure. Internal errors record safe codes such as `ECONNREFUSED` or a PostgreSQL SQLSTATE; raw database error messages are excluded.

Normal sharing, project creation/opening/deletion and list requests are logged. Request failures and slow responses (at least one second) are logged across endpoints. Successful high-frequency edits, cursor updates and normal health checks are omitted to keep logs useful. `live.unavailable` records live-stream access failures and interruptions; `session.cleanup_failed` records background cleanup failures.

Logs contain timestamps, server-generated request IDs, account/project/member IDs, route names, status, duration and relevant roles/list IDs. They exclude project titles/content, request bodies, raw URLs/query strings, cookies, authorization headers, Google tokens and connection strings. Access to container logs should stay with server administrators. Logs begin after deployment; they cannot reconstruct a deleted project's earlier sharing history.
