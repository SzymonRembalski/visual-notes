BEGIN;
SELECT pg_advisory_xact_lock(1835627630, 1);
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM visual_notes.schema_migrations WHERE version = 3) THEN RETURN; END IF;
    ALTER TABLE visual_notes.users ADD COLUMN picture_url text;
    INSERT INTO visual_notes.schema_migrations (version) VALUES (3);
END;
$migration$;
COMMIT;
