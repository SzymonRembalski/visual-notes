const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const D = require('../assets/js/collaboration-document.js');
const board = () => ({ title: 'Board', coordinateVersion: 2, notes: [{ id: 'a', title: 'A', text: 'Hello', x: 0, y: 0 }, { id: 'b', title: 'B', x: 50, y: 50 }], shapes: [], connections: [], drawings: [] });
const context = vm.createContext({ window: {}, CollaborationDocument: D });
for (const file of ['server-save-queue.js', 'collaboration-queue.js']) vm.runInContext(readFileSync(join(__dirname, '../assets/js', file), 'utf8'), context);
const Queue = context.window.CollaborationQueue;

test('different fields and independently created objects merge; pending same-field edits take precedence', () => {
    const base = board(), left = board(), right = board();
    left.notes[0].x = 80; left.notes.push({ id: 'left', x: 0, y: 0 });
    right.notes[0].text = 'World'; right.notes.push({ id: 'right', x: 0, y: 0 });
    const result = D.merge(base, left, right);
    assert.equal(result.notes[0].x, 80); assert.equal(result.notes[0].text, 'World'); assert.equal(result.notes.length, 4);
    right.notes[0].x = 90;
    assert.equal(D.merge(base, left, right).notes[0].x, 80);
    assert.equal(right.notes.length, 3); assert.equal(base.notes[0].x, 0);
});
test('retry is idempotent despite PostgreSQL property order, and cannot erase a later edit', () => {
    const base = board(), after = board(); after.notes.push({ id: 'new', x: 3, y: 5 });
    const operations = D.diff(base, after), stored = D.apply(base, operations);
    stored.notes[2] = { y: 5, x: 3, id: 'new' };
    assert.equal(D.apply(stored, operations).notes.length, 3);
    stored.notes[2].x = 40;
    assert.throws(() => D.apply(stored, operations), error => error.status === 409);
});
test('connection IDs support UUIDs, deletion removes dangling edges, and old drawings gain stable IDs', () => {
    const base = board(), local = board(), remote = board();
    local.notes.shift(); remote.connections.push({ a: 'a', b: 'b' });
    assert.deepEqual(D.merge(base, local, remote).connections, []);
    assert.notEqual(D.key('connections', { a: 'a-a', b: 'b' }), D.key('connections', { a: 'a', b: 'a-b' }));
    base.drawings = [{ color: '#123456', width: 2, points: [{ x: 0, y: 0 }] }];
    assert.deepEqual(D.normalize(base), D.normalize(D.normalize(base)));
    assert.equal(base.drawings[0].id, undefined);
});
test('malformed edits cannot write protected fields or prototypes', () => {
    for (const field of ['__proto__', 'constructor', 'prototype', 'id']) assert.throws(() => D.apply(board(), [{ collection: 'notes', id: 'a', field, before: null, after: {} }]));
    assert.throws(() => D.apply(board(), [{ collection: 'document', field: 'ownerId', before: null, after: 'x' }]));
    assert.equal({}.polluted, undefined);
});
test('collaborative undo preserves another user’s different-field change and refuses same-field overwrite', () => {
    const base = board(), local = board(); local.notes[0].x = 20;
    const changes = D.diff(base, local), inverse = changes.map(change => ({ ...change, before: change.after, after: change.before }));
    local.notes[0].text = 'Remote text';
    const undone = D.apply(local, inverse); assert.equal(undone.notes[0].x, 0); assert.equal(undone.notes[0].text, 'Remote text');
    local.notes[0].x = 30; assert.throws(() => D.apply(local, inverse), error => error.status === 409);
});
test('live queue rebases edits made in flight and accepts a newer stream event after acknowledgment', async () => {
    let current = board(), resolve;
    const gate = new Promise(done => { resolve = done; }); let calls = 0; let draft;
    const queue = new Queue({ document: board(), view: {}, revision: '1', readDocument: () => current, onDocument: doc => { current = doc; },
        writeDocument: async document => {
            calls++; if (calls === 1) await gate;
            const remote = D.clone(document); remote.notes[1].title = 'Remote';
            return { revision: String(calls + 1), document: remote };
        }, writeView: async () => {}, persist: value => { draft = value; }, onChange: () => {} });
    current.notes[0].title = 'First'; queue.enqueue(current, {}); const saving = queue.flush();
    current.notes[0].title = 'Latest'; queue.enqueue(current, {});
    resolve(); assert.equal(await saving, true); assert.equal(calls, 2);
    assert.equal(current.notes[0].title, 'Latest'); assert.equal(current.notes[1].title, 'Remote'); assert.equal(draft, null);
    const newest = D.clone(current); newest.title = 'New server title'; queue.receive({ revision: '4', document: newest });
    assert.equal(current.title, newest.title); assert.equal(queue.revision, '4');
});
test('live same-field update keeps pending edits ready to save without conflict recovery', () => {
    let current = board(), draft;
    const queue = new Queue({ document: board(), view: {}, revision: '1', readDocument: () => current, onDocument: doc => { current = doc; },
        persist: value => { draft = value; }, onChange: () => {} });
    current.title = 'Mine'; queue.enqueue(current, {});
    const remote = board(); remote.title = 'Theirs'; queue.receive({ revision: '2', document: remote });
    assert.equal(queue.error, null); assert.equal(current.title, 'Mine'); assert.equal(draft.document.title, 'Mine'); assert.equal(draft.baseDocument.title, 'Theirs');
});
test('late field edits do not resurrect deleted objects and creation retries preserve newer edits', () => {
    const base = board(), edited = board(); edited.notes[0].text = 'Late text';
    const deleted = board(); deleted.notes.shift();
    assert.equal(D.merge(base, edited, deleted).notes.some(note => note.id === 'a'), false);
    const created = [{ collection: 'notes', id: 'a', before: null, after: base.notes[0] }];
    assert.equal(D.apply(edited, created, true).notes[0].text, 'Late text');
});
test('failed writes continue receiving remote changes and retain only unsaved local changes', async () => {
    let current = board(), draft, fail = true;
    const queue = new Queue({ document: board(), view: {}, revision: '1', readDocument: () => current, onDocument: doc => { current = doc; },
        writeDocument: async document => {
            if (fail) throw Object.assign(new Error('Temporary failure'), { status: 503 });
            return { document, revision: '3' };
        }, writeView: async () => {}, persist: value => { draft = value; }, onChange: () => {} });
    current.title = 'Local change'; queue.enqueue(current, {}); await queue.flush();
    const remote = board(); remote.notes[1].text = 'Visible live while saving is unavailable';
    queue.receive({ revision: '2', document: remote });
    assert.equal(current.notes[1].text, remote.notes[1].text); assert.equal(current.title, 'Local change');
    assert.equal(queue.error.status, 503); assert.equal(draft.baseDocument.notes[1].text, remote.notes[1].text);
    fail = false; assert.equal(await queue.retry(), true); assert.equal(draft, null);
});
test('a live acknowledgment clears an uncertain write failure when it confirms the pending edits', async () => {
    let current = board();
    const queue = new Queue({ document: board(), view: {}, revision: '1', readDocument: () => current, onDocument: doc => { current = doc; },
        writeDocument: async () => { throw Object.assign(new Error('Response lost'), { status: 0 }); }, persist: () => {}, onChange: () => {} });
    current.title = 'Already saved'; queue.enqueue(current, {}); await queue.flush();
    queue.receive({ revision: '2', document: D.clone(current) });
    assert.equal(queue.error, null); assert.equal(queue.pending, null);
});
test('camera-only changes do not count as unsaved shared edits', () => {
    const queue = new Queue({ document: board(), view: {}, revision: '1', persist: () => {}, onChange: () => {} });
    queue.enqueue(board(), { zoom: 0.5 }); assert.equal(queue.dirtyDocument, false);
    const changed = board(); changed.title = 'Unsaved'; queue.enqueue(changed, { zoom: 0.5 }); assert.equal(queue.dirtyDocument, true);
});
