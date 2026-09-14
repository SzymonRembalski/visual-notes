# Database setup

Provision PostgreSQL separately, with an empty application database and a migration login allowed to create a schema and tables. These scripts target PostgreSQL 14 or newer, require no extensions, and do not create databases, database logins or sample accounts. Use separate databases for production and test.

From the repository root, set the standard PostgreSQL connection environment variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`) and supply the password through your deployment's secret configuration or a PostgreSQL password file. Then use the PostgreSQL client:

```powershell
psql -X -v ON_ERROR_STOP=1 -f server/db/migrations/001_accounts_projects.sql
psql -X -v ON_ERROR_STOP=1 -f server/db/migrations/002_sessions_requests.sql
psql -X -v ON_ERROR_STOP=1 -f server/db/verify.sql
```

Run verification on the **test** database. Its fixtures are enclosed in a transaction and rolled back. `psql` uses its own connection settings; it does not read the Node configuration loader's `.env` file or `DATABASE_URL` automatically. Do not paste connection passwords into commands or committed files.

Alternatively, after `npm ci`, apply both migrations using the Node runner and a private migration-login configuration file:

```powershell
npm run db:migrate -- --env-file C:\private\visual-notes\migration.env
```

Create a separate runtime login through your database administration process, then grant only the required schema/table permissions:

```powershell
psql -X -v ON_ERROR_STOP=1 -v runtime_role=visual_notes_app -f server/db/grant-runtime.sql
```

The grants script does not create the login or password. It gives the runtime role table operations and read access to migration versions, with no schema-creation privileges. Use that login's connection URL for the running service; keep schema ownership/migration privileges separate.

The migration runs in one transaction, records its version and takes a transaction-level advisory lock so simultaneous executions serialize. Rerunning an applied migration is a no-op. Apply numbered migrations in order, and add new migrations instead of changing applied ones. There is no automatic destructive rollback; take a database backup before future production migrations.

## Data model

| Table in `visual_notes` | Purpose |
| --- | --- |
| `schema_migrations` | Applied migration versions |
| `users` | Stable internal account IDs |
| `identities` | Unique verified identity provider + subject linked to an account |
| `projects` | One document per project, owner, revision and timestamps |
| `project_members` | Additional accounts with editor or viewer access |
| `project_views` | Independent camera/preferences per account and project |
| `sessions` | Hashed session tokens, account IDs, CSRF tokens and expiry |
| `login_flows` | Short-lived OAuth state hashes, nonce and PKCE verifier |

The project row defines its owner. The API derives identity from a verified session and checks access on every project operation: owners manage sharing/deletion, editors may save and viewers may read/save their personal view. The SQL tables establish relationships and constraints; the runtime role itself can access all application records, so never expose it to browsers. The browser sharing dialog targets existing account IDs, presented as sharing codes. Invitations are pending.

The document format matches `BoardStorage.getDocument`: title, notes, connections, shapes, drawings and coordinate version. Personal view fields remain in `project_views`. SQL checks the outer document structure; the API additionally validates board fields and imposes a 16 MB JSON body limit. Project IDs use UUIDs; IDs inside documents retain their existing values. Migration 002 adds a unique owner/request ID pair for retry-safe creation/import.

The repository locks the project row, checks permission/revision in the same transaction, increments the revision and updates `modified_at`. Sharing changes use the same lock. Concurrent-save and revoke/save races are covered by the database integration suite; the standalone SQL verification script covers the underlying constraints and sequential revision checks.

## Acceptance on your database

1. Apply migrations 001 and 002 to the test database.
2. Apply them again; confirm they succeed without replacing data.
3. Run `verify.sql`; expect the final success message and exit code 0.
4. Inspect `visual_notes.schema_migrations`; expect versions 1 and 2.

The SQL script checks identity/membership uniqueness, roles, owner deletion protection, document structure, views, revisions and project deletion isolation. Both migrations, repeated application, SQL verification and runtime grants passed against temporary PostgreSQL 18.4. The integration suite also verifies API protection, concurrent saves, access revocation and persistence across backend/database restarts. Run it with `npm run test:database`; it uses an isolated local cluster, not your provisioned database. Automated Google-flow tests use a provider substitute; live sign-in remains a deployment check.

Reference: [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [row locking](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE).
