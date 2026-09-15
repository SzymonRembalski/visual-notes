class CollaborationQueue extends ServerSaveQueue {
    constructor(options) {
        super(options);
        this.onDocument = options.onDocument;
        this.readDocument = options.readDocument;
    }
    enqueue(document, view) {
        super.enqueue(CollaborationDocument.equal(document, JSON.parse(this.savedDocument)) ? JSON.parse(this.savedDocument) : document, view);
    }
    get dirtyDocument() {
        return !this.readonly && Boolean(this.pending) && !CollaborationDocument.equal(JSON.parse(this.pending.document), JSON.parse(this.savedDocument));
    }
    checkpoint() {
        this.persist(this.pending ? { document: JSON.parse(this.pending.document), view: JSON.parse(this.pending.view),
            revision: this.revision, baseDocument: JSON.parse(this.savedDocument) } : null);
    }
    adopt(base, remote, revision) {
        const latest = this.readDocument?.() || JSON.parse(this.pending?.document || this.savedDocument);
        const document = this.readonly ? remote : CollaborationDocument.merge(base, latest, remote);
        this.onDocument(document);
        this.savedDocument = JSON.stringify(remote);
        this.revision = revision;
        if (this.pending) this.pending = { ...this.pending, document: JSON.stringify(document) };
        else if (!this.readonly && !CollaborationDocument.equal(document, remote)) this.pending = { document: JSON.stringify(document), view: this.savedView };
        this.checkpoint();
    }
    receive(state) {
        if (!state.document || BigInt(state.revision) <= BigInt(this.revision)) return;
        try {
            // Keep the sent snapshot in the same remote context as the visible board.
            // Its difference from current edits then contains only work done after sending.
            if (this.writeBaseline) this.writeBaseline = CollaborationDocument.merge(JSON.parse(this.savedDocument), this.writeBaseline, state.document);
            this.adopt(JSON.parse(this.savedDocument), state.document, state.revision);
            if (this.pending && CollaborationDocument.equal(JSON.parse(this.pending.document), JSON.parse(this.savedDocument)) && this.pending.view === this.savedView) {
                this.pending = this.error = null; this.checkpoint();
            }
        } catch (error) {
            // Keep the old base and the current browser edits for explicit recovery.
            if (!this.pending) this.pending = { document: JSON.stringify(this.readDocument()), view: this.savedView };
            this.error = error; this.checkpoint(); this.incoming = state;
        }
        this.onChange();
    }
    async run() {
        try {
            while (this.pending) {
                const snapshot = this.pending;
                const document = JSON.parse(snapshot.document);
                if (!this.readonly && !CollaborationDocument.equal(document, JSON.parse(this.savedDocument))) {
                    this.writeBaseline = document;
                    const result = await this.writeDocument(document, this.revision, JSON.parse(this.savedDocument));
                    const newer = BigInt(result.revision) >= BigInt(this.revision);
                    this.adopt(this.writeBaseline, newer ? result.document : JSON.parse(this.savedDocument), newer ? result.revision : this.revision);
                    this.writeBaseline = null;
                }
                if (snapshot.view !== this.savedView) {
                    await this.writeView(JSON.parse(snapshot.view));
                    this.savedView = snapshot.view;
                }
                if (this.pending && (this.readonly || CollaborationDocument.equal(JSON.parse(this.pending.document), JSON.parse(this.savedDocument))) && this.pending.view === this.savedView) this.pending = null;
                this.checkpoint();
            }
            return true;
        } catch (error) {
            this.writeBaseline = null;
            // The live stream may already have confirmed a write whose HTTP reply failed.
            this.error = this.pending ? error : null; this.checkpoint(); return !this.error;
        }
    }
    flush() {
        const result = super.flush();
        return result.then(saved => {
            if (!this.running && this.incoming) {
                const state = this.incoming; this.incoming = null; this.receive(state);
            }
            return saved && !this.error;
        });
    }
}
window.CollaborationQueue = CollaborationQueue;
