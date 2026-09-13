const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createApp(entries = {}, search = '') {
    const values = new Map(Object.entries(entries));
    const status = { textContent: '', parentElement: { dataset: {} } };
    let notifications = 0;
    const context = vm.createContext({
        localStorage: {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value))
        },
        document: { getElementById: id => id === 'workspaceSaveLabel' ? status : null },
        location: { search }, innerWidth: 1200, innerHeight: 800,
        URLSearchParams,
        LocalBackupManager: { notifyChange: () => notifications++ }
    });
    context.window = context;
    for (const name of ['canvas-utils', 'history-manager', 'project-manager', 'drawing-layer', 'board-camera', 'board-storage', 'visual-notes']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', name + '.js'), 'utf8'), context);
    }
    context.VisualNotes.render = () => {};
    context.DrawingLayer.updateControls = () => {};
    return { ...context, values, status, notifications: () => notifications };
}

function fillBoard(board) {
    Object.assign(board, {
        projectTitle: 'Board',
        notes: [{ id: 1, x: 100, y: 200, width: 225, height: 135, title: 'Note', text: 'Body', imageSrc: 'data:image/png;base64,fixture' }],
        connections: [{ a: 1, b: 2 }],
        shapes: [{ id: 3, x: 0, y: 0, width: 500, height: 400 }],
        drawings: [{ color: '#91bda0', width: 4, points: [{ x: 1, y: 2 }] }],
        drawingsVisible: false, panX: 400, panY: 150, zoom: 0.5, snappingEnabled: false,
        selectedNotes: [1], selectedShapeId: 3
    });
}

test('document and view projections exclude transient selection and history', () => {
    const app = createApp();
    fillBoard(app.VisualNotes);
    const document = app.BoardStorage.getDocument(app.VisualNotes);
    const view = app.BoardStorage.getView(app.VisualNotes);
    assert.deepEqual(Object.keys(document).sort(), ['connections', 'coordinateVersion', 'drawings', 'notes', 'shapes', 'title']);
    assert.deepEqual(Object.keys(view).sort(), ['drawingsVisible', 'panX', 'panY', 'snappingEnabled', 'zoom']);
    assert.equal(document.title, 'Board');
    assert.equal(document.notes[0].imageSrc, 'data:image/png;base64,fixture');
});

test('legacy save retains existing keys, unrelated data, and one backup notification', () => {
    const app = createApp({ tasksV2: '[{"name":"Keep"}]', visualAppSettings: '{"appearance":"paper"}' });
    fillBoard(app.VisualNotes);
    app.VisualNotes.saveBoard();
    assert.equal(app.values.get('tasksV2'), '[{"name":"Keep"}]');
    assert.equal(app.values.get('visualAppSettings'), '{"appearance":"paper"}');
    assert.equal(app.values.get('visualTitle'), 'Board');
    assert.equal(app.values.get('visualPanX'), '400');
    assert.equal(app.values.get('visualDrawingsVisible'), 'false');
    assert.equal(app.values.get('visualSnappingEnabled'), 'false');
    assert.equal(app.notifications(), 1);
    const loaded = app.BoardStorage.load(null);
    assert.equal(loaded.notes[0].id, 1);
    assert.equal(loaded.drawings[0].points[0].y, 2);
    assert.equal(app.status.parentElement.dataset.saved, 'true');
});

test('named save updates one project and preserves metadata', () => {
    const other = { id: 2, title: 'Other', notes: [] };
    const app = createApp({ visualProjects: JSON.stringify([{ id: 1, createdAt: 123, custom: 'Keep' }, other]), visualTitle: 'Legacy board' });
    fillBoard(app.VisualNotes);
    app.VisualNotes.projectId = '1';
    app.VisualNotes.saveBoard();
    const projects = JSON.parse(app.values.get('visualProjects'));
    assert.equal(projects.length, 2);
    assert.deepEqual(projects[1], other);
    assert.equal(projects[0].createdAt, 123);
    assert.equal(projects[0].custom, 'Keep');
    assert.equal(projects[0].panX, 400);
    assert.equal(projects[0].notes[0].id, 1);
    assert.equal(typeof projects[0].modifiedAt, 'number');
    assert.equal(app.values.get('visualTitle'), 'Legacy board');
    assert.equal(app.notifications(), 1);
});

