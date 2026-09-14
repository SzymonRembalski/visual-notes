BEGIN;
SELECT pg_advisory_xact_lock(1835627630, 1);
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM visual_notes.schema_migrations WHERE version = 2) THEN RETURN; END IF;

    ALTER TABLE visual_notes.projects ADD COLUMN request_id uuid;
    CREATE UNIQUE INDEX projects_owner_request_idx ON visual_notes.projects (owner_id, request_id);

    CREATE TABLE visual_notes.sessions (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES visual_notes.users(id) ON DELETE CASCADE,
        csrf_token text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sessions_user_idx ON visual_notes.sessions (user_id);
    CREATE INDEX sessions_expiry_idx ON visual_notes.sessions (expires_at);

    CREATE TABLE visual_notes.login_flows (
        state_hash text PRIMARY KEY,
        nonce text NOT NULL,
        verifier text NOT NULL,
        expires_at timestamptz NOT NULL
    );
    CREATE INDEX login_flows_expiry_idx ON visual_notes.login_flows (expires_at);
    INSERT INTO visual_notes.schema_migrations (version) VALUES (2);
END;
$migration$;
COMMIT;
