const VisualNotes = {
    notes: JSON.parse(localStorage.getItem("visualNotes")) || [],
    connections: JSON.parse(localStorage.getItem("visualConnections")) || [],
    shapes: JSON.parse(localStorage.getItem("visualShapes")) || [],
    drawings: [],
    drawingsVisible: true,
    projectId: null,
    suspendPersistence: false,
    projectTitle: localStorage.getItem("visualTitle") ?? "Untitled Project",
    selectedNote: null,
    selectedNotes: [],
    resizeDirections: ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
    expandedNoteIds: new Set(),
    selectedShapeId: null,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    snappingEnabled: true,
    panX: 0,
    panY: 0,
    panning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
    navigationDrag: null,
    zoomAnimationFrame: null,
    zoomAnimationTarget: null,
    zoomAnimationDuration: 180,
    selectingBox: false,
    selectBoxMoved: false,
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
    keyboardMoving: false,
    connectionElements: [],
    captureHistoryState() {
        return {
            notes: this.notes,
            connections: this.connections,
            shapes: this.shapes,
            drawings: this.drawings,
            projectTitle: this.projectTitle
        };
    },
    beginHistoryTransaction() {
        if (this.historyTransaction) return;
        this.historyTransaction = this.historyManager.clone(this.captureHistoryState());
    },
    commitHistoryTransaction() {
        this.keyboardMoving = false;
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
        this.drawings = state.drawings || [];
        this.projectTitle = typeof state.projectTitle === "string" ? state.projectTitle : "Untitled Project";
        this.selectedNote = null;
        this.selectedNotes = [];
        this.expandedNoteIds.clear();
        this.selectedShapeId = null;
        this.historyTransaction = null;
        this.normalizeTitleOnlyNotes();

        const titleInput = document.getElementById("projectTitleInput");
        if (titleInput) titleInput.value = this.projectTitle;
        this.saveBoard();
        this.render();
        this.applyTransform();
    },
    undo() {
        window.DrawingLayer?.finish();
        this.commitHistoryTransaction();
        const state = this.historyManager.undo(this.captureHistoryState());
        if (!state) return false;
        this.restoreHistoryState(state);
        return true;
    },
    redo() {
        window.DrawingLayer?.finish();
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
    syncLayerGeometry(layer, selector, items, dataKey) {
        if (!layer) return;
        const itemsById = new Map(items.map(item => [String(item.id), item]));
        layer.querySelectorAll(selector).forEach(element => {
            if (element.classList.contains("shapeDraft")) return;
            const item = itemsById.get(element.dataset[dataKey]);
            if (!item) return;
            element.style.left = `${item.x - this.canvasBounds.left}px`;
            element.style.top = `${item.y - this.canvasBounds.top}px`;
            if (Number.isFinite(item.width)) element.style.width = `${item.width}px`;
            if (Number.isFinite(item.height)) element.style.height = `${item.height}px`;
            if (element.classList.contains("note")) {
                element.style.setProperty("--node-width", `${item.width || CanvasUtils.defaultNoteWidth}px`);
                element.style.setProperty("--node-height", `${item.height || CanvasUtils.defaultNoteHeight}px`);
            }
        });
    },
    setDragHandlers(move, stop) {
        document.onmousemove = move;
        document.onmouseup = stop;
    },
    clearDragHandlers() {
        document.onmousemove = null;
        document.onmouseup = null;
    },
    setTextSelectionLocked(locked) {
        if (locked) {
            this.previousBodyUserSelect = document.body.style.userSelect;
            this.previousBodyWebkitUserSelect = document.body.style.webkitUserSelect;
            document.body.style.userSelect = "none";
            document.body.style.webkitUserSelect = "none";
            document.onselectstart = () => false;
            return;
        }
        document.body.style.userSelect = this.previousBodyUserSelect || "";
        document.body.style.webkitUserSelect = this.previousBodyWebkitUserSelect || "";
        document.onselectstart = null;
    },
    updateCanvasBounds(syncItems = true) {
        const next = this.calculateCanvasBounds();
        const originChanged = next.left !== this.canvasBounds.left || next.top !== this.canvasBounds.top;
        this.canvasBounds = next;
        const width = next.right - next.left;
        const height = next.bottom - next.top;
        const canvas = document.getElementById("canvas");
        const shapesLayer = document.getElementById("shapes");
        const svg = document.getElementById("connections");

        if (canvas) {
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            if (syncItems || originChanged) this.syncLayerGeometry(canvas, ".note", this.notes, "noteId");
        }
        if (shapesLayer) {
            shapesLayer.style.width = width + "px";
            shapesLayer.style.height = height + "px";
            if (syncItems || originChanged) this.syncLayerGeometry(shapesLayer, ".canvasShape", this.shapes, "shapeId");
        }
        if (svg) {
            svg.style.left = "0px";
            svg.style.top = `${CanvasUtils.toolbarHeight}px`;
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
    centerCameraOnNotes(notes = this.notes) {
        this.finishZoomAnimation();
        const view = CanvasUtils.cameraCenteredOnNotes(
            notes,
            this.zoom,
            window.innerWidth,
            window.innerHeight
        );
        this.panX = view.panX;
        this.panY = view.panY;
        this.updateCanvasBounds();
        this.applyTransform();
        this.saveBoard();
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
        if (this.suspendPersistence) return;
        const status = document.getElementById("workspaceSaveLabel");
        if (status) {
            status.textContent = "Saving…";
            status.parentElement.dataset.saved = "false";
        }
        if (this.projectId) {
            const projects = ProjectManager.loadProjects();
            const projectIndex = projects.findIndex(p => String(p.id) === String(this.projectId));
            const projectData = {
                id: this.projectId,
                title: this.projectTitle,
                notes: this.notes,
                connections: this.connections,
                shapes: this.shapes,
                drawings: this.drawings,
                drawingsVisible: this.drawingsVisible,
                panX: this.panX,
                panY: this.panY,
                zoom: this.zoom,
                snappingEnabled: this.snappingEnabled,
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
            localStorage.setItem("visualDrawings", JSON.stringify(this.drawings));
            localStorage.setItem("visualDrawingsVisible", String(this.drawingsVisible));
            localStorage.setItem("visualTitle", this.projectTitle);
            localStorage.setItem("visualCoordinateVersion", String(this.coordinateVersion));
            localStorage.setItem("visualPanX", String(this.panX));
            localStorage.setItem("visualPanY", String(this.panY));
            localStorage.setItem("visualZoom", String(this.zoom));
            localStorage.setItem("visualSnappingEnabled", String(this.snappingEnabled));
            if (window.LocalBackupManager) window.LocalBackupManager.notifyChange();
        }
        if (status) {
            status.textContent = "Saved on this device";
            status.parentElement.dataset.saved = "true";
        }
    },
    async exportBoardImage() {
        window.DrawingLayer?.finish();
        const button = document.getElementById("exportImageBtn");
        const originalLabel = button ? button.textContent : "Export PNG";
        if (!window.BoardImageExporter) {
            alert("Image export is unavailable.");
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Exporting…";
        }
        try {
            await window.BoardImageExporter.download({
                title: this.projectTitle,
                notes: this.notes,
                connections: this.connections,
                shapes: this.shapes,
                drawings: this.drawings,
                drawingsVisible: this.drawingsVisible
            });
            if (button) button.textContent = "Saved!";
        } catch (error) {
            console.error("Board image export failed", error);
            alert(error.message || "The board image could not be created.");
        } finally {
            setTimeout(() => {
                if (!button) return;
                button.disabled = false;
                button.textContent = originalLabel;
            }, 900);
        }
    },
    createNote() {
        window.DrawingLayer?.setTool(null);
        const { x, y } = this.getVisibleCenter();
        this.createNoteAt(
            x - CanvasUtils.defaultNoteWidth / 2,
            y - CanvasUtils.titleOnlyNoteHeight / 2
        );
    },
    createNoteAt(x, y, options = {}) {
        let note = null;
        this.performHistoryChange(() => {
            const isFirstNote = this.notes.length === 0;
            const position = this.snappingEnabled ? CanvasUtils.snapPoint({ x, y }) : { x, y };
            const noteType = options.type || (options.imageSrc ? 'image' : 'text');
            const noteText = options.text || "";
            const defaultHeight = noteType === 'image' || String(noteText).trim()
                ? CanvasUtils.defaultNoteHeight
                : CanvasUtils.titleOnlyNoteHeight;
            note = {
                id: Date.now(),
                x: position.x,
                y: position.y,
                width: typeof options.width === 'number' ? options.width : CanvasUtils.defaultNoteWidth,
                height: typeof options.height === 'number' ? options.height : defaultHeight,
                title: typeof options.title === "string" ? options.title : "New node",
                text: noteText,
                imageSrc: options.imageSrc || null,
                type: noteType,
                aspectRatio: typeof options.aspectRatio === 'number' ? options.aspectRatio : null,
                color: options.color || null
            };
            if (isFirstNote) {
                this.establishFirstNoteOrigin(note);
                if (this.snappingEnabled) {
                    const snappedPosition = CanvasUtils.snapPoint(note);
                    note.x = snappedPosition.x;
                    note.y = snappedPosition.y;
                }
            }
            this.notes.push(note);
        });
        this.updateCanvasBounds();
        this.saveBoard();
        this.render();
        return note;
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
    hasNoteContent(note) {
        return Boolean(note && (String(note.text || "").trim() || note.imageSrc));
    },
    normalizeTitleOnlyNotes() {
        let changed = false;
        this.notes.forEach(note => {
            if (note.type === 'image' || this.hasNoteContent(note)) return;
            if (note.text) {
                note.text = "";
                changed = true;
            }
            if (note.height !== CanvasUtils.titleOnlyNoteHeight) {
                note.height = CanvasUtils.titleOnlyNoteHeight;
                changed = true;
            }
        });
        return changed;
    },
    openNoteContent(note) {
        if (!note || note.type === 'image' || this.hasNoteContent(note)) return;
        this.beginHistoryTransaction();
        note.height = Math.max(CanvasUtils.defaultNoteHeight, note.height || 0);
        this.expandedNoteIds.add(note.id);
        this.render();
        setTimeout(() => {
            const textarea = document.querySelector(`.note[data-note-id="${note.id}"] textarea`);
            if (textarea) textarea.focus();
        }, 0);
    },
    moveNote(event) {
        if (!this.selectedNote) return;
        const pointer = this.screenToCanvas(event.clientX, event.clientY);
        const requestedPosition = {
            x: pointer.x - this.offsetX,
            y: pointer.y - this.offsetY
        };
        const nextPosition = this.snappingEnabled
            ? CanvasUtils.snapPoint(requestedPosition)
            : requestedPosition;
        const deltaX = nextPosition.x - this.selectedNote.x;
        const deltaY = nextPosition.y - this.selectedNote.y;
        if (deltaX === 0 && deltaY === 0) return;

        const notesById = new Map(this.notes.map(note => [note.id, note]));
        this.selectedNotes.forEach(noteId => {
            const note = notesById.get(noteId);
            if (!note) return;
            note.x += deltaX;
            note.y += deltaY;
        });

        this.updateCanvasBounds();
        this.applyTransform();
        this.updateMovedConnections(this.selectedNotes);
    },
    moveSelectionWithArrow(event) {
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[event.key];
        if (!direction || event.ctrlKey || event.metaKey || event.altKey || document.onmousemove ||
            this.addMode || this.removeMode || window.DrawingLayer?.tool) return false;
        const selectedIds = new Set(this.selectedNotes);
        const items = this.shapeMode
            ? this.shapes.filter(shape => String(shape.id) === String(this.selectedShapeId))
            : this.notes.filter(note => selectedIds.has(note.id));
        if (!items.length) return false;
        const axis = direction[0] ? "x" : "y";
        const sign = direction[0] || direction[1];
        const steps = event.shiftKey ? 10 : 1;
        const anchor = items[0][axis];
        const spacing = CanvasUtils.gridSpacing;
        const delta = this.snappingEnabled
            ? ((sign > 0 ? Math.floor(anchor / spacing) : Math.ceil(anchor / spacing)) + sign * steps) * spacing - anchor
            : sign * steps;
        if (!this.keyboardMoving) {
            this.commitHistoryTransaction();
            this.beginHistoryTransaction();
            this.keyboardMoving = true;
        }
        items.forEach(item => { item[axis] += delta; });
        this.updateCanvasBounds();
        this.applyTransform();
        if (!this.shapeMode) this.updateMovedConnections(this.selectedNotes);
        return true;
    },
    finishKeyboardMove() {
        if (!this.keyboardMoving) return;
        this.commitHistoryTransaction();
        this.saveBoard();
    },
    loadBoard() {
        window.DrawingLayer?.setTool(null);
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
            this.drawings = DrawingLayer.normalize(project.drawings);
            this.drawingsVisible = project.drawingsVisible !== false;
            this.needsInitialCenter = typeof project.panX !== "number" || typeof project.panY !== "number";
            this.panX = typeof project.panX === "number" ? project.panX : 0;
            this.panY = typeof project.panY === "number" ? project.panY : 0;
            this.zoom = CanvasUtils.clampZoom(project.zoom);
            this.snappingEnabled = project.snappingEnabled !== false;
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
            this.drawings = DrawingLayer.normalize(JSON.parse(localStorage.getItem("visualDrawings") || "[]"));
            this.drawingsVisible = localStorage.getItem("visualDrawingsVisible") !== "false";
            this.projectTitle = localStorage.getItem("visualTitle") ?? "Untitled Project";
            this.snappingEnabled = localStorage.getItem("visualSnappingEnabled") !== "false";
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
                    this.zoom = CanvasUtils.clampZoom(storedZoom);
                } else {
                    this.needsInitialCenter = true;
                }
                boardNeedsUpgrade = storedCoordinateVersion < this.coordinateVersion;
            }
        } else {
            this.notes = [];
            this.connections = [];
            this.shapes = [];
            this.drawings = [];
            this.drawingsVisible = true;
            this.projectTitle = "Untitled Project";
            this.snappingEnabled = true;
            this.needsInitialCenter = true;
        }

        if (this.normalizeTitleOnlyNotes()) {
            boardNeedsUpgrade = true;
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
        this.updateSnappingButton();
        this.render();
        window.DrawingLayer?.updateControls();
    },
    updateToggleButton(id, active, activeLabel, inactiveLabel) {
        const button = document.getElementById(id);
        if (!button) return;
        button.classList.toggle("active", active);
        button.textContent = active ? activeLabel : inactiveLabel;
        button.setAttribute("aria-pressed", String(active));
        window.WorkspaceUI?.update();
    },
    updateSnappingButton() {
        this.updateToggleButton("snapBtn", this.snappingEnabled, "Snap: ON", "Snap: OFF");
    },
    toggleSnappingMode() {
        this.snappingEnabled = !this.snappingEnabled;
        this.updateSnappingButton();
        this.saveBoard();
    },
    getVisibleCenter() {
        return this.screenToCanvas(
            window.innerWidth / 2,
            CanvasUtils.toolbarHeight + (window.innerHeight - CanvasUtils.toolbarHeight) / 2
        );
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
        if (enabled) window.DrawingLayer?.setTool(null);
        this.shapeMode = Boolean(enabled);
        const shapesLayer = document.getElementById("shapes");

        if (this.shapeMode) {
            this.selectedNotes = [];
        } else {
            this.cancelShapeDraw();
            this.selectedShapeId = null;
        }
        document.body.classList.toggle("shapes-mode-active", this.shapeMode);
        this.updateToggleButton("shapesBtn", this.shapeMode, "Shapes: ON", "Shapes Mode");
        if (shapesLayer) shapesLayer.setAttribute("aria-hidden", String(!this.shapeMode));
        this.render();
    },

    toggleShapesMode() {
        const shouldEnable = !this.shapeMode;
        if (shouldEnable) {
            if (this.removeMode) this.toggleRemoveMode();
            if (this.addMode) this.toggleAddMode();
        }
        this.setShapeMode(shouldEnable);
    },

    startShapeDraw(event) {
        if (!this.shapeMode || this.colorMode || this.creatingShape) return;
        const shapesLayer = document.getElementById("shapes");
        if (!shapesLayer) return;

        this.selectedShapeId = null;
        this.creatingShape = true;
        const start = this.screenToCanvas(event.clientX, event.clientY);
        this.shapeDrawStart = this.snappingEnabled ? CanvasUtils.snapPoint(start) : start;
        this.shapeDrawRect = { ...this.shapeDrawStart, width: 0, height: 0 };
        this.shapeDraftElement = document.createElement("div");
        this.shapeDraftElement.className = "canvasShape shapeDraft";
        shapesLayer.appendChild(this.shapeDraftElement);
        this.updateShapeDraw(event);
        this.setDragHandlers(
            nextEvent => this.updateShapeDraw(nextEvent),
            nextEvent => this.endShapeDraw(nextEvent)
        );
        event.preventDefault();
    },

    updateShapeDraw(event) {
        if (!this.creatingShape || !this.shapeDrawStart || !this.shapeDraftElement) return;
        const pointer = this.screenToCanvas(event.clientX, event.clientY);
        const end = this.snappingEnabled ? CanvasUtils.snapPoint(pointer) : pointer;
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
        this.clearDragHandlers();

        if (!rectangle || rectangle.width < 12 || rectangle.height < 12) {
            this.renderShapes();
            return;
        }

        const minimumShapeWidth = this.snappingEnabled
            ? Math.ceil(160 / CanvasUtils.gridSpacing) * CanvasUtils.gridSpacing
            : 160;
        const minimumShapeHeight = this.snappingEnabled
            ? Math.ceil(100 / CanvasUtils.gridSpacing) * CanvasUtils.gridSpacing
            : 100;
        const shape = {
            id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            x: rectangle.x,
            y: rectangle.y,
            width: Math.max(minimumShapeWidth, rectangle.width),
            height: Math.max(minimumShapeHeight, rectangle.height),
            title: ""
        };
        this.performHistoryChange(() => this.shapes.push(shape));
        this.selectedShapeId = shape.id;
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
        this.saveBoard();
        this.render();
        this.applyTransform();
    },

    startShapeMove(shape, event) {
        if (!this.shapeMode || this.colorMode) return;
        this.beginHistoryTransaction();
        this.selectedShapeId = shape.id;
        this.movingShape = shape;
        this.shapeMoveStart = this.screenToCanvas(event.clientX, event.clientY);
        this.shapeMoveOrigin = { x: shape.x, y: shape.y };
        this.renderShapes();
        this.setDragHandlers(
            nextEvent => this.moveShape(nextEvent),
            () => this.stopShapeMove()
        );
    },

    moveShape(event) {
        if (!this.movingShape || !this.shapeMoveStart || !this.shapeMoveOrigin) return;
        const current = this.screenToCanvas(event.clientX, event.clientY);
        const requestedPosition = {
            x: this.shapeMoveOrigin.x + current.x - this.shapeMoveStart.x,
            y: this.shapeMoveOrigin.y + current.y - this.shapeMoveStart.y
        };
        const nextPosition = this.snappingEnabled
            ? CanvasUtils.snapPoint(requestedPosition)
            : requestedPosition;
        this.movingShape.x = nextPosition.x;
        this.movingShape.y = nextPosition.y;
        this.updateCanvasBounds();
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
        this.clearDragHandlers();
    },

    startShapeResize(shape, direction, event) {
        if (!this.shapeMode || this.colorMode) return;
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
        this.setDragHandlers(
            nextEvent => this.resizeShape(nextEvent),
            () => this.stopShapeResize()
        );
        event.preventDefault();
    },

    resizeShape(event) {
        if (!this.resizingShape || !this.shapeResizeStart || !this.shapeResizeOrigin) return;
        const current = this.screenToCanvas(event.clientX, event.clientY);
        let resized = CanvasUtils.resizeRectangle(
            this.shapeResizeOrigin,
            this.shapeResizeDirection,
            current.x - this.shapeResizeStart.x,
            current.y - this.shapeResizeStart.y
        );
        if (this.snappingEnabled) {
            resized = CanvasUtils.snapResizedRectangle(
                resized,
                this.shapeResizeDirection,
                160,
                100
            );
        }
        Object.assign(this.resizingShape, resized);
        this.updateCanvasBounds();
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
        this.clearDragHandlers();
    },
    getResizeHandlesMarkup(className) {
        return this.resizeDirections
            .map(direction => `<span class="${className} ${direction}" data-direction="${direction}"></span>`)
            .join("");
    },

    renderShapes() {
        window.WorkspaceUI?.update();
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
            if (shape.color) {
                element.classList.add("has-custom-color");
                element.style.setProperty("--shape-color", shape.color);
            }
            element.innerHTML = `
                <span class="shapeTitle" data-placeholder="Add title">${escapeHtml(shape.title || "")}</span>
                <button type="button" class="shapeDeleteButton" aria-label="Delete shape" title="Delete shape">&times;</button>
                ${this.getResizeHandlesMarkup("shapeResizeHandle")}
            `;

            const title = element.querySelector(".shapeTitle");
            if (title) {
                title.addEventListener("mousedown", event => event.stopPropagation());
                title.addEventListener("click", event => {
                    event.stopPropagation();
                    if (this.colorMode) {
                        if (this.colorPickMode) {
                            this.sampleColor(shape);
                        } else {
                            this.selectedShapeId = String(this.selectedShapeId) === String(shape.id) ? null : shape.id;
                            this.renderShapes();
                        }
                        return;
                    }
                    this.startTitleEdit(shape, title, true);
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
                if (this.colorMode) {
                    if (this.colorPickMode) {
                        this.sampleColor(shape);
                    } else {
                        this.selectedShapeId = String(this.selectedShapeId) === String(shape.id) ? null : shape.id;
                        this.renderShapes();
                    }
                    return;
                }
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
        const textHeight = this.getTextHeight(
            note.text || '',
            (note.width || CanvasUtils.defaultNoteWidth) - 16
        );
        return Math.max(textHeight + titleHeight + 20, note.type === 'image' ? 80 : 100);
    },

    updateTextareaOverflow(textarea) {
        if (!textarea) return;
        textarea.style.overflowY = 'hidden';
        const overflowAmount = textarea.scrollHeight - textarea.clientHeight;
        textarea.style.overflowY = overflowAmount > 2 ? 'auto' : 'hidden';
    },

    isIgnoreElement(target) {
        return target.closest("input,textarea,button,select,a,.resizeHandle,#toolbar,.backupControls,.canvasNavigator,.workspaceControls,.colorPanel,#drawingLayer");
    },

    startTitleEdit(item, titleElement, shapeTitle = false) {
        if (shapeTitle && (!this.shapeMode || this.colorMode)) return;
        this.beginHistoryTransaction();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = shapeTitle ? 'shapeTitleInput' : 'noteTitleInput';
        input.value = item.title || '';
        if (shapeTitle) input.placeholder = 'Group title';
        input.addEventListener('mousedown', e => e.stopPropagation());
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                input.value = item.title || '';
                input.blur();
            }
        });
        input.addEventListener('blur', () => {
            item.title = input.value.trim();
            if (!shapeTitle) {
                item.width = Math.max(item.width || CanvasUtils.defaultNoteWidth, this.getMinNoteWidth(item));
            }
            this.commitHistoryTransaction();
            this.saveBoard();
            shapeTitle ? this.renderShapes() : this.render();
        });
        titleElement.replaceWith(input);
        input.focus();
        input.select();
    },
    deleteSelectedNotes() {
        if (!this.selectedNotes.length) return;
        const deletedIds = new Set(this.selectedNotes);
        this.performHistoryChange(() => {
            this.connections = this.getConnectionsWithoutNotes(deletedIds);
            this.notes = this.notes.filter(note => !deletedIds.has(note.id));
        });
        this.selectedNote = null;
        this.selectedNotes = [];
        deletedIds.forEach(id => this.expandedNoteIds.delete(id));
        this.saveBoard();
        this.render();
    },
    getConnectionsWithoutNotes(deletedIds) {
        const remainingIds = new Set(this.notes.filter(note => !deletedIds.has(note.id)).map(note => note.id));
        const connections = [];
        const outgoing = new Map();
        const entries = new Map();
        this.connections.forEach(connection => {
            const { a, b } = connection;
            if (!deletedIds.has(a) && !deletedIds.has(b)) {
                connections.push(connection);
            } else {
                const links = deletedIds.has(a) ? outgoing : entries;
                if (!links.has(a)) links.set(a, []);
                links.get(a).push(b);
            }
        });
        const keys = new Set(connections.map(({ a, b }) => this.getConnectionKey(a, b)));
        // Follow the saved a -> b order through deleted notes only, keeping sibling branches separate.
        entries.forEach((starts, a) => {
            if (!remainingIds.has(a)) return;
            const pending = [...starts];
            const visited = new Set();
            while (pending.length) {
                const b = pending.pop();
                if (visited.has(b)) continue;
                visited.add(b);
                if (deletedIds.has(b)) {
                    for (const next of outgoing.get(b) || []) pending.push(next);
                } else if (remainingIds.has(b) && a !== b) {
                    const key = this.getConnectionKey(a, b);
                    if (!keys.has(key)) {
                        keys.add(key);
                        connections.push({ a, b });
                    }
                }
            }
        });
        return connections;
    },
    getConnectionKey(a, b) {
        return `${Math.min(a, b)}-${Math.max(a, b)}`;
    },
    createSvgElement(tag, attributes = {}) {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    },
    connectNotes(a, b) {
        if (a === b) return;
        const key = this.getConnectionKey(a, b);
        const exists = this.connections.some(connection => this.getConnectionKey(connection.a, connection.b) === key);
        if (exists) return;
        this.performHistoryChange(() => {
            this.connections.push({ a, b });
        });
        this.saveBoard();
        this.drawConnections();
    },
    removeConnection(a, b) {
        const key = this.getConnectionKey(a, b);
        const exists = this.connections.some(connection => this.getConnectionKey(connection.a, connection.b) === key);
        if (!exists) return;
        this.performHistoryChange(() => {
            this.connections = this.connections.filter(connection =>
                this.getConnectionKey(connection.a, connection.b) !== key
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
    colorPresets: [
        { name: "Default", value: null },
        { name: "Green", value: "#5f9364" },
        { name: "Red", value: "#a85f5f" },
        { name: "Blue", value: "#5f7fa8" },
        { name: "Amber", value: "#a88755" },
        { name: "Purple", value: "#826fa3" }
    ],
    selectedColor: null,
    colorPanelElement: null,
    colorPicker: null,
    customColorButton: null,
    colorPickButton: null,
    colorPickMode: false,
    setConnectionMode(mode, enabled, finishRemoveDrag = false) {
        if (enabled) window.DrawingLayer?.setTool(null);
        const addMode = mode === "add";
        const property = `${mode}Mode`;
        const className = `${mode}-mode-active`;
        this[property] = enabled;
        document.body.classList.toggle(className, enabled);
        document.getElementById("connections")?.classList.toggle(className, enabled);
        this.updateToggleButton(
            `${mode}Btn`,
            enabled,
            addMode ? "Add: ON" : "Remove: ON",
            addMode ? "Add Connections" : "Remove Connections"
        );
        if (!enabled) {
            if (addMode) this.endAddDrag();
            else if (finishRemoveDrag) this.endRemoveDrag();
            else this.clearRemoveDrag();
        }
    },
    toggleConnectionMode(mode) {
        const enabled = !this[`${mode}Mode`];
        if (enabled) {
            if (this.colorMode) this.toggleColorMode();
            if (this.shapeMode) this.setShapeMode(false);
            const otherMode = mode === "add" ? "remove" : "add";
            if (this[`${otherMode}Mode`]) this.setConnectionMode(otherMode, false, mode === "add");
        }
        this.setConnectionMode(mode, enabled);
    },
    toggleRemoveMode() {
        this.toggleConnectionMode("remove");
    },
    toggleAddMode() {
        this.toggleConnectionMode("add");
    },
    toggleColorMode() {
        if (!this.colorMode) window.DrawingLayer?.setTool(null);
        this.colorMode = !this.colorMode;
        if (this.colorMode) {
            if (this.addMode) this.setConnectionMode("add", false);
            if (this.removeMode) this.setConnectionMode("remove", false, true);
        } else {
            this.setColorPickMode(false);
        }
        this.updateToggleButton("colorBtn", this.colorMode, "Color: ON", "Color Mode");
        document.body.classList.toggle("color-mode-active", this.colorMode);
    },

    selectColor(color) {
        if (!this.colorPicker) return;
        const isDefault = color === null || color === "" || color === "default";
        if (!isDefault && !/^#[0-9a-f]{6}$/i.test(color)) return;
        const normalizedColor = isDefault ? null : color.toLowerCase();
        this.selectedColor = normalizedColor;
        if (normalizedColor) this.colorPicker.value = normalizedColor;
        if (this.colorPanelElement) {
            this.colorPanelElement.style.setProperty("--selected-color", normalizedColor || "#333333");
            let presetSelected = false;
            this.colorPanelElement.querySelectorAll(".colorSwatch").forEach(button => {
                const presetColor = button.dataset.color || null;
                const selected = presetColor === normalizedColor;
                button.classList.toggle("selected", selected);
                button.setAttribute("aria-pressed", String(selected));
                if (selected) presetSelected = true;
            });
            if (this.customColorButton) {
                const customSelected = normalizedColor !== null && !presetSelected;
                this.customColorButton.classList.toggle("selected", customSelected);
                this.customColorButton.setAttribute("aria-pressed", String(customSelected));
            }
        }
    },

    setColorPickMode(enabled) {
        if (enabled && !this.colorMode) this.toggleColorMode();
        this.colorPickMode = Boolean(enabled && this.colorMode);
        document.body.classList.toggle('color-pick-mode-active', this.colorPickMode);
        if (this.colorPickButton) {
            this.colorPickButton.classList.toggle('active', this.colorPickMode);
            this.colorPickButton.setAttribute('aria-pressed', String(this.colorPickMode));
            this.colorPickButton.textContent = this.colorPickMode ? 'Pick: ON' : 'Pick';
        }
    },

    sampleColor(item) {
        if (!item) return;
        this.selectColor(item.color || null);
        this.setColorPickMode(false);
    },

    selectNote(note, additive = false) {
        if (!note) return;
        if (additive) {
            if (this.selectedNotes.includes(note.id)) {
                this.selectedNotes = this.selectedNotes.filter(id => id !== note.id);
            } else {
                this.selectedNotes.push(note.id);
            }
        } else {
            this.selectedNotes = [note.id];
        }
        this.render();
    },
    setItemColor(item, color) {
        if (color) item.color = color;
        else delete item.color;
    },

    applyColor() {
        const color = this.selectedColor;

        if (this.shapeMode) {
            const shape = this.shapes.find(item => String(item.id) === String(this.selectedShapeId));
            if (!shape || (shape.color || null) === color) return;
            this.performHistoryChange(() => this.setItemColor(shape, color));
            this.saveBoard();
            this.renderShapes();
            return;
        }

        if (!this.selectedNotes.length) return;
        const selectedIds = new Set(this.selectedNotes);
        const changedNotes = this.notes.filter(note => selectedIds.has(note.id) && (note.color || null) !== color);
        if (!changedNotes.length) return;
        this.performHistoryChange(() => {
            changedNotes.forEach(note => this.setItemColor(note, color));
        });
        this.saveBoard();
        this.render();
    },
    
    drawConnections(updateLayout = true) {
        const svg = document.getElementById("connections");
        if (!svg) return;
        this.clearRemoveDrag();
        if (updateLayout) {
            this.updateCanvasBounds();
            this.applyTransform();
        }
        svg.innerHTML = "";
        this.connectionElements = [];

        // defs for gradients
        const defs = this.createSvgElement("defs");
        svg.appendChild(defs);
        const notesById = new Map(this.notes.map(note => [note.id, note]));

        this.connections.forEach(c => {
            const a = notesById.get(c.a);
            const b = notesById.get(c.b);
            if (!a || !b) return;
            const connKey = this.getConnectionKey(c.a, c.b);

            const colorA = a.color || '#aaa';
            const colorB = b.color || '#aaa';
            let strokeRef = colorA;
            let gradient = null;
            if (colorA !== colorB) {
                const gradId = `grad-${c.a}-${c.b}`;
                const existing = defs.querySelector(`#${gradId}`);
                if (existing) existing.remove();
                gradient = this.createSvgElement("linearGradient", {
                    id: gradId, gradientUnits: "userSpaceOnUse"
                });
                const stop1 = this.createSvgElement("stop", { offset: "0%", "stop-color": colorA });
                const stop2 = this.createSvgElement("stop", { offset: "100%", "stop-color": colorB });
                gradient.append(stop1, stop2);
                defs.appendChild(gradient);
                strokeRef = `url(#${gradId})`;
            }

            const line = this.createSvgElement("path", { fill: "none", class: "line" });
            line.dataset.conn = connKey;
            // Prefer inline styles so CSS defaults don't override colors/gradients
            line.style.stroke = strokeRef;
            line.style.strokeWidth = '2';
            line.style.strokeLinecap = 'round';
            line.style.strokeLinejoin = 'round';
            const removeOnClick = e => {
                e.stopPropagation();
                if (this.removeMode) this.removeConnection(c.a, c.b);
            };
            line.addEventListener("click", removeOnClick);

            // Add invisible wider stroke for better clickability
            const bgLine = this.createSvgElement("path", {
                fill: "none",
                stroke: "transparent",
                "stroke-width": 20,
                "stroke-linejoin": "round"
            });
            bgLine.style.pointerEvents = "all";
            bgLine.style.cursor = "pointer";
            bgLine.dataset.conn = connKey;
            bgLine.addEventListener("click", removeOnClick);
            const elements = { a, b, line, bgLine, gradient };
            this.updateConnectionGeometry(elements);
            this.connectionElements.push(elements);
            svg.append(bgLine, line);
        });
    },
    updateConnectionGeometry({ a, b, line, bgLine, gradient }) {
        const { path, start, end } = CanvasUtils.getOrthogonalConnection(a, b);
        line.setAttribute("d", path);
        bgLine.setAttribute("d", path);
        if (gradient) {
            gradient.setAttribute("x1", start.x);
            gradient.setAttribute("y1", start.y);
            gradient.setAttribute("x2", end.x);
            gradient.setAttribute("y2", end.y);
        }
    },
    updateMovedConnections(noteIds) {
        const movedIds = new Set(noteIds);
        this.connectionElements.forEach(elements => {
            if (movedIds.has(elements.a.id) || movedIds.has(elements.b.id)) {
                this.updateConnectionGeometry(elements);
            }
        });
    },
    startRemoveDrag(event) {
        if (this.removeDragActive) return;
        this.removeDragActive = true;
        this.removeDragCrossed = [];
        const svg = document.getElementById("connections");
        if (!svg) return;
        this.removeDragStart = this.screenToCanvas(event.clientX, event.clientY);
        this.removeDragLine = this.createSvgElement("line", {
            class: "removeLine",
            x1: this.removeDragStart.x,
            y1: this.removeDragStart.y,
            x2: this.removeDragStart.x,
            y2: this.removeDragStart.y
        });
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
        this.addDragLine = this.createSvgElement("line", {
            class: "addLine",
            x1: this.addDragStart.x,
            y1: this.addDragStart.y,
            x2: this.addDragStart.x,
            y2: this.addDragStart.y
        });
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
            for (let seg of CanvasUtils.getRectangleSegments(note)) {
                if (CanvasUtils.lineIntersects(this.addDragStart, end, seg)) {
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
        const notesById = new Map(this.notes.map(note => [note.id, note]));
        this.connections.forEach(c => {
            const a = notesById.get(c.a);
            const b = notesById.get(c.b);
            if (!a || !b) return;
            const geometry = CanvasUtils.getOrthogonalConnection(a, b);
            if (geometry.segments.some(segment => CanvasUtils.lineIntersects(this.removeDragStart, end, segment))) {
                crossed.add(this.getConnectionKey(c.a, c.b));
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
                    const key = this.getConnectionKey(c.a, c.b);
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
    stopMove() {
        if (this.selectedNote) {
            this.commitHistoryTransaction();
            this.saveBoard();
        }
        this.setTextSelectionLocked(false);
        this.selectedNote = null;
        this.clearDragHandlers();
    },
    startSelectBox(event) {
        if (event.button !== 0) return; // Only left click
        this.selectBoxStart = this.screenToCanvas(event.clientX, event.clientY);
        this.selectBoxStartScreen = {
            x: event.clientX,
            y: event.clientY
        };
        this.selectingBox = true;
        this.selectBoxMoved = false;
        this.setDragHandlers(e => this.updateSelectBox(e), () => this.stopSelectBox());
    },
    updateSelectBox(event) {
        if (!this.selectingBox) return;
        const screenWidth = Math.abs(event.clientX - this.selectBoxStartScreen.x);
        const screenHeight = Math.abs(event.clientY - this.selectBoxStartScreen.y);
        if (!this.selectBoxMoved && Math.hypot(screenWidth, screenHeight) < 5) return;
        this.selectBoxMoved = true;

        const { x: endX, y: endY } = this.screenToCanvas(event.clientX, event.clientY);
        
        const minX = Math.min(this.selectBoxStart.x, endX);
        const maxX = Math.max(this.selectBoxStart.x, endX);
        const minY = Math.min(this.selectBoxStart.y, endY);
        const maxY = Math.max(this.selectBoxStart.y, endY);
        
        this.selectedNotes = this.notes
            .filter(note => {
                const bounds = CanvasUtils.getItemBounds(note);
                return bounds.left < maxX && bounds.right > minX && bounds.top < maxY && bounds.bottom > minY;
            })
            .map(n => n.id);
        
        if (this.selectionBoxElement) {
            const screenMinX = Math.min(this.selectBoxStartScreen.x, event.clientX);
            const screenMinY = Math.min(this.selectBoxStartScreen.y, event.clientY);
            this.selectionBoxElement.style.display = "block";
            this.selectionBoxElement.style.left = screenMinX + "px";
            this.selectionBoxElement.style.top = screenMinY + "px";
            this.selectionBoxElement.style.width = screenWidth + "px";
            this.selectionBoxElement.style.height = screenHeight + "px";
        }
        
        this.render();
    },
    stopSelectBox() {
        this.selectingBox = false;
        this.selectBoxMoved = false;
        if (this.selectionBoxElement) {
            this.selectionBoxElement.style.display = "none";
            this.selectionBoxElement.style.width = "0px";
            this.selectionBoxElement.style.height = "0px";
        }
        this.clearDragHandlers();
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
        this.resizeStartRect = {
            x: note.x,
            y: note.y,
            width: note.width || CanvasUtils.defaultNoteWidth,
            height: note.height || CanvasUtils.defaultNoteHeight
        };
        this.setTextSelectionLocked(true);
        this.setDragHandlers(e2 => this.doResize(e2), () => this.stopResize());
        this.render();
    },
    doResize(e) {
        if (!this.resizingNote) return;
        const deltaX = (e.clientX - this.resizeStartX) / this.zoom;
        const deltaY = (e.clientY - this.resizeStartY) / this.zoom;
        const note = this.resizingNote;
        const minWidth = this.getMinNoteWidth(note);
        const titleOnlyNote = note.type !== 'image' && !this.hasNoteContent(note) &&
            !this.expandedNoteIds.has(note.id);
        let minHeight = titleOnlyNote ? CanvasUtils.titleOnlyNoteHeight : CanvasUtils.defaultNoteHeight;
        let rectangle;
        if (note.type === 'image' && Number.isFinite(note.aspectRatio) && note.aspectRatio > 0) {
            rectangle = CanvasUtils.resizeRectangleProportionally(
                this.resizeStartRect, this.resizeDirection, deltaX, deltaY, note.aspectRatio, minWidth, minHeight
            );
        } else {
            const proposed = CanvasUtils.resizeRectangle(
                this.resizeStartRect, this.resizeDirection, deltaX, deltaY, minWidth, minHeight
            );
            minHeight = titleOnlyNote
                ? CanvasUtils.titleOnlyNoteHeight
                : Math.max(
                    CanvasUtils.defaultNoteHeight,
                    this.getMinNoteHeight({ ...note, width: proposed.width })
                );
            rectangle = CanvasUtils.resizeRectangle(
                this.resizeStartRect, this.resizeDirection, deltaX, deltaY, minWidth, minHeight
            );
            // A narrower text note may need additional height even on a side-only resize.
            rectangle.height = Math.max(rectangle.height, minHeight);
        }
        if (this.snappingEnabled) {
            rectangle = CanvasUtils.snapResizedRectangle(
                rectangle,
                this.resizeDirection,
                minWidth,
                minHeight
            );
        }
        Object.assign(note, rectangle);
        this.updateCanvasBounds();
        this.applyTransform();
        this.updateMovedConnections([note.id]);
        this.updateTextareaOverflow(document.querySelector(`.note[data-note-id="${note.id}"] textarea`));
    },
    stopResize() {
        if (this.resizingNote) {
            this.commitHistoryTransaction();
            this.saveBoard();
        }
        this.setTextSelectionLocked(false);
        this.resizingNote = null;
        this.resizeStartRect = null;
        this.resizeDirection = null;
        this.clearDragHandlers();
        this.render();
    },
    render() {
        window.DrawingLayer?.render();
        const canvas = document.getElementById("canvas");
        if (!canvas) return;
        const notes = this.notes;
        const selectedNoteIds = new Set(this.selectedNotes);
        const self = this;
        notes.forEach(note => {
            const minWidth = self.getMinNoteWidth(note);
            if ((note.width || CanvasUtils.defaultNoteWidth) < minWidth) {
                note.width = minWidth;
            }
            const noteContentVisible = note.type === 'image' || self.hasNoteContent(note) ||
                self.expandedNoteIds.has(note.id);
            const minHeight = note.type === 'image'
                ? note.height || CanvasUtils.defaultNoteHeight
                : noteContentVisible
                    ? self.getMinNoteHeight(note)
                    : CanvasUtils.titleOnlyNoteHeight;
            if (!noteContentVisible) note.height = CanvasUtils.titleOnlyNoteHeight;
            if ((note.height || CanvasUtils.defaultNoteHeight) < minHeight) {
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
            const imageOnlyNote = note.type === "image";
            const noteContentVisible = imageOnlyNote || this.hasNoteContent(note) || this.expandedNoteIds.has(note.id);
            const titleOnlyNote = !imageOnlyNote && !noteContentVisible;
            const showAddNoteButton = titleOnlyNote && selectedNoteIds.size === 1 && selectedNoteIds.has(note.id);
            if (imageOnlyNote) div.classList.add("image-note", "no-title");
            if (titleOnlyNote) div.classList.add("title-only");
            if (showAddNoteButton) div.classList.add("has-add-note-control");
            if (this.resizingNote && this.resizingNote.id === note.id) div.classList.add("resizing");
            if (selectedNoteIds.has(note.id)) {
                div.classList.add("selected");
            }
            div.style.left = (note.x - this.canvasBounds.left) + "px";
            div.style.top = (note.y - this.canvasBounds.top) + "px";
            div.style.width = (note.width || CanvasUtils.defaultNoteWidth) + "px";
            div.style.height = (note.height || CanvasUtils.defaultNoteHeight) + "px";
            div.style.setProperty('--node-width', `${note.width || CanvasUtils.defaultNoteWidth}px`);
            div.style.setProperty('--node-height', `${note.height || CanvasUtils.defaultNoteHeight}px`);
            // apply custom background color if present
            if (note.color) {
                div.style.setProperty('--note-bg', note.color);
                div.style.setProperty('--note-text', AppSettings.getContrastColor(note.color));
            }
            if (imageOnlyNote) {
                div.innerHTML = `
        ${note.imageSrc ? `<div class="noteImage"><img src="${escapeHtml(note.imageSrc)}" alt="Note image">` +
            `</img></div>` : ""}
        `;
            } else {
                div.innerHTML = `
        <div class="noteHeader">
            <span class="noteTitle" data-placeholder="Add title">${escapeHtml(note.title)}</span>
        </div>
        ${showAddNoteButton ? `<button type="button" class="addNoteContentButton" aria-label="Add note" title="Add note">+</button>` : ""}
        ${noteContentVisible && note.imageSrc ? `<div class="noteImage"><img src="${escapeHtml(note.imageSrc)}" alt="Note image"></div>` : ""}
        ${noteContentVisible ? `<textarea aria-label="Note">${escapeHtml(note.text)}</textarea>` : ""}
        `;
            }
            div.insertAdjacentHTML("beforeend", `
                <div class="noteResizeBorder" aria-hidden="true">
                    ${this.getResizeHandlesMarkup("resizeHandle")}
                </div>
            `);

            const addNoteContentButton = div.querySelector(".addNoteContentButton");
            if (addNoteContentButton) {
                addNoteContentButton.addEventListener("mousedown", event => event.stopPropagation());
                addNoteContentButton.addEventListener("click", event => {
                    event.stopPropagation();
                    event.preventDefault();
                    self.openNoteContent(note);
                });
            }

            const titleElement = div.querySelector(".noteTitle");
            if (titleElement) {
                titleElement.addEventListener('click', e => {
                    e.stopPropagation();
                    if (self.shapeMode) return;
                    if (self.colorMode) {
                        if (self.colorPickMode) {
                            self.sampleColor(note);
                        } else {
                            self.selectNote(note, e.shiftKey);
                        }
                        return;
                    }
                    if (e.shiftKey) return;
                    self.startTitleEdit(note, titleElement);
                });
            }

            const textarea = div.querySelector("textarea");
            if (textarea) {
                textarea.oninput = () => {
                    self.updateText(note.id, textarea.value);
                    const minNoteHeight = self.getMinNoteHeight(note);
                    note.height = Math.max(note.height || CanvasUtils.defaultNoteHeight, minNoteHeight);
                    div.style.height = note.height + 'px';
                    self.updateTextareaOverflow(textarea);
                };
                textarea.onmousedown = e => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    if (self.colorMode) {
                        e.preventDefault();
                        if (self.colorPickMode) {
                            self.sampleColor(note);
                        } else {
                            self.selectNote(note, e.shiftKey);
                        }
                    } else if (e.shiftKey) {
                        e.preventDefault();
                        self.selectNote(note, true);
                    }
                };
                textarea.onfocus = e => {
                    e.stopPropagation();
                    self.expandedNoteIds.add(note.id);
                    self.beginHistoryTransaction();
                };
                textarea.onblur = () => {
                    self.expandedNoteIds.delete(note.id);
                    const shouldCollapse = !self.hasNoteContent(note);
                    if (shouldCollapse) {
                        note.text = "";
                        note.height = CanvasUtils.titleOnlyNoteHeight;
                    }
                    self.commitHistoryTransaction();
                    self.saveBoard();
                    if (shouldCollapse) self.render();
                };
            }

            const imgEl = div.querySelector('.noteImage img');
            if (imgEl) {
                const syncImageDimensions = () => {
                    try {
                        const naturalW = imgEl.naturalWidth || imgEl.width;
                        const naturalH = imgEl.naturalHeight || imgEl.height;
                        if (naturalW && naturalH) {
                            const imageContainer = imgEl.closest('.noteImage');
                            imageContainer?.style.setProperty(
                                '--overview-image-width',
                                `${76 * naturalW / naturalH}px`
                            );

                            // Image-only notes also preserve their proportions while resizing.
                            if (note.type === 'image') {
                                note.aspectRatio = naturalH / naturalW;
                                // If note had default width, compute height to keep proportions
                                if (!note._sizeInitialized) {
                                    const maxW = 400;
                                    const newW = Math.min(maxW, naturalW, note.width || CanvasUtils.defaultNoteWidth);
                                    note.width = newW;
                                    note.height = Math.max(80, Math.round(newW * note.aspectRatio));
                                    note._sizeInitialized = true;
                                    div.style.width = note.width + 'px';
                                    div.style.height = note.height + 'px';
                                }
                            }
                        }
                    } catch (err) {
                        // ignore
                    }
                };

                imgEl.onload = syncImageDimensions;
                if (imgEl.complete) {
                    syncImageDimensions();
                }
            }


            div.onmousedown = e => {
                if (e.button !== 0) return;
                if (self.shapeMode || self.removeMode || self.addMode) return;
                if (self.colorMode) {
                    e.stopPropagation();
                    e.preventDefault();
                    if (self.colorPickMode) {
                        self.sampleColor(note);
                    } else {
                        self.selectNote(note, e.shiftKey);
                    }
                    return;
                }
                if (self.isIgnoreElement(e.target)) {
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                e.preventDefault();
                const pointer = self.screenToCanvas(e.clientX, e.clientY);
                
                // Modifier-click toggles selection without starting a drag.
                if (e.shiftKey) {
                    self.selectNote(note, true);
                    return;
                }

                self.beginHistoryTransaction();
                
                // If clicking on already selected note, drag all selected notes
                if (!selectedNoteIds.has(note.id)) {
                    // Clicking on unselected note: select only it and drag
                    self.selectedNotes = [note.id];
                    self.render();
                }
                self.selectedNote = note;
                self.offsetX = pointer.x - note.x;
                self.offsetY = pointer.y - note.y;
                self.setTextSelectionLocked(true);
                self.setDragHandlers(e2 => self.moveNote(e2), () => self.stopMove());
            };
            
            div.querySelectorAll(".resizeHandle").forEach(resizeHandle => {
                resizeHandle.onmousedown = e => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    self.startResize(note, e, resizeHandle.dataset.direction);
                };
            });

            canvas.appendChild(div);
            self.updateTextareaOverflow(textarea);
        });

        this.drawConnections(false);
        this.updateNavigationBars();
    },
    getNavigationMetrics(axis, trackLength) {
        return CanvasUtils.getNavigationMetrics(
            this.notes,
            this.getViewportBounds(),
            axis,
            trackLength
        );
    },
    updateNavigationBars() {
        [
            { axis: "x", id: "horizontalNavigator" },
            { axis: "y", id: "verticalNavigator" }
        ].forEach(({ axis, id }) => {
            const navigator = document.getElementById(id);
            if (!navigator) return;
            if (!this.notes.length) {
                navigator.hidden = true;
                return;
            }

            navigator.hidden = false;
            const trackLength = axis === "x" ? navigator.clientWidth : navigator.clientHeight;
            let metrics = this.getNavigationMetrics(axis, trackLength);
            if (!metrics) {
                navigator.hidden = true;
                return;
            }

            if (this.navigationDrag && this.navigationDrag.axis === axis) {
                const activeMetrics = this.navigationDrag.metrics;
                const viewport = this.getViewportBounds();
                const viewportStart = axis === "x" ? viewport.left : viewport.top;
                const progress = Math.max(0, Math.min(1,
                    (viewportStart - activeMetrics.contentStart) / activeMetrics.scrollRange
                ));
                metrics = {
                    ...activeMetrics,
                    visible: true,
                    progress,
                    thumbPosition: progress * Math.max(0, trackLength - activeMetrics.thumbSize)
                };
            }

            if (!metrics.visible) {
                navigator.hidden = true;
                return;
            }

            const thumb = navigator.querySelector(".canvasNavigatorThumb");
            if (axis === "x") {
                thumb.style.left = `${metrics.thumbPosition}px`;
                thumb.style.width = `${metrics.thumbSize}px`;
            } else {
                thumb.style.top = `${metrics.thumbPosition}px`;
                thumb.style.height = `${metrics.thumbSize}px`;
            }
            navigator.setAttribute("aria-valuemin", "0");
            navigator.setAttribute("aria-valuemax", "100");
            navigator.setAttribute("aria-valuenow", String(Math.round(metrics.progress * 100)));
        });
    },
    moveCameraFromNavigator(event) {
        const drag = this.navigationDrag;
        if (!drag) return;
        const rectangle = drag.navigator.getBoundingClientRect();
        const pointer = drag.axis === "x" ? event.clientX - rectangle.left : event.clientY - rectangle.top;
        const trackLength = drag.axis === "x" ? rectangle.width : rectangle.height;
        const travel = Math.max(1, trackLength - drag.metrics.thumbSize);
        const progress = Math.max(0, Math.min(1, (pointer - drag.grabOffset) / travel));
        const viewportStart = drag.metrics.contentStart + progress * drag.metrics.scrollRange;
        if (drag.axis === "x") {
            this.panX = -viewportStart * this.zoom;
        } else {
            this.panY = -viewportStart * this.zoom;
        }
        this.updateCanvasBounds();
        this.applyTransform();
    },
    startNavigationDrag(axis, navigator, event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const rectangle = navigator.getBoundingClientRect();
        const trackLength = axis === "x" ? rectangle.width : rectangle.height;
        const metrics = this.getNavigationMetrics(axis, trackLength);
        if (!metrics) return;

        const pointer = axis === "x" ? event.clientX - rectangle.left : event.clientY - rectangle.top;
        const clickedThumb = event.target.closest(".canvasNavigatorThumb");
        const grabOffset = clickedThumb
            ? pointer - metrics.thumbPosition
            : metrics.thumbSize / 2;
        this.navigationDrag = { axis, navigator, metrics, grabOffset };
        navigator.classList.add("dragging");
        this.moveCameraFromNavigator(event);

        const move = moveEvent => this.moveCameraFromNavigator(moveEvent);
        const stop = () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
            navigator.classList.remove("dragging");
            this.navigationDrag = null;
            this.updateNavigationBars();
            this.saveBoard();
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    },
    setupNavigationBars() {
        [
            { axis: "x", id: "horizontalNavigator" },
            { axis: "y", id: "verticalNavigator" }
        ].forEach(({ axis, id }) => {
            const navigator = document.getElementById(id);
            if (!navigator) return;
            navigator.addEventListener("mousedown", event => {
                this.startNavigationDrag(axis, navigator, event);
            });
        });
        this.updateNavigationBars();
    },
    applyTransform() {
        window.DrawingLayer?.syncView();
        window.WorkspaceUI?.update();
        const canvas = document.getElementById("canvas");
        const shapesLayer = document.getElementById("shapes");
        const grid = document.getElementById("grid");
        const svg = document.getElementById("connections");
        const bounds = this.canvasBounds;
        const displayedZoomTarget = this.zoomAnimationTarget
            ? this.zoomAnimationTarget.zoom
            : this.zoom;
        const overviewActive = displayedZoomTarget <= CanvasUtils.overviewZoomThreshold + 0.001;
        document.body.classList.toggle("canvas-overview-mode", overviewActive);
        document.body.style.setProperty("--overview-title-scale", String(1 / this.zoom));
        const transform = `translate(${this.panX + bounds.left * this.zoom}px, ${this.panY + bounds.top * this.zoom}px) scale(${this.zoom})`;
        [canvas, shapesLayer, svg].forEach(layer => {
            if (layer) layer.style.transform = transform;
        });
        if (grid) {
            // Paint only the viewport in screen pixels, independent of canvas bounds.
            // CSS sizes the dots in em; only spacing and camera alignment use pixels.
            const spacing = CanvasUtils.gridSpacing * this.zoom;
            const dotCenterOffset = spacing / 2;
            grid.style.backgroundSize = `${spacing}px ${spacing}px`;
            grid.style.backgroundPosition =
                `${(this.panX - dotCenterOffset) % spacing}px ` +
                `${(this.panY - dotCenterOffset) % spacing}px`;
            grid.style.setProperty("--grid-zoom", String(this.zoom));
        }
        this.updateNavigationBars();
    },
    startPan(event) {
        if (event.button !== 2) return;
        this.panning = true;
        this.panStartX = event.clientX;
        this.panStartY = event.clientY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
        this.setDragHandlers(e => this.updatePan(e), () => this.stopPan());
        event.preventDefault();
    },
    updatePan(event) {
        if (!this.panning) return;
        const deltaX = event.clientX - this.panStartX;
        const deltaY = event.clientY - this.panStartY;
        this.panX = this.panStartPanX + deltaX;
        this.panY = this.panStartPanY + deltaY;
        this.updateCanvasBounds(false);
        this.applyTransform();
    },
    stopPan() {
        this.panning = false;
        this.clearDragHandlers();
        this.updateCanvasBounds(false);
        this.applyTransform();
        this.saveBoard();
    },
    finishZoomAnimation() {
        if (!this.zoomAnimationTarget) return;
        cancelAnimationFrame(this.zoomAnimationFrame);
        const target = this.zoomAnimationTarget;
        this.zoomAnimationFrame = null;
        this.zoomAnimationTarget = null;
        this.zoom = target.zoom;
        this.panX = target.panX;
        this.panY = target.panY;
        this.updateCanvasBounds(false);
        this.applyTransform();
        this.saveBoard();
    },
    centerCameraOnSelectionOrNotes() {
        window.DrawingLayer?.finish();
        const selectedIds = new Set(this.selectedNotes);
        const selectedNotes = this.notes.filter(note => selectedIds.has(note.id));
        const drawingBounds = this.drawingsVisible ? window.DrawingLayer?.getBounds(this.drawings) : null;
        this.centerCameraOnNotes(selectedNotes.length ? selectedNotes : [...this.notes, ...(drawingBounds ? [drawingBounds] : [])]);
    },
    animateZoom(target) {
        if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
        const start = {
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY
        };
        const animationTarget = { ...target };
        this.zoomAnimationTarget = animationTarget;
        let startedAt = null;

        const step = timestamp => {
            if (this.zoomAnimationTarget !== animationTarget) return;
            if (startedAt === null) startedAt = timestamp;
            const progress = Math.min(1, (timestamp - startedAt) / this.zoomAnimationDuration);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.zoom = start.zoom + (animationTarget.zoom - start.zoom) * eased;
            this.panX = start.panX + (animationTarget.panX - start.panX) * eased;
            this.panY = start.panY + (animationTarget.panY - start.panY) * eased;
            this.updateCanvasBounds(false);
            this.applyTransform();

            if (progress < 1) {
                this.zoomAnimationFrame = requestAnimationFrame(step);
                return;
            }
            this.zoom = animationTarget.zoom;
            this.panX = animationTarget.panX;
            this.panY = animationTarget.panY;
            this.zoomAnimationFrame = null;
            this.zoomAnimationTarget = null;
            this.updateCanvasBounds(false);
            this.applyTransform();
            this.saveBoard();
        };
        this.zoomAnimationFrame = requestAnimationFrame(step);
    },
    handleZoom(event) {
        window.DrawingLayer?.finish();
        event.preventDefault();
        const zoomSpeed = 0.1;
        const delta = event.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const pending = this.zoomAnimationTarget || {
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY
        };
        const newZoom = CanvasUtils.clampZoom(
            Math.round((pending.zoom + delta) * 10) / 10
        );
        if (newZoom === pending.zoom) return;
        
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = (window.innerHeight - CanvasUtils.toolbarHeight) / 2;
        const worldX = (viewportCenterX - pending.panX) / pending.zoom;
        const worldY = (viewportCenterY - pending.panY) / pending.zoom;

        this.animateZoom({
            zoom: newZoom,
            panX: viewportCenterX - worldX * newZoom,
            panY: viewportCenterY - worldY * newZoom
        });
    },
    init() {
        if (document.getElementById("canvas")) {
            window.WorkspaceUI?.syncToolbarHeight();
            this.loadBoard();
            this.historyManager.clear();
            this.historyTransaction = null;
            this.setupNavigationBars();
            const canvas = document.getElementById("canvas");
            const self = this;

            // Pointer interactions snap a running zoom animation to its exact target
            // before starting, so camera calculations always use a locked zoom value.
            document.addEventListener("mousedown", () => self.finishZoomAnimation(), true);

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

            // The palette appears for a selection or while Color Mode is active.
            const colorPanel = document.createElement('div');
            colorPanel.className = 'colorPanel workspaceControls';
            colorPanel.style.display = 'none';
            colorPanel.innerHTML = `
                <span class="colorSelectionLabel">Select a node or group</span>
                <div class="colorPalette" role="group" aria-label="Preset colors">
                    ${this.colorPresets.map(({ name, value }) => `
                        <button type="button" class="colorSwatch${value ? "" : " defaultColorSwatch"}" data-color="${value || ""}"${value ? ` style="--swatch-color: ${value}"` : ""} aria-label="${name}" title="${name}" aria-pressed="false"></button>
                    `).join("")}
                </div>
                <button type="button" class="customColorBtn" aria-pressed="false">
                    <span class="customColorPreview" aria-hidden="true"></span>
                    Custom
                </button>
                <input type="color" class="colorPicker" value="${this.colorPresets.find(preset => preset.value).value}" aria-label="Choose a custom color" tabindex="-1">
                <button type="button" class="pickColorBtn" aria-pressed="false" title="Pick a color from a note or shape">Pick</button>
                <button type="button" class="applyColorBtn">Apply</button>
            `;
            document.body.appendChild(colorPanel);
            this.colorPanelElement = colorPanel;
            this.colorPicker = colorPanel.querySelector('.colorPicker');
            this.customColorButton = colorPanel.querySelector('.customColorBtn');
            this.colorPickButton = colorPanel.querySelector('.pickColorBtn');
            colorPanel.querySelectorAll('.colorSwatch').forEach(button => {
                button.onclick = () => this.selectColor(button.dataset.color);
            });
            if (this.customColorButton && this.colorPicker) {
                this.customColorButton.onclick = () => this.colorPicker.click();
                this.colorPicker.addEventListener('input', () => this.selectColor(this.colorPicker.value));
                this.colorPicker.addEventListener('change', () => this.selectColor(this.colorPicker.value));
            }
            if (this.colorPickButton) {
                this.colorPickButton.onclick = () => this.setColorPickMode(!this.colorPickMode);
            }
            colorPanel.querySelector('.applyColorBtn').onclick = () => this.applyColor();
            this.selectColor(null);
            
            // Canvas background click for drag-select - check coordinates against note positions
            document.addEventListener("mousedown", e => {
                if (e.button !== 0) return; // Only left click
                const ignoreElement = self.isIgnoreElement(e.target);
                if (ignoreElement) return;
                if (self.shapeMode) {
                    if (self.colorMode) {
                        self.selectedShapeId = null;
                        self.renderShapes();
                        return;
                    }
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
                
                const { x: unzoomedX, y: unzoomedY } = self.screenToCanvas(e.clientX, e.clientY);
                
                // Clear selection when clicking outside any note
                self.selectedNotes = [];
                self.render();

                // The adaptive bounds always cover the camera and all notes.
                if (!self.isPointInsideCanvas(unzoomedX, unzoomedY)) {
                    return;
                }

                // Check if we clicked on a note by testing bounding boxes
                        const clickedNote = self.notes.some(note => {
                            const bounds = CanvasUtils.getItemBounds(note);
                            return unzoomedX >= bounds.left && unzoomedX <= bounds.right &&
                                   unzoomedY >= bounds.top && unzoomedY <= bounds.bottom;
                        });
                
                // If we didn't click on a note, start selection box
                if (!clickedNote) {
                    self.startSelectBox(e);
                }
            });
            
            // Mouse wheel zoom - attach to document since canvas has pointer-events:none
            document.addEventListener("wheel", e => {
                if (!e.target.closest("#toolbar,.workspaceControls")) self.handleZoom(e);
            }, { passive: false });

            // Pressing the mouse wheel centers on the selection, or all notes as a fallback.
            document.addEventListener("mousedown", e => {
                if (e.button !== 1 || e.target.closest("#toolbar,.workspaceControls,.backupControls,.exportImageButton,.canvasNavigator")) return;
                e.preventDefault();
                e.stopPropagation();
                self.centerCameraOnSelectionOrNotes();
            }, true);
            document.addEventListener("auxclick", e => {
                if (e.button !== 1 || e.target.closest("#toolbar,.workspaceControls,.backupControls,.exportImageButton")) return;
                e.preventDefault();
            }, true);
            
            // Keyboard shortcuts
            document.addEventListener("pointerdown", () => self.finishKeyboardMove(), true);
            document.addEventListener("keyup", e => {
                if (e.key.startsWith("Arrow")) self.finishKeyboardMove();
            });
            window.addEventListener("blur", () => self.finishKeyboardMove());
            document.addEventListener("keydown", e => {
                const activeElement = document.activeElement;
                const activeTag = activeElement && activeElement.tagName;
                const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || activeElement.isContentEditable;
                if (!e.repeat || !e.key.startsWith("Arrow") || typing) self.finishKeyboardMove();
                const matchesShortcut = action => window.AppSettings && window.AppSettings.matchesShortcut(e, action);
                const redoShortcut = matchesShortcut("redo");
                const undoShortcut = matchesShortcut("undo");
                const historyShortcut = redoShortcut ? "redo" : undoShortcut ? "undo" : null;
                const historyAllowedWhileTyping = historyShortcut && window.AppSettings.shortcutUsesModifier(historyShortcut);
                if (historyShortcut && (!typing || historyAllowedWhileTyping)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.target && e.target.classList &&
                        (e.target.classList.contains("noteTitleInput") || e.target.classList.contains("shapeTitleInput"))) {
                        e.target.blur();
                    }
                    if (historyShortcut === "redo") {
                        self.redo();
                    } else {
                        self.undo();
                    }
                    return;
                }

                if (typing) return;

                if (matchesShortcut("deleteSelection") && self.shapeMode && self.selectedShapeId) {
                    e.preventDefault();
                    self.deleteShape(self.selectedShapeId);
                    return;
                }
                if (matchesShortcut("deleteSelection") && self.selectedNotes.length > 0) {
                    e.preventDefault();
                    self.deleteSelectedNotes();
                    return;
                }
                if (!self.selectedNotes.length) {
                    if (matchesShortcut("addConnections")) {
                        e.preventDefault();
                        self.toggleAddMode();
                        return;
                    }
                    if (matchesShortcut("removeConnections")) {
                        e.preventDefault();
                        self.toggleRemoveMode();
                        return;
                    }
                    if (matchesShortcut("colorMode")) {
                        e.preventDefault();
                        self.toggleColorMode();
                        return;
                    }
                    if (matchesShortcut("shapesMode")) {
                        e.preventDefault();
                        self.toggleShapesMode();
                        return;
                    }
                }
                if (matchesShortcut("newNode")) {
                    e.preventDefault();
                    self.createNote();
                    return;
                }
                if (self.moveSelectionWithArrow(e)) e.preventDefault();
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
            });
            
            // Right-click pan
            document.addEventListener("contextmenu", e => e.preventDefault());
            document.addEventListener("mousedown", e => {
                if (e.button === 2) {
                    const ignoreElement = e.target.closest("#toolbar,.workspaceControls,.backupControls,.exportImageButton,.canvasNavigator");
                    if (ignoreElement) return;
                    // Right-click always starts panning (add-mode uses left-click like remove-mode)
                    self.startPan(e);
                }
            });

            ["beforeunload", "pagehide"].forEach(event => {
                window.addEventListener(event, () => {
                    self.commitHistoryTransaction();
                    self.saveBoard();
                });
            });
            window.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden") {
                    self.saveBoard();
                }
            });
            window.addEventListener("resize", () => {
                window.WorkspaceUI?.syncToolbarHeight();
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
                const { x, y } = self.screenToCanvas(e.clientX, e.clientY);

                const file = e.dataTransfer.files[0];
                if (!file.type.startsWith("image/")) return;

                const reader = new FileReader();
                reader.onload = () => {
                    // create note and set its aspect ratio based on a temporary Image
                    const dataUrl = reader.result;
                    const img = new Image();
                    img.onload = () => {
                        self.createNoteAt(x, y, {
                            title: "",
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
            
            window.WorkspaceUI?.init();
            window.DrawingLayer?.init();
            self.applyTransform();
        }
    }
};

window.VisualNotes = VisualNotes;
