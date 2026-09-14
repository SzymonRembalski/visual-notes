# Test-server backend

The Node.js backend serves the frontend and a PostgreSQL-backed project API. It supports Google sign-in, persistent sessions, ownership, editor/viewer sharing, per-account views and revision checks. **The existing gallery and canvas still save locally. Their account controls and asynchronous server-saving integration are the next checkpoint.** Backups and live collaboration are also pending.

Use `dev` for the test server; production stays on `main`. Configure the deployment service to follow the correct branch. Use separate origins, databases, credentials and OAuth configuration for test and production.

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

Docker is not installed in the development workspace, so image build and proxy routing remain deployment checks. Do not promote this checkpoint to `main`: browser saving integration and backups are unfinished. See [Docker's environment-file reference](https://docs.docker.com/reference/compose-file/services/#env_file).

## Verify and recover

```sh
npm test
npm run test:database
```

The database suite creates a temporary PostgreSQL cluster on localhost with a random password and port, then removes only that cluster. It tests real SQL, isolation, sharing, conflicting saves, revocation races, retry-safe creation, runtime permissions, HTTP protection, sessions and backend/database restarts. Run as a normal user; PostgreSQL cannot initialize as root. No server credentials are needed. Automated authentication-flow tests substitute Google responses; live Google sign-in still needs the configured client.

After deployment, check `/readyz`, visit `/auth/google/start`, sign in, then inspect `/api/session` to confirm the account. The callback currently returns to the local Projects page; [api.md](api.md) documents server API testing. Normal board saves remain on the device at this checkpoint.

If deployment fails, stop/redeploy the previous test image. Preserve the external database. These migrations are additive, and the earlier static frontend still runs independently. Do not drop the schema as a rollback. Independent project backups and restoration are not implemented yet.
