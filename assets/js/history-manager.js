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
        if (!this.past.length) return null;
        this.future.push(this.clone(currentState));
        if (this.future.length > this.limit) {
            this.future.splice(0, this.future.length - this.limit);
        }
        return this.clone(this.past.pop());
    }

    redo(currentState) {
        if (!this.future.length) return null;
        this.past.push(this.clone(currentState));
        if (this.past.length > this.limit) {
            this.past.splice(0, this.past.length - this.limit);
        }
        return this.clone(this.future.pop());
    }
}

window.HistoryManager = HistoryManager;
