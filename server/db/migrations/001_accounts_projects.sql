-- Run against an existing database using psql with ON_ERROR_STOP enabled.
-- This migration owns only the visual_notes schema; it creates no database or role.
BEGIN;
SELECT pg_advisory_xact_lock(1835627630, 1);
CREATE SCHEMA IF NOT EXISTS visual_notes;
CREATE TABLE IF NOT EXISTS visual_notes.schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM visual_notes.schema_migrations WHERE version = 1) THEN
        RETURN;
    END IF;

    CREATE TABLE visual_notes.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Identity is provider + verified subject, never a browser-supplied email.
    CREATE TABLE visual_notes.identities (
        provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 200),
        subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
        user_id uuid NOT NULL REFERENCES visual_notes.users(id) ON DELETE CASCADE,
        PRIMARY KEY (provider, subject)
    );
    CREATE INDEX identities_user_idx ON visual_notes.identities (user_id);

    CREATE TABLE visual_notes.projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid NOT NULL REFERENCES visual_notes.users(id) ON DELETE RESTRICT,
        document jsonb NOT NULL,
        schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
        revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        modified_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT project_document_object CHECK (jsonb_typeof(document) = 'object'),
        CONSTRAINT project_document_fields CHECK (
            document ?& ARRAY['title', 'notes', 'connections', 'shapes', 'drawings', 'coordinateVersion']
            AND jsonb_typeof(document->'title') = 'string'
            AND jsonb_typeof(document->'notes') = 'array'
            AND jsonb_typeof(document->'connections') = 'array'
            AND jsonb_typeof(document->'shapes') = 'array'
            AND jsonb_typeof(document->'drawings') = 'array'
            AND jsonb_typeof(document->'coordinateVersion') = 'number'
        ),
        CONSTRAINT project_document_personal_state CHECK (
            NOT document ?| ARRAY['panX', 'panY', 'zoom', 'snappingEnabled', 'drawingsVisible']
        )
    );
    CREATE INDEX projects_owner_modified_idx ON visual_notes.projects (owner_id, modified_at DESC, id);

    -- The owner is stored on projects; other accounts receive one explicit role.
    CREATE TABLE visual_notes.project_members (
        project_id uuid NOT NULL REFERENCES visual_notes.projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES visual_notes.users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('editor', 'viewer')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, user_id)
    );
    CREATE INDEX project_members_user_idx ON visual_notes.project_members (user_id, project_id);

    CREATE TABLE visual_notes.project_views (
        project_id uuid NOT NULL REFERENCES visual_notes.projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES visual_notes.users(id) ON DELETE CASCADE,
        view jsonb NOT NULL CHECK (jsonb_typeof(view) = 'object'),
        modified_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, user_id)
    );
    CREATE INDEX project_views_user_idx ON visual_notes.project_views (user_id);

    INSERT INTO visual_notes.schema_migrations (version) VALUES (1);
END;
$migration$;
COMMIT;
