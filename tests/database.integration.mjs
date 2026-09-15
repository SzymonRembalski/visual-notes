import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer as createSocket } from 'node:net';
import { createPool, checkDatabase } from '../server/database.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { Projects } from '../server/projects.mjs';
import { Auth, tokenHash } from '../server/auth.mjs';
import { createApp } from '../server/http.mjs';

const config = { databaseUrl: process.env.TEST_DATABASE_URL, origin: 'http://localhost:3000', googleClientId: 'test-client', googleClientSecret: 'test-secret' };
assert.ok(config.databaseUrl, 'Use npm run test:database to create an isolated temporary database.');
const pool = createPool(config);
const projects = new Projects(pool);
const board = { title: 'Test board', notes: [{ id: 1, title: 'One', x: 100, y: 100 }], connections: [], shapes: [], drawings: [], coordinateVersion: 2 };
const create = (user, document = board, requestId = randomUUID()) => projects.create(user, { document, requestId });
const denied = (promise, status) => assert.rejects(promise, error => error.status === status);
let owner, editor, viewer, outsider;

test('database and API integration', async t => {
    t.after(() => pool.end());
    await t.test('migrations repeat without replacing data; supplied verification SQL passes', async () => {
        await migrate(pool);
        const result = await pool.query(`INSERT INTO visual_notes.users (display_name) VALUES ('Owner'), ('Editor'), ('Viewer'), ('Outsider') RETURNING id`);
        [owner, editor, viewer, outsider] = result.rows.map(row => row.id);
        await migrate(pool);
        await checkDatabase(pool);
        assert.equal((await pool.query('SELECT count(*) FROM visual_notes.users')).rows[0].count, '4');
        const sql = (await readFile(new URL('../server/db/verify.sql', import.meta.url), 'utf8')).split(/\r?\n/).filter(line => !line.startsWith('\\')).join('\n');
        await pool.query(sql);
        assert.equal((await pool.query('SELECT count(*) FROM visual_notes.users')).rows[0].count, '4');
    });

    await t.test('accounts have isolated projects, explicit roles and independent views', async () => {
        const first = await create(owner);
        const second = await create(outsider);
        await denied(projects.get(outsider, first.id), 404);
        assert.equal((await projects.list(outsider)).length, 1);
        await projects.share(owner, first.id, editor, 'editor');
        await projects.share(owner, first.id, viewer, 'viewer');
        assert.equal((await projects.get(editor, first.id)).role, 'editor');
        await denied(projects.save(viewer, first.id, { expectedRevision: '1', document: board }), 403);
        await denied(projects.share(editor, first.id, outsider, 'editor'), 403);
        await denied(projects.remove(editor, first.id, '1'), 403);
        await projects.saveView(viewer, first.id, { zoom: 0.5, panX: 10 });
        assert.deepEqual((await projects.get(viewer, first.id)).view, { zoom: 0.5, panX: 10 });
        assert.deepEqual((await projects.get(owner, first.id)).view, {});
        await projects.save(editor, first.id, { expectedRevision: '1', document: { ...board, title: 'Edited' } });
        assert.equal((await projects.get(owner, first.id)).revision, '2');
        await denied(projects.remove(owner, first.id, '1'), 409);
        await projects.share(owner, first.id, viewer, null);
        await denied(projects.get(viewer, first.id), 404);
        assert.equal((await pool.query('SELECT count(*) FROM visual_notes.project_views WHERE project_id = $1 AND user_id = $2', [first.id, viewer])).rows[0].count, '0');
        await projects.remove(owner, first.id, '2');
        assert.equal((await projects.get(outsider, second.id)).revision, '1');
    });

    await t.test('simultaneous saves accept exactly one revision and preserve the winner', async () => {
        const project = await create(owner);
        await projects.share(owner, project.id, editor, 'editor');
        const results = await Promise.allSettled([
            projects.save(owner, project.id, { expectedRevision: '1', document: { ...board, title: 'Owner edit' } }),
            projects.save(editor, project.id, { expectedRevision: '1', document: { ...board, title: 'Editor edit' } })
        ]);
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
        const saved = await projects.get(owner, project.id);
        assert.equal(saved.revision, '2');
        assert.equal(saved.document.title, results[0].status === 'fulfilled' ? 'Owner edit' : 'Editor edit');
    });

    await t.test('a save waiting behind access revocation rechecks membership', async () => {
        const project = await create(owner);
        await projects.share(owner, project.id, editor, 'editor');
        const connection = await pool.connect();
        try {
            await connection.query('BEGIN');
            await connection.query('SELECT id FROM visual_notes.projects WHERE id = $1 FOR UPDATE', [project.id]);
            await connection.query('DELETE FROM visual_notes.project_members WHERE project_id = $1 AND user_id = $2', [project.id, editor]);
            const saving = projects.save(editor, project.id, { expectedRevision: '1', document: board });
            const rejection = denied(saving, 404);
            // The API call starts before the revoke commits; the row lock establishes the order.
            await connection.query('COMMIT');
            await rejection;
            assert.equal((await projects.get(owner, project.id)).revision, '1');
        } finally { await connection.query('ROLLBACK'); connection.release(); }
    });

    await t.test('retried imports create one project without replacing later edits', async () => {
        const request = randomUUID();
        const [first, second] = await Promise.all([create(owner, board, request), create(owner, board, request)]);
        assert.equal(first.id, second.id);
        await projects.save(owner, first.id, { expectedRevision: '1', document: { ...board, title: 'Later edit' } });
        assert.equal((await create(owner, board, request)).document.title, 'Later edit');
        assert.notEqual((await create(outsider, board, request)).id, first.id);
    });

    await t.test('runtime database role can save but cannot change the schema', async () => {
        await pool.query('CREATE ROLE visual_notes_test_runtime NOLOGIN');
        const sql = (await readFile(new URL('../server/db/grant-runtime.sql', import.meta.url), 'utf8')).replaceAll(':"runtime_role"', 'visual_notes_test_runtime');
        await pool.query(sql);
        const connection = await pool.connect();
        try {
            await connection.query('SET ROLE visual_notes_test_runtime');
            await connection.query('SELECT version FROM visual_notes.schema_migrations');
            await connection.query('INSERT INTO visual_notes.projects (owner_id, document) VALUES ($1, $2)', [owner, board]);
            await assert.rejects(connection.query('CREATE TABLE visual_notes.runtime_must_not_create (id integer)'), error => error.code === '42501');
        } finally { await connection.query('RESET ROLE'); connection.release(); }
    });

    await t.test('Google flow binds state and nonce, rotates sessions and rejects reuse', async () => {
        let receivedNonce;
        let receivedAudience;
        let failNonce = false;
        const provider = {
            generateCodeVerifierAsync: async () => ({ codeVerifier: 'verifier', codeChallenge: 'challenge' }),
            generateAuthUrl: options => { receivedNonce = options.nonce; return `https://accounts.google.com/?state=${options.state}`; },
            getToken: async options => { assert.equal(options.codeVerifier, 'verifier'); return { tokens: { id_token: 'provider-token' } }; },
            verifyIdToken: async options => { receivedAudience = options.audience; return { getPayload: () => ({ sub: 'verified-google-sub', name: 'Account', picture: 'https://lh3.googleusercontent.com/test-avatar', nonce: failNonce ? 'wrong' : receivedNonce }) }; }
        };
        const auth = new Auth(pool, config, provider);
        const first = await auth.begin({ headers: {} });
        const req = { headers: { cookie: first.cookie.split(';')[0] } };
        const params = new URLSearchParams({ code: 'code', state: new URL(first.location).searchParams.get('state') });
        await denied(auth.finish({ headers: {} }, params), 400);
        const cookies = await auth.finish(req, params);
        assert.equal(receivedAudience, config.googleClientId);
        assert.match(cookies[0], /HttpOnly; SameSite=Lax/);
        const signedIn = { headers: { cookie: cookies[0].split(';')[0] } };
        const session = await auth.session(signedIn);
        assert.equal(session.displayName, 'Account');
        assert.equal(session.pictureUrl, 'https://lh3.googleusercontent.com/test-avatar');
        await denied(auth.finish(req, params), 400);
        const second = await auth.begin(signedIn);
        const secondCookies = await auth.finish({ headers: { cookie: `${signedIn.headers.cookie}; ${second.cookie.split(';')[0]}` } }, new URLSearchParams({ code: 'code', state: new URL(second.location).searchParams.get('state') }));
        assert.equal(await auth.session(signedIn), null);
        const nextSession = await auth.session({ headers: { cookie: secondCookies[0].split(';')[0] } });
        assert.equal(nextSession.id, session.id);
        const invalid = await auth.begin({ headers: {} });
        failNonce = true;
        await denied(auth.finish({ headers: { cookie: invalid.cookie.split(';')[0] } }, new URLSearchParams({ code: 'code', state: new URL(invalid.location).searchParams.get('state') })), 401);
        assert.match(new Auth(pool, { ...config, origin: 'https://test.example.com' }, provider).cookie('__Host-vn_session', 'token', 10), /; Secure$/);
        await pool.query('UPDATE visual_notes.sessions SET expires_at = now() - interval \'1 second\' WHERE user_id = $1', [session.id]);
        assert.equal(await auth.session({ headers: { cookie: secondCookies[0].split(';')[0] } }), null);
        const expired = await auth.begin({ headers: {} });
        await pool.query('UPDATE visual_notes.login_flows SET expires_at = now() - interval \'1 second\'');
        await denied(auth.finish({ headers: { cookie: expired.cookie.split(';')[0] } }, new URLSearchParams({ code: 'code', state: new URL(expired.location).searchParams.get('state') })), 400);
        await auth.cleanup();
    });

    await t.test('HTTP protects accounts, writes, private files and request limits', async () => {
        const sessionToken = randomBytes(32).toString('base64url');
        const csrf = randomBytes(32).toString('base64url');
        await pool.query(`INSERT INTO visual_notes.sessions (token_hash, user_id, csrf_token, expires_at)
            VALUES ($1, $2, $3, now() + interval '1 day')`, [tokenHash(sessionToken), owner, csrf]);
        const app = createApp({ pool, config, onError: () => {} });
        app.listen(0, '127.0.0.1');
        await once(app, 'listening');
        const origin = `http://127.0.0.1:${app.address().port}`;
        const headers = { Cookie: `vn_session=${sessionToken}`, Origin: config.origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
        try {
            assert.equal((await fetch(`${origin}/readyz`)).status, 200);
            assert.equal((await fetch(`${origin}/api/projects`)).status, 401);
            const result = await fetch(`${origin}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), document: board, userId: outsider }) });
            assert.equal(result.status, 201);
            const project = await result.json();
            assert.equal(project.ownerId, owner);
            assert.equal((await fetch(`${origin}/api/projects/${project.id}`, { method: 'PUT', headers: { ...headers, Origin: 'https://attacker.example' }, body: JSON.stringify({ expectedRevision: '1', document: board }) })).status, 403);
            assert.equal((await fetch(`${origin}/api/projects/${project.id}`, { method: 'DELETE', headers: { ...headers, 'X-CSRF-Token': 'wrong' }, body: '{"expectedRevision":"1"}' })).status, 403);
            assert.equal((await fetch(`${origin}/api/projects`, { method: 'POST', headers, body: '{' })).status, 400);
            assert.equal((await fetch(`${origin}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(16 * 1024 * 1024) }) })).status, 413);
            for (const path of ['/server/.env', '/server/config.mjs', '/package-lock.json', '/.git/config', '/Dockerfile', '/assets/%2e%2e%2fserver/config.mjs']) {
                assert.equal((await fetch(origin + path)).status, 404, path);
            }
            assert.equal((await fetch(origin + '/')).status, 200);
            assert.equal((await fetch(origin + '/assets/js/app.js')).status, 200);
            assert.equal((await fetch(origin + '/api/logout', { method: 'POST', headers })).status, 200);
            assert.equal((await fetch(origin + '/api/projects', { headers })).status, 401);
        } finally { await new Promise(resolve => app.close(resolve)); }
    });
    await t.test('saved project and session survive restarting the actual backend process', async () => {
        const sessionToken = randomBytes(32).toString('base64url');
        await pool.query(`INSERT INTO visual_notes.sessions (token_hash, user_id, csrf_token, expires_at)
            VALUES ($1, $2, $3, now() + interval '1 day')`, [tokenHash(sessionToken), owner, 'restart-csrf']);
        const project = await create(owner);
        const socket = createSocket();
        await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
        const port = socket.address().port;
        await new Promise(resolve => socket.close(resolve));
        let child;
        const stop = async () => {
            if (child && child.exitCode === null && child.signalCode === null) {
                const exited = once(child, 'exit');
                child.kill('SIGTERM');
                await exited;
            }
            child = null;
        };
        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                child = spawn(process.execPath, ['server/index.mjs'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
                    ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: config.databaseUrl,
                    APP_ORIGIN: `http://localhost:${port}`, GOOGLE_CLIENT_ID: config.googleClientId, GOOGLE_CLIENT_SECRET: config.googleClientSecret
                } });
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Backend did not start.')), 10000);
                    child.once('error', error => { clearTimeout(timeout); reject(error); });
                    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Backend exited during startup.')); });
                    child.stdout.on('data', chunk => {
                        if (chunk.toString().includes('server listening')) { clearTimeout(timeout); resolve(); }
                    });
                });
                const result = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}`, { headers: { Cookie: `vn_session=${sessionToken}` } });
                assert.equal(result.status, 200);
                assert.equal((await result.json()).document.title, board.title);
                await stop();
            }
        } finally { await stop(); }
    });
    await create(owner, { ...board, title: 'Restart durability fixture' });
});
