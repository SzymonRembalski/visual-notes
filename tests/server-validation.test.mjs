import test from 'node:test';
import assert from 'node:assert/strict';
import { documentPayload, viewPayload, revision } from '../server/validation.mjs';

const board = () => ({ title: 'Board', coordinateVersion: 2, notes: [{ id: 1, x: 0, y: 0, title: '<b>Text</b>', imageSrc: 'data:image/png;base64,aA==' }], connections: [], shapes: [], drawings: [] });
test('valid payload preserves text/images while excluding views and server metadata', () => {
    const value = board();
    assert.deepEqual(documentPayload({ ...value, zoom: 0.2, ownerId: 'attacker', revision: '100' }), value);
    assert.deepEqual(viewPayload({ panX: 0, zoom: 0.5, drawingsVisible: false, document: value }), { panX: 0, zoom: 0.5, drawingsVisible: false });
});

test('invalid geometry, duplicate IDs, dangling connections and malformed drawings are rejected', () => {
    const invalid = [
        { notes: [{ id: 1, x: null, y: 0 }] },
        { notes: [{ id: 1, x: 0, y: 0, width: -1 }] },
        { notes: [{ id: 'bad"id', x: 0, y: 0 }] },
        { notes: [{ id: 1, x: 0, y: 0 }, { id: '1', x: 1, y: 1 }] },
        { connections: [{ a: 1, b: 2 }] },
        { drawings: [{ color: '#ffffff', width: 4, points: [{ x: 0, y: null }] }] },
        { drawings: [{ color: 'red', width: 4, points: [{ x: 0, y: 0 }] }] },
        { notes: [{ id: 1, x: 0, y: 0, imageSrc: 'javascript:alert(1)' }] },
        { notes: [{ id: 1, x: 0, y: 0, title: {} }] },
        { coordinateVersion: 99 }
    ];
    for (const value of invalid) assert.throws(() => documentPayload({ ...board(), ...value }), error => error.status === 400);
    for (const value of [0, '0', '01', '1.2', '9223372036854775807']) assert.throws(() => revision(value));
    assert.equal(revision('9223372036854775806'), '9223372036854775806');
    assert.throws(() => viewPayload({ zoom: 0 }));
    assert.throws(() => viewPayload({ drawingsVisible: 'false' }));
});
