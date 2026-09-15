import { HttpError, requireValue, uuid } from './validation.mjs';
import { createLogger, errorCode } from './logger.mjs';

// Presence is ephemeral; documents and permissions always come from PostgreSQL.
// One backend process per deployment, as in the supplied Compose configuration.
export class Collaboration {
    constructor(auth, projects, log = createLogger()) {
        Object.assign(this, { auth, projects, log });
        this.clients = new Map();
        this.timer = setInterval(() => this.refresh(), 1000);
        this.timer.unref();
    }
    send(client, event, data) {
        if (this.clients.get(client.id) !== client || client.res.destroyed || client.res.writableEnded) return this.remove(client);
        if (client.res.writableLength > 20 * 1024 * 1024) { client.res.destroy(); return this.remove(client); }
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    remove(client) {
        if (this.clients.get(client.id) !== client) return;
        this.clients.delete(client.id);
        client.res.end();
    }
    async open(req, res, session, projectId, clientId) {
        clientId = uuid(clientId); projectId = uuid(projectId);
        await this.projects.liveState(session.id, projectId);
        const previous = this.clients.get(clientId);
        if (previous && previous.userId !== session.id) throw new HttpError(409, 'This live connection ID is already in use.');
        const peers = [...this.clients.values()].filter(peer => peer !== previous);
        if (peers.length >= 500 || peers.filter(peer => peer.userId === session.id).length >= 8 || peers.filter(peer => peer.projectId === projectId).length >= 50) {
            throw new HttpError(429, 'Too many live boards are open. Close an unused tab and try again.');
        }
        if (previous) this.remove(previous);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        const client = { id: clientId, projectId, userId: session.id, displayName: session.displayName, req, res, revision: null, cursor: null, selected: [], lastCursor: 0 };
        this.clients.set(clientId, client);
        res.on('close', () => this.remove(client));
        await this.refresh();
    }
    async presence(session, projectId, input) {
        const client = this.clients.get(uuid(input.clientId));
        if (!client || client.userId !== session.id || client.projectId !== uuid(projectId)) throw new HttpError(409, 'Live connection is reconnecting.');
        await this.projects.liveState(session.id, projectId, client.revision);
        const cursor = input.cursor;
        requireValue(cursor === null || (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) && Math.abs(cursor.x) <= 1e9 && Math.abs(cursor.y) <= 1e9), 'Invalid cursor.');
        requireValue(Array.isArray(input.selected) && input.selected.length <= 100 && input.selected.every(id => typeof id === 'string' && /^[\w-]{1,128}$/.test(id)), 'Invalid selection.');
        if (Date.now() - client.lastCursor < 80) return { saved: true };
        client.cursor = cursor && { x: cursor.x, y: cursor.y };
        client.selected = input.selected;
        client.lastCursor = Date.now();
        this.schedule();
        return { saved: true };
    }
    schedule() {
        if (!this.scheduled) this.scheduled = setTimeout(() => { this.scheduled = null; this.refresh(); }, 20);
    }
    refresh() {
        if (this.running) { this.again = true; return this.running; }
        this.running = this.update().finally(() => {
            this.running = null;
            if (this.again) { this.again = false; this.schedule(); }
        });
        return this.running;
    }
    async update() {
        await Promise.all([...this.clients.values()].map(async client => {
            try {
                const session = await this.auth.session(client.req);
                if (!session || session.id !== client.userId) throw new HttpError(401, 'Sign in again to continue live collaboration.');
                const state = await this.projects.liveState(client.userId, client.projectId, client.revision);
                client.role = state.role;
                if (state.document || state.role !== client.sentRole) {
                    this.send(client, 'document', state);
                    client.revision = state.revision; client.sentRole = state.role;
                }
            } catch (error) {
                this.log('live.unavailable', { requestId: client.req.requestId, userId: client.userId, projectId: client.projectId,
                    status: error instanceof HttpError ? error.status : 503, errorCode: error instanceof HttpError ? 'HTTP_ERROR' : errorCode(error) });
                this.send(client, 'unavailable', { status: error instanceof HttpError ? error.status : 503,
                    message: error instanceof HttpError ? error.message : 'Live connection interrupted. Reconnecting…' });
                this.remove(client);
            }
        }));
        const rooms = new Map();
        for (const client of this.clients.values()) {
            if (!rooms.has(client.projectId)) rooms.set(client.projectId, []);
            rooms.get(client.projectId).push({ id: client.id, name: client.displayName, role: client.role,
                cursor: Date.now() - client.lastCursor < 15000 ? client.cursor : null, selected: Date.now() - client.lastCursor < 15000 ? client.selected : [] });
        }
        for (const client of this.clients.values()) this.send(client, 'presence', rooms.get(client.projectId));
    }
    close() {
        clearInterval(this.timer); clearTimeout(this.scheduled);
        for (const client of this.clients.values()) this.remove(client);
    }
}
