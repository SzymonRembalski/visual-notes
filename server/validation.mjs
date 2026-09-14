export class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

export function requireValue(condition, message = 'Invalid request.') {
    if (!condition) throw new HttpError(400, message);
}

export function uuid(value) {
    requireValue(typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value), 'Invalid identifier.');
    return value.toLowerCase();
}

export function revision(value) {
    requireValue(typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)
        && BigInt(value) < 9223372036854775807n, 'A valid expected revision is required.');
    return value;
}

export function documentPayload(value) {
    requireValue(value && typeof value === 'object' && !Array.isArray(value), 'A board document is required.');
    requireValue(typeof value.title === 'string' && value.title.length <= 1000, 'Invalid project title.');
    requireValue([1, 2].includes(value.coordinateVersion), 'Unsupported coordinate version.');
    const document = { title: value.title, coordinateVersion: value.coordinateVersion };
    for (const [field, limit] of Object.entries({ notes: 10000, connections: 50000, shapes: 10000, drawings: 20000 })) {
        const items = value[field];
        requireValue(Array.isArray(items) && items.length <= limit && items.every(item => item && typeof item === 'object' && !Array.isArray(item)), `Invalid ${field}.`);
        document[field] = items;
    }
    const id = value => (Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && /^[\w-]{1,128}$/.test(value));
    const coordinate = value => Number.isFinite(value) && Math.abs(value) <= 1e9;
    for (const items of [document.notes, document.shapes]) {
        const ids = new Set();
        for (const item of items) {
            requireValue(id(item.id) && !ids.has(String(item.id)), 'Board item IDs must be valid and unique.');
            ids.add(String(item.id));
            requireValue(coordinate(item.x) && coordinate(item.y), 'Invalid board coordinates.');
            for (const field of ['width', 'height']) {
                requireValue(item[field] === undefined || (coordinate(item[field]) && item[field] > 0), 'Invalid board dimensions.');
            }
            for (const field of ['title', 'text']) {
                requireValue(item[field] === undefined || (typeof item[field] === 'string' && item[field].length <= 1000000), 'Invalid board text.');
            }
            requireValue(item.color == null || /^#[0-9a-f]{6}$/i.test(item.color), 'Invalid board color.');
            requireValue(item.imageSrc == null || (typeof item.imageSrc === 'string' &&
                /^(data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,|https?:\/\/)/i.test(item.imageSrc)), 'Invalid image source.');
        }
    }
    const noteIds = new Set(document.notes.map(note => String(note.id)));
    for (const connection of document.connections) {
        requireValue(id(connection.a) && id(connection.b) && noteIds.has(String(connection.a)) && noteIds.has(String(connection.b)), 'A connection refers to a missing note.');
    }
    let points = 0;
    for (const stroke of document.drawings) {
        requireValue(/^#[0-9a-f]{6}$/i.test(stroke.color) && Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 30, 'Invalid drawing style.');
        requireValue(Array.isArray(stroke.points) && stroke.points.length > 0, 'Invalid drawing points.');
        points += stroke.points.length;
        requireValue(points <= 500000 && stroke.points.every(point => point && coordinate(point.x) && coordinate(point.y)), 'Invalid drawing points.');
    }
    // Shared documents never include personal views or server-controlled metadata.
    return document;
}

export function viewPayload(value) {
    requireValue(value && typeof value === 'object' && !Array.isArray(value), 'A view is required.');
    const view = {};
    for (const field of ['panX', 'panY', 'zoom']) {
        if (value[field] === undefined) continue;
        requireValue(Number.isFinite(value[field]) && Math.abs(value[field]) <= 1e9, `Invalid ${field}.`);
        view[field] = value[field];
    }
    requireValue(view.zoom === undefined || (view.zoom >= 0.2 && view.zoom <= 1), 'Invalid zoom.');
    for (const field of ['snappingEnabled', 'drawingsVisible']) {
        if (value[field] === undefined) continue;
        requireValue(typeof value[field] === 'boolean', `Invalid ${field}.`);
        view[field] = value[field];
    }
    return view;
}
