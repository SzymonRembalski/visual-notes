class HistoryManager {
    constructor(limit = 30) {
        this.limit = limit;
        this.past = [];
        this.future = [];
    }

    clone(state) {
        return JSON.parse(JSON.stringify(state));
    }

    clear() {
        this.past = [];
        this.future = [];
    }

    record(state) {
        this.past.push(this.clone(state));
        if (this.past.length > this.limit) {
            this.past.splice(0, this.past.length - this.limit);
        }
        this.future = [];
    }

    undo(currentState) {
        return this.move(this.past, this.future, currentState);
    }

    redo(currentState) {
        return this.move(this.future, this.past, currentState);
    }

    move(source, destination, currentState) {
        if (!source.length) return null;
        destination.push(this.clone(currentState));
        if (destination.length > this.limit) {
            destination.splice(0, destination.length - this.limit);
        }
        // Popped snapshots are no longer retained by history, so ownership can transfer.
        return source.pop();
    }
}

window.HistoryManager = HistoryManager;
