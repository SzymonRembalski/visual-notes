class HistoryManager {
    constructor(limit = 30) {
        this.limit = limit;
        this.clear();
    }

    clone(state) {
        return JSON.parse(JSON.stringify(state));
    }

    clear() {
        this.past = [];
        this.future = [];
    }

    push(stack, state) {
        stack.push(this.clone(state));
        if (stack.length > this.limit) {
            stack.splice(0, stack.length - this.limit);
        }
    }

    record(state) {
        this.push(this.past, state);
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
        this.push(destination, currentState);
        // Popped snapshots are no longer retained by history, so ownership can transfer.
        return source.pop();
    }
}

window.HistoryManager = HistoryManager;
