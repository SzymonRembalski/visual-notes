import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../server/logger.mjs';
import { createApp } from '../server/http.mjs';

test('structured logs allow diagnostic IDs and omit credentials and document content', () => {
    const lines = [], id = randomUUID();
    createLogger(line => lines.push(line))('project.sharing', {
        requestId: id, projectId: id, memberId: 'invalid\nvalue', userId: id, status: 403, role: 'editor',
        projectIds: [id, 'secret'], body: { title: 'private note' }, cookie: 'secret', authorization: 'secret',
        message: 'password in error message', stack: 'private stack', url: '/auth/google/callback?code=secret'
    });
    const record = JSON.parse(lines[0]);
    assert.equal(record.level, 'warn'); assert.equal(record.requestId, id);
    assert.deepEqual(record.projectIds, [id]);
    for (const key of ['memberId', 'body', 'cookie', 'authorization', 'message', 'stack', 'url']) assert.equal(record[key], undefined);
    assert.doesNotThrow(() => createLogger(() => { throw new Error('Log destination unavailable'); })('request.completed'));
});

test('failed HTTP requests include a correlated reference and safe database error code', async () => {
    const lines = [];
    const app = createApp({ pool: { query: async () => { throw Object.assign(new Error('secret database password'), { code: 'ECONNREFUSED' }); } },
        config: { origin: 'http://localhost', googleClientId: 'test', googleClientSecret: 'secret' }, log: createLogger(line => lines.push(JSON.parse(line))) });
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    try {
        const response = await fetch(`http://127.0.0.1:${app.address().port}/api/projects?token=secret`, {
            headers: { Cookie: `vn_session=${'secret'.repeat(8).slice(0, 43)}`, Authorization: 'Basic secret', 'X-Request-ID': 'untrusted' }
        });
        const data = await response.json();
        assert.equal(response.status, 500);
        assert.equal(data.requestId, response.headers.get('x-request-id'));
        const entry = lines.find(entry => entry.requestId === data.requestId);
        assert.equal(entry.status, 500); assert.equal(entry.errorCode, 'ECONNREFUSED'); assert.equal(entry.route, 'projects');
        assert.ok(!JSON.stringify(lines).includes('secret'));
        assert.ok(!JSON.stringify(data).includes('secret'));
        assert.notEqual(data.requestId, 'untrusted');
    } finally { await new Promise(resolve => app.close(resolve)); }
});
