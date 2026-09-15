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
            project.document = CollaborationDocument.normalize(project.document);
            this.readonly = project.role === 'viewer';
            this.userId = ServerAPI.user.id;
            this.project = { ...project.document, ...project.view, id: project.id };
            this.draftKey = `visualDraft:${ServerAPI.user.id}:${project.id}`;
            this.queue = new CollaborationQueue({
                document: ServerAPI.document(project.document), view: ServerAPI.view(project.view), revision: project.revision, readonly: this.readonly,
                writeDocument: (document, expectedRevision, base) => ServerAPI.request(`projects/${this.id}/edits`, { method: 'POST', body: { changes: CollaborationDocument.diff(base, document), expectedRevision } }),
                readDocument: () => BoardCollaboration.enabled ? BoardCollaboration.document() : this.project,
                onDocument: document => { if (BoardCollaboration.enabled) BoardCollaboration.apply(document); },
                writeView: view => ServerAPI.request(`projects/${this.id}/view`, { method: 'PUT', body: view }),
                persist: draft => {
                    try {
                        if (this.protectedDraft) { this.draftError = Boolean(draft); return; }
                        if (draft) localStorage.setItem(this.draftKey, JSON.stringify(draft));
                        else localStorage.removeItem(this.draftKey);
                        this.draftError = false;
                    } catch { this.draftError = true; }
                },
                onChange: () => this.status()
            });
            let saved;
            try { saved = localStorage.getItem(this.draftKey); } catch { this.draftError = true; }
            if (saved) {
                try {
                    const draft = JSON.parse(saved);
                    if (!draft.document || !draft.view || typeof draft.revision !== 'string') throw new Error();
                    const base = draft.baseDocument || (draft.revision === project.revision ? project.document : null);
                    if (this.readonly || !base) this.keepRecovery(saved);
                    else {
                        const restored = CollaborationDocument.merge(CollaborationDocument.normalize(base), CollaborationDocument.normalize(draft.document), project.document);
                        this.project = { ...restored, ...ServerAPI.view(draft.view), id: project.id };
                        this.queue.enqueue(restored, ServerAPI.view(draft.view));
                    }
                } catch { this.keepRecovery(saved); }
            }
            try {
                const recoveryKeys = Object.keys(localStorage).filter(key => key.startsWith(`${this.draftKey}:recovery:`)).sort();
                if (!this.recoveryDraft && recoveryKeys.length) this.recoveryDraft = localStorage.getItem(recoveryKeys.at(-1));
            } catch { this.draftError = true; }
            return true;
        } catch (error) {
            this.message(error.message, true);
            this.notice.querySelector('[data-action="signin"]').hidden = error.status !== 401;
            this.notice.querySelector('[data-action="reload"]').hidden = false;
            document.querySelectorAll('#toolbar input, #toolbar button, #toolbar details, #quickTools').forEach(element => { element.inert = true; });
            return false;
        }
    },
    keepRecovery(saved) {
        // Unmergeable older drafts stay downloadable while the shared board opens normally.
        this.recoveryDraft = saved;
        try {
            localStorage.setItem(`${this.draftKey}:recovery:${Date.now()}`, saved);
            localStorage.removeItem(this.draftKey);
        } catch { this.protectedDraft = true; }
    },
    createNotice() {
        this.notice = document.createElement('div');
        this.notice.className = 'serverNotice';
        this.notice.setAttribute('role', 'status');
        this.notice.innerHTML = `<button class="noticeClose" data-action="dismiss" aria-label="Dismiss saving details">×</button><span></span><div><button data-action="retry" hidden>Retry save</button><button data-action="download" hidden>Download my edits</button><button data-action="reload" hidden>Reload server version</button><button data-action="signin" hidden>Sign in</button><a href="projects.html" data-backup-before-leave>Back to projects</a></div>`;
        document.body.append(this.notice);
        this.notice.onclick = async event => {
            const action = event.target.dataset.action;
            try {
                if (action === 'retry') await this.manualSave();
                if (action === 'dismiss') { this.detailsOpen = false; this.notice.hidden = true; }
                if (action === 'download') this.download();
                if (action === 'signin') ServerAPI.signIn(location.href);
                if (action === 'reload' && (!this.queue?.pending || confirm('Discard these unsaved edits and load the server version? Download them first if you want to keep them.'))) {
                    if (this.draftKey && !this.protectedDraft) localStorage.removeItem(this.draftKey);
                    this.leaving = true;
                    location.reload();
                }
            } catch (error) { this.message(error.message, true); }
        };
    },
    message(text, error = false) {
        this.detailsOpen = true;
        this.notice.hidden = false;
        this.notice.dataset.error = String(error);
        this.notice.querySelector('span').textContent = text;
    },
    status() {
        if (!this.queue) return;
        const { pending, error, running } = this.queue;
        const label = document.getElementById('workspaceSaveLabel');
        const retryable = error && [0, 408, 409, 429, 500, 502, 503, 504].includes(error.status);
        label.textContent = error ? retryable ? 'Waiting to save…' : 'Save needs attention' : pending || running ? 'Saving to account…' : this.readonly ? 'View only' : 'Saved to your account';
        label.parentElement.dataset.saved = String(!pending && !error && !running);
        const text = error ? retryable ? 'Saving will retry automatically. You can keep working; live updates continue while connected.' : error.message
            : this.draftError ? 'This browser could not keep a recovery draft. Keep this tab open until saving finishes.' : label.textContent;
        label.parentElement.title = `${text} Click for saving details.`;
        this.notice.querySelector('span').textContent = text;
        this.notice.dataset.error = String(Boolean(error || this.draftError));
        this.notice.hidden = !this.detailsOpen;
        for (const action of ['retry', 'download', 'reload']) this.notice.querySelector(`[data-action="${action}"]`).hidden = !error;
        this.notice.querySelector('[data-action="signin"]').hidden = error?.status !== 401;
        if (retryable && !this.retryTimer && !this.retrying && !BoardCollaboration.blocked && !this.leaving) {
            this.retryTimer = setTimeout(() => this.retrySave(), this.retryDelay || 1000);
        } else if (!error) {
            clearTimeout(this.retryTimer); this.retryTimer = null;
            if (!pending && !running) this.retryDelay = 1000;
        }
    },
    async retrySave() {
        clearTimeout(this.retryTimer); this.retryTimer = null;
        if (this.retrying || BoardCollaboration.blocked || this.leaving) return false;
        this.retrying = true;
        try {
            const saved = navigator.onLine && await this.queue.retry();
            this.retryDelay = saved ? 1000 : Math.min((this.retryDelay || 1000) * 2, 15000);
            return saved;
        } finally { this.retrying = false; this.status(); }
    },
    showDetails() { this.detailsOpen = true; this.status(); },
    hint(text, detail = text) {
        const label = document.getElementById('workspaceSaveLabel');
        label.textContent = text; label.parentElement.title = detail;
    },
    save(document, view) {
        this.queue.enqueue(document, view);
        if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.queue.flush(); }, 150);
    },
    async flush() {
        clearTimeout(this.timer);
        this.timer = null;
        if (!this.queue) return false;
        return this.queue.flush();
    },
    async manualSave() {
        if (!this.queue) return false;
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
        this.timer = null;
        return this.retrySave();
    },
    async beforeLeave() {
        if (!this.queue) return true;
        DrawingLayer.finish();
        VisualNotes.commitHistoryTransaction();
        VisualNotes.saveBoard();
        if (await this.flush() || !this.queue.dirtyDocument) { this.leaving = true; return true; }
        const downloadedCurrentEdits = this.downloaded === JSON.stringify(this.snapshot());
        if (!this.draftError || downloadedCurrentEdits) {
            this.leaving = true; return true;
        }
        this.hint('Edits only in this tab', 'Keep this tab open until saving succeeds, or download your edits from Save.');
        return false;
    },
    snapshot() { return { ...BoardStorage.getDocument(VisualNotes), ...BoardStorage.getView(VisualNotes) }; },
    download(recovered = false) {
        const data = this.snapshot();
        const url = URL.createObjectURL(new Blob([recovered ? this.recoveryDraft : JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'visual-notes-project.json'; link.click();
        if (!recovered) this.downloaded = JSON.stringify(data);
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
        panel.innerHTML = '<button id="serverSaveNow">Save to account now</button><button id="serverSaveDetails">Saving details</button><button id="serverDownload">Download this project</button>';
        document.getElementById('serverSaveNow').onclick = () => this.manualSave();
        document.getElementById('serverSaveDetails').onclick = () => this.showDetails();
        document.getElementById('serverDownload').onclick = () => this.download();
        if (this.recoveryDraft) {
            const button = document.createElement('button'); button.textContent = 'Download older unsaved edits';
            button.onclick = () => this.download(true); panel.append(button);
        }
        const status = document.getElementById('workspaceSaveStatus');
        status.setAttribute('role', 'button'); status.tabIndex = 0;
        status.onclick = () => this.showDetails();
        status.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); this.showDetails(); } };
        this.detailsOpen = false; this.status();
        BoardCollaboration.start();
        if (this.queue.pending) this.flush();
        window.addEventListener('online', () => { if (this.queue.error) this.retrySave(); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) { VisualNotes.saveBoard(); this.flush(); } });
        window.addEventListener('pagehide', () => { clearTimeout(this.retryTimer); this.retryTimer = null; });
        window.addEventListener('beforeunload', () => {
            if (this.leaving) return;
            VisualNotes.saveBoard();
        });
        window.addEventListener('pageshow', event => { if (event.persisted) this.leaving = false; });
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
