// Shared, deterministic document operations used by both the browser and server.
const CollaborationDocument = (() => {
    const collections = ['notes', 'shapes', 'connections', 'drawings'];
    const clone = value => JSON.parse(JSON.stringify(value));
    const equal = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
        && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every(key => Object.hasOwn(b, key) && equal(a[key], b[key])));
    const key = (collection, item) => collection === 'connections'
        ? JSON.stringify([String(item.a), String(item.b)].sort()) : String(item.id);
    const conflict = () => Object.assign(new Error('Someone changed the same part of this project. Your edits are kept here; download them or save a separate copy before reloading.'), { status: 409 });
    function normalize(document) {
        const result = clone(document);
        const used = new Set(result.drawings.map(stroke => String(stroke.id)));
        const assigned = new Set();
        result.drawings.forEach((stroke, index) => {
            if (((Number.isSafeInteger(stroke.id) && stroke.id >= 0) || (typeof stroke.id === 'string' && /^[\w-]{1,128}$/.test(stroke.id))) && !assigned.has(String(stroke.id))) {
                assigned.add(String(stroke.id)); return;
            }
            let id = `legacy-drawing-${index}`;
            while (used.has(id)) id += '-old';
            stroke.id = id; used.add(id); assigned.add(id);
        });
        return result;
    }
    function diff(before, after) {
        const changes = [];
        for (const field of ['title', 'coordinateVersion']) {
            if (!equal(before[field], after[field])) changes.push({ collection: 'document', field, before: before[field], after: after[field] });
        }
        for (const collection of collections) {
            const a = new Map(before[collection].map(item => [key(collection, item), item]));
            const b = new Map(after[collection].map(item => [key(collection, item), item]));
            for (const id of new Set([...a.keys(), ...b.keys()])) {
                const previous = a.get(id), next = b.get(id);
                if (!previous || !next) {
                    changes.push({ collection, id, before: previous || null, after: next || null });
                } else for (const field of new Set([...Object.keys(previous), ...Object.keys(next)])) {
                    if (!equal(previous[field], next[field])) changes.push({ collection, id, field,
                        before: previous[field] ?? null, after: next[field] ?? null });
                }
            }
        }
        return changes;
    }
    function apply(document, changes, overwrite = false) {
        if (!Array.isArray(changes) || changes.length > 100000) throw new Error('Invalid collaboration changes.');
        const result = clone(document);
        const indexes = Object.fromEntries(collections.map(name => [name, new Map(result[name].map(item => [key(name, item), item]))]));
        for (const change of changes) {
            const { collection, id, field, before, after } = change;
            if (!Object.hasOwn(change, 'before') || !Object.hasOwn(change, 'after')) throw new Error('Invalid collaboration change.');
            if (collection === 'document') {
                if (!['title', 'coordinateVersion'].includes(field)) throw new Error('Invalid document field.');
                if (!overwrite && !equal(result[field], before) && !equal(result[field], after)) throw conflict();
                result[field] = after;
                continue;
            }
            if (!collections.includes(collection) || typeof id !== 'string' || id.length > 300) throw new Error('Invalid collection.');
            const items = indexes[collection], current = items.get(id);
            if (field !== undefined) {
                if (typeof field !== 'string' || field.length > 100 || ['__proto__', 'constructor', 'prototype', 'id', 'a', 'b'].includes(field)) throw new Error('Invalid item field.');
                if (!current) { if (overwrite) continue; throw conflict(); }
                const value = Object.hasOwn(current, field) ? current[field] : null;
                if (!overwrite && !equal(value, before) && !equal(value, after)) throw conflict();
                current[field] = clone(after);
            } else {
                if (!overwrite && !equal(current || null, before) && !equal(current || null, after)) throw conflict();
                // A retried creation must not replace subsequent edits to that object.
                if (overwrite && before === null && current) continue;
                if (after === null) items.delete(id);
                else {
                    if (!after || typeof after !== 'object' || Array.isArray(after) || key(collection, after) !== id) throw new Error('Invalid item.');
                    items.set(id, clone(after));
                }
            }
        }
        for (const collection of collections) result[collection] = [...indexes[collection].values()];
        // Deleting a note also removes connections created to it by another editor.
        const notes = new Set(result.notes.map(note => String(note.id)));
        result.connections = result.connections.filter(edge => notes.has(String(edge.a)) && notes.has(String(edge.b)));
        return result;
    }
    const merge = (base, local, remote) => apply(remote, diff(base, local), true);
    return { clone, equal, key, normalize, diff, apply, merge, conflict };
})();
if (typeof module !== 'undefined') module.exports = CollaborationDocument;
else window.CollaborationDocument = CollaborationDocument;
