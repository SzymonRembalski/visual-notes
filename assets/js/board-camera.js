// Camera state and methods are composed into VisualNotes and share its board state.
const BoardCamera = {
    navigationAxes: [
        { axis: "x", id: "horizontalNavigator" },
        { axis: "y", id: "verticalNavigator" }
    ],
    zoom: 1,
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
    canvasBounds: { left: -800, top: -500, right: 800, bottom: 500 },
    canvasPadding: 360,
    canvasResizeStep: 250,
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
            const stored = itemsById.get(element.dataset[dataKey]);
            if (!stored) return;
            const item = window.BoardCollaboration?.displayed(stored) || stored;
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
    updateCanvasBounds(syncItems = true) {
        const next = this.calculateCanvasBounds();
        const originChanged = next.left !== this.canvasBounds.left || next.top !== this.canvasBounds.top;
        this.canvasBounds = next;
        const width = next.right - next.left;
        const height = next.bottom - next.top;
        const canvas = document.getElementById("canvas");
        const shapesLayer = document.getElementById("shapes");
        const svg = document.getElementById("connections");

        [[canvas, ".note", this.notes, "noteId"], [shapesLayer, ".canvasShape", this.shapes, "shapeId"]].forEach(([layer, selector, items, key]) => {
            if (!layer) return;
            layer.style.width = width + "px";
            layer.style.height = height + "px";
            if (syncItems || originChanged) this.syncLayerGeometry(layer, selector, items, key);
        });
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
    getVisibleCenter() {
        return this.screenToCanvas(
            window.innerWidth / 2,
            CanvasUtils.toolbarHeight + (window.innerHeight - CanvasUtils.toolbarHeight) / 2
        );
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
    getNavigationMetrics(axis, trackLength) {
        return CanvasUtils.getNavigationMetrics(
            this.notes,
            this.getViewportBounds(),
            axis,
            trackLength
        );
    },
    updateNavigationBars() {
        this.navigationAxes.forEach(({ axis, id }) => {
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
            thumb.style[axis === "x" ? "left" : "top"] = `${metrics.thumbPosition}px`;
            thumb.style[axis === "x" ? "width" : "height"] = `${metrics.thumbSize}px`;
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
        this[drag.axis === "x" ? "panX" : "panY"] = -viewportStart * this.zoom;
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
        this.navigationAxes.forEach(({ axis, id }) => {
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
        window.BoardCollaboration?.renderPresence();
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
            this.finishZoomAnimation();
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
};
window.BoardCamera = BoardCamera;
