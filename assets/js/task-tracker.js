const TaskTracker = {
    tasks: [],
    categories: [
        {
            id: 1,
            name: "GENERAL",
            color: "#555"
        }
    ],
    filter: "all",
    draggedIndex: null,
    draggedStep: null,
    save() {
        localStorage.setItem("tasksV2", JSON.stringify(this.tasks));
        localStorage.setItem("categoriesV2", JSON.stringify(this.categories));
        if (window.LocalBackupManager) window.LocalBackupManager.notifyChange();
    },
    load() {
        try {
            let tasks = JSON.parse(localStorage.getItem("tasksV2"));
            if (!Array.isArray(tasks)) {
                tasks = JSON.parse(localStorage.getItem("tasks"));
            }
            if (Array.isArray(tasks)) {
                this.tasks = tasks;
            }
        } catch (error) {
            this.tasks = [];
        }

        try {
            let categories = JSON.parse(localStorage.getItem("categoriesV2"));
            if (!Array.isArray(categories) || !categories.length) {
                categories = JSON.parse(localStorage.getItem("categories"));
            }
            if (Array.isArray(categories) && categories.length) {
                this.categories = categories;
            }
        } catch (error) {
            this.categories = [
                {
                    id: 1,
                    name: "GENERAL",
                    color: "#555"
                }
            ];
        }
    },
    addTask(afterIndex = null) {
        this.filter = "all";
        const task = {
            id: Date.now(),
            name: "New Task",
            category: "GENERAL",
            pinned: false,
            notes: "",
            expanded: false,
            steps: [
                {
                    text: "Step 1",
                    done: false
                }
            ]
        };

        if (afterIndex === null) {
            this.tasks.unshift(task);
        } else {
            this.tasks.splice(afterIndex + 1, 0, task);
        }

        this.save();
        this.render();
    },
    addCategory() {
        const name = prompt("Category name:");
        if (!name) return;

        this.categories.push({
            id: Date.now(),
            name,
            color: "#444"
        });

        this.save();
        this.render();
    },
    deleteTask(index) {
        if (confirm("Delete task?")) {
            this.tasks.splice(index, 1);
            this.save();
            this.render();
        }
    },
    toggleStep(taskIndex, stepIndex) {
        const step = this.tasks[taskIndex].steps[stepIndex];
        step.done = !step.done;
        this.save();
        this.render();
    },
    addStep(index) {
        this.tasks[index].steps.push({
            text: "Step " + (this.tasks[index].steps.length + 1),
            done: false
        });
        this.save();
        this.render();
    },
    removeStep(index) {
        if (this.tasks[index].steps.length <= 1) return;
        this.tasks[index].steps.pop();
        this.save();
        this.render();
    },
    editTask(index) {
        const newName = prompt("Task name:", this.tasks[index].name);
        if (!newName) return;
        this.tasks[index].name = newName;
        this.save();
        this.render();
    },
    editStep(taskIndex, stepIndex) {
        const value = prompt("Step name:", this.tasks[taskIndex].steps[stepIndex].text);
        if (!value) return;
        this.tasks[taskIndex].steps[stepIndex].text = value;
        this.save();
        this.render();
    },
    startStepDrag(taskIndex, stepIndex, event) {
        event.stopPropagation();
        this.draggedStep = { taskIndex, stepIndex };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `${taskIndex}:${stepIndex}`);
    },
    dropStep(taskIndex, stepIndex, event) {
        event.preventDefault();
        if (!this.draggedStep) return;
        event.stopPropagation();
        const { taskIndex: sourceTask, stepIndex: sourceIndex } = this.draggedStep;
        if (sourceTask !== taskIndex) {
            this.draggedStep = null;
            return;
        }
        if (sourceIndex === stepIndex) {
            this.draggedStep = null;
            return;
        }

        this.draggedStep = null;
        this.moveItem(this.tasks[taskIndex].steps, sourceIndex, stepIndex);
    },
    moveItem(items, from, to) {
        if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
        this.save();
        this.render();
    },
    moveTask(index, delta) {
        this.moveItem(this.tasks, index, index + delta);
        document.querySelector(`[data-focus-key="name-${index + delta}"]`)?.focus({ preventScroll: true });
    },
    moveStep(taskIndex, stepIndex, delta) {
        this.moveItem(this.tasks[taskIndex].steps, stepIndex, stepIndex + delta);
        document.querySelector(`[data-focus-key="step-${taskIndex}-${stepIndex + delta}"]`)?.focus({ preventScroll: true });
    },
    setCategory(index, name) {
        if (!this.categories.some(category => category.name === name)) return;
        this.tasks[index].category = name;
        this.save();
        this.render();
    },
    toggleNotes(index) {
        this.tasks[index].expanded = !this.tasks[index].expanded;
        this.save();
        this.render();
    },
    updateNotes(index, text) {
        this.tasks[index].notes = text;
        this.save();
    },
    togglePinned(index) {
        this.tasks[index].pinned = !this.tasks[index].pinned;
        this.save();
        this.render();
    },
    calculateProgress(task) {
        const total = task.steps.length;
        const done = task.steps.filter(step => step.done).length;
        return {
            done,
            total,
            percent: total ? Math.round(done / total * 100) : 0
        };
    },
    render() {
        const list = document.getElementById("taskList");
        if (!list) return;
        const focusKey = document.activeElement?.dataset.focusKey;
        const completed = this.tasks.filter(task => this.calculateProgress(task).percent === 100).length;
        const total = this.tasks.length;
        document.getElementById("taskSummary").textContent = total
            ? `${total - completed} in progress · ${completed} completed` : "A clear space for what comes next.";
        document.querySelectorAll("[data-task-filter]").forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.taskFilter === this.filter));
        });
        list.innerHTML = "";
        this.tasks.forEach((task, index) => {
            const progress = this.calculateProgress(task);
            const complete = progress.percent === 100;
            if ((this.filter === "active" && complete) || (this.filter === "done" && !complete)) return;
            const card = document.createElement("article");
            card.className = `taskCard${complete ? " completed" : ""}${task.pinned ? " pinned" : ""}`;
            card.dataset.index = index;
            card.setAttribute("aria-labelledby", `taskTitle${index}`);
            const categories = [...new Set([task.category || "GENERAL", ...this.categories.map(category => category.name)])];
            card.innerHTML = `
                <div class="taskCardHeader">
                    <span class="taskDrag" draggable="true" title="Drag to reorder task" aria-hidden="true">${AppIcons.icon("grip")}</span>
                    <span class="taskStatusIcon" aria-hidden="true">${AppIcons.icon(complete ? "check" : "node")}</span>
                    <div class="taskIdentity">
                        <h2 id="taskTitle${index}"><button type="button" class="taskName" data-focus-key="name-${index}" onclick="editTask(${index})" title="Rename task">${escapeHtml(task.name)}</button></h2>
                        <select class="taskCategory" aria-label="Category for ${escapeHtml(task.name)}" data-focus-key="category-${index}" onchange="TaskTracker.setCategory(${index},this.value)">${categories.map(name => `<option value="${escapeHtml(name)}" ${name === (task.category || "GENERAL") ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select>
                    </div>
                    <div class="taskProgress"><span>${progress.done} / ${progress.total} steps <strong>${progress.percent}%</strong></span><progress max="100" value="${progress.percent}" aria-label="Progress for ${escapeHtml(task.name)}"></progress></div>
                    <button type="button" class="taskIconButton star" data-focus-key="pin-${index}" onclick="togglePinned(${index})" aria-label="Pin ${escapeHtml(task.name)}" aria-pressed="${Boolean(task.pinned)}" title="Pin task">${AppIcons.icon("pin")}</button>
                    <details class="taskMenu"><summary aria-label="More actions for ${escapeHtml(task.name)}" title="More actions">${AppIcons.icon("more")}</summary><div class="taskMenuPanel">
                        <button type="button" onclick="editTask(${index})">Rename task</button>
                        <button type="button" onclick="addTask(${index})">Insert task below</button>
                        <button type="button" onclick="TaskTracker.moveTask(${index},-1)" ${index === 0 ? "disabled" : ""}>Move task up</button>
                        <button type="button" onclick="TaskTracker.moveTask(${index},1)" ${index === total - 1 ? "disabled" : ""}>Move task down</button>
                        <button type="button" class="delete" onclick="deleteTask(${index})">Delete task</button>
                    </div></details>
                </div>
                <div class="steps">${task.steps.map((step, stepIndex) => `
                    <div class="step${step.done ? " stepDone" : ""}" ondragstart="startStepDrag(${index},${stepIndex},event)" ondragover="event.preventDefault();event.stopPropagation()" ondrop="dropStep(${index},${stepIndex},event)">
                        <input type="checkbox" ${step.done ? "checked" : ""} aria-label="Complete ${escapeHtml(step.text)}" data-focus-key="check-${index}-${stepIndex}" onchange="toggleStep(${index},${stepIndex})">
                        <button type="button" class="stepName" data-focus-key="step-${index}-${stepIndex}" onclick="editStep(${index},${stepIndex})" title="Rename step">${escapeHtml(step.text)}</button>
                        <span class="stepMoves"><button type="button" class="taskIconButton" onclick="TaskTracker.moveStep(${index},${stepIndex},-1)" aria-label="Move ${escapeHtml(step.text)} up" ${stepIndex === 0 ? "disabled" : ""}>${AppIcons.icon("up")}</button><button type="button" class="taskIconButton" onclick="TaskTracker.moveStep(${index},${stepIndex},1)" aria-label="Move ${escapeHtml(step.text)} down" ${stepIndex === task.steps.length - 1 ? "disabled" : ""}>${AppIcons.icon("down")}</button></span>
                        <span class="dragHandle" draggable="true" title="Drag to reorder step" aria-hidden="true">${AppIcons.icon("grip")}</span>
                    </div>`).join("")}</div>
                <div class="taskCardActions">
                    <button type="button" class="addStep" data-focus-key="add-${index}" onclick="addStep(${index})">${AppIcons.icon("plus")}Add step</button>
                    <button type="button" class="removeStep" data-focus-key="remove-${index}" onclick="removeStep(${index})" ${task.steps.length <= 1 ? "disabled" : ""}>Remove last step</button>
                    <button type="button" class="toggleNotes" data-focus-key="notes-${index}" onclick="toggleNotes(${index})" aria-expanded="${Boolean(task.expanded)}" aria-controls="taskNotes${index}">${task.expanded ? "Hide notes" : task.notes ? "View notes" : "Add notes"}</button>
                </div>
                <div id="taskNotes${index}" class="note" ${task.expanded ? "" : "hidden"}><label for="notesInput${index}">Notes</label><textarea id="notesInput${index}" rows="3" placeholder="Add a little context…" oninput="updateNotes(${index},this.value)">${escapeHtml(task.notes || "")}</textarea></div>
            `;
            card.addEventListener("dragstart", event => {
                if (!event.target.closest(".taskDrag")) return;
                this.draggedIndex = index;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
                card.classList.add("dragging");
            });
            card.addEventListener("dragend", () => {
                this.draggedIndex = null;
                this.draggedStep = null;
                card.classList.remove("dragging");
            });
            card.addEventListener("dragover", event => event.preventDefault());
            card.addEventListener("drop", event => {
                event.preventDefault();
                if (this.draggedIndex === null) return;
                const from = this.draggedIndex;
                this.draggedIndex = null;
                this.moveItem(this.tasks, from, index);
            });
            list.appendChild(card);
        });
        if (!list.children.length) {
            list.innerHTML = `<div class="taskEmpty">${AppIcons.icon(total ? "check" : "node")}<h2>${!total ? "Start with one task" : this.filter === "done" ? "No completed tasks yet" : "All caught up"}</h2><p>${!total ? "Add a task, then break it into a few manageable steps." : this.filter === "done" ? "Finished tasks will appear here." : "Every step is complete. Take a moment to enjoy it."}</p><button type="button" onclick="addTask()">New Task</button></div>`;
        }
        if (focusKey) {
            const target = Array.from(list.querySelectorAll("[data-focus-key]")).find(element => element.dataset.focusKey === focusKey);
            (target || document.querySelector('[data-task-filter][aria-pressed="true"]'))?.focus({ preventScroll: true });
        }
    },
    init() {
        if (!document.getElementById("taskList")) return;
        this.load();
        document.querySelectorAll("[data-task-filter]").forEach(button => {
            button.onclick = () => { this.filter = button.dataset.taskFilter; this.render(); };
        });
        document.addEventListener("click", event => {
            document.querySelectorAll(".taskMenu[open]").forEach(menu => {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            document.querySelectorAll(".taskMenu[open]").forEach(menu => { menu.open = false; menu.querySelector("summary").focus(); });
        });
        this.render();
    }
};
window.TaskTracker = TaskTracker;
