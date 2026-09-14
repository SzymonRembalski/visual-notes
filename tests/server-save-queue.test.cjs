const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(require('node:path').join(__dirname, '../assets/js/server-save-queue.js'), 'utf8'), context);
const Queue = context.window.ServerSaveQueue;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function queue(options = {}) {
    const events = { drafts: [], writes: [] };
    const instance = new Queue({ document: { title: 'Initial' }, view: {}, revision: '1',
        writeDocument: async (document, revision) => { events.writes.push({ document, revision }); return { revision: String(Number(revision) + 1) }; },
        writeView: async () => {}, persist: draft => events.drafts.push(draft ? JSON.parse(JSON.stringify(draft)) : null), onChange: () => {}, ...options });
    return { instance, events };
}
test('snapshots are copied and saves serialize without acknowledging newer edits early', async () => {
    const first = deferred(); const writes = [];
    const { instance } = queue({ writeDocument: async (document, revision) => {
        writes.push({ title: document.title, revision });
        if (writes.length === 1) await first.promise;
        return { revision: String(Number(revision) + 1) };
    } });
    const document = { title: 'First' };
    instance.enqueue(document, {});
    const saving = instance.flush();
    document.title = 'Second'; instance.enqueue(document, {}); document.title = 'Not queued';
    assert.equal(writes.length, 1); assert.ok(instance.pending);
    first.resolve(); assert.equal(await saving, true);
    assert.deepEqual(writes, [{ title: 'First', revision: '1' }, { title: 'Second', revision: '2' }]);
    assert.equal(instance.pending, null); assert.equal(instance.revision, '3');
});
test('reverting to the saved value replaces a pending edit before it is sent', async () => {
    const { instance, events } = queue();
    instance.enqueue({ title: 'Edit' }, {}); instance.enqueue({ title: 'Initial' }, {});
    await instance.flush(); assert.equal(events.writes.length, 0); assert.equal(events.drafts.at(-1), null);
});
test('a conflict keeps the newest draft and stops automatic writes until explicit retry', async () => {
    let calls = 0;
    const { instance, events } = queue({ writeDocument: async () => { calls++; throw Object.assign(new Error('Conflict'), { status: 409 }); } });
    instance.enqueue({ title: 'Keep me' }, {}); assert.equal(await instance.flush(), false);
    instance.enqueue({ title: 'And these edits' }, {}); assert.equal(await instance.flush(), false);
    assert.equal(calls, 1); assert.equal(events.drafts.at(-1).document.title, 'And these edits');
    assert.equal(events.drafts.at(-1).revision, '1');
    await instance.retry(); assert.equal(calls, 2);
});
test('retrying a failed view save uses the acknowledged document revision', async () => {
    let fails = true;
    const { instance, events } = queue({ writeView: async () => { if (fails) throw new Error('Offline'); } });
    instance.enqueue({ title: 'Saved document' }, { zoom: 0.5 });
    assert.equal(await instance.flush(), false); assert.equal(events.drafts.at(-1).revision, '2');
    fails = false; assert.equal(await instance.retry(), true); assert.equal(events.writes.length, 1);
    assert.equal(events.drafts.at(-1), null);
});
test('viewers can persist their view without writing the shared document', async () => {
    let view;
    const { instance, events } = queue({ readonly: true, writeView: async value => { view = value; } });
    instance.enqueue({ title: 'Cannot save this' }, { zoom: 0.5 }); await instance.flush();
    assert.equal(events.writes.length, 0); assert.equal(view.zoom, 0.5);
});
