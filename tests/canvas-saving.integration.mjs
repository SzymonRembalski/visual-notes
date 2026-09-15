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

test('overlapping canvas actions and silent save recovery', { timeout: 90000 }, async t => {
    const config = { databaseUrl: process.env.TEST_DATABASE_URL, origin: 'http://127.0.0.1', googleClientId: 'test', googleClientSecret: 'test' };
    assert.ok(config.databaseUrl, 'Run node tests/run-database-tests.mjs --canvas');
    const pool = createPool(config), projects = new Projects(pool), app = createApp({ pool, config, log: () => {} });
    app.listen(0, '127.0.0.1'); await once(app, 'listening'); config.origin = `http://127.0.0.1:${app.address().port}`;
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chrome) ? chrome : undefined) });
    t.after(async () => { await browser.close(); await new Promise(resolve => app.close(resolve)); await pool.end(); });
    const pages = [], users = [], errors = [], dialogs = [];
    for (const name of ['Canvas owner', 'Canvas editor']) {
        const id = (await pool.query('INSERT INTO visual_notes.users (display_name) VALUES ($1) RETURNING id', [name])).rows[0].id;
        const token = randomBytes(32).toString('base64url');
        await pool.query(`INSERT INTO visual_notes.sessions (token_hash, user_id, csrf_token, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')`, [tokenHash(token), id, token]);
        const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
        await context.addCookies([{ name: 'vn_session', value: token, url: config.origin }]);
        const page = await context.newPage(); pages.push(page); users.push(id);
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.dismiss(); });
    }
    const [owner, editor] = pages;
    const idle = page => page.waitForFunction(() => window.ServerBoard?.queue && !ServerBoard.queue.pending && !ServerBoard.queue.running && !ServerBoard.queue.error);
    const open = async (page, url) => { await page.goto(url); await page.waitForFunction(() => window.BoardCollaboration?.connected); await idle(page); };
    const fresh = async () => {
        const project = await projects.create(users[0], { requestId: randomUUID(), document: {
            title: 'Canvas saving fixture', coordinateVersion: 2,
            notes: ['one', 'two'].map((id, i) => ({ id, x: i * 350, y: 0, width: 225, height: 135, title: id, text: 'Text' })),
            shapes: [{ id: 'group', x: -40, y: -40, width: 650, height: 260, title: 'Group' }],
            drawings: [], connections: [{ a: 'one', b: 'two' }]
        } });
        await projects.share(users[0], project.id, users[1], 'editor');
        const url = `${config.origin}/visual-notes.html?storage=server&projectId=${project.id}`;
        await Promise.all(pages.map(page => open(page, url)));
        return { project, url };
    };

    await t.test('a delayed save reply allows live edits during dragging and preserves later movement', async () => {
        const { project } = await fresh();
        let release, held = false;
        const gate = new Promise(resolve => { release = resolve; });
        await owner.route('**/api/projects/*/edits', async route => {
            if (held) return route.continue();
            held = true; const response = await route.fetch(); await gate; await route.fulfill({ response });
        });
        try {
            await owner.evaluate(() => VisualNotes.centerCameraOnNotes());
            const box = await owner.locator('[data-note-id="one"] .noteHeader').boundingBox();
            await owner.mouse.move(box.x + 12, box.y + 12); await owner.mouse.down();
            await owner.mouse.move(box.x + 70, box.y + 45, { steps: 5 });
            await owner.waitForFunction(() => Boolean(ServerBoard.queue.running));
            await editor.evaluate(() => {
                VisualNotes.notes[1].text = 'Remote while dragging'; VisualNotes.shapes[0].width += 100;
                VisualNotes.saveBoard(); return ServerBoard.flush();
            });
            await owner.waitForFunction(() => VisualNotes.notes[1].text === 'Remote while dragging', null, { timeout: 3000 });
            assert.equal(await owner.evaluate(() => Boolean(document.onmousemove)), true);
            await owner.mouse.move(box.x + 160, box.y + 90, { steps: 6 }); await owner.mouse.up();
            const finalX = await owner.evaluate(() => VisualNotes.notes[0].x);
            release(); await Promise.all(pages.map(idle));
            const saved = await projects.get(users[0], project.id);
            assert.equal(saved.document.notes[0].x, finalX);
            assert.equal(saved.document.notes[1].text, 'Remote while dragging');
            assert.equal(saved.document.shapes[0].width, 750);
        } finally { release(); await owner.unroute('**/api/projects/*/edits'); }
    });

    await t.test('mixed remote text and geometry keep moving elements and interpolate display only', async () => {
        await fresh();
        const result = await owner.evaluate(async () => {
            BoardCollaboration.source.close();
            const next = BoardCollaboration.document(), note = document.querySelector('[data-note-id="one"]');
            const shape = document.querySelector('[data-shape-id="group"]');
            next.notes[0].x += 240; next.shapes[0].width += 150; next.notes[1].text = 'Changed together';
            BoardCollaboration.apply(next);
            const reused = note === document.querySelector('[data-note-id="one"]') && shape === document.querySelector('[data-shape-id="group"]');
            const animated = BoardCollaboration.motion.size === 2;
            await new Promise(resolve => setTimeout(resolve, 45));
            const x = BoardCollaboration.displayed(VisualNotes.notes[0]).x;
            const between = x > 0 && x < 240;
            await new Promise(resolve => setTimeout(resolve, 160));
            const exact = CollaborationDocument.equal(BoardCollaboration.document(), next);
            return { reused, animated, between, exact };
        });
        assert.ok(Object.values(result).every(Boolean), JSON.stringify(result));
    });

    await t.test('repeated failed saves keep many local actions, receive remote edits and retry without dialogs', async () => {
        const { project } = await fresh();
        await owner.route('**/api/projects/*/edits', route => route.fulfill({ status: 503, json: { error: 'Temporary failure' } }));
        await owner.evaluate(() => {
            VisualNotes.createNoteAt(100, 300, { title: 'Created during outage' });
            VisualNotes.notes[0].x = 120; VisualNotes.shapes[0].height = 420;
            VisualNotes.connectNotes('two', VisualNotes.notes.at(-1).id);
            VisualNotes.saveBoard(); return ServerBoard.flush();
        });
        await owner.waitForFunction(() => ServerBoard.queue.error?.status === 503);
        await editor.evaluate(() => { VisualNotes.notes[1].text = 'Still live'; VisualNotes.saveBoard(); return ServerBoard.flush(); });
        await owner.waitForFunction(() => VisualNotes.notes[1].text === 'Still live');
        await owner.evaluate(() => { VisualNotes.notes[0].y = 95; VisualNotes.saveBoard(); });
        assert.equal(await owner.locator('.serverNotice').isVisible(), false);
        assert.ok(await owner.evaluate(() => Boolean(localStorage.getItem(ServerBoard.draftKey))));
        await owner.unroute('**/api/projects/*/edits'); await Promise.all(pages.map(idle));
        const saved = await projects.get(users[0], project.id);
        assert.equal(saved.document.notes.length, 3); assert.equal(saved.document.notes[0].y, 95);
        assert.equal(saved.document.notes[1].text, 'Still live'); assert.equal(saved.document.shapes[0].height, 420);
        assert.equal(saved.document.connections.length, 2);
        assert.equal(await owner.locator('.serverNotice').isVisible(), false);
    });

    await t.test('drawing survives concurrent text edits and stops cleanly when another editor erases the active stroke', async () => {
        await fresh();
        await owner.evaluate(() => DrawingLayer.setTool('pen'));
        await owner.mouse.move(430, 520); await owner.mouse.down(); await owner.mouse.move(480, 570, { steps: 8 });
        await editor.waitForFunction(() => VisualNotes.drawings.length === 1);
        await owner.evaluate(() => { window.strokePath = DrawingLayer.elements.get(DrawingLayer.stroke).path; });
        await editor.evaluate(() => { VisualNotes.notes[1].text = 'Typing during drawing'; VisualNotes.saveBoard(); return ServerBoard.flush(); });
        await owner.waitForFunction(() => VisualNotes.notes[1].text === 'Typing during drawing');
        assert.equal(await owner.evaluate(() => window.strokePath === DrawingLayer.elements.get(DrawingLayer.stroke).path), true);
        await owner.mouse.move(520, 610, { steps: 5 });
        await editor.evaluate(() => { VisualNotes.drawings = []; VisualNotes.saveBoard(); return ServerBoard.flush(); });
        await owner.waitForFunction(() => DrawingLayer.stroke === null && DrawingLayer.pointerId === null);
        await owner.mouse.move(550, 620); await owner.mouse.up();
        await Promise.all(pages.map(idle));
        assert.equal(await owner.evaluate(() => VisualNotes.drawings.length), 0);
    });

    await t.test('deleting a note being resized ends the gesture without resurrecting it', async () => {
        await fresh();
        await owner.evaluate(() => {
            const note = VisualNotes.notes[0];
            VisualNotes.startResize(note, 'se', { clientX: 500, clientY: 500, preventDefault() {}, stopPropagation() {} });
        });
        await editor.evaluate(() => { VisualNotes.selectedNotes = ['one']; VisualNotes.deleteSelectedNotes(); return ServerBoard.flush(); });
        await owner.waitForFunction(() => !VisualNotes.notes.some(note => note.id === 'one'));
        assert.equal(await owner.evaluate(() => !document.onmousemove && !VisualNotes.resizingNote), true);
        await owner.mouse.move(700, 650); await owner.mouse.up(); await idle(owner);
        assert.equal(await editor.evaluate(() => VisualNotes.notes.length), 1);
    });

    await t.test('leaving and reopening after save failure restores the draft without a popup', async () => {
        const { project, url } = await fresh();
        await owner.route('**/api/projects/*/edits', route => route.abort());
        await owner.fill('#projectTitleInput', 'Recover after leaving'); await owner.locator('#projectTitleInput').blur();
        await owner.waitForFunction(() => ServerBoard.queue.error?.status === 0);
        assert.equal(await owner.evaluate(() => {
            const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
        }), false);
        await owner.click('.workspaceBreadcrumb a[href="projects.html"]'); await owner.waitForURL('**/projects.html');
        await owner.unroute('**/api/projects/*/edits'); await open(owner, url);
        assert.equal((await projects.get(users[0], project.id)).document.title, 'Recover after leaving');
        assert.equal(await owner.locator('.serverNotice').isVisible(), false);
    });
    await t.test('failed draft storage keeps the canvas open without a modal until edits can save', async () => {
        const { url } = await fresh();
        await owner.route('**/api/projects/*/edits', route => route.abort());
        await owner.evaluate(() => {
            window.originalSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function(key, value) {
                if (key.startsWith('visualDraft:')) throw new Error('Storage full');
                return window.originalSetItem.call(this, key, value);
            };
        });
        try {
            await owner.fill('#projectTitleInput', 'Only in this tab'); await owner.locator('#projectTitleInput').blur();
            await owner.waitForFunction(() => ServerBoard.draftError && ServerBoard.queue.error);
            await owner.click('.workspaceBreadcrumb a[href="projects.html"]');
            assert.equal(owner.url(), url);
            assert.equal(await owner.locator('.serverNotice').isVisible(), false);
            assert.equal(await owner.evaluate(() => ServerBoard.leaving === true), false);
        } finally {
            await owner.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
            await owner.unroute('**/api/projects/*/edits');
        }
        await owner.evaluate(() => ServerBoard.manualSave()); await idle(owner);
        await owner.click('.workspaceBreadcrumb a[href="projects.html"]'); await owner.waitForURL('**/projects.html');
    });
    assert.deepEqual(dialogs, []); assert.deepEqual(errors, []);
});