test('saving a missing named project creates it without duplicating subsequent saves', () => {
    const app = createApp();
    fillBoard(app.VisualNotes);
    app.VisualNotes.projectId = 'new';
    app.VisualNotes.saveBoard();
    app.VisualNotes.saveBoard();
    assert.equal(JSON.parse(app.values.get('visualProjects')).length, 1);
});

test('opening a named project does not parse unrelated malformed legacy data', () => {
    const app = createApp({ visualNotes: '{broken', visualProjects: JSON.stringify([{ id: 'valid', title: 'Named', coordinateVersion: 2, panX: 10, panY: 20, zoom: 0.5 }]) }, '?projectId=valid');
    app.VisualNotes.loadBoard();
    assert.equal(app.VisualNotes.projectTitle, 'Named');
    assert.equal(app.VisualNotes.panX, 10);
    assert.equal(app.values.get('visualNotes'), '{broken');
    assert.equal(app.notifications(), 0);
});

test('a missing named project never opens the legacy board', () => {
    const app = createApp({ visualTitle: 'Private legacy board', visualNotes: '[{"id":1}]' }, '?projectId=missing');
    app.VisualNotes.loadBoard();
    assert.equal(app.VisualNotes.projectTitle, 'Untitled Project');
    assert.equal(app.VisualNotes.notes.length, 0);
    assert.equal(app.notifications(), 0);
});

test('legacy coordinate migration and camera centering are preserved', () => {
    const app = createApp({ visualNotes: JSON.stringify([{ id: 1, x: 100, y: 200, width: 225, height: 135, text: 'Body' }]) });
    app.VisualNotes.loadBoard();
    assert.equal(app.VisualNotes.notes[0].x, -112.5);
    assert.equal(app.VisualNotes.notes[0].y, -67.5);
    assert.equal(app.VisualNotes.panX, 600);
    assert.equal(app.VisualNotes.panY, 375);
    assert.equal(app.values.get('visualCoordinateVersion'), '2');
    assert.equal(app.notifications(), 1);
});

test('named coordinate migration preserves the visible position', () => {
    const app = createApp({ visualProjects: JSON.stringify([{ id: 'old', panX: 400, panY: 150, zoom: 0.5, notes: [{ id: 1, x: 100, y: 200, width: 225, height: 135, text: 'Body' }] }]) }, '?projectId=old');
    app.VisualNotes.loadBoard();
    assert.equal(app.VisualNotes.panX, 506.25);
    assert.equal(app.VisualNotes.panY, 283.75);
    assert.equal(app.VisualNotes.notes[0].x, -112.5);
    assert.equal(app.notifications(), 1);
});

test('current legacy data restores view and drawing visibility without rewriting it', () => {
    const app = createApp();
    fillBoard(app.VisualNotes);
    app.VisualNotes.saveBoard();
    const restored = createApp(Object.fromEntries(app.values));
    restored.VisualNotes.loadBoard();
    assert.equal(restored.VisualNotes.panX, 400);
    assert.equal(restored.VisualNotes.panY, 150);
    assert.equal(restored.VisualNotes.zoom, 0.5);
    assert.equal(restored.VisualNotes.drawingsVisible, false);
    assert.equal(restored.VisualNotes.snappingEnabled, false);
    assert.equal(restored.notifications(), 0);
});

test('suspended persistence leaves saved data untouched', () => {
    const app = createApp({ visualTitle: 'Keep' });
    fillBoard(app.VisualNotes);
    app.VisualNotes.suspendPersistence = true;
    app.VisualNotes.saveBoard();
    assert.deepEqual([...app.values], [['visualTitle', 'Keep']]);
    assert.equal(app.notifications(), 0);
});

test('failed storage writes do not claim success or notify backups', () => {
    const app = createApp();
    app.localStorage.setItem = () => { throw new Error('Storage full'); };
    assert.throws(() => app.VisualNotes.saveBoard(), /Storage full/);
    assert.equal(app.status.parentElement.dataset.saved, 'false');
    assert.equal(app.notifications(), 0);
});

test('invalid active legacy JSON is reported without replacing the stored value', () => {
    const app = createApp({ visualNotes: '{broken' });
    assert.throws(() => app.VisualNotes.loadBoard(), { name: 'SyntaxError' });
    assert.equal(app.values.get('visualNotes'), '{broken');
    assert.equal(app.notifications(), 0);
});
