const ServerBoard = {
    active: false,
    async open() {
        const params = new URLSearchParams(location.search);
        if (params.get('storage') !== 'server') return true;
        this.active = true;
        document.body.classList.add('serverLoading');
        this.id = params.get('projectId');
        this.createNotice();
        this.message('Opening your project…');
        try {
            if (!await ServerAPI.init() || !ServerAPI.user) throw Object.assign(new Error('Sign in to open this project.'), { status: 401 });
            const project = await ServerAPI.request(`projects/${encodeURIComponent(this.id)}`);
            this.readonly = project.role === 'viewer';
            this.userId = ServerAPI.user.id;
            this.project = { ...project.document, ...project.view, id: project.id };
            this.draftKey = `visualDraft:${ServerAPI.user.id}:${project.id}`;
            this.queue = new ServerSaveQueue({
                document: ServerAPI.document(project.document), view: ServerAPI.view(project.view), revision: project.revision, readonly: this.readonly,
                writeDocument: (document, expectedRevision) => ServerAPI.request(`projects/${this.id}`, { method: 'PUT', body: { document, expectedRevision } }),
                writeView: view => ServerAPI.request(`projects/${this.id}/view`, { method: 'PUT', body: view }),
                persist: draft => {
                    try {
                        if (draft) localStorage.setItem(this.draftKey, JSON.stringify(draft));
                        else localStorage.removeItem(this.draftKey);
                        this.draftError = false;
                    } catch { this.draftError = true; }
                },
                onChange: () => this.status()
            });
            const saved = localStorage.getItem(this.draftKey);
            if (saved) {
                try {
                    const draft = JSON.parse(saved);
                    if (!draft.document || !draft.view || typeof draft.revision !== 'string') throw new Error();
                    if (confirm('This browser has unsaved edits for this project. Restore them?')) {
                        this.recoveredReadOnly = this.readonly;
                        this.project = { ...draft.document, ...draft.view, id: project.id };
                        this.queue.revision = draft.revision;
                        this.queue.enqueue(ServerAPI.document(draft.document), ServerAPI.view(draft.view));
                        this.queue.error = Object.assign(new Error(this.readonly ? 'Your editing access changed. Download your recovered edits or save a separate copy.' : 'Recovered unsaved edits. Save a copy, or retry if the server version has not changed.'), { status: 409 });
                    } else localStorage.removeItem(this.draftKey);
                } catch (error) {
                    if (!confirm('The recovery draft could not be read. Open the server version? The saved draft will be kept.')) throw error;
                    localStorage.setItem(`${this.draftKey}:unreadable:${Date.now()}`, saved);
                    localStorage.removeItem(this.draftKey);
                }
            }
            return true;
        } catch (error) {
            this.message(error.message, true);
            this.notice.querySelector('[data-action="signin"]').hidden = error.status !== 401;
            this.notice.querySelector('[data-action="reload"]').hidden = false;
            document.querySelectorAll('#toolbar input, #toolbar button, #toolbar details, #quickTools').forEach(element => { element.inert = true; });
            return false;
        }
    },
    createNotice() {
        this.notice = document.createElement('div');
        this.notice.className = 'serverNotice';
        this.notice.setAttribute('role', 'status');
        this.notice.innerHTML = `<span></span><div><button data-action="retry" hidden>Retry save</button><button data-action="copy" hidden>Save a copy</button><button data-action="download" hidden>Download my edits</button><button data-action="reload" hidden>Reload server version</button><button data-action="signin" hidden>Sign in</button><a href="projects.html" data-backup-before-leave>Back to projects</a></div>`;
        document.body.append(this.notice);
        this.notice.onclick = async event => {
            const action = event.target.dataset.action;
            try {
                if (action === 'retry') await this.manualSave();
                if (action === 'copy') await this.copy();
                if (action === 'download') this.download();
                if (action === 'signin') ServerAPI.signIn(location.href);
                if (action === 'reload' && (!this.queue?.pending || confirm('Discard these unsaved edits and load the server version? Download them first if you want to keep them.'))) {
                    if (this.draftKey) localStorage.removeItem(this.draftKey);
                    this.leaving = true;
                    location.reload();
                }
            } catch (error) { this.message(error.message, true); }
        };
    },
    message(text, error = false) {
        this.notice.hidden = false;
        this.notice.dataset.error = String(error);
        this.notice.querySelector('span').textContent = text;
    },
    status() {
        if (!this.queue) return;
        const { pending, error, running } = this.queue;
        const label = document.getElementById('workspaceSaveLabel');
        label.textContent = error ? 'Not saved to server' : pending || running ? 'Saving to account…' : this.readonly ? 'View only' : 'Saved to your account';
        label.parentElement.dataset.saved = String(!pending && !error && !running);
        this.notice.hidden = !error && !this.draftError;
        if (error || this.draftError) this.message(error?.message || 'This browser could not keep a recovery draft. Keep this tab open until saving finishes.', true);
        for (const action of ['retry', 'copy', 'download', 'reload']) this.notice.querySelector(`[data-action="${action}"]`).hidden = !error;
        if (this.recoveredReadOnly) this.notice.querySelector('[data-action="retry"]').hidden = true;
        this.notice.querySelector('[data-action="signin"]').hidden = error?.status !== 401;
    },
    save(document, view) {
        this.queue.enqueue(document, view);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.queue.flush(), 350);
    },
    async flush() {
        clearTimeout(this.timer);
        if (!this.queue) return false;
        return this.queue.flush();
    },
    async manualSave() {
        if (!this.queue || this.recoveredReadOnly) return false;
        if ([401, 403].includes(this.queue.error?.status)) {
            try {
                await ServerAPI.init();
                if (ServerAPI.user?.id !== this.userId) throw new Error('Sign in with the account that opened this project before retrying.');
            } catch (error) { this.queue.error = Object.assign(error, { status: 401 }); this.status(); return false; }
        }
        DrawingLayer.finish();
        VisualNotes.commitHistoryTransaction();
        VisualNotes.saveBoard();
        clearTimeout(this.timer);
        return this.queue.retry();
    },
    async beforeLeave() {
        if (!this.queue) return true;
        DrawingLayer.finish();
        VisualNotes.commitHistoryTransaction();
        VisualNotes.saveBoard();
        if (await this.flush()) { this.leaving = true; return true; }
        this.message('Your edits have not reached the server. Retry, save a copy or download them before leaving.', true);
        const downloadedCurrentEdits = this.downloaded === JSON.stringify(this.snapshot());
        if ((!this.draftError || downloadedCurrentEdits) && confirm('This project has not been saved to the server. Make sure you have the recovery draft or download before leaving. Leave anyway?')) {
            this.leaving = true; return true;
        }
        return false;
    },
    snapshot() { return { ...BoardStorage.getDocument(VisualNotes), ...BoardStorage.getView(VisualNotes) }; },
    download() {
        const data = this.snapshot();
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'visual-notes-project.json'; link.click();
        this.downloaded = JSON.stringify(data);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async copy() {
        const document = BoardStorage.getDocument(VisualNotes);
        const fingerprint = JSON.stringify(document);
        if (this.copyFingerprint !== fingerprint) { this.copyRequest = crypto.randomUUID(); this.copyFingerprint = fingerprint; }
        const saved = await ServerAPI.request('projects', { method: 'POST', body: { requestId: this.copyRequest, document } });
        // Edits made during this request stay on this board; the copy is opened separately.
        this.message('Your copy was saved. Open it from My account in Projects.');
        return saved;
    },
    ready() {
        document.body.classList.remove('serverLoading');
        this.status();
        const panel = document.getElementById('saveMenuPanel');
        panel.innerHTML = '<button id="serverSaveNow">Save to account now</button><button id="serverDownload">Download this project</button>';
        document.getElementById('serverSaveNow').onclick = () => this.manualSave();
        document.getElementById('serverDownload').onclick = () => this.download();
        window.addEventListener('online', () => { if (this.queue.error?.status === 0) this.queue.retry(); });
        window.addEventListener('beforeunload', event => {
            if (this.leaving) return;
            VisualNotes.saveBoard();
            if (this.queue.pending) { event.preventDefault(); event.returnValue = ''; }
        });
        window.addEventListener('pageshow', event => { if (event.persisted) { this.leaving = false; this.message('This board may have changed while you were away. Reload before editing.'); } });
        if (this.readonly) {
            document.body.classList.add('serverReadonly');
            document.getElementById('projectTitleInput').readOnly = true;
            const block = event => {
                const canvas = event.target.closest?.('#canvas, #shapes, #connections, #drawingLayer, #grid');
                const editing = event.target.closest?.('#editMenu, #quickTools, .colorPanel, #drawingControls');
                if (event.type === 'keydown' && ['Enter', ' '].includes(event.key) && event.target.closest?.('button, a, summary') && !editing) {
                    event.stopImmediatePropagation(); return; // Keep native button activation, without editor shortcuts.
                }
                const keyboard = event.type === 'keydown' && !['Tab', 'Escape'].includes(event.key) && !((event.ctrlKey || event.metaKey) && ['c', 'f', 's'].includes(event.key.toLowerCase()));
                if (keyboard || editing || ['paste', 'drop'].includes(event.type) || (canvas && event.button !== 2 && event.button !== 1)) { event.preventDefault(); event.stopImmediatePropagation(); }
            };
            for (const type of ['mousedown', 'pointerdown', 'touchstart', 'dblclick', 'click', 'paste', 'drop', 'keydown']) window.addEventListener(type, block, { capture: true, passive: false });
        }
    }
};
window.ServerBoard = ServerBoard;
