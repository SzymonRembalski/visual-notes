const TaskTracker = {
    tasks: [],
    categories: [
        {
            id: 1,
            name: "GENERAL",
            color: "#555"
        }
    ],
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
    moveStepUp(taskIndex, stepIndex) {
        if (stepIndex <= 0) return;
        const steps = this.tasks[taskIndex].steps;
        [steps[stepIndex - 1], steps[stepIndex]] = [steps[stepIndex], steps[stepIndex - 1]];
        this.save();
        this.render();
    },
    moveStepDown(taskIndex, stepIndex) {
        const steps = this.tasks[taskIndex].steps;
        if (stepIndex >= steps.length - 1) return;
        [steps[stepIndex], steps[stepIndex + 1]] = [steps[stepIndex + 1], steps[stepIndex]];
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
        event.stopPropagation();
        if (!this.draggedStep) return;
        const { taskIndex: sourceTask, stepIndex: sourceIndex } = this.draggedStep;
        if (sourceTask !== taskIndex) {
            this.draggedStep = null;
            return;
        }
        if (sourceIndex === stepIndex) {
            this.draggedStep = null;
            return;
        }

        const steps = this.tasks[taskIndex].steps;
        const [moved] = steps.splice(sourceIndex, 1);
        const insertIndex = sourceIndex < stepIndex ? stepIndex + 1 : stepIndex;
        steps.splice(insertIndex, 0, moved);
        this.draggedStep = null;
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
            percent: Math.round(done / total * 100)
        };
    },
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },
    checkCompletion() {
        let total = 0;
        let done = 0;

        this.tasks.forEach(task => {
            total += task.steps.length;
            done += task.steps.filter(step => step.done).length;
        });

        if (total > 0 && total === done) {
            const box = document.getElementById("completeMessage");
            if (!box) return;
            box.style.display = "block";
            setTimeout(() => {
                box.style.display = "none";
            }, 3000);
        }
    },
    render() {
        const body = document.getElementById("tableBody");
        if (!body) return;

        body.innerHTML = "";
        const tracker = this;

        this.tasks.forEach((task, index) => {
            const progress = tracker.calculateProgress(task);
            const row = document.createElement("tr");
            row.draggable = true;
            row.dataset.index = index;

            if (progress.percent === 100) {
                row.classList.add("completed");
            }

            row.innerHTML = `
<td class="drag">≡</td>
<td>
    <span class="star" onclick="togglePinned(${index})">${task.pinned ? "★" : "☆"}</span>
    <span class="taskName" onclick="editTask(${index})">${this.escapeHtml(task.name)}</span>
    <br>
    <button onclick="toggleNotes(${index})">📝 Notes</button>
    <button onclick="addTask(${index})" title="Insert after this task">+</button>
    <div class="note" style="display:${task.expanded ? "block" : "none"}">
        <textarea rows="3" style="width:95%" onchange="updateNotes(${index},this.value)">${this.escapeHtml(task.notes)}</textarea>
    </div>
</td>
<td>
    <div class="steps">
        ${task.steps.map((step, stepIndex) => `
            <div class="step" draggable="true" ondragstart="startStepDrag(${index},${stepIndex},event)" ondragover="event.preventDefault(); event.stopPropagation()" ondrop="dropStep(${index},${stepIndex},event); event.stopPropagation()">
                <span class="dragHandle" title="Drag to reorder">☰</span>
                <input type="checkbox" ${step.done ? "checked" : ""} onclick="toggleStep(${index},${stepIndex})">
                <span onclick="editStep(${index},${stepIndex})">${this.escapeHtml(step.text)}</span>
            </div>
        `).join("")}
    </div>
    <br>
    <button class="addStep" onclick="addStep(${index})" title="Add step">+ Step</button>
    <button class="removeStep" onclick="removeStep(${index})" title="Remove step">- Step</button>
</td>
<td>${progress.done}/${progress.total}</td>
<td>${progress.percent}%</td>
<td><button class="delete" onclick="deleteTask(${index})" title="Delete task">Delete</button></td>
`;

            body.appendChild(row);

            row.addEventListener("dragstart", event => {
                if (event.target.closest(".step")) return;
                tracker.draggedIndex = index;
                row.classList.add("dragging");
            });

            row.addEventListener("dragend", () => {
                row.classList.remove("dragging");
            });

            row.addEventListener("dragover", event => {
                event.preventDefault();
            });

            row.addEventListener("drop", event => {
                if (event.target.closest(".step")) return;
                if (tracker.draggedIndex === null || tracker.draggedIndex === index) return;
                const [moved] = tracker.tasks.splice(tracker.draggedIndex, 1);
                tracker.tasks.splice(index, 0, moved);
                tracker.draggedIndex = null;
                tracker.save();
                tracker.render();
            });
        });
    },
    init() {
        if (!document.getElementById("tableBody")) return;
        this.load();
        this.render();
        this.checkCompletion();
    }
};

window.TaskTracker = TaskTracker;
