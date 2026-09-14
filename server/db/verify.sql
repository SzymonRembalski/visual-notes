-- Run after migrations, against the TEST database. All fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $verification$
DECLARE
    owner_id uuid;
    editor_id uuid;
    viewer_id uuid;
    first_project uuid;
    second_project uuid;
    changed integer;
    board jsonb := '{"title":"Schema check","notes":[],"connections":[],"shapes":[],"drawings":[],"coordinateVersion":1}';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM visual_notes.schema_migrations WHERE version = 1) THEN
        RAISE EXCEPTION 'Migration 1 is missing';
    END IF;

    INSERT INTO visual_notes.users (display_name) VALUES ('Check owner') RETURNING id INTO owner_id;
    INSERT INTO visual_notes.users (display_name) VALUES ('Check editor') RETURNING id INTO editor_id;
    INSERT INTO visual_notes.users (display_name) VALUES ('Check viewer') RETURNING id INTO viewer_id;
    INSERT INTO visual_notes.identities (provider, subject, user_id) VALUES ('test', owner_id::text, owner_id);
    BEGIN
        INSERT INTO visual_notes.identities (provider, subject, user_id) VALUES ('test', owner_id::text, editor_id);
        RAISE EXCEPTION 'Duplicate identity was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    INSERT INTO visual_notes.projects (owner_id, document) VALUES (owner_id, board) RETURNING id INTO first_project;
    INSERT INTO visual_notes.projects (owner_id, document) VALUES (owner_id, board) RETURNING id INTO second_project;
    INSERT INTO visual_notes.project_members (project_id, user_id, role) VALUES
        (first_project, editor_id, 'editor'), (first_project, viewer_id, 'viewer');
    BEGIN
        INSERT INTO visual_notes.project_members (project_id, user_id, role) VALUES (second_project, editor_id, 'owner');
        RAISE EXCEPTION 'Invalid member role was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO visual_notes.project_members (project_id, user_id, role) VALUES (first_project, editor_id, 'viewer');
        RAISE EXCEPTION 'Duplicate membership was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM visual_notes.users WHERE id = owner_id;
        RAISE EXCEPTION 'Deleting an owner with projects was accepted';
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO visual_notes.projects (owner_id, document) VALUES (owner_id, '{}');
        RAISE EXCEPTION 'Incomplete document was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO visual_notes.projects (owner_id, document) VALUES (owner_id, board || '{"zoom":0.5}');
        RAISE EXCEPTION 'Personal view in shared document was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO visual_notes.project_views (project_id, user_id, view) VALUES
        (first_project, owner_id, '{"zoom":1}'), (first_project, editor_id, '{"zoom":0.5}');
    IF (SELECT count(*) FROM visual_notes.project_views WHERE project_id = first_project) <> 2 THEN
        RAISE EXCEPTION 'Separate views were not saved';
    END IF;

    UPDATE visual_notes.projects SET document = board || '{"title":"Updated"}', revision = revision + 1,
        modified_at = now() WHERE id = first_project AND revision = 1;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN RAISE EXCEPTION 'Expected revision update failed'; END IF;
    UPDATE visual_notes.projects SET document = board, revision = revision + 1 WHERE id = first_project AND revision = 1;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Stale revision update was accepted'; END IF;
    IF (SELECT document->>'title' FROM visual_notes.projects WHERE id = first_project) <> 'Updated' THEN
        RAISE EXCEPTION 'Stale data replaced the saved document';
    END IF;
    IF (SELECT revision FROM visual_notes.projects WHERE id = second_project) <> 1 THEN
        RAISE EXCEPTION 'Updating one project changed another';
    END IF;

    DELETE FROM visual_notes.projects WHERE id = first_project;
    IF EXISTS (SELECT 1 FROM visual_notes.project_members WHERE project_id = first_project)
        OR EXISTS (SELECT 1 FROM visual_notes.project_views WHERE project_id = first_project) THEN
        RAISE EXCEPTION 'Project deletion left dependent records';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM visual_notes.projects WHERE id = second_project) THEN
        RAISE EXCEPTION 'Project deletion affected another project';
    END IF;
END;
$verification$;
ROLLBACK;
\echo Database schema checks passed; all verification fixtures rolled back.
