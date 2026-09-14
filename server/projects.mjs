import { transaction } from './database.mjs';
import { HttpError, requireValue, uuid, revision, documentPayload, viewPayload } from './validation.mjs';

const notFound = () => new HttpError(404, 'Project not found.');

export class Projects {
    constructor(pool) { this.pool = pool; }

    async list(userId, offset = 0) {
        requireValue(Number.isSafeInteger(offset) && offset >= 0 && offset <= 1e9, 'Invalid page offset.');
        const { rows } = await this.pool.query(`SELECT p.id, p.document->>'title' AS title,
            p.revision::text, p.created_at AS "createdAt", p.modified_at AS "modifiedAt",
            CASE WHEN p.owner_id = $1 THEN 'owner' ELSE m.role END AS role
            FROM visual_notes.projects p
            LEFT JOIN visual_notes.project_members m ON m.project_id = p.id AND m.user_id = $1
            WHERE p.owner_id = $1 OR m.user_id IS NOT NULL
            ORDER BY p.modified_at DESC, p.id LIMIT 100 OFFSET $2`, [userId, offset]);
        return rows;
    }

    async get(userId, projectId) {
        const { rows } = await this.pool.query(`SELECT p.id, p.owner_id AS "ownerId", p.document,
            p.revision::text, p.schema_version AS "schemaVersion", p.created_at AS "createdAt",
            p.modified_at AS "modifiedAt", COALESCE(v.view, '{}'::jsonb) AS view,
            CASE WHEN p.owner_id = $1 THEN 'owner' ELSE m.role END AS role
            FROM visual_notes.projects p
            LEFT JOIN visual_notes.project_members m ON m.project_id = p.id AND m.user_id = $1
            LEFT JOIN visual_notes.project_views v ON v.project_id = p.id AND v.user_id = $1
            WHERE p.id = $2 AND (p.owner_id = $1 OR m.user_id IS NOT NULL)`, [userId, uuid(projectId)]);
        if (!rows[0]) throw notFound();
        return rows[0];
    }

    async create(userId, input) {
        const requestId = uuid(input.requestId);
        const document = JSON.stringify(documentPayload(input.document));
        const { rows } = await this.pool.query(`INSERT INTO visual_notes.projects (owner_id, document, request_id)
            VALUES ($1, $2, $3) ON CONFLICT (owner_id, request_id) DO NOTHING RETURNING id`, [userId, document, requestId]);
        const id = rows[0]?.id ?? (await this.pool.query(
            'SELECT id FROM visual_notes.projects WHERE owner_id = $1 AND request_id = $2', [userId, requestId])).rows[0]?.id;
        if (!id) throw new HttpError(409, 'Project was removed during creation. Retry with a new request ID.');
        return this.get(userId, id);
    }

    async locked(userId, projectId, allowed, work) {
        return transaction(this.pool, async client => {
            const { rows } = await client.query(`SELECT owner_id, revision::text FROM visual_notes.projects WHERE id = $1 FOR UPDATE`, [uuid(projectId)]);
            if (!rows[0]) throw notFound();
            const project = rows[0];
            const role = project.owner_id === userId ? 'owner' : (await client.query(
                'SELECT role FROM visual_notes.project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId])).rows[0]?.role;
            if (!role) throw notFound();
            if (!allowed.includes(role)) throw new HttpError(403, 'You do not have permission to change this project.');
            return work(client, project);
        });
    }

    async save(userId, projectId, input) {
        const expected = revision(input.expectedRevision);
        const document = JSON.stringify(documentPayload(input.document));
        return this.locked(userId, projectId, ['owner', 'editor'], async (client, project) => {
            if (project.revision !== expected) throw new HttpError(409, 'This project has newer changes. Keep your edits and reload or save a copy.', { currentRevision: project.revision });
            const { rows } = await client.query(`UPDATE visual_notes.projects SET document = $2,
                revision = revision + 1, modified_at = clock_timestamp() WHERE id = $1 AND revision = $3
                RETURNING revision::text, modified_at AS "modifiedAt"`, [projectId, document, expected]);
            return rows[0];
        });
    }

    async saveView(userId, projectId, input) {
        const view = JSON.stringify(viewPayload(input));
        return this.locked(userId, projectId, ['owner', 'editor', 'viewer'], async client => {
            await client.query(`INSERT INTO visual_notes.project_views (project_id, user_id, view) VALUES ($1, $2, $3)
                ON CONFLICT (project_id, user_id) DO UPDATE SET view = EXCLUDED.view, modified_at = clock_timestamp()`, [projectId, userId, view]);
            return { saved: true };
        });
    }

    async members(userId, projectId) {
        return this.locked(userId, projectId, ['owner'], async (client, project) => {
            const { rows } = await client.query(`SELECT u.id, u.display_name AS "displayName", m.role
                FROM visual_notes.project_members m JOIN visual_notes.users u ON u.id = m.user_id
                WHERE m.project_id = $1 ORDER BY u.display_name, u.id`, [projectId]);
            return { ownerId: project.owner_id, members: rows };
        });
    }

    async share(userId, projectId, memberId, role) {
        memberId = uuid(memberId);
        requireValue(role === null || ['editor', 'viewer'].includes(role), 'Choose editor or viewer.');
        return this.locked(userId, projectId, ['owner'], async (client, project) => {
            requireValue(memberId !== project.owner_id, 'The owner cannot be changed through sharing.');
            if (role === null) {
                await client.query('DELETE FROM visual_notes.project_members WHERE project_id = $1 AND user_id = $2', [projectId, memberId]);
                await client.query('DELETE FROM visual_notes.project_views WHERE project_id = $1 AND user_id = $2', [projectId, memberId]);
            } else {
                const result = await client.query(`INSERT INTO visual_notes.project_members (project_id, user_id, role)
                    SELECT $1, id, $3 FROM visual_notes.users WHERE id = $2
                    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [projectId, memberId, role]);
                if (!result.rowCount) throw new HttpError(404, 'Account not found. Ask the person to sign in first.');
            }
            return { saved: true };
        });
    }

    async remove(userId, projectId, expectedRevision) {
        const expected = revision(expectedRevision);
        return this.locked(userId, projectId, ['owner'], async (client, project) => {
            if (expected !== project.revision) throw new HttpError(409, 'Project changed before deletion. Reload first.');
            await client.query('DELETE FROM visual_notes.projects WHERE id = $1', [projectId]);
            return { deleted: true };
        });
    }
}
