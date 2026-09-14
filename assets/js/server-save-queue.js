// One writer per open board. Snapshots are copied before any asynchronous work.
class ServerSaveQueue {
    constructor({ document, view, revision, readonly = false, writeDocument, writeView, persist, onChange }) {
        Object.assign(this, { revision, readonly, writeDocument, writeView, persist, onChange });
        this.savedDocument = JSON.stringify(document);
        this.savedView = JSON.stringify(view);
        this.pending = this.running = this.error = null;
    }
    enqueue(document, view) {
        const snapshot = { document: JSON.stringify(document), view: JSON.stringify(view) };
        if ((!this.readonly && snapshot.document !== this.savedDocument) || snapshot.view !== this.savedView || this.pending || this.running) {
            this.pending = snapshot;
            this.checkpoint();
        }
        this.onChange();
    }
    checkpoint() {
        this.persist(this.pending ? { document: JSON.parse(this.pending.document), view: JSON.parse(this.pending.view), revision: this.revision } : null);
    }
    flush() {
        if (this.running) return this.running;
        if (this.error) return Promise.resolve(false);
        this.running = this.run().finally(() => { this.running = null; this.onChange(); });
        this.onChange();
        return this.running;
    }
    async run() {
        try {
            while (this.pending) {
                const snapshot = this.pending;
                if (!this.readonly && snapshot.document !== this.savedDocument) {
                    const result = await this.writeDocument(JSON.parse(snapshot.document), this.revision);
                    this.revision = result.revision;
                    this.savedDocument = snapshot.document;
                    this.checkpoint();
                }
                if (snapshot.view !== this.savedView) {
                    await this.writeView(JSON.parse(snapshot.view));
                    this.savedView = snapshot.view;
                }
                if (this.pending === snapshot) this.pending = null;
                this.checkpoint();
            }
            return true;
        } catch (error) {
            this.error = error;
            this.checkpoint();
            return false;
        }
    }
    retry() { this.error = null; return this.flush(); }
}
window.ServerSaveQueue = ServerSaveQueue;
