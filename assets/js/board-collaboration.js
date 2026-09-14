const BoardCollaboration = {
    enabled: false,
    peers: [],
    undoStack: [],
    redoStack: [],
    document() { return CollaborationDocument.normalize(BoardStorage.getDocument(VisualNotes)); },
    historyDocument(state) {
        return { ...state, title: state.projectTitle, coordinateVersion: VisualNotes.coordinateVersion };
    },
    record(before, after) {
        const changes = CollaborationDocument.diff(this.historyDocument(before), this.historyDocument(after));
        if (!changes.length) return;
        this.undoStack.push(changes);
        if (this.undoStack.length > 30) this.undoStack.shift();
        this.redoStack = [];
    },
    history(direction) {
        const stack = direction === 'undo' ? this.undoStack : this.redoStack;
        const changes = stack.at(-1);
        if (!changes) return false;
        const operations = direction === 'undo' ? changes.map(change => ({ ...change, before: change.after, after: change.before })) : changes;
        try {
            this.apply(CollaborationDocument.apply(this.document(), operations));
            stack.pop(); (direction === 'undo' ? this.redoStack : this.undoStack).push(changes);
            VisualNotes.saveBoard();
            return true;
        } catch {
            ServerBoard.message('This edit has since changed. Undo was stopped to protect the other person’s work.', true);
            return false;
        }
    },
    apply(next) {
        const board = VisualNotes;
        const previous = this.document();
        if (CollaborationDocument.equal(previous, next)) return;
        // Move the transaction baseline with remote edits so undo records only local work.
        if (board.historyTransaction) {
            const baseline = CollaborationDocument.apply(this.historyDocument(board.historyTransaction), CollaborationDocument.diff(previous, next));
            board.historyTransaction = { ...baseline, projectTitle: baseline.title };
        }
        for (const name of ['notes', 'shapes', 'drawings', 'connections']) {
            const byId = new Map(board[name].map(item => [CollaborationDocument.key(name, item), item]));
            board[name] = next[name].map(value => {
                const item = byId.get(CollaborationDocument.key(name, value));
                if (!item) return CollaborationDocument.clone(value);
                for (const field of Object.keys(item)) if (!Object.hasOwn(value, field)) delete item[field];
                Object.assign(item, CollaborationDocument.clone(value));
                return item;
            });
        }
        board.projectTitle = next.title;
        board.coordinateVersion = next.coordinateVersion;
        document.getElementById('projectTitleInput').value = next.title;
        board.selectedNotes = board.selectedNotes.filter(id => board.notes.some(note => note.id === id));
        if (board.selectedShapeId && !board.shapes.some(shape => shape.id === board.selectedShapeId)) board.selectedShapeId = null;
        const focused = document.activeElement;
        const item = focused.closest?.('[data-note-id], [data-shape-id]');
        if (item) {
            const value = item.dataset.noteId ? board.notes.find(note => String(note.id) === item.dataset.noteId) : board.shapes.find(shape => String(shape.id) === item.dataset.shapeId);
            if (value && focused.matches('textarea, .noteTitleInput, .shapeTitleInput')) {
                const text = focused.matches('textarea') ? value.text || '' : value.title || '';
                if (focused.value !== text) {
                    const start = focused.selectionStart, end = focused.selectionEnd;
                    focused.value = text; focused.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length));
                }
            }
        }
        board.render(true);
        board.applyTransform();
        this.renderPresence();
    },
    preserve(element) {
        return element.contains(document.activeElement) || (document.onmousemove &&
            (element.dataset.noteId && VisualNotes.selectedNotes.some(id => String(id) === element.dataset.noteId)
                || element.dataset.shapeId === String(VisualNotes.selectedShapeId)));
    },
    start() {
        this.enabled = true;
        this.clientId = crypto.randomUUID();
        this.layer = document.createElement('div'); this.layer.className = 'collaborationLayer'; this.layer.setAttribute('aria-hidden', 'true');
        this.label = document.createElement('div'); this.label.className = 'collaborationStatus'; this.label.setAttribute('role', 'status');
        document.body.append(this.layer, this.label);
        document.addEventListener('pointermove', event => { this.cursor = event.clientY >= CanvasUtils.toolbarHeight ? VisualNotes.screenToCanvas(event.clientX, event.clientY) : null; });
        document.addEventListener('pointerleave', () => { this.cursor = null; });
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.cursor = null; });
        document.addEventListener('focusout', event => {
            if (event.target.closest?.('.note, .canvasShape')) setTimeout(() => VisualNotes.render(true), 0);
        });
        window.addEventListener('pagehide', () => this.stop());
        window.addEventListener('pageshow', event => { if (event.persisted) { this.connect(); this.timer = setInterval(() => this.tick(), 180); } });
        this.connect();
        this.timer = setInterval(() => this.tick(), 180);
    },
    stop() {
        this.source?.close(); clearInterval(this.timer);
        this.connected = false; this.peers = []; this.renderPresence();
    },
    connect() {
        if (this.blocked) return;
        this.source?.close();
        this.label.textContent = 'Connecting live…';
        const source = this.source = new EventSource(`/api/projects/${ServerBoard.id}/live?clientId=${this.clientId}`);
        source.addEventListener('document', event => {
            const state = JSON.parse(event.data);
            if ((state.role === 'viewer') !== ServerBoard.readonly) return this.unavailable(403, 'Your project access changed. Reload to use the updated permissions.');
            if (state.document) state.document = CollaborationDocument.normalize(state.document);
            ServerBoard.queue.receive(state);
            if (ServerBoard.queue.pending && !ServerBoard.queue.error) ServerBoard.flush();
            this.connected = true;
        });
        source.addEventListener('presence', event => {
            this.connected = true; this.peers = JSON.parse(event.data).filter(peer => peer.id !== this.clientId); this.renderPresence();
        });
        source.addEventListener('unavailable', event => {
            const error = JSON.parse(event.data); this.unavailable(error.status, error.message);
        });
        source.onerror = async () => {
            this.connected = false; this.peers = []; this.renderPresence();
            // EventSource reconnects using the same tab ID; opening state closes any gap.
            if (Date.now() - (this.lastProbe || 0) < 5000 || !navigator.onLine) return;
            this.lastProbe = Date.now();
            try { await ServerAPI.request(`projects/${ServerBoard.id}`); }
            catch (error) { if ([401, 403, 404].includes(error.status)) this.unavailable(error.status, error.message); }
        };
    },
    unavailable(status, message) {
        this.connected = false; this.peers = []; this.renderPresence();
        if (![401, 403, 404].includes(status)) return;
        this.blocked = true; this.source.close();
        DrawingLayer.finish();
        VisualNotes.clearDragHandlers();
        VisualNotes.saveBoard();
        ServerBoard.queue.error = Object.assign(new Error(message), { status });
        ServerBoard.status();
        document.body.classList.add('serverAccessLost');
        document.querySelectorAll('#canvas, #shapes, #drawingLayer, #editMenu, #quickTools, #projectTitleInput').forEach(element => { element.inert = true; });
        window.addEventListener('keydown', event => {
            if (['Tab', 'Escape'].includes(event.key) || ((event.ctrlKey || event.metaKey) && ['c', 'f', 's'].includes(event.key.toLowerCase())) || event.target.closest?.('.serverNotice')) return;
            event.preventDefault(); event.stopImmediatePropagation();
        }, true);
    },
    async tick() {
        this.renderPresence();
        if (this.blocked) return;
        // Also publish changes during dragging, resizing and drawing, not only on release.
        if (!ServerBoard.readonly) {
            const current = this.document();
            const queued = JSON.parse(ServerBoard.queue.pending?.document || ServerBoard.queue.savedDocument);
            if (!CollaborationDocument.equal(current, queued)) ServerBoard.save(current, BoardStorage.getView(VisualNotes));
        }
        if (!this.connected || this.sendingPresence) return;
        const selected = [...VisualNotes.selectedNotes.map(String), ...(VisualNotes.selectedShapeId ? [String(VisualNotes.selectedShapeId)] : [])].slice(0, 100);
        const body = { clientId: this.clientId, cursor: document.hidden ? null : this.cursor || null, selected };
        const fingerprint = JSON.stringify(body);
        if (fingerprint === this.lastPresence && Date.now() - this.lastPresenceAt < 5000) return;
        this.sendingPresence = true;
        try {
            await ServerAPI.request(`projects/${ServerBoard.id}/presence`, { method: 'POST', body });
            this.lastPresence = fingerprint; this.lastPresenceAt = Date.now();
        } catch (error) { if ([401, 403, 404].includes(error.status)) this.unavailable(error.status, error.message); }
        finally { this.sendingPresence = false; }
    },
    renderPresence() {
        if (!this.layer) return;
        this.label.textContent = this.blocked ? 'Live access ended' : this.connected ? this.peers.length ? `${this.peers.length + 1} people here` : 'Live · Just you' : 'Reconnecting live…';
        this.label.title = this.peers.map(peer => peer.name).join(', ');
        this.layer.replaceChildren();
        for (const peer of this.peers) {
            const color = `hsl(${[...peer.id].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 0) % 360} 65% 55%)`;
            const position = (element, x, y) => {
                element.style.left = `${VisualNotes.panX + x * VisualNotes.zoom}px`;
                element.style.top = `${CanvasUtils.toolbarHeight + VisualNotes.panY + y * VisualNotes.zoom}px`;
                element.style.setProperty('--peer-color', color); this.layer.append(element);
            };
            if (peer.cursor) {
                const cursor = document.createElement('div'); cursor.className = 'peerCursor';
                const name = document.createElement('span'); name.textContent = peer.name; cursor.append(name);
                position(cursor, peer.cursor.x, peer.cursor.y);
            }
            for (const id of peer.selected) {
                const item = [...VisualNotes.notes, ...VisualNotes.shapes].find(item => String(item.id) === id);
                if (!item) continue;
                const outline = document.createElement('div'); outline.className = 'peerSelection';
                outline.style.width = `${item.width * VisualNotes.zoom}px`; outline.style.height = `${item.height * VisualNotes.zoom}px`;
                position(outline, item.x, item.y);
            }
        }
    }
};
window.BoardCollaboration = BoardCollaboration;
