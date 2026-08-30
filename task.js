

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
            name: name,
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
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `${taskIndex}:${stepIndex}`);
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
        const done = task.steps.filter(s => s.done).length;
        return {
            done,
            total,
            percent: Math.round(done / total * 100)
        };
    },
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },
    updateDashboard() {
        // Dashboard removed - progress shown per-task in table
    },
    checkCompletion() {
        let total = 0;
        let done = 0;

        this.tasks.forEach(task => {
            total += task.steps.length;
            done += task.steps.filter(s => s.done).length;
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
            const p = tracker.calculateProgress(task);
            const tr = document.createElement("tr");
            tr.draggable = true;
            tr.dataset.index = index;

            if (p.percent === 100) {
                tr.classList.add("completed");
            }

            tr.innerHTML = `
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
        ${task.steps.map((step, j) => `
            <div class="step" draggable="true" ondragstart="startStepDrag(${index},${j},event)" ondragover="event.preventDefault(); event.stopPropagation()" ondrop="dropStep(${index},${j},event); event.stopPropagation()">
                <span class="dragHandle" title="Drag to reorder">☰</span>
                <input type="checkbox" ${step.done ? "checked" : ""} onclick="toggleStep(${index},${j})">
                <span onclick="editStep(${index},${j})">${this.escapeHtml(step.text)}</span>
            </div>
        `).join("")}
    </div>
    <br>
    <button class="addStep" onclick="addStep(${index})" title="Add step">+ Step</button>
    <button class="removeStep" onclick="removeStep(${index})" title="Remove step">- Step</button>
</td>
<td>${p.done}/${p.total}</td>
<td>${p.percent}%</td>
<td><button class="delete" onclick="deleteTask(${index})" title="Delete task">Delete</button></td>
`;

            body.appendChild(tr);

            tr.addEventListener("dragstart", event => {
                if (event.target.closest('.step')) return;
                tracker.draggedIndex = index;
                tr.classList.add("dragging");
            });

            tr.addEventListener("dragend", () => {
                tr.classList.remove("dragging");
            });

            tr.addEventListener("dragover", e => {
                e.preventDefault();
            });

            tr.addEventListener("drop", event => {
                if (event.target.closest('.step')) return;
                if (tracker.draggedIndex === null || tracker.draggedIndex === index) return;
                const moved = tracker.tasks.splice(tracker.draggedIndex, 1)[0];
                tracker.tasks.splice(index, 0, moved);
                tracker.save();
                tracker.render();
            });
        });

        tracker.updateDashboard();
    },
    init() {
        if (document.getElementById("tableBody")) {
            this.load();
            this.render();
            this.checkCompletion();
        }
    }
};

const ProjectManager = {
    storageKey: "visualProjects",
    loadProjects() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            const projects = JSON.parse(raw);
            return Array.isArray(projects) ? projects : [];
        } catch (error) {
            return [];
        }
    },
    saveProjects(projects) {
        localStorage.setItem(this.storageKey, JSON.stringify(projects));
    },
    getProjectById(id) {
        if (!id) return null;
        const projects = this.loadProjects();
        return projects.find(project => String(project.id) === String(id)) || null;
    },
    createProject({ title, notes, connections, panX, panY, zoom }) {
        const projects = this.loadProjects();
        const project = {
            id: Date.now().toString(),
            title: title || "Untitled Project",
            notes: notes || [],
            connections: connections || [],
            panX: typeof panX === "number" ? panX : 0,
            panY: typeof panY === "number" ? panY : 0,
            zoom: typeof zoom === "number" ? zoom : 1,
            createdAt: Date.now(),
            modifiedAt: Date.now()
        };
        projects.unshift(project);
        this.saveProjects(projects);
        return project;
    },
    deleteProject(id) {
        const projects = this.loadProjects();
        const filtered = projects.filter(p => String(p.id) !== String(id));
        this.saveProjects(filtered);
    }
};

