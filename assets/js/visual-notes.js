const VisualNotes = {
    notes: JSON.parse(localStorage.getItem("visualNotes")) || [],
    connections: JSON.parse(localStorage.getItem("visualConnections")) || [],
    shapes: JSON.parse(localStorage.getItem("visualShapes")) || [],
    projectId: null,
    projectTitle: localStorage.getItem("visualTitle") ?? "Untitled Project",
    selectedNote: null,
    selectedNotes: [],
    selectedShapeId: null,
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
    coordinateVersion: 2,
    needsInitialCenter: false,
    canvasBounds: { left: -800, top: -500, right: 800, bottom: 500 },
    canvasPadding: 360,
    canvasResizeStep: 250,
    historyManager: new HistoryManager(30),
    historyTransaction: null,
    captureHistoryState() {
        return {
            notes: this.notes,
            connections: this.connections,
            shapes: this.shapes,
            projectTitle: this.projectTitle
        };
    },
    beginHistoryTransaction() {
        if (this.historyTransaction) return;
        this.historyTransaction = this.historyManager.clone(this.captureHistoryState());
    },
    commitHistoryTransaction() {
        if (!this.historyTransaction) return false;
        const before = this.historyTransaction;
        const after = this.captureHistoryState();
        this.historyTransaction = null;
        if (JSON.stringify(before) === JSON.stringify(after)) return false;
        this.historyManager.record(before);
        return true;
    },
    performHistoryChange(change) {
        const ownsTransaction = !this.historyTransaction;
        if (ownsTransaction) this.beginHistoryTransaction();
        change();
        if (ownsTransaction) this.commitHistoryTransaction();
    },
    restoreHistoryState(state) {
        this.notes = state.notes || [];
        this.connections = state.connections || [];
        this.shapes = state.shapes || [];
        this.projectTitle = typeof state.projectTitle === "string" ? state.projectTitle : "Untitled Project";
        this.selectedNote = null;
        this.selectedNotes = [];
        this.selectedShapeId = null;
        this.historyTransaction = null;

        const titleInput = document.getElementById("projectTitleInput");
        if (titleInput) titleInput.value = this.projectTitle;
        this.updateCanvasBounds();
        this.saveBoard();
        this.render();
        this.applyTransform();
    },
    undo() {
        this.commitHistoryTransaction();
        const state = this.historyManager.undo(this.captureHistoryState());
        if (!state) return false;
        this.restoreHistoryState(state);
        return true;
    },
    redo() {
        this.commitHistoryTransaction();
        const state = this.historyManager.redo(this.captureHistoryState());
        if (!state) return false;
        this.restoreHistoryState(state);
        return true;
    },
    getViewportBounds() {
        return CanvasUtils.getViewportBounds(
            this.panX,
            this.panY,
            this.zoom,
            window.innerWidth,
            window.innerHeight
        );
    },
    calculateCanvasBounds() {
        return CanvasUtils.calculateCanvasBounds(
            [...this.notes, ...this.shapes],
            this.getViewportBounds(),
            this.canvasPadding,
            this.canvasResizeStep
        );
    },
    updateCanvasBounds() {
        const next = this.calculateCanvasBounds();
        this.canvasBounds = next;
        const width = next.right - next.left;
        const height = next.bottom - next.top;
        const canvas = document.getElementById("canvas");
        const shapesLayer = document.getElementById("shapes");
        const svg = document.getElementById("connections");

        if (canvas) {
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            canvas.querySelectorAll(".note").forEach(element => {
                const note = this.notes.find(item => String(item.id) === element.dataset.noteId);
                if (!note) return;
                element.style.left = (note.x - next.left) + "px";
                element.style.top = (note.y - next.top) + "px";
            });
        }
        if (shapesLayer) {
            shapesLayer.style.width = width + "px";
            shapesLayer.style.height = height + "px";
            shapesLayer.querySelectorAll(".canvasShape").forEach(element => {
                if (element.classList.contains("shapeDraft")) return;
                const shape = this.shapes.find(item => String(item.id) === element.dataset.shapeId);
                if (!shape) return;
                element.style.left = (shape.x - next.left) + "px";
                element.style.top = (shape.y - next.top) + "px";
            });
        }
        if (svg) {
            svg.style.left = "0px";
            svg.style.top = "50px";
            svg.setAttribute("width", width);
            svg.setAttribute("height", height);
            svg.setAttribute("viewBox", `${next.left} ${next.top} ${width} ${height}`);
        }
    },
    centerCameraOnOrigin() {
        const view = CanvasUtils.centeredCamera(window.innerWidth, window.innerHeight);
        this.panX = view.panX;
        this.panY = view.panY;
    },
    establishFirstNoteOrigin(note) {
        const view = CanvasUtils.rebaseNotesAroundFirst(
            [note, ...this.shapes],
            { panX: this.panX, panY: this.panY, zoom: this.zoom },
            true,
            window.innerWidth,
            window.innerHeight
        );
        this.panX = view.panX;
        this.panY = view.panY;
    },
    migrateLegacyCoordinates(preserveView) {
        const view = CanvasUtils.rebaseNotesAroundFirst(
            this.notes,
            { panX: this.panX, panY: this.panY, zoom: this.zoom },
            preserveView,
            window.innerWidth,
            window.innerHeight
        );
        this.panX = view.panX;
        this.panY = view.panY;
    },
    isPointInsideCanvas(x, y) {
        const bounds = this.canvasBounds;
        return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    },
    saveBoard() {
        if (this.projectId) {
            const projects = ProjectManager.loadProjects();
            const projectIndex = projects.findIndex(p => String(p.id) === String(this.projectId));
            const projectData = {
                id: this.projectId,
                title: this.projectTitle,
                notes: this.notes,
                connections: this.connections,
                shapes: this.shapes,
                panX: this.panX,
                panY: this.panY,
                zoom: this.zoom,
                coordinateVersion: this.coordinateVersion,
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
            localStorage.setItem("visualShapes", JSON.stringify(this.shapes));
            localStorage.setItem("visualTitle", this.projectTitle);
            localStorage.setItem("visualCoordinateVersion", String(this.coordinateVersion));
            localStorage.setItem("visualPanX", String(this.panX));
            localStorage.setItem("visualPanY", String(this.panY));
            localStorage.setItem("visualZoom", String(this.zoom));
        }
    },
    saveProject() {
        if (!this.projectId) {
            const project = ProjectManager.createProject({
                title: this.projectTitle,
                notes: this.notes,
                connections: this.connections,
                shapes: this.shapes,
                panX: this.panX,
                panY: this.panY,
                zoom: this.zoom,
                coordinateVersion: this.coordinateVersion
            });
            this.projectId = project.id;
            history.replaceState(null, "", `visual-notes.html?projectId=${project.id}`);
        }

        this.saveBoard();
        alert("Project saved.");
    },
    createNote() {
        const { x, y } = this.getVisibleCenter();
        this.createNoteAt(x - 110, y - 70);
    },
    createNoteAt(x, y, options = {}) {
        let note = null;
        this.performHistoryChange(() => {
            const isFirstNote = this.notes.length === 0;
            note = {
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
            if (isFirstNote) {
                this.establishFirstNoteOrigin(note);
            }
            this.notes.push(note);
        });
        this.updateCanvasBounds();
        this.saveBoard();
        this.render();
        return note;
    },
    deleteNote(id) {
        if (!this.notes.some(note => note.id === id)) return;
        this.performHistoryChange(() => {
            this.notes = this.notes.filter(note => note.id !== id);
            this.connections = this.connections.filter(connection => connection.a !== id && connection.b !== id);
        });
        this.saveBoard();
        this.render();
    },
    updateText(id, value) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;
        if (note.text === value) return;
        this.beginHistoryTransaction();
        note.text = value;
        this.saveBoard();
    },
    updateProjectTitle(title) {
        if (this.projectTitle === title) return;
        this.beginHistoryTransaction();
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
            this.performHistoryChange(() => {
                note.imageSrc = imageUrl;
                note.type = 'image';
            });
            // Try to get aspect ratio via Image
            const img = new Image();
            img.onload = () => {
                this.performHistoryChange(() => {
                    note.aspectRatio = img.naturalHeight / img.naturalWidth;
                    note.width = Math.min(400, img.naturalWidth);
                    note.height = Math.max(80, Math.round(note.width * note.aspectRatio));
                });
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
                this.performHistoryChange(() => {
                    note.imageSrc = reader.result;
                    note.type = 'image';
                });
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
        let boardNeedsUpgrade = false;

        if (projectId) {
            project = ProjectManager.getProjectById(projectId);
        }

        if (project) {
            this.projectTitle = typeof project.title === "string" ? project.title : "Untitled Project";
            this.notes = project.notes || [];
            this.connections = project.connections || [];
            this.shapes = project.shapes || [];
            this.needsInitialCenter = typeof project.panX !== "number" || typeof project.panY !== "number";
            this.panX = typeof project.panX === "number" ? project.panX : 0;
            this.panY = typeof project.panY === "number" ? project.panY : 0;
            this.zoom = typeof project.zoom === "number" ? project.zoom : 1;
            if ((project.coordinateVersion || 1) < this.coordinateVersion && this.notes.length) {
                this.migrateLegacyCoordinates(true);
                boardNeedsUpgrade = true;
            } else if ((project.coordinateVersion || 1) < this.coordinateVersion && !this.notes.length) {
                this.needsInitialCenter = true;
                boardNeedsUpgrade = true;
            }
        } else if (!projectId) {
            const loadedNotes = JSON.parse(localStorage.getItem("visualNotes")) || [];
            const loadedConnections = JSON.parse(localStorage.getItem("visualConnections")) || [];
            const loadedShapes = JSON.parse(localStorage.getItem("visualShapes")) || [];
            this.notes = loadedNotes;
            this.connections = loadedConnections;
            this.shapes = loadedShapes;
            this.projectTitle = localStorage.getItem("visualTitle") ?? "Untitled Project";
            const storedCoordinateVersion = Number(localStorage.getItem("visualCoordinateVersion")) || 1;
            if (storedCoordinateVersion < this.coordinateVersion && this.notes.length) {
                this.migrateLegacyCoordinates(false);
                boardNeedsUpgrade = true;
            } else {
                const storedPanX = Number(localStorage.getItem("visualPanX"));
                const storedPanY = Number(localStorage.getItem("visualPanY"));
                const storedZoom = Number(localStorage.getItem("visualZoom"));
                const hasStoredView = Number.isFinite(storedPanX) && Number.isFinite(storedPanY) &&
                    localStorage.getItem("visualPanX") !== null && localStorage.getItem("visualPanY") !== null;
                if (hasStoredView) {
                    this.panX = storedPanX;
                    this.panY = storedPanY;
                    this.zoom = Number.isFinite(storedZoom) && storedZoom > 0 ? storedZoom : 1;
                } else {
                    this.needsInitialCenter = true;
                }
                boardNeedsUpgrade = storedCoordinateVersion < this.coordinateVersion;
            }
        } else {
            this.notes = [];
            this.connections = [];
            this.shapes = [];
            this.projectTitle = "Untitled Project";
            this.needsInitialCenter = true;
        }

        if (this.needsInitialCenter) {
            this.centerCameraOnOrigin();
            this.needsInitialCenter = false;
        }
        if (boardNeedsUpgrade) {
            this.saveBoard();
        }

        const titleInput = document.getElementById("projectTitleInput");
        if (titleInput) {
            titleInput.value = this.projectTitle;
        }
        this.render();
    },
    getVisibleCenter() {
        return this.screenToCanvas(
            window.innerWidth / 2,
            50 + (window.innerHeight - 50) / 2
        );
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
        if (note.title === value) return;
        this.performHistoryChange(() => {
            note.title = value;
        });
        this.saveBoard();
    },

    shapeMode: false,
    creatingShape: false,
    shapeDrawStart: null,
    shapeDrawRect: null,
    shapeDraftElement: null,
    movingShape: null,
    shapeMoveStart: null,
    shapeMoveOrigin: null,
    resizingShape: null,
    shapeResizeDirection: null,
    shapeResizeStart: null,
    shapeResizeOrigin: null,

    setShapeMode(enabled) {
        this.shapeMode = Boolean(enabled);
        const button = document.getElementById("shapesBtn");
        const shapesLayer = document.getElementById("shapes");

        if (this.shapeMode) {
            this.selectedNotes = [];
            document.body.classList.add("shapes-mode-active");
            if (button) {
                button.classList.add("active");
                button.textContent = "Shapes: ON";
                button.setAttribute("aria-pressed", "true");
            }
            if (shapesLayer) shapesLayer.setAttribute("aria-hidden", "false");
        } else {
            this.cancelShapeDraw();
            this.selectedShapeId = null;
            document.body.classList.remove("shapes-mode-active");
            if (button) {
                button.classList.remove("active");
                button.textContent = "Shapes Mode";
                button.setAttribute("aria-pressed", "false");
            }
            if (shapesLayer) shapesLayer.setAttribute("aria-hidden", "true");
        }

        this.render();
    },

    toggleShapesMode() {
        const shouldEnable = !this.shapeMode;
        if (shouldEnable) {
            if (this.removeMode) this.toggleRemoveMode();
            if (this.addMode) this.toggleAddMode();
            if (this.colorMode) this.toggleColorMode();
        }
        this.setShapeMode(shouldEnable);
    },

    startShapeDraw(event) {
        if (!this.shapeMode || this.creatingShape) return;
        const shapesLayer = document.getElementById("shapes");
        if (!shapesLayer) return;

        this.selectedShapeId = null;
        this.creatingShape = true;
        this.shapeDrawStart = this.screenToCanvas(event.clientX, event.clientY);
        this.shapeDrawRect = { ...this.shapeDrawStart, width: 0, height: 0 };
        this.shapeDraftElement = document.createElement("div");
        this.shapeDraftElement.className = "canvasShape shapeDraft";
        shapesLayer.appendChild(this.shapeDraftElement);
        this.updateShapeDraw(event);
        document.onmousemove = nextEvent => this.updateShapeDraw(nextEvent);
        document.onmouseup = nextEvent => this.endShapeDraw(nextEvent);
        event.preventDefault();
    },

    updateShapeDraw(event) {
        if (!this.creatingShape || !this.shapeDrawStart || !this.shapeDraftElement) return;
        const end = this.screenToCanvas(event.clientX, event.clientY);
        const rectangle = CanvasUtils.normalizeRectangle(this.shapeDrawStart, end);
        this.shapeDrawRect = rectangle;
        this.shapeDraftElement.style.left = (rectangle.x - this.canvasBounds.left) + "px";
        this.shapeDraftElement.style.top = (rectangle.y - this.canvasBounds.top) + "px";
        this.shapeDraftElement.style.width = rectangle.width + "px";
        this.shapeDraftElement.style.height = rectangle.height + "px";
    },

    endShapeDraw(event) {
        if (!this.creatingShape) return;
        if (event) this.updateShapeDraw(event);
        const rectangle = this.shapeDrawRect;
        this.cancelShapeDraw();
        document.onmousemove = null;
        document.onmouseup = null;

        if (!rectangle || rectangle.width < 12 || rectangle.height < 12) {
            this.renderShapes();
            return;
        }

        const shape = {
            id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            x: rectangle.x,
            y: rectangle.y,
            width: Math.max(160, rectangle.width),
            height: Math.max(100, rectangle.height),
            title: ""
        };
        this.performHistoryChange(() => this.shapes.push(shape));
        this.selectedShapeId = shape.id;
        this.updateCanvasBounds();
        this.saveBoard();
        this.render();
        this.applyTransform();
    },

    cancelShapeDraw() {
        if (this.shapeDraftElement) this.shapeDraftElement.remove();
        this.shapeDraftElement = null;
        this.shapeDrawStart = null;
        this.shapeDrawRect = null;
        this.creatingShape = false;
    },

    deleteShape(id) {
        if (!this.shapeMode || !this.shapes.some(shape => String(shape.id) === String(id))) return;
        this.performHistoryChange(() => {
            this.shapes = this.shapes.filter(shape => String(shape.id) !== String(id));
        });
        if (String(this.selectedShapeId) === String(id)) this.selectedShapeId = null;
        this.updateCanvasBounds();
        this.saveBoard();
        this.render();
        this.applyTransform();
    },

    startShapeMove(shape, event) {
        if (!this.shapeMode) return;
        this.beginHistoryTransaction();
        this.selectedShapeId = shape.id;
        this.movingShape = shape;
        this.shapeMoveStart = this.screenToCanvas(event.clientX, event.clientY);
        this.shapeMoveOrigin = { x: shape.x, y: shape.y };
        this.renderShapes();
        document.onmousemove = nextEvent => this.moveShape(nextEvent);
        document.onmouseup = () => this.stopShapeMove();
    },

    moveShape(event) {
        if (!this.movingShape || !this.shapeMoveStart || !this.shapeMoveOrigin) return;
        const current = this.screenToCanvas(event.clientX, event.clientY);
        this.movingShape.x = this.shapeMoveOrigin.x + current.x - this.shapeMoveStart.x;
        this.movingShape.y = this.shapeMoveOrigin.y + current.y - this.shapeMoveStart.y;
        this.updateCanvasBounds();
        this.renderShapes();
        this.applyTransform();
    },

    stopShapeMove() {
        if (this.movingShape) {
            this.commitHistoryTransaction();
            this.saveBoard();
        }
        this.movingShape = null;
        this.shapeMoveStart = null;
        this.shapeMoveOrigin = null;
        document.onmousemove = null;
        document.onmouseup = null;
    },

    startShapeResize(shape, direction, event) {
        if (!this.shapeMode) return;
        this.beginHistoryTransaction();
        this.selectedShapeId = shape.id;
        this.resizingShape = shape;
        this.shapeResizeDirection = direction;
        this.shapeResizeStart = this.screenToCanvas(event.clientX, event.clientY);
        this.shapeResizeOrigin = {
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height
        };
        document.onmousemove = nextEvent => this.resizeShape(nextEvent);
        document.onmouseup = () => this.stopShapeResize();
        event.preventDefault();
    },

    resizeShape(event) {
        if (!this.resizingShape || !this.shapeResizeStart || !this.shapeResizeOrigin) return;
        const current = this.screenToCanvas(event.clientX, event.clientY);
        const resized = CanvasUtils.resizeRectangle(
            this.shapeResizeOrigin,
            this.shapeResizeDirection,
            current.x - this.shapeResizeStart.x,
            current.y - this.shapeResizeStart.y
        );
        Object.assign(this.resizingShape, resized);
        this.updateCanvasBounds();
        this.renderShapes();
        this.applyTransform();
    },

    stopShapeResize() {
        if (this.resizingShape) {
            this.commitHistoryTransaction();
            this.saveBoard();
        }
        this.resizingShape = null;
        this.shapeResizeDirection = null;
        this.shapeResizeStart = null;
        this.shapeResizeOrigin = null;
        document.onmousemove = null;
        document.onmouseup = null;
    },

    startShapeTitleEdit(shape, titleElement) {
        if (!this.shapeMode) return;
        this.beginHistoryTransaction();
        const originalTitle = shape.title || "";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "shapeTitleInput";
        input.value = originalTitle;
        input.placeholder = "Group title";
        input.addEventListener("mousedown", event => event.stopPropagation());
        input.addEventListener("click", event => event.stopPropagation());
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                input.blur();
            } else if (event.key === "Escape") {
                event.preventDefault();
                input.value = originalTitle;
                input.blur();
            }
        });
        input.addEventListener("blur", () => {
            shape.title = input.value.trim();
            this.commitHistoryTransaction();
            this.saveBoard();
            this.renderShapes();
        });
        titleElement.replaceWith(input);
        input.focus();
        input.select();
    },

    renderShapes() {
        const shapesLayer = document.getElementById("shapes");
        if (!shapesLayer) return;
        shapesLayer.querySelectorAll(".canvasShape:not(.shapeDraft)").forEach(element => element.remove());

        this.shapes.forEach(shape => {
            const element = document.createElement("div");
            element.className = "canvasShape";
            element.dataset.shapeId = shape.id;
            if (String(this.selectedShapeId) === String(shape.id)) element.classList.add("selected");
            element.style.left = (shape.x - this.canvasBounds.left) + "px";
            element.style.top = (shape.y - this.canvasBounds.top) + "px";
            element.style.width = shape.width + "px";
            element.style.height = shape.height + "px";
            element.innerHTML = `
                <span class="shapeTitle" data-placeholder="Add title">${this.escapeHtml(shape.title || "")}</span>
                <button type="button" class="shapeDeleteButton" aria-label="Delete shape" title="Delete shape">&times;</button>
                ${["n", "ne", "e", "se", "s", "sw", "w", "nw"]
                    .map(direction => `<span class="shapeResizeHandle ${direction}" data-direction="${direction}"></span>`)
                    .join("")}
            `;

            const title = element.querySelector(".shapeTitle");
            if (title) {
                title.addEventListener("mousedown", event => event.stopPropagation());
                title.addEventListener("click", event => {
                    event.stopPropagation();
                    this.startShapeTitleEdit(shape, title);
                });
            }

            const deleteButton = element.querySelector(".shapeDeleteButton");
            if (deleteButton) {
                deleteButton.addEventListener("mousedown", event => event.stopPropagation());
                deleteButton.addEventListener("click", event => {
                    event.stopPropagation();
                    this.deleteShape(shape.id);
                });
            }

            element.querySelectorAll(".shapeResizeHandle").forEach(handle => {
                handle.addEventListener("mousedown", event => {
                    event.stopPropagation();
                    this.startShapeResize(shape, handle.dataset.direction, event);
                });
            });

            element.addEventListener("mousedown", event => {
                if (!this.shapeMode || event.button !== 0) return;
                if (event.target.closest(".shapeTitle,.shapeTitleInput,.shapeDeleteButton,.shapeResizeHandle")) return;
                event.stopPropagation();
                event.preventDefault();
                this.startShapeMove(shape, event);
            });
            shapesLayer.appendChild(element);
        });
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
        sizer.textContent = title || 'Add title';
        return sizer.offsetWidth;
    },

    getMinNoteWidth(note) {
        const titleWidth = this.getTitleWidth(note.title || 'Add title');
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
        this.beginHistoryTransaction();
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
            note.title = input.value.trim();
            note.width = Math.max(note.width || 220, this.getMinNoteWidth(note));
            this.commitHistoryTransaction();
            this.saveBoard();
            this.render();
        });
        titleElement.replaceWith(input);
        input.focus();
        input.select();
    },
    deleteSelectedNotes() {
        if (!this.selectedNotes.length) return;
        const deletedIds = new Set(this.selectedNotes);
        this.performHistoryChange(() => {
            this.notes = this.notes.filter(note => !deletedIds.has(note.id));
            this.connections = this.connections.filter(connection =>
                !deletedIds.has(connection.a) && !deletedIds.has(connection.b)
            );
        });
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
        this.performHistoryChange(() => {
            this.connections.push({ a, b });
        });
        this.saveBoard();
        this.drawConnections();
    },
    removeConnection(a, b) {
        const exists = this.connections.some(
            connection =>
                (connection.a === a && connection.b === b) ||
                (connection.a === b && connection.b === a)
        );
        if (!exists) return;
        this.performHistoryChange(() => {
            this.connections = this.connections.filter(
                c => !(
                    (c.a === a && c.b === b) ||
                    (c.a === b && c.b === a)
                )
            );
        });
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
        if (this.removeMode && this.shapeMode) this.setShapeMode(false);
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
        if (this.addMode && this.shapeMode) this.setShapeMode(false);
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
        if (this.colorMode && this.shapeMode) this.setShapeMode(false);
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
        const changedNotes = this.notes.filter(note =>
            this.selectedNotes.includes(note.id) && note.color !== color
        );
        if (!changedNotes.length) return;
        this.performHistoryChange(() => {
            changedNotes.forEach(note => {
                note.color = color;
            });
        });
        this.saveBoard();
        this.render();
    },
    
    drawConnections() {
        const svg = document.getElementById("connections");
        if (!svg) return;
        this.clearRemoveDrag();
        this.updateCanvasBounds();
        this.applyTransform();
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
            this.beginHistoryTransaction();
            for (let i = 1; i < ids.length; i++) {
                this.connectNotes(base, ids[i]);
            }
            this.commitHistoryTransaction();
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
            this.performHistoryChange(() => {
                this.connections = this.connections.filter(c => {
                    const key = `${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`;
                    return !this.removeDragCrossed.includes(key);
                });
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
        return CanvasUtils.screenToCanvas(
            clientX,
            clientY,
            this.panX,
            this.panY,
            this.zoom
        );
    },
    lineIntersects(a, b, c) {
        return CanvasUtils.lineIntersects(a, b, c);
    },
    stopMove() {
        if (this.selectedNote) {
            this.commitHistoryTransaction();
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
    startResize(note, e, direction = "se") {
        if (e.button !== 0 || this.shapeMode || this.addMode || this.removeMode || this.colorMode) return;
        e.preventDefault();
        // Finish editing before starting a separate, single-step resize transaction.
        if (document.activeElement && document.activeElement.matches("input,textarea")) {
            document.activeElement.blur();
        }
        this.commitHistoryTransaction();
        this.beginHistoryTransaction();
        this.resizingNote = note;
        this.resizeDirection = direction;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeStartRect = { x: note.x, y: note.y, width: note.width || 220, height: note.height || 140 };
        this.previousBodyUserSelect = document.body.style.userSelect;
        this.previousBodyWebkitUserSelect = document.body.style.webkitUserSelect;
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.onselectstart = () => false;
        document.onmousemove = e2 => this.doResize(e2);
        document.onmouseup = () => this.stopResize();
        this.render();
    },
    doResize(e) {
        if (!this.resizingNote) return;
        const deltaX = (e.clientX - this.resizeStartX) / this.zoom;
        const deltaY = (e.clientY - this.resizeStartY) / this.zoom;
        const note = this.resizingNote;
        const minWidth = this.getMinNoteWidth(note);
        let rectangle;
        if (note.type === 'image' && Number.isFinite(note.aspectRatio) && note.aspectRatio > 0) {
            rectangle = CanvasUtils.resizeRectangleProportionally(
                this.resizeStartRect, this.resizeDirection, deltaX, deltaY, note.aspectRatio, minWidth, 140
            );
        } else {
            const proposed = CanvasUtils.resizeRectangle(
                this.resizeStartRect, this.resizeDirection, deltaX, deltaY, minWidth, 140
            );
            const minHeight = Math.max(140, this.getMinNoteHeight({ ...note, width: proposed.width }));
            rectangle = CanvasUtils.resizeRectangle(
                this.resizeStartRect, this.resizeDirection, deltaX, deltaY, minWidth, minHeight
            );
            // A narrower text note may need additional height even on a side-only resize.
            rectangle.height = Math.max(rectangle.height, minHeight);
        }
        Object.assign(note, rectangle);
        this.render();
    },
    stopResize() {
        if (this.resizingNote) {
            this.commitHistoryTransaction();
            this.saveBoard();
        }
        document.body.style.userSelect = this.previousBodyUserSelect || '';
        document.body.style.webkitUserSelect = this.previousBodyWebkitUserSelect || '';
        document.onselectstart = null;
        this.resizingNote = null;
        this.resizeStartRect = null;
        this.resizeDirection = null;
        document.onmousemove = null;
        document.onmouseup = null;
        this.render();
    },
    render() {
        const canvas = document.getElementById("canvas");
        if (!canvas) return;
        const notes = this.notes;
        const self = this;
        notes.forEach(note => {
            const minWidth = self.getMinNoteWidth(note);
            if ((note.width || 220) < minWidth) {
                note.width = minWidth;
            }
            const minHeight = note.type === 'image' ? note.height || 140 : self.getMinNoteHeight(note);
            if ((note.height || 140) < minHeight) {
                note.height = minHeight;
            }
        });
        this.updateCanvasBounds();
        this.renderShapes();
        
        // Remove and rebuild the interactive note layer.
        const allNotes = canvas.querySelectorAll(".note");
        allNotes.forEach(note => note.remove());

        notes.forEach(note => {
            const div = document.createElement("div");
            div.className = "note";
            div.dataset.noteId = note.id;
            if (this.resizingNote && this.resizingNote.id === note.id) div.classList.add("resizing");
            if (this.selectedNotes.includes(note.id)) {
                div.classList.add("selected");
            }
            div.style.left = (note.x - this.canvasBounds.left) + "px";
            div.style.top = (note.y - this.canvasBounds.top) + "px";
            div.style.width = (note.width || 220) + "px";
            div.style.height = (note.height || 140) + "px";
            // apply custom background color if present
            div.style.setProperty('--note-bg', note.color || '#333');
            if (note.type === 'image') {
                div.innerHTML = `
        <div class="noteHeader">
            <span class="noteTitle" data-placeholder="Add title">${this.escapeHtml(note.title)}</span>
        </div>
        ${note.imageSrc ? `<div class="noteImage"><img src="${this.escapeHtml(note.imageSrc)}" alt="Note image">` +
            `</img></div>` : ""}
        `;
            } else {
                div.innerHTML = `
        <div class="noteHeader">
            <span class="noteTitle" data-placeholder="Add title">${this.escapeHtml(note.title)}</span>
        </div>
        ${note.imageSrc ? `<div class="noteImage"><img src="${this.escapeHtml(note.imageSrc)}" alt="Note image"></div>` : ""}
        <textarea>${this.escapeHtml(note.text)}</textarea>
        `;
            }

            const titleElement = div.querySelector(".noteTitle");
            if (titleElement) {
                titleElement.addEventListener('click', e => {
                    e.stopPropagation();
                    if (self.shapeMode) return;
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
                    if (e.button === 0) e.stopPropagation();
                };
                textarea.onfocus = e => {
                    e.stopPropagation();
                    self.beginHistoryTransaction();
                };
                textarea.onblur = () => {
                    self.commitHistoryTransaction();
                    self.saveBoard();
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
                if (e.button !== 0) return;
                if (self.shapeMode) return;
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
                self.beginHistoryTransaction();
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
            
            const resizeBorder = document.createElement("div");
            resizeBorder.className = "noteResizeBorder";
            resizeBorder.setAttribute("aria-hidden", "true");
            ["n", "ne", "e", "se", "s", "sw", "w", "nw"].forEach(direction => {
                const resizeHandle = document.createElement("span");
                resizeHandle.className = `resizeHandle ${direction}`;
                resizeHandle.dataset.direction = direction;
                resizeHandle.onmousedown = e => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    self.startResize(note, e, direction);
                };
                resizeBorder.appendChild(resizeHandle);
            });
            div.appendChild(resizeBorder);

            canvas.appendChild(div);
        });

        this.drawConnections();
    },
    applyTransform() {
        const canvas = document.getElementById("canvas");
        const shapesLayer = document.getElementById("shapes");
        const grid = document.getElementById("grid");
        const svg = document.getElementById("connections");
        const bounds = this.canvasBounds;
        const transform = `translate(${this.panX + bounds.left * this.zoom}px, ${this.panY + bounds.top * this.zoom}px) scale(${this.zoom})`;
        if (canvas) {
            canvas.style.transform = transform;
            canvas.style.transformOrigin = "0 0";
        }
        if (shapesLayer) {
            shapesLayer.style.transform = transform;
            shapesLayer.style.transformOrigin = "0 0";
        }
        if (grid) {
            // Paint only the viewport in screen pixels, independent of canvas bounds.
            // CSS sizes the dots in em; only spacing and camera alignment use pixels.
            const spacing = 45 * this.zoom;
            grid.style.backgroundSize = `${spacing}px ${spacing}px`;
            grid.style.backgroundPosition = `${this.panX % spacing}px ${this.panY % spacing}px`;
            grid.style.setProperty("--grid-zoom", String(this.zoom));
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
        this.updateCanvasBounds();
        this.applyTransform();
    },
    stopPan() {
        this.panning = false;
        document.onmousemove = null;
        document.onmouseup = null;
        this.updateCanvasBounds();
        this.applyTransform();
        this.saveBoard();
    },
    handleZoom(event) {
        event.preventDefault();
        const zoomSpeed = 0.1;
        const delta = event.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newZoom = Math.max(0.2, Math.min(10, this.zoom + delta));
        if (newZoom === this.zoom) return;
        
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = (window.innerHeight - 50) / 2;
        const worldX = (viewportCenterX - this.panX) / this.zoom;
        const worldY = (viewportCenterY - this.panY) / this.zoom;
        
        this.panX = viewportCenterX - worldX * newZoom;
        this.panY = viewportCenterY - worldY * newZoom;
        this.zoom = newZoom;
        this.updateCanvasBounds();
        this.applyTransform();
    },
    init() {
        if (document.getElementById("canvas")) {
            this.loadBoard();
            this.historyManager.clear();
            this.historyTransaction = null;
            const canvas = document.getElementById("canvas");
            const self = this;

            const projectTitleInput = document.getElementById("projectTitleInput");
            if (projectTitleInput) {
                projectTitleInput.addEventListener("focus", () => self.beginHistoryTransaction());
                projectTitleInput.addEventListener("blur", () => {
                    self.commitHistoryTransaction();
                    self.saveBoard();
                });
            }
            
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
            
            // Canvas background click for drag-select - check coordinates against note positions
            document.addEventListener("mousedown", e => {
                if (e.button !== 0) return; // Only left click
                const ignoreElement = self.isIgnoreElement(e.target);
                if (ignoreElement) return;
                if (self.shapeMode) {
                    self.startShapeDraw(e);
                    return;
                }
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

                // The adaptive bounds always cover the camera and all notes.
                if (!self.isPointInsideCanvas(unzoomedX, unzoomedY)) {
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
                const historyShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z";
                if (historyShortcut) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.target && e.target.classList &&
                        (e.target.classList.contains("noteTitleInput") || e.target.classList.contains("shapeTitleInput"))) {
                        e.target.blur();
                    }
                    if (e.shiftKey) {
                        self.redo();
                    } else {
                        self.undo();
                    }
                    return;
                }

                const activeTag = document.activeElement && document.activeElement.tagName;
                const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement.isContentEditable;
                if (typing) return;

                if (e.key === "Delete" && self.shapeMode && self.selectedShapeId &&
                    !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    self.deleteShape(self.selectedShapeId);
                    return;
                }
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
                    if (e.key.toLowerCase() === 's' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                        e.preventDefault();
                        self.toggleShapesMode();
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
                    const ignoreElement = e.target.closest("#toolbar,.colorPanel");
                    if (ignoreElement) return;
                    // Right-click always starts panning (add-mode uses left-click like remove-mode)
                    self.startPan(e);
                }
            });

            window.addEventListener("beforeunload", () => {
                self.commitHistoryTransaction();
                self.saveBoard();
            });
            window.addEventListener("pagehide", () => {
                self.commitHistoryTransaction();
                self.saveBoard();
            });
            window.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden") {
                    self.saveBoard();
                }
            });
            window.addEventListener("resize", () => {
                self.updateCanvasBounds();
                self.render();
                self.applyTransform();
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

window.VisualNotes = VisualNotes;
