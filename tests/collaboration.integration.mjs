import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createPool } from '../server/database.mjs';
import { Projects } from '../server/projects.mjs';
import { createApp } from '../server/http.mjs';
import { tokenHash } from '../server/auth.mjs';
import D from '../assets/js/collaboration-document.js';

test('live collaboration with real browsers and PostgreSQL', { timeout: 90000 }, async t => {
    const config = { databaseUrl: process.env.TEST_DATABASE_URL, origin: 'http://127.0.0.1', googleClientId: 'test', googleClientSecret: 'test' };
    assert.ok(config.databaseUrl, 'Run with npm run test:database.');
    const pool = createPool(config), projects = new Projects(pool), app = createApp({ pool, config });
    app.listen(0, '127.0.0.1'); await once(app, 'listening'); config.origin = `http://127.0.0.1:${app.address().port}`;
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chrome) ? chrome : undefined) });
    t.after(async () => { await browser.close(); await new Promise(resolve => app.close(resolve)); await pool.end(); });
    const users = [], contexts = [], pages = [], tokens = [], errors = [];
    for (const name of ['Live owner', 'Live editor', 'Live viewer', 'Unrelated account']) {
        const id = (await pool.query('INSERT INTO visual_notes.users (display_name) VALUES ($1) RETURNING id', [name])).rows[0].id;
        const token = randomBytes(32).toString('base64url');
        await pool.query(`INSERT INTO visual_notes.sessions (token_hash, user_id, csrf_token, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')`, [tokenHash(token), id, token]);
        const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
        await context.addCookies([{ name: 'vn_session', value: token, url: config.origin }]);
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        users.push(id); contexts.push(context); pages.push(page); tokens.push(token);
    }
    const [owner, editor, viewer] = pages;
    const base = { title: 'Live board', coordinateVersion: 2, notes: [
        { id: 'one', x: 0, y: 0, width: 225, height: 135, title: 'One', text: 'First note' },
        { id: 'two', x: 360, y: 0, width: 225, height: 135, title: 'Two', text: 'Second note' }
    ], shapes: [], drawings: [], connections: [{ a: 'one', b: 'two' }] };
    const project = await projects.create(users[0], { requestId: randomUUID(), document: base });
    await projects.share(users[0], project.id, users[1], 'editor'); await projects.share(users[0], project.id, users[2], 'viewer');
    const url = `${config.origin}/visual-notes.html?storage=server&projectId=${project.id}`;
    const open = async page => { await page.goto(url); await page.waitForFunction(() => window.BoardCollaboration?.connected); };
    const idle = page => page.waitForFunction(() => window.ServerBoard?.queue && !ServerBoard.queue.pending && !ServerBoard.queue.running && !ServerBoard.queue.error);
    const edit = (page, title) => page.evaluate(title => { VisualNotes.updateProjectTitle(title); VisualNotes.commitHistoryTransaction(); return ServerBoard.flush(); }, title);

    await t.test('concurrent operation writes merge disjoint fields and enforce permission and conflicts', async () => {
        const copy = await projects.create(users[0], { requestId: randomUUID(), document: base });
        await projects.share(users[0], copy.id, users[1], 'editor'); await projects.share(users[0], copy.id, users[2], 'viewer');
        const left = D.clone(base), right = D.clone(base); left.notes[0].x = 90; right.notes[0].text = 'Concurrent text';
        const input = document => ({ expectedRevision: '1', changes: D.diff(base, document) });
        await Promise.all([projects.edit(users[0], copy.id, input(left)), projects.edit(users[1], copy.id, input(right))]);
        const stored = await projects.get(users[0], copy.id);
        assert.equal(stored.document.notes[0].x, 90); assert.equal(stored.document.notes[0].text, 'Concurrent text');
        assert.equal((await projects.edit(users[0], copy.id, input(left))).revision, stored.revision);
        left.notes[0].x = 180;
        await assert.rejects(projects.edit(users[0], copy.id, input(left)), error => error.status === 409);
        await assert.rejects(projects.edit(users[2], copy.id, input(left)), error => error.status === 403);
        const response = await fetch(`${config.origin}/api/projects/${project.id}/live?clientId=${randomUUID()}`, { headers: { Cookie: `vn_session=${tokens[3]}` } });
        assert.equal(response.status, 404);
        const csrf = await fetch(`${config.origin}/api/projects/${copy.id}/edits`, { method: 'POST', headers: { Cookie: `vn_session=${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input(left)) });
        assert.equal(csrf.status, 403);
    });
    await t.test('editors and viewer join, see named cursors and selections, and keep personal cameras', async () => {
        await Promise.all([open(owner), open(editor), open(viewer)]);
        await owner.waitForFunction(() => BoardCollaboration.peers.length === 2);
        await owner.evaluate(() => { VisualNotes.selectedNotes = ['one']; });
        await owner.mouse.move(500, 400);
        await editor.waitForFunction(() => BoardCollaboration.peers.some(peer => peer.name === 'Live owner' && peer.cursor && peer.selected.includes('one')));
        assert.ok(await editor.locator('.peerCursor').count()); assert.ok(await editor.locator('.peerSelection').count());
        const zoom = await editor.evaluate(() => VisualNotes.zoom);
        await owner.click('#zoomOut'); await idle(owner);
        assert.equal(await editor.evaluate(() => VisualNotes.zoom), zoom);
        await owner.click('#zoomIn');
    });
    await t.test('simultaneous creations survive on every board with distinct IDs', async () => {
        await Promise.all([owner, editor].map((page, index) => page.evaluate(index => {
            VisualNotes.createNoteAt(index * 300, 260, { title: `Created ${index}` }); return ServerBoard.flush();
        }, index)));
        await Promise.all([owner, editor, viewer].map(page => page.waitForFunction(() => VisualNotes.notes.length === 4)));
        const stored = await projects.get(users[0], project.id);
        assert.equal(new Set(stored.document.notes.map(note => note.id)).size, 4);
        assert.equal(stored.document.notes.filter(note => note.id.length === 36).length, 2);
    });
    await t.test('remote updates preserve the active text editor and undo only local changes', async () => {
        await owner.locator('[data-note-id="one"] textarea').fill('Typing locally');
        await idle(owner);
        await editor.evaluate(() => {
            VisualNotes.performHistoryChange(() => { VisualNotes.notes.find(note => note.id === 'two').title = 'Remote title'; });
            VisualNotes.saveBoard(); return ServerBoard.flush();
        });
        await owner.waitForFunction(() => VisualNotes.notes.find(note => note.id === 'two').title === 'Remote title');
        assert.equal(await owner.evaluate(() => document.activeElement.closest('.note')?.dataset.noteId), 'one');
        assert.equal(await owner.locator('[data-note-id="one"] textarea').inputValue(), 'Typing locally');
        await owner.locator('[data-note-id="one"] textarea').blur();
        await owner.evaluate(() => { VisualNotes.undo(); return ServerBoard.flush(); });
        await editor.waitForFunction(() => VisualNotes.notes.find(note => note.id === 'one').text === 'First note');
        assert.equal((await projects.get(users[0], project.id)).document.notes.find(note => note.id === 'two').title, 'Remote title');
        await owner.evaluate(() => { VisualNotes.redo(); return ServerBoard.flush(); });
        await viewer.waitForFunction(() => VisualNotes.notes.find(note => note.id === 'one').text === 'Typing locally');
    });
    await t.test('drawings, groups and UUID connections arrive live and survive deletion', async () => {
        await owner.evaluate(() => {
            VisualNotes.performHistoryChange(() => {
                VisualNotes.shapes.push({ id: crypto.randomUUID(), title: 'Shared group', x: 0, y: 0, width: 650, height: 500 });
                VisualNotes.drawings.push({ id: crypto.randomUUID(), color: '#123456', width: 3, points: [{ x: 20, y: 20 }, { x: 40, y: 50 }] });
                VisualNotes.connectNotes('one', VisualNotes.notes.find(note => note.title === 'Created 0').id);
            }); VisualNotes.saveBoard(); return ServerBoard.flush();
        });
        await viewer.waitForFunction(() => VisualNotes.shapes.length === 1 && VisualNotes.drawings.length === 1 && VisualNotes.connections.length === 2);
        await editor.evaluate(() => { VisualNotes.selectedNotes = ['one']; VisualNotes.deleteSelectedNotes(); return ServerBoard.flush(); });
        await owner.waitForFunction(() => !VisualNotes.notes.some(note => note.id === 'one'));
        const stored = await projects.get(users[0], project.id);
        assert.ok(stored.document.connections.every(edge => edge.a !== 'one' && edge.b !== 'one'));
    });
    await t.test('dragging and title typing publish before release without replacing active controls', async () => {
        await owner.evaluate(() => { VisualNotes.centerCameraOnNotes(); });
        const target = owner.locator('.note[data-note-id="two"] .noteHeader');
        const box = await target.boundingBox(); assert.ok(box);
        const originalX = await owner.evaluate(() => VisualNotes.notes.find(note => note.id === 'two').x);
        await owner.mouse.move(box.x + 15, box.y + 12); await owner.mouse.down();
        await owner.mouse.move(box.x + 110, box.y + 65, { steps: 5 });
        await editor.waitForFunction(x => VisualNotes.notes.find(note => note.id === 'two').x !== x, originalX);
        assert.equal(await owner.evaluate(() => Boolean(document.onmousemove)), true);
        await owner.mouse.up(); await idle(owner);
        await owner.locator('.note[data-note-id="two"] .noteTitle').click();
        await owner.locator('.noteTitleInput').fill('Live while typing');
        await editor.waitForFunction(() => VisualNotes.notes.find(note => note.id === 'two').title === 'Live while typing');
        assert.equal(await owner.locator('.noteTitleInput').isVisible(), true);
        await owner.locator('.noteTitleInput').press('Enter'); await idle(owner);
    });
    await t.test('offline edits merge on reconnect without erasing online changes', async () => {
        await contexts[0].setOffline(true);
        await edit(owner, 'Offline title');
        await owner.waitForFunction(() => ServerBoard.queue.error?.status === 0);
        await editor.evaluate(() => {
            VisualNotes.performHistoryChange(() => { VisualNotes.notes.find(note => note.id === 'two').text = 'Online edit'; });
            VisualNotes.saveBoard(); return ServerBoard.flush();
        });
        await contexts[0].setOffline(false);
        await idle(owner);
        await owner.waitForFunction(() => BoardCollaboration.connected && VisualNotes.notes.find(note => note.id === 'two').text === 'Online edit');
        await editor.waitForFunction(() => VisualNotes.projectTitle === 'Offline title');
    });
    await t.test('simultaneous same-field edits keep the loser in recovery instead of overwriting', async () => {
        await Promise.all([owner, editor].map(page => page.evaluate(() => { BoardCollaboration.source.close(); })));
        await Promise.all([edit(owner, 'Owner title'), edit(editor, 'Editor title')]);
        const states = await Promise.all([owner, editor].map(page => page.evaluate(() => ({ error: ServerBoard.queue.error?.status, title: VisualNotes.projectTitle }))));
        assert.equal(states.filter(state => state.error === 409).length, 1);
        const loser = states[0].error ? owner : editor;
        const draft = await loser.evaluate(() => JSON.parse(localStorage.getItem(ServerBoard.draftKey)));
        assert.ok(draft.baseDocument); assert.notEqual(draft.document.title, (await projects.get(users[0], project.id)).document.title);
        const copy = await loser.evaluate(() => ServerBoard.copy()); assert.equal(copy.document.title, draft.document.title);
        for (const page of [owner, editor]) {
            await page.evaluate(() => { localStorage.removeItem(ServerBoard.draftKey); ServerBoard.leaving = true; });
            await open(page);
        }
    });
    await t.test('revocation ends the live session and prevents further edits or document updates', async () => {
        await projects.share(users[0], project.id, users[1], null);
        await editor.waitForFunction(() => BoardCollaboration.blocked);
        const before = await editor.evaluate(() => VisualNotes.notes.length);
        await editor.keyboard.press('Control+b');
        assert.equal(await editor.evaluate(() => VisualNotes.notes.length), before);
        await edit(owner, 'Private after revocation');
        assert.notEqual(await editor.inputValue('#projectTitleInput'), 'Private after revocation');
        const expiredToken = tokens[2]; await pool.query('DELETE FROM visual_notes.sessions WHERE token_hash = $1', [tokenHash(expiredToken)]);
        await viewer.waitForFunction(() => BoardCollaboration.blocked && ServerBoard.queue.error?.status === 401);
    });
    assert.deepEqual(errors, []);
});
