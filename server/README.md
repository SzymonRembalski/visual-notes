# Test-server backend

The Node.js backend serves the frontend and a PostgreSQL-backed project API. The gallery and canvas support Google sign-in, account projects, editor/viewer sharing, live changes and cursors, per-account views and ordered server saving. Existing local projects remain available under **On this device**, including when opened directly through `file://`. Scheduled independent server backups are planned for the next update.

## Using account projects

1. Open **Projects**, choose **My account**, and sign in with Google.
2. Create or open a project. The canvas shows **Saved to your account** only after the latest queued changes reach the server. Camera settings are saved separately per account.
3. To share, the other person signs in and selects **Copy my sharing code**. The owner selects **Share** on a project, pastes the code, and chooses **Can edit** or **Can view**. The same dialog can change or remove access. Shared projects appear in the recipient's account list after refresh.
4. To copy an existing local board online, choose **On this device → Save to account** on that project. The original remains local. Retrying the import reuses the account copy rather than duplicating or replacing it.
5. On account boards, **Save → Download this project** exports one project. **Import project file** in the gallery restores it as an account project. Old full-workspace backups must first be restored through a local board's existing Save menu, then imported project by project.

Failed/conflicting saves keep the current edits and, when browser storage permits, a recovery draft scoped to the account and project, including its base document. The recovery panel offers retry, save a separate copy, download, or an explicitly confirmed reload. Changes to different objects or fields merge; conflicting edits to the same field stop with a recovery notice instead of silently replacing someone's work. Normal navigation waits for saving; when saving fails, leaving requires confirmation and a recovery draft or matching download. Browser-close/reload prompts protect pending edits. Reopening an unsaved board offers to restore its draft; a recovered draft requires explicit retry/copy. If editing access changed to viewer, recover the edits through copy/download instead of saving over the shared board.

Viewer boards hide editing tools and block editing input; camera controls and exports remain available. Shared boards show other people's named cursors and selected objects. Edits, drawing strokes and moves appear without refreshing. Each tab has its own presence ID; personal camera state stays separate. Undo/redo applies only the local user's changes and refuses to overwrite a later conflicting edit. Simultaneous edits to the same text field require recovery; character-level text merging is not implemented. Tasks and appearance/shortcut settings remain on the device.

Use `dev` for the test server; production stays on `main`. Configure the deployment service to follow the correct branch. Use separate origins, databases, credentials and OAuth configuration for test and production.

## Live collaboration deployment

No new database migration, dependency or Google configuration is needed for this update. Rebuild and redeploy `dev`, then open one shared test project in two signed-in browsers. Verify cursors, changes before mouse release, viewer access, offline recovery and account revocation on the actual proxy route.

The browser receives a same-origin Server-Sent Events stream at `/api/projects/:id/live` and posts edits/presence through the existing authenticated API. The reverse proxy must pass streaming responses without buffering; the endpoint sends `X-Accel-Buffering: no` and a heartbeat/presence event at least once per second. Do not cache `/api/`. WebSocket support is not required. Browser reconnects fetch current server state and rebase pending changes using their saved before-values.

Run one backend process per deployment, as in the supplied Compose file: cursors/presence are held in memory and disappear on restart. Shared documents remain in PostgreSQL. The stream rechecks sessions and project permissions before each update, and database writes recheck editor rights under the project lock. Permission revocation ends access and keeps unsaved browser drafts. Limits are 50 live connections per project, eight per account and 500 per process. Multiple backend replicas would need shared presence transport before deployment; they are not supported by this presence implementation.

Changes normally travel after roughly 150–300 ms; database polling also catches edits from older clients or another backend within about a second, subject to network and database latency. Every write is durable before acknowledgment. An unchanged retry is a no-op; a retry after someone changed the same field becomes a conflict. Existing whole-document PUT clients keep strict revision checks.

## Configuration

Requires Node.js 24+ and separately provisioned PostgreSQL (14+ syntax; integration tests run on PostgreSQL 18.4). Copy `.env.example` to a private location outside the repository/public directory. Replace all examples with test-environment values. Never put real credentials in Docker build arguments or commit them.

| Setting | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL for the runtime database login; required |
| `APP_ORIGIN` | Exact public HTTPS origin, without trailing slash, e.g. `https://notes-test.example.com` |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret, backend only |
| `NODE_ENV` | `development` by default; `test` and `production` accepted |
| `HOST` | `127.0.0.1` by default; `--host` overrides it |
| `PORT` | `3000` by default; `--port` overrides it |

Command-line options override process environment, then an explicitly selected `--env-file`, then defaults. No file is read implicitly. The loader does not change the process environment. Database credentials have no command-line flags. Configure PostgreSQL TLS/certificate verification through the connection URL and Node's trusted certificates as required by the database provider; do not disable certificate checks to resolve connection errors.