const ProjectsPage = {
    init() {
        const listContainer = document.getElementById("projectList");
        if (!listContainer) return;
        const newButton = document.getElementById("newProjectButton");
        if (newButton) {
            newButton.onclick = () => {
                const title = prompt("Project title:", "New Project") || "New Project";
                const project = ProjectManager.createProject({ title, notes: [], connections: [], panX: 0, panY: 0, zoom: 1 });
                window.location.href = `think.html?projectId=${project.id}`;
            };
        }
        this.render();
    },
    render() {
        const listContainer = document.getElementById("projectList");
        if (!listContainer) return;
        const projects = ProjectManager.loadProjects();
        listContainer.innerHTML = projects.map(project => {
            const title = project.title || "Untitled Project";
            const modified = new Date(project.modifiedAt || project.createdAt || Date.now()).toLocaleString();
            return `
                <div class="project-card" data-id="${project.id}">
                    <h2>${TaskTracker.escapeHtml(title)}</h2>
                    <div>Saved: ${TaskTracker.escapeHtml(modified)}</div>
                    <div class="project-actions">
                        <button class="button openProjectButton" data-id="${project.id}">Open</button>
                        <button class="button deleteProjectButton" data-id="${project.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join("") || `<div>No projects yet. Create one to start.</div>`;

        listContainer.querySelectorAll(".openProjectButton").forEach(button => {
            button.onclick = event => {
                const id = event.currentTarget.dataset.id;
                window.location.href = `think.html?projectId=${id}`;
            };
        });

        listContainer.querySelectorAll(".deleteProjectButton").forEach(button => {
            button.onclick = event => {
                const id = event.currentTarget.dataset.id;
                if (confirm("Delete this project?")) {
                    ProjectManager.deleteProject(id);
                    this.render();
                }
            };
        });
    }
};

const VisualNotes = {
    notes: JSON.parse(localStorage.getItem("visualNotes")) || [],
    connections: JSON.parse(localStorage.getItem("visualConnections")) || [],
    projectId: null,
    projectTitle: localStorage.getItem("visualTitle") || "Untitled Project",
    selectedNote: null,
    selectedNotes: [],
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
    selectingBox: false,
    selectBoxStart: { x: 0, y: 0 },
    selectBoxStartScreen: { x: 0, y: 0 },
    selectionBoxElement: null,
    saveBoard() {
        if (this.projectId) {
            const projects = ProjectManager.loadProjects();
            const projectIndex = projects.findIndex(p => String(p.id) === String(this.projectId));
            const projectData = {
                id: this.projectId,
                title: this.projectTitle,
                notes: this.notes,
                connections: this.connections,
                panX: this.panX,
                panY: this.panY,
                zoom: this.zoom,
                modifiedAt: Date.now()
            };
            if (projectIndex >= 0) {
                projects[projectIndex] = {
                    ...projects[projectIndex],
                    ...projectData
                };
            } else {
                projects.unshift(projectData);
            }
            ProjectManager.saveProjects(projects);
        } else {
            localStorage.setItem("visualNotes", JSON.stringify(this.notes));
            localStorage.setItem("visualConnections", JSON.stringify(this.connections));
            localStorage.setItem("visualTitle", this.projectTitle);
        }
    },
    saveProject() {
        if (!this.projectTitle || this.projectTitle.trim() === "") {
            this.projectTitle = prompt("Project title:", "New Project") || this.projectTitle;
        }
        if (!this.projectTitle) return;

        if (!this.projectId) {
            const project = ProjectManager.createProject({
                title: this.projectTitle,
                notes: this.notes,
                connections: this.connections,
                panX: this.panX,
                panY: this.panY,
                zoom: this.zoom
            });
            this.projectId = project.id;
            history.replaceState(null, "", `think.html?projectId=${project.id}`);
        }

        this.saveBoard();
        alert("Project saved.");
    },
    createNote() {
        const { x, y } = this.getVisibleCenter();
        this.createNoteAt(x, y);
    },
    createNoteAt(x, y, options = {}) {
        const note = {
            id: Date.now(),
            x,
            y,
            width: typeof options.width === 'number' ? options.width : 220,
            height: typeof options.height === 'number' ? options.height : 140,
            title: options.title || "New note",
            text: options.text || "",
            imageSrc: options.imageSrc || null,
            type: options.type || (options.imageSrc ? 'image' : 'text'),
            aspectRatio: typeof options.aspectRatio === 'number' ? options.aspectRatio : null,
            color: options.color || null
        };
        this.notes.push(note);
        this.saveBoard();
        this.render();
        return note;
    },
    deleteNote(id) {
        this.notes = this.notes.filter(n => n.id !== id);
        this.saveBoard();
        this.render();
    },
    updateText(id, value) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;
        note.text = value;
        this.saveBoard();
    },
    updateProjectTitle(title) {
        this.projectTitle = title;
        const input = document.getElementById("projectTitleInput");
        if (input) {
            input.value = this.projectTitle;
        }
        if (this.projectId) {
            this.saveBoard();
        }
    },
    chooseNoteImage(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        const imageUrl = prompt("Enter image URL, or leave blank to upload a local file:", note.imageSrc || "");
        if (imageUrl) {
            note.imageSrc = imageUrl;
            note.type = 'image';
            // Try to get aspect ratio via Image
            const img = new Image();
            img.onload = () => {
                note.aspectRatio = img.naturalHeight / img.naturalWidth;
                note.width = Math.min(400, img.naturalWidth);
                note.height = Math.max(80, Math.round(note.width * note.aspectRatio));
                this.saveBoard();
                this.render();
            };
            img.src = imageUrl;
            // render immediately in case it fails to load later
            this.saveBoard();
            this.render();
            return;
        }

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.onchange = () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                note.imageSrc = reader.result;
                this.saveBoard();
                this.render();
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    },
    moveNote(event) {
        if (!this.selectedNote) return;
        const canvasOffsetTop = 50;
        const viewportX = event.clientX;
        const viewportY = event.clientY - canvasOffsetTop;
        const unzoomedX = (viewportX - this.panX) / this.zoom;
        const unzoomedY = (viewportY - this.panY) / this.zoom;
        const deltaX = unzoomedX - this.offsetX - this.selectedNote.x;
        const deltaY = unzoomedY - this.offsetY - this.selectedNote.y;

        this.selectedNotes.forEach(noteId => {
            const note = this.notes.find(n => n.id === noteId);
            if (!note) return;
            note.x += deltaX;
            note.y += deltaY;
        });

        this.render();
    },
    loadBoard() {
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get("projectId");
        this.projectId = projectId;
        let project = null;

        if (projectId) {
            project = ProjectManager.getProjectById(projectId);
        }

        if (project) {
            this.projectTitle = project.title || "Untitled Project";
            this.notes = project.notes || [];
            this.connections = project.connections || [];
            this.panX = typeof project.panX === "number" ? project.panX : 0;
            this.panY = typeof project.panY === "number" ? project.panY : 0;
            this.zoom = typeof project.zoom === "number" ? project.zoom : 1;
        } else if (!projectId) {
            const loadedNotes = JSON.parse(localStorage.getItem("visualNotes")) || [];
            const loadedConnections = JSON.parse(localStorage.getItem("visualConnections")) || [];
            this.notes = loadedNotes;
            this.connections = loadedConnections;
            this.projectTitle = localStorage.getItem("visualTitle") || "Untitled Project";
        } else {
            this.notes = [];
            this.connections = [];
            this.projectTitle = "Untitled Project";
        }

        const titleInput = document.getElementById("projectTitleInput");
        if (titleInput) {
            titleInput.value = this.projectTitle;
        }
        this.render();
    },
    getVisibleCenter() {
        const viewportX = window.innerWidth / 2;
        const viewportY = 50 + (window.innerHeight - 50) / 2;
        return {
            x: (viewportX - this.panX) / this.zoom,
            y: (viewportY - this.panY) / this.zoom
        };
    },
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },
    updateTitle(id, value) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;
        note.title = value;
        this.saveBoard();
    },

    getTitleWidth(title) {
        let sizer = document.getElementById('noteTitleSizer');
        if (!sizer) {
            sizer = document.createElement('span');
            sizer.id = 'noteTitleSizer';
            sizer.className = 'noteTitle';
            sizer.style.position = 'absolute';
            sizer.style.visibility = 'hidden';
            sizer.style.pointerEvents = 'none';
            sizer.style.whiteSpace = 'nowrap';
            document.body.appendChild(sizer);
        }
        sizer.textContent = title || 'Untitled';
        return sizer.offsetWidth;
    },

    getMinNoteWidth(note) {
        const titleWidth = this.getTitleWidth(note.title || 'Untitled');
        return Math.max(titleWidth + 24, note.type === 'image' ? 80 : 150);
    },

    getTextHeight(text, width) {
        let sizer = document.getElementById('noteTextSizer');
        if (!sizer) {
            sizer = document.createElement('div');
            sizer.id = 'noteTextSizer';
            sizer.style.position = 'absolute';
            sizer.style.visibility = 'hidden';
            sizer.style.pointerEvents = 'none';
            sizer.style.whiteSpace = 'pre-wrap';
            sizer.style.wordWrap = 'break-word';
            sizer.style.padding = '8px';
            sizer.style.fontSize = '1rem';
            sizer.style.fontFamily = 'inherit';
            sizer.style.lineHeight = '1.4';
            sizer.style.width = '200px';
            document.body.appendChild(sizer);
        }
        sizer.style.width = width + 'px';
        sizer.textContent = text || '';
        return sizer.offsetHeight;
    },

    getMinNoteHeight(note) {
        const titleHeight = 28;
        const textHeight = this.getTextHeight(note.text || '', (note.width || 220) - 16);
        return Math.max(textHeight + titleHeight + 20, note.type === 'image' ? 80 : 100);
    },

    isIgnoreElement(target) {
        return target.closest("input,textarea,button,select,a,.resizeHandle,#toolbar");
    },

    startTitleEdit(note, titleElement) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'noteTitleInput';
        input.value = note.title;
        input.addEventListener('mousedown', e => e.stopPropagation());
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                input.value = note.title;
                input.blur();
            }
        });
        input.addEventListener('blur', () => {
            note.title = input.value.trim() || 'Untitled';
            note.width = Math.max(note.width || 220, this.getMinNoteWidth(note));
            this.saveBoard();
            this.render();
        });
        titleElement.replaceWith(input);
        input.focus();
        input.select();
    },
    deleteSelectedNotes() {
        if (!this.selectedNotes.length) return;
        this.notes = this.notes.filter(note => !this.selectedNotes.includes(note.id));
        this.selectedNotes = [];
        this.saveBoard();
        this.render();
    },
    connectNotes(a, b) {
        if (a === b) return;
        const exists = this.connections.some(
            c => (c.a === a && c.b === b) || (c.a === b && c.b === a)
        );
        if (exists) return;
        this.connections.push({ a, b });
        this.saveBoard();
        this.drawConnections();
    },
    removeConnection(a, b) {
        this.connections = this.connections.filter(
            c => !(
                (c.a === a && c.b === b) ||
                (c.a === b && c.b === a)
            )
        );
        this.saveBoard();
        this.drawConnections();
    },

    removeMode: false,
    addMode: false,
    removeDragActive: false,
    removeDragStart: null,
    removeDragLine: null,
    removeDragCrossed: [],
    addDragActive: false,
    addDragStart: null,
    addDragLine: null,
    addDragTouchedNotes: [],
    colorMode: false,
    colorPanelElement: null,
    colorPicker: null,
    colorApplyButton: null,
    toggleRemoveMode() {
        this.removeMode = !this.removeMode;
        const btn = document.getElementById('removeBtn');
        const svg = document.getElementById('connections');
        const addBtn = document.getElementById('addBtn');
        if (this.removeMode) {
            // turn off add mode and clean it up
            if (this.addMode) {
                this.addMode = false;
                if (addBtn) {
                    addBtn.classList.remove('active');
                    addBtn.textContent = 'Add Connections';
                }
                document.body.classList.remove('add-mode-active');
                if (svg) svg.classList.remove('add-mode-active');
                try { this.endAddDrag(); } catch (e) {}
            }
            if (btn) {
                btn.classList.add('active');
                btn.textContent = 'Remove: ON';
            }
            if (svg) svg.classList.add('remove-mode-active');
            document.body.classList.add('remove-mode-active');
        } else {
            if (btn) {
                btn.classList.remove('active');
                btn.textContent = 'Remove Connections';
            }
            if (svg) svg.classList.remove('remove-mode-active');
            document.body.classList.remove('remove-mode-active');
            try { this.clearRemoveDrag(); } catch (e) {}
        }
    },

    toggleAddMode() {
        this.addMode = !this.addMode;
        const btn = document.getElementById('addBtn');
        const svg = document.getElementById('connections');
        const removeBtn = document.getElementById('removeBtn');
        if (this.addMode) {
            // turn off remove mode and clean it up
            if (this.removeMode) {
                this.removeMode = false;
                if (removeBtn) {
                    removeBtn.classList.remove('active');
                    removeBtn.textContent = 'Remove Connections';
                }
                document.body.classList.remove('remove-mode-active');
                if (svg) svg.classList.remove('remove-mode-active');
                try { this.endRemoveDrag(); } catch (e) {}
            }
            if (btn) {
                btn.classList.add('active');
                btn.textContent = 'Add: ON';
            }
            if (svg) svg.classList.add('add-mode-active');
            document.body.classList.add('add-mode-active');
        } else {
            if (btn) {
                btn.classList.remove('active');
                btn.textContent = 'Add Connections';
            }
            if (svg) svg.classList.remove('add-mode-active');
            document.body.classList.remove('add-mode-active');
            try { this.endAddDrag(); } catch (e) {}
        }
    },

    toggleColorMode() {
        this.colorMode = !this.colorMode;
        const btn = document.getElementById('colorBtn');
        const svg = document.getElementById('connections');
        const addBtn = document.getElementById('addBtn');
        const removeBtn = document.getElementById('removeBtn');
        if (this.colorMode) {
            // turn off other modes
            if (this.addMode) {
                this.addMode = false;
                if (addBtn) { addBtn.classList.remove('active'); addBtn.textContent = 'Add Connections'; }
                try { this.endAddDrag(); } catch (e) {}
            }
            if (this.removeMode) {
                this.removeMode = false;
                if (removeBtn) { removeBtn.classList.remove('active'); removeBtn.textContent = 'Remove Connections'; }
                try { this.endRemoveDrag(); } catch (e) {}
            }
            if (btn) { btn.classList.add('active'); btn.textContent = 'Color: ON'; }
            // show color panel
            if (this.colorPanelElement) this.colorPanelElement.style.display = 'flex';
            document.body.classList.add('color-mode-active');
        } else {
            if (btn) { btn.classList.remove('active'); btn.textContent = 'Color Mode'; }
            if (this.colorPanelElement) this.colorPanelElement.style.display = 'none';
            document.body.classList.remove('color-mode-active');
            // clear selection visuals
        }
    },

    applyColor() {
        if (!this.selectedNotes.length) return;
        const color = (this.colorPicker && this.colorPicker.value) ? this.colorPicker.value : null;
        if (!color) return;
        this.selectedNotes.forEach(id => {
            const note = this.notes.find(n => n.id === id);
            if (!note) return;
            note.color = color;
        });
        this.saveBoard();
        this.render();
    },
    
    drawConnections() {
        const svg = document.getElementById("connections");
        if (!svg) return;
        this.clearRemoveDrag();
        const canvas = document.getElementById("canvas");
        if (canvas) {
            // Position both SVG and canvas at the same place; transforms will sync them
            svg.style.left = canvas.style.left || '0px';
            svg.style.top = canvas.style.top || '50px';
            svg.setAttribute("width", canvas.offsetWidth);
            svg.setAttribute("height", canvas.offsetHeight);
        }
        svg.innerHTML = "";

        // defs for gradients
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svg.appendChild(defs);

        this.connections.forEach(c => {
            const a = this.notes.find(n => n.id === c.a);
            const b = this.notes.find(n => n.id === c.b);
            if (!a || !b) return;
            const connKey = `${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`;

            const x1 = a.x + 110;
            const y1 = a.y + 70;
            const x2 = b.x + 110;
            const y2 = b.y + 70;

            // Determine colors (default gray for notes without color)
            const defaultGray = '#aaa';
            const colorA = a.color || defaultGray;
            const colorB = b.color || defaultGray;

            let strokeRef = null;
            if (colorA && colorB && colorA === colorB) {
                // same color: solid stroke
                strokeRef = colorA;
            } else {
                // different colors: create a gradient
                const gradId = `grad-${c.a}-${c.b}`;
                // remove existing def if present
                const existing = defs.querySelector(`#${gradId}`);
                if (existing) existing.remove();
                const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
                grad.setAttribute('id', gradId);
                grad.setAttribute('gradientUnits', 'userSpaceOnUse');
                grad.setAttribute('x1', x1);
                grad.setAttribute('y1', y1);
                grad.setAttribute('x2', x2);
                grad.setAttribute('y2', y2);
                const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                stop1.setAttribute('offset', '0%');
                stop1.setAttribute('stop-color', colorA);
                const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                stop2.setAttribute('offset', '100%');
                stop2.setAttribute('stop-color', colorB);
                grad.appendChild(stop1);
                grad.appendChild(stop2);
                defs.appendChild(grad);
                strokeRef = `url(#${gradId})`;
            }

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("class", "line");
            line.dataset.conn = connKey;
            // Prefer inline styles so CSS defaults don't override colors/gradients
            if (strokeRef) {
                line.setAttribute('stroke', strokeRef);
                line.style.stroke = strokeRef;
            } else {
                line.style.stroke = '#aaa';
            }
            line.style.strokeWidth = '2';
            line.style.strokeLinecap = 'round';
            line.addEventListener("click", e => {
                e.stopPropagation();
                if (this.removeMode) {
                    this.removeConnection(c.a, c.b);
                }
            });

            // Add invisible wider stroke for better clickability
            const bgLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            bgLine.setAttribute("x1", x1);
            bgLine.setAttribute("y1", y1);
            bgLine.setAttribute("x2", x2);
            bgLine.setAttribute("y2", y2);
            bgLine.setAttribute("stroke", "transparent");
            bgLine.setAttribute("stroke-width", "20");
            bgLine.style.pointerEvents = "all";
            bgLine.style.cursor = "pointer";
            bgLine.dataset.conn = connKey;
            bgLine.addEventListener("click", e => {
                e.stopPropagation();
                if (this.removeMode) {
                    this.removeConnection(c.a, c.b);
                }
            });
            svg.appendChild(bgLine);
            svg.appendChild(line);
        });
    },
    startRemoveDrag(event) {
        if (this.removeDragActive) return;
        this.removeDragActive = true;
        this.removeDragCrossed = [];
        const svg = document.getElementById("connections");
        if (!svg) return;
        this.removeDragStart = this.screenToCanvas(event.clientX, event.clientY);
        this.removeDragLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        this.removeDragLine.setAttribute("class", "removeLine");
        this.removeDragLine.setAttribute("x1", this.removeDragStart.x);
        this.removeDragLine.setAttribute("y1", this.removeDragStart.y);
        this.removeDragLine.setAttribute("x2", this.removeDragStart.x);
        this.removeDragLine.setAttribute("y2", this.removeDragStart.y);
        svg.appendChild(this.removeDragLine);
        this.updateRemoveDrag(event);
    },
    startAddDrag(event) {
        if (this.addDragActive) return;
        this.addDragActive = true;
        this.addDragTouchedNotes = [];
        const svg = document.getElementById("connections");
        if (!svg) return;
        this.addDragStart = this.screenToCanvas(event.clientX, event.clientY);
        this.addDragLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        this.addDragLine.setAttribute("class", "addLine");
        this.addDragLine.setAttribute("x1", this.addDragStart.x);
        this.addDragLine.setAttribute("y1", this.addDragStart.y);
        this.addDragLine.setAttribute("x2", this.addDragStart.x);
        this.addDragLine.setAttribute("y2", this.addDragStart.y);
        svg.appendChild(this.addDragLine);
        this.updateAddDrag(event);
    },
    updateAddDrag(event) {
        if (!this.addDragActive || !this.addDragStart) return;
        const end = this.screenToCanvas(event.clientX, event.clientY);
        if (!this.addDragLine) return;
        this.addDragLine.setAttribute("x2", end.x);
        this.addDragLine.setAttribute("y2", end.y);

        // highlight notes crossed by the line
        const touched = new Set();
        for (let note of this.notes) {
            // check if the line intersects note rect
            const rectSegs = [
                { x1: note.x, y1: note.y, x2: note.x + (note.width || 220), y2: note.y },
                { x1: note.x + (note.width || 220), y1: note.y, x2: note.x + (note.width || 220), y2: note.y + (note.height || 140) },
                { x1: note.x + (note.width || 220), y1: note.y + (note.height || 140), x2: note.x, y2: note.y + (note.height || 140) },
                { x1: note.x, y1: note.y + (note.height || 140), x2: note.x, y2: note.y }
            ];
            for (let seg of rectSegs) {
                if (this.lineIntersects(this.addDragStart, end, seg)) {
                    touched.add(note.id);
                    break;
                }
            }
        }

        this.addDragTouchedNotes = Array.from(touched);

        // apply highlight classes
        const svg = document.getElementById("connections");
        if (!svg) return;
        const canvas = document.getElementById("canvas");
        if (!canvas) return;
        // highlight notes dom elements
        canvas.querySelectorAll('.note').forEach(div => {
            const id = Number(div.dataset.noteId);
            if (id && touched.has(id)) {
                div.classList.add('addition-highlight');
            } else {
                div.classList.remove('addition-highlight');
            }
        });
    },
    endAddDrag() {
        if (!this.addDragActive) return;
        this.addDragActive = false;
        if (this.addDragTouchedNotes.length > 1) {
            // Connect all touched notes pairwise: connect sequentially as one group (first to others)
            const ids = this.addDragTouchedNotes;
            const base = ids[0];
            for (let i = 1; i < ids.length; i++) {
                this.connectNotes(base, ids[i]);
            }
            this.saveBoard();
            this.drawConnections();
        }
        // cleanup
        if (this.addDragLine) {
            this.addDragLine.remove();
            this.addDragLine = null;
        }
        this.addDragStart = null;
        this.addDragTouchedNotes = [];
        const canvas = document.getElementById("canvas");
        if (canvas) {
            canvas.querySelectorAll('.note').forEach(div => div.classList.remove('addition-highlight'));
        }
    },
    updateRemoveDrag(event) {
        if (!this.removeDragActive || !this.removeDragStart) return;
        const end = this.screenToCanvas(event.clientX, event.clientY);
        if (!this.removeDragLine) return;
        this.removeDragLine.setAttribute("x2", end.x);
        this.removeDragLine.setAttribute("y2", end.y);

        const crossed = new Set();
        this.connections.forEach(c => {
            const a = this.notes.find(n => n.id === c.a);
            const b = this.notes.find(n => n.id === c.b);
            if (!a || !b) return;
            const segA = { x1: a.x + 110, y1: a.y + 70, x2: b.x + 110, y2: b.y + 70 };
            if (this.lineIntersects(this.removeDragStart, end, segA)) {
                crossed.add(`${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`);
            }
        });

        this.removeDragCrossed = Array.from(crossed);
        const svg = document.getElementById("connections");
        if (!svg) return;
        svg.querySelectorAll(".line").forEach(line => {
            const key = line.dataset.conn;
            if (key && crossed.has(key)) {
                line.classList.add("removal-highlight");
            } else {
                line.classList.remove("removal-highlight");
            }
        });
    },
    endRemoveDrag() {
        if (!this.removeDragActive) return;
        this.removeDragActive = false;
        if (this.removeDragCrossed.length > 0) {
            this.connections = this.connections.filter(c => {
                const key = `${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`;
                return !this.removeDragCrossed.includes(key);
            });
            this.saveBoard();
            this.drawConnections();
        } else {
            this.clearRemoveDrag();
        }
        this.removeDragCrossed = [];
        this.removeDragStart = null;
    },
    clearRemoveDrag() {
        if (this.removeDragLine) {
            this.removeDragLine.remove();
            this.removeDragLine = null;
        }
        this.removeDragActive = false;
        this.removeDragCrossed = [];
        const svg = document.getElementById("connections");
        if (!svg) return;
        svg.querySelectorAll(".line").forEach(line => {
            line.classList.remove("removal-highlight");
        });
    },
    screenToCanvas(clientX, clientY) {
        const canvasOffsetTop = 50;
        const viewportX = clientX;
        const viewportY = clientY - canvasOffsetTop;
        return {
            x: (viewportX - this.panX) / this.zoom,
            y: (viewportY - this.panY) / this.zoom
        };
    },
    lineIntersects(a, b, c) {
        const d = { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 };
        const orientation = (p, q, r) => {
            return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        };
        const onSegment = (p, q, r) => {
            return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
                q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
        };
        const p1 = { x: a.x, y: a.y };
        const q1 = { x: b.x, y: b.y };
        const p2 = { x: d.x1, y: d.y1 };
        const q2 = { x: d.x2, y: d.y2 };
        const o1 = orientation(p1, q1, p2);
        const o2 = orientation(p1, q1, q2);
        const o3 = orientation(p2, q2, p1);
        const o4 = orientation(p2, q2, q1);
        if (o1 === 0 && onSegment(p1, p2, q1)) return true;
        if (o2 === 0 && onSegment(p1, q2, q1)) return true;
        if (o3 === 0 && onSegment(p2, p1, q2)) return true;
        if (o4 === 0 && onSegment(p2, q1, q2)) return true;
        return o1 * o2 < 0 && o3 * o4 < 0;
    },
    stopMove() {
        if (this.selectedNote) {
            this.saveBoard();
        }
        document.body.style.userSelect = this.previousBodyUserSelect || '';
        document.body.style.webkitUserSelect = this.previousBodyWebkitUserSelect || '';
        document.onselectstart = null;
        this.selectedNote = null;
        document.onmousemove = null;
        document.onmouseup = null;
    },
    startSelectBox(event) {
        if (event.button !== 0) return; // Only left click
        const canvasOffsetTop = 50;
        const viewportX = event.clientX;
        const viewportY = event.clientY - canvasOffsetTop;
        this.selectBoxStart = {
            x: (viewportX - this.panX) / this.zoom,
            y: (viewportY - this.panY) / this.zoom
        };
        this.selectBoxStartScreen = {
            x: event.clientX,
            y: event.clientY
        };
        if (this.selectionBoxElement) {
            this.selectionBoxElement.style.display = "block";
        }
        this.selectingBox = true;
        document.onmousemove = e => this.updateSelectBox(e);
        document.onmouseup = () => this.stopSelectBox();
    },
    updateSelectBox(event) {
        if (!this.selectingBox) return;
        const canvasOffsetTop = 50;
        const viewportX = event.clientX;
        const viewportY = event.clientY - canvasOffsetTop;
        const endX = (viewportX - this.panX) / this.zoom;
        const endY = (viewportY - this.panY) / this.zoom;
        
        const minX = Math.min(this.selectBoxStart.x, endX);
        const maxX = Math.max(this.selectBoxStart.x, endX);
        const minY = Math.min(this.selectBoxStart.y, endY);
        const maxY = Math.max(this.selectBoxStart.y, endY);
        
        this.selectedNotes = this.notes
            .filter(note => {
                const noteRight = note.x + (note.width || 220);
                const noteBottom = note.y + (note.height || 140);
                return note.x < maxX && noteRight > minX && note.y < maxY && noteBottom > minY;
            })
            .map(n => n.id);
        
        if (this.selectionBoxElement) {
            const screenMinX = Math.min(this.selectBoxStartScreen.x, event.clientX);
            const screenMinY = Math.min(this.selectBoxStartScreen.y, event.clientY);
            const screenWidth = Math.abs(event.clientX - this.selectBoxStartScreen.x);
            const screenHeight = Math.abs(event.clientY - this.selectBoxStartScreen.y);
            this.selectionBoxElement.style.left = screenMinX + "px";
            this.selectionBoxElement.style.top = screenMinY + "px";
            this.selectionBoxElement.style.width = screenWidth + "px";
            this.selectionBoxElement.style.height = screenHeight + "px";
        }
        
        this.render();
    },
    stopSelectBox() {
        this.selectingBox = false;
        if (this.selectionBoxElement) {
            this.selectionBoxElement.style.display = "none";
            this.selectionBoxElement.style.width = "0px";
            this.selectionBoxElement.style.height = "0px";
        }
        document.onmousemove = null;
        document.onmouseup = null;
    },
    startResize(note, e) {
        this.resizingNote = note;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeStartWidth = note.width || 220;
        this.resizeStartHeight = note.height || 140;
        this.previousBodyUserSelect = document.body.style.userSelect;
        this.previousBodyWebkitUserSelect = document.body.style.webkitUserSelect;
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.onselectstart = () => false;
        document.onmousemove = e2 => this.doResize(e2);
        document.onmouseup = () => this.stopResize();
    },
    doResize(e) {
        if (!this.resizingNote) return;
        const canvasOffsetTop = 50;
        const deltaX = (e.clientX - this.resizeStartX) / this.zoom;
        const deltaY = (e.clientY - this.resizeStartY) / this.zoom;
        const minWidth = this.getMinNoteWidth(this.resizingNote);
        if (this.resizingNote.type === 'image' && this.resizingNote.aspectRatio) {
            const newWidth = Math.max(minWidth, this.resizeStartWidth + deltaX);
            const newHeight = Math.max(40, Math.round(newWidth * this.resizingNote.aspectRatio));
            this.resizingNote.width = newWidth;
            this.resizingNote.height = newHeight;
        } else {
            this.resizingNote.width = Math.max(minWidth, this.resizeStartWidth + deltaX);
            const minHeight = this.getMinNoteHeight(this.resizingNote);
            this.resizingNote.height = Math.max(minHeight, this.resizeStartHeight + deltaY);
        }
        this.render();
    },
    stopResize() {
        if (this.resizingNote) {
            this.saveBoard();
        }
        document.body.style.userSelect = this.previousBodyUserSelect || '';
        document.body.style.webkitUserSelect = this.previousBodyWebkitUserSelect || '';
        document.onselectstart = null;
        this.resizingNote = null;
        document.onmousemove = null;
        document.onmouseup = null;
    },
    render() {
        const canvas = document.getElementById("canvas");
        if (!canvas) return;
        const notes = this.notes;
        const self = this;
        
        // Create grid background once
        let gridContainer = canvas.querySelector(".gridBackground");
        if (!gridContainer) {
            const grid = document.createElement("div");
            grid.className = "gridBackground";
            grid.style.position = "absolute";
            grid.style.top = "0";
            grid.style.left = "0";
            grid.style.width = "10000px";
            grid.style.height = "10000px";
            grid.style.pointerEvents = "none";
            grid.style.zIndex = "1";
            grid.style.backgroundImage = 'radial-gradient(circle, #555 1.5px, transparent 1.5px)';
            grid.style.backgroundSize = '30px 30px';
            canvas.appendChild(grid);
        }
        
        // Remove all notes (but keep grid)
        const allNotes = canvas.querySelectorAll(".note");
        allNotes.forEach(note => note.remove());

        notes.forEach(note => {
            const div = document.createElement("div");
            div.className = "note";
            div.dataset.noteId = note.id;
            if (this.selectedNotes.includes(note.id)) {
                div.classList.add("selected");
            }
            div.style.left = note.x + "px";
            div.style.top = note.y + "px";
            const minNoteWidth = self.getMinNoteWidth(note);
            if ((note.width || 220) < minNoteWidth) {
                note.width = minNoteWidth;
            }
            const minNoteHeight = note.type === 'image' ? note.height || 140 : self.getMinNoteHeight(note);
            if ((note.height || 140) < minNoteHeight) {
                note.height = minNoteHeight;
            }
            div.style.width = (note.width || 220) + "px";
            div.style.height = (note.height || 140) + "px";
            // apply custom background color if present
            div.style.setProperty('--note-bg', note.color || '#333');
            if (note.type === 'image') {
                div.innerHTML = `
        <div class="noteHeader">
            <span class="noteTitle">${this.escapeHtml(note.title)}</span>
        </div>
        ${note.imageSrc ? `<div class="noteImage"><img src="${this.escapeHtml(note.imageSrc)}" alt="Note image">` +
            `</img></div>` : ""}
        <div class="resizeHandle"></div>
        `;
            } else {
                div.innerHTML = `
        <div class="noteHeader">
            <span class="noteTitle">${this.escapeHtml(note.title)}</span>
        </div>
        ${note.imageSrc ? `<div class="noteImage"><img src="${this.escapeHtml(note.imageSrc)}" alt="Note image"></div>` : ""}
        <textarea>${this.escapeHtml(note.text)}</textarea>
        <div class="resizeHandle"></div>
        `;
            }

            const titleElement = div.querySelector(".noteTitle");
            if (titleElement) {
                titleElement.addEventListener('click', e => {
                    e.stopPropagation();
                    self.startTitleEdit(note, titleElement);
                });
            }

            const textarea = div.querySelector("textarea");
            if (textarea) {
                textarea.oninput = () => {
                    self.updateText(note.id, textarea.value);
                    const minNoteHeight = self.getMinNoteHeight(note);
                    note.height = Math.max(note.height || 140, minNoteHeight);
                    div.style.height = note.height + 'px';
                };
                textarea.onmousedown = e => {
                    e.stopPropagation();
                };
                textarea.onfocus = e => {
                    e.stopPropagation();
                };
            }

            // If image note, bind image onload to capture aspect ratio and set initial size
            if (note.type === 'image') {
                const imgEl = div.querySelector('.noteImage img');
                if (imgEl) {
                    imgEl.onload = () => {
                        try {
                            const naturalW = imgEl.naturalWidth || imgEl.width;
                            const naturalH = imgEl.naturalHeight || imgEl.height;
                            if (naturalW && naturalH) {
                                note.aspectRatio = naturalH / naturalW;
                                // If note had default width, compute height to keep proportions
                                if (!note._sizeInitialized) {
                                    const maxW = 400;
                                    const newW = Math.min(maxW, naturalW, note.width || 220);
                                    note.width = newW;
                                    note.height = Math.max(80, Math.round(newW * note.aspectRatio));
                                    note._sizeInitialized = true;
                                    div.style.width = note.width + 'px';
                                    div.style.height = note.height + 'px';
                                }
                            }
                        } catch (err) {
                            // ignore
                        }
                    };
                }
            }


            div.onmousedown = e => {
                if (self.removeMode) return;
                if (self.addMode) return;
                if (self.colorMode) {
                    // In color mode, clicking a note toggles its selection (no drag)
                    if (self.isIgnoreElement(e.target)) {
                        e.stopPropagation();
                        return;
                    }
                    e.stopPropagation();
                    if (self.selectedNotes.includes(note.id)) {
                        self.selectedNotes = self.selectedNotes.filter(id => id !== note.id);
                    } else {
                        self.selectedNotes.push(note.id);
                    }
                    self.render();
                    return;
                }
                if (self.isIgnoreElement(e.target)) {
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                e.preventDefault();
                const canvasOffsetTop = 50;
                const viewportX = e.clientX;
                const viewportY = e.clientY - canvasOffsetTop;
                const unzoomedX = (viewportX - self.panX) / self.zoom;
                const unzoomedY = (viewportY - self.panY) / self.zoom;
                
                // Handle Ctrl+Click: toggle selection without dragging
                if (e.ctrlKey || e.metaKey) {
                    if (self.selectedNotes.includes(note.id)) {
                        self.selectedNotes = self.selectedNotes.filter(id => id !== note.id);
                    } else {
                        self.selectedNotes.push(note.id);
                    }
                    self.render();
                    return; // Don't drag on Ctrl+Click
                }
                
                // If clicking on already selected note, drag all selected notes
                if (self.selectedNotes.includes(note.id)) {
                    self.selectedNote = note;
                    self.offsetX = unzoomedX - note.x;
                    self.offsetY = unzoomedY - note.y;
                } else {
                    // Clicking on unselected note: select only it and drag
                    self.selectedNotes = [note.id];
                    self.render();
                    self.selectedNote = note;
                    self.offsetX = unzoomedX - note.x;
                    self.offsetY = unzoomedY - note.y;
                }
                self.previousBodyUserSelect = document.body.style.userSelect;
                self.previousBodyWebkitUserSelect = document.body.style.webkitUserSelect;
                document.body.style.userSelect = 'none';
                document.body.style.webkitUserSelect = 'none';
                document.onselectstart = () => false;
                document.onmousemove = e2 => self.moveNote(e2);
                document.onmouseup = () => self.stopMove();
            };
            
            const resizeHandle = div.querySelector(".resizeHandle");
            if (resizeHandle) {
                resizeHandle.onmousedown = e => {
                    e.stopPropagation();
                    self.startResize(note, e);
                };
            }

            canvas.appendChild(div);
        });

        this.drawConnections();
    },
    applyTransform() {
        const canvas = document.getElementById("canvas");
        const svg = document.getElementById("connections");
        const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        if (canvas) {
            canvas.style.transform = transform;
            canvas.style.transformOrigin = "0 0";
        }
        if (svg) {
            svg.style.transform = transform;
            svg.style.transformOrigin = "0 0";
        }
    },
    startPan(event) {
        if (event.button !== 2) return;
        this.panning = true;
        this.panStartX = event.clientX;
        this.panStartY = event.clientY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
        document.onmousemove = e => this.updatePan(e);
        document.onmouseup = () => this.stopPan();
        event.preventDefault();
    },
    updatePan(event) {
        if (!this.panning) return;
        const deltaX = event.clientX - this.panStartX;
        const deltaY = event.clientY - this.panStartY;
        this.panX = this.panStartPanX + deltaX;
        this.panY = this.panStartPanY + deltaY;
        this.applyTransform();
    },
    stopPan() {
        this.panning = false;
        document.onmousemove = null;
        document.onmouseup = null;
    },
    handleZoom(event) {
        event.preventDefault();
        const zoomSpeed = 0.1;
        const delta = event.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newZoom = Math.max(0.2, Math.min(10, this.zoom + delta));
        if (newZoom === this.zoom) return;
        
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = 50 + (window.innerHeight - 50) / 2;
        const worldX = (viewportCenterX - this.panX) / this.zoom;
        const worldY = (viewportCenterY - this.panY) / this.zoom;
        
        this.panX = viewportCenterX - worldX * newZoom;
        this.panY = viewportCenterY - worldY * newZoom;
        this.zoom = newZoom;
        this.applyTransform();
    },
    init() {
        if (document.getElementById("canvas")) {
            this.loadBoard();
            const canvas = document.getElementById("canvas");
            const self = this;
            
            // Create selection box overlay for drag selection
            const selectionBox = document.createElement("div");
            selectionBox.className = "selectionBox";
            selectionBox.style.display = "none";
            document.body.appendChild(selectionBox);
            this.selectionBoxElement = selectionBox;

            // Create color picker panel (hidden by default)
            const colorPanel = document.createElement('div');
            colorPanel.className = 'colorPanel';
            colorPanel.style.display = 'none';
            colorPanel.innerHTML = `
                <input type="color" class="colorPicker" value="#4caf50">
                <button class="applyColorBtn">Apply</button>
            `;
            document.body.appendChild(colorPanel);
            this.colorPanelElement = colorPanel;
            this.colorPicker = colorPanel.querySelector('.colorPicker');
            this.colorApplyButton = colorPanel.querySelector('.applyColorBtn');
            if (this.colorApplyButton) {
                this.colorApplyButton.onclick = () => this.applyColor();
            }
            
            // Center camera on 10000x10000 canvas only when the project did not already set pan/zoom
            if (this.projectId === null && this.panX === 0 && this.panY === 0 && this.zoom === 1) {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight - 50; // subtract toolbar
                this.panX = viewportWidth / 2 - (10000 * this.zoom) / 2;
                this.panY = viewportHeight / 2 - (10000 * this.zoom) / 2;
            }

            // Canvas background click for drag-select - check coordinates against note positions
            document.addEventListener("mousedown", e => {
                if (e.button !== 0) return; // Only left click
                const ignoreElement = self.isIgnoreElement(e.target);
                if (ignoreElement) return;
                if (self.removeMode) {
                    self.startRemoveDrag(e);
                    return;
                }
                if (self.addMode) {
                    self.startAddDrag(e);
                    return;
                }
                
                const canvasOffsetTop = 50;
                const viewportX = e.clientX;
                const viewportY = e.clientY - canvasOffsetTop;
                const unzoomedX = (viewportX - self.panX) / self.zoom;
                const unzoomedY = (viewportY - self.panY) / self.zoom;
                
                // Clear selection when clicking outside any note
                self.selectedNotes = [];
                self.render();

                // Check if click is within canvas bounds
                if (unzoomedX < 0 || unzoomedX > 10000 || unzoomedY < 0 || unzoomedY > 10000) {
                    return;
                }

                // Check if we clicked on a note by testing bounding boxes
                        let clickedNote = self.notes.some(note => {
                            const noteRight = note.x + (note.width || 220);
                            const noteBottom = note.y + (note.height || 140);
                            return unzoomedX >= note.x && unzoomedX <= noteRight &&
                                   unzoomedY >= note.y && unzoomedY <= noteBottom;
                        });
                
                // If we didn't click on a note, start selection box
                if (!clickedNote) {
                    self.startSelectBox(e);
                }
            });
            
            // Mouse wheel zoom - attach to document since canvas has pointer-events:none
            document.addEventListener("wheel", e => self.handleZoom(e), { passive: false });
            
            // Keyboard shortcuts
            document.addEventListener("keydown", e => {
                const activeTag = document.activeElement && document.activeElement.tagName;
                const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement.isContentEditable;
                if (typing) return;

                if (e.key === "Delete" && self.selectedNotes.length > 0 && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    self.deleteSelectedNotes();
                }
                if (!self.selectedNotes.length) {
                    if (e.key.toLowerCase() === 'a' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                        e.preventDefault();
                        self.toggleAddMode();
                    }
                    if (e.key.toLowerCase() === 'r' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                        e.preventDefault();
                        self.toggleRemoveMode();
                    }
                    if (e.key.toLowerCase() === 'c' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                        e.preventDefault();
                        self.toggleColorMode();
                    }
                }
                if (e.key.toLowerCase() === "b" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    self.createNote();
                }
            });
            document.addEventListener("mousemove", e => {
                if (self.removeDragActive) {
                    self.updateRemoveDrag(e);
                }
                if (self.addDragActive) {
                    self.updateAddDrag(e);
                }
                // color mode doesn't use a drag line, selection handled via clicks and selection box
            });
            document.addEventListener("mouseup", () => {
                if (self.removeDragActive) {
                    self.endRemoveDrag();
                }
                if (self.addDragActive) {
                    self.endAddDrag();
                }
                if (self.colorMode) {
                    // nothing to end on mouseup for color mode
                }
            });
            
            // Right-click pan
            document.addEventListener("contextmenu", e => e.preventDefault());
            document.addEventListener("mousedown", e => {
                if (e.button === 2) {
                    const ignoreElement = self.isIgnoreElement(e.target);
                    if (ignoreElement) return;
                    // Right-click always starts panning (add-mode uses left-click like remove-mode)
                    self.startPan(e);
                }
            });

            window.addEventListener("beforeunload", () => {
                self.saveBoard();
            });
            window.addEventListener("pagehide", () => {
                self.saveBoard();
            });
            window.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden") {
                    self.saveBoard();
                }
            });
            
            const preventDragDefault = e => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = "copy";
                }
            };

            const handleDrop = e => {
                if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
                preventDragDefault(e);
                const canvasOffsetTop = 50;
                const viewportX = e.clientX;
                const viewportY = e.clientY - canvasOffsetTop;
                const x = (viewportX - self.panX) / self.zoom;
                const y = (viewportY - self.panY) / self.zoom;

                const file = e.dataTransfer.files[0];
                if (!file.type.startsWith("image/")) return;

                const reader = new FileReader();
                reader.onload = () => {
                    // create note and set its aspect ratio based on a temporary Image
                    const dataUrl = reader.result;
                    const img = new Image();
                    img.onload = () => {
                        self.createNoteAt(x, y, {
                            title: "Image",
                            imageSrc: dataUrl,
                            aspectRatio: img.naturalHeight / img.naturalWidth,
                            width: Math.min(400, img.naturalWidth),
                            height: Math.max(80, Math.round(Math.min(400, img.naturalWidth) * (img.naturalHeight / img.naturalWidth))),
                            type: 'image'
                        });
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(file);
            };

            document.addEventListener("dragenter", preventDragDefault);
            document.addEventListener("dragover", preventDragDefault);
            document.addEventListener("drop", handleDrop);
            
            self.applyTransform();
        }
    }
};

