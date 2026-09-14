-- An administrator runs this after migrations for an already-created runtime role:
-- psql -X -v ON_ERROR_STOP=1 -v runtime_role=visual_notes_app -f server/db/grant-runtime.sql
BEGIN;
GRANT USAGE ON SCHEMA visual_notes TO :"runtime_role";
GRANT SELECT ON visual_notes.schema_migrations TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON
    visual_notes.users, visual_notes.identities, visual_notes.projects,
    visual_notes.project_members, visual_notes.project_views,
    visual_notes.sessions, visual_notes.login_flows TO :"runtime_role";
COMMIT;