For Google, register `${APP_ORIGIN}/auth/google/callback` as an authorized redirect URI for a **Web application** OAuth client. For a consent screen in Testing status, add the intended test accounts. The backend requests only `openid profile`, verifies ID tokens with Google's library and identifies accounts by Google's stable subject. See [Google's setup documentation](https://developers.google.com/identity/openid-connect/openid-connect).

For local development, `APP_ORIGIN=http://localhost:3000` is accepted when `NODE_ENV` is not `production`. HTTPS uses host-only secure cookies; local HTTP uses separate development cookie names. Sessions expire after seven days and are invalidated on logout. Sign-in state expires after ten minutes; expired records are cleaned every minute. Live Google authentication still needs verification with your OAuth client.

## Database setup and Node startup

Use an administrator/migration login to apply migrations to the existing **test** database, then run the app with a restricted runtime login. [Database instructions](db/README.md) include Node and `psql` commands, verification and runtime grants. Startup checks the schema version and refuses to serve if the database is unavailable or migrations are missing. It never runs migrations automatically.

From the repository root:

```powershell
npm ci
node server/check-config.mjs --env-file C:\private\visual-notes\test.env
npm run db:migrate -- --env-file C:\private\visual-notes\migration.env
npm start -- --env-file C:\private\visual-notes\test.env
```

Use corresponding paths on Linux. The configuration check validates database/listen settings only; server startup additionally requires Google configuration and the public origin. For installs without test tools, use `npm ci --omit=dev --ignore-scripts`.

## Docker Compose test deployment

The test checkout must be on `dev`. Set `VISUAL_NOTES_ENV_FILE` to the absolute private runtime configuration path. Compose reads that file at runtime; it is not part of the image. Example on the Linux server:

```sh
export VISUAL_NOTES_ENV_FILE=/private/visual-notes/test.env
docker compose build
VISUAL_NOTES_ENV_FILE=/private/visual-notes/migration.env docker compose run --rm visual-notes-dev node server/db/migrate.mjs
docker compose up -d
```

The migration command temporarily uses the migration login; the running service uses the runtime file. Alternatively, apply the SQL scripts separately through `psql`.

The Compose project and service are named `visual-notes-dev` to avoid reusing production's container or network service name. It connects to the existing external `nginx-proxy-manager_default` network. In Nginx Proxy Manager, route the **test hostname** to `visual-notes-dev`, **port 3000**, using HTTP internally and HTTPS publicly. The previous nginx-only image listened on port 80. Route the whole site, including `/api/` and `/auth/`, to this service. Keep the test database reachable from the container: `localhost` inside it means the container itself.

Only explicitly copied frontend files are publicly served. Backend source, configuration, migrations, dependencies and Git files have no public route. The container runs as an unprivileged user with a read-only filesystem. Replacing the app container does not replace the external database.

`GET /healthz` checks the process; `GET /readyz` checks database/schema readiness. The container health check uses readiness. Configure reverse-proxy request limits to accommodate boards up to 16 MB; larger saves receive HTTP 413. Also configure per-client sign-in rate limits at the proxy. The app's bounded limiter uses the direct socket address (60 sign-in requests/minute), so requests through a shared proxy share that limit; the app does not trust arbitrary forwarded IP headers.

The user reports the server database and Google login are configured. This frontend checkpoint needs no additional database migration or OAuth change; redeploy the updated `dev` image. Docker is not installed in the development workspace, so its image/proxy rollout is still a server-side check. Keep the test deployment on `dev` while scheduled project backups and release checks remain unfinished. See [Docker's environment-file reference](https://docs.docker.com/reference/compose-file/services/#env_file).

## Verify and recover

```sh
npm test
npx playwright install chromium
npm run test:database
```

The database suite creates a temporary PostgreSQL cluster on localhost with a random password and port, then removes only that cluster. It tests real SQL, isolation, sharing, conflicting saves, revocation races, retry-safe creation, runtime permissions, HTTP protection, sessions and backend/database restarts. It also runs real-browser gallery/canvas checks against that backend, including imports, offline/conflict recovery, viewer restrictions and navigation. Run as a normal user; PostgreSQL cannot initialize as root. No server credentials are needed. Automated authentication-flow tests substitute Google responses and browser tests seed isolated test sessions. Browser tests use installed Chrome on Windows, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if provided, or Playwright's installed Chromium.

After redeployment, check `/readyz`, sign in through Projects, create a disposable account board, edit and reopen it from another signed-in browser. Share it with a second account and check viewer/editor behavior. [api.md](api.md) documents the underlying requests. Verify this real OAuth/proxy flow on the configured test origin; automated tests do not access your deployed server.

If deployment fails, stop/redeploy the previous test image. Preserve the external database and local recovery drafts. These migrations are additive, and the earlier static frontend still runs independently. Do not drop the schema as a rollback. Manual individual-project download/import is available; scheduled independent server backups and destructive in-place restoration are not implemented yet.