window.addTask = TaskTracker.addTask.bind(TaskTracker);
window.addCategory = TaskTracker.addCategory.bind(TaskTracker);
window.deleteTask = TaskTracker.deleteTask.bind(TaskTracker);
window.toggleStep = TaskTracker.toggleStep.bind(TaskTracker);
window.addStep = TaskTracker.addStep.bind(TaskTracker);
window.removeStep = TaskTracker.removeStep.bind(TaskTracker);
window.editTask = TaskTracker.editTask.bind(TaskTracker);
window.editStep = TaskTracker.editStep.bind(TaskTracker);
window.moveStepUp = TaskTracker.moveStepUp.bind(TaskTracker);
window.moveStepDown = TaskTracker.moveStepDown.bind(TaskTracker);
window.toggleNotes = TaskTracker.toggleNotes.bind(TaskTracker);
window.updateNotes = TaskTracker.updateNotes.bind(TaskTracker);
window.togglePinned = TaskTracker.togglePinned.bind(TaskTracker);
window.startStepDrag = TaskTracker.startStepDrag.bind(TaskTracker);
window.dropStep = TaskTracker.dropStep.bind(TaskTracker);

window.createNote = VisualNotes.createNote.bind(VisualNotes);
window.saveBoard = VisualNotes.saveBoard.bind(VisualNotes);
window.saveProject = VisualNotes.saveProject.bind(VisualNotes);
window.updateProjectTitle = VisualNotes.updateProjectTitle.bind(VisualNotes);
window.deleteNote = VisualNotes.deleteNote.bind(VisualNotes);
window.toggleRemoveMode = VisualNotes.toggleRemoveMode.bind(VisualNotes);
window.toggleAddMode = VisualNotes.toggleAddMode.bind(VisualNotes);
window.toggleColorMode = VisualNotes.toggleColorMode.bind(VisualNotes);
window.applyColor = VisualNotes.applyColor.bind(VisualNotes);

window.addEventListener("DOMContentLoaded", () => {
    TaskTracker.init();
    VisualNotes.init();
    if (typeof ProjectsPage !== "undefined") {
        ProjectsPage.init();
    }
});
