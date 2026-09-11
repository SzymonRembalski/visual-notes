const DrawingLayer = {
    tool: null,
    pointerId: null,
    stroke: null,
    previousPoint: null,
    elements: new Map(),
    normalize(strokes) {
        if (!Array.isArray(strokes)) return [];
        return strokes.filter(stroke => stroke && Array.isArray(stroke.points)).map(stroke => ({
            color: /^#[0-9a-f]{6}$/i.test(stroke.color || "") ? stroke.color : "#91bda0",
            width: Number.isFinite(stroke.width) ? Math.max(1, Math.min(30, stroke.width)) : 4,
            points: stroke.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
                .map(({ x, y }) => ({ x, y }))
        })).filter(stroke => stroke.points.length);
    },
    getBounds(strokes) {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        strokes.forEach(stroke => stroke.points.forEach(point => {
            const padding = stroke.width / 2;
            left = Math.min(left, point.x - padding);
            top = Math.min(top, point.y - padding);
            right = Math.max(right, point.x + padding);
            bottom = Math.max(bottom, point.y + padding);
        }));
        return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
    },
    path(stroke) {
        return stroke.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ") +
            (stroke.points.length === 1 ? "l0.01 0" : "");
    },
    addElement(stroke) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", this.path(stroke));
        path.setAttribute("stroke", stroke.color);
        path.setAttribute("stroke-width", stroke.width);
        document.getElementById("drawingStrokes").appendChild(path);
        this.elements.set(stroke, { path, bounds: this.getBounds([stroke]) });
    },
    render() {
        const group = document.getElementById("drawingStrokes");
        if (!group) return;
        group.replaceChildren();
        this.elements.clear();
        VisualNotes.drawings.forEach(stroke => this.addElement(stroke));
        this.syncView();
    },
    syncView() {
        const layer = document.getElementById("drawingLayer");
        if (!layer) return;
        layer.style.display = VisualNotes.drawingsVisible ? "block" : "none";
        layer.setAttribute("aria-hidden", String(!VisualNotes.drawingsVisible));
        document.getElementById("drawingStrokes").setAttribute("transform",
            `translate(${VisualNotes.panX} ${VisualNotes.panY}) scale(${VisualNotes.zoom})`);
    },
    updateControls() {
        const active = Boolean(this.tool);
        document.body.classList.toggle("drawing-mode-active", active);
        document.body.classList.toggle("drawing-eraser-active", this.tool === "eraser");
        document.getElementById("drawingControls").hidden = !active;
        document.getElementById("drawingPen").setAttribute("aria-pressed", String(this.tool === "pen"));
        document.getElementById("drawingEraser").setAttribute("aria-pressed", String(this.tool === "eraser"));
        const toggle = document.getElementById("drawingVisibilityBtn");
        toggle.textContent = VisualNotes.drawingsVisible ? "Hide drawings" : "Show drawings";
        toggle.setAttribute("aria-pressed", String(VisualNotes.drawingsVisible));
        VisualNotes.updateToggleButton("drawBtn", active, "Draw: ON", "Draw");
    },
    setTool(tool) {
        if (this.tool === tool) return;
        this.finish();
        if (tool) WorkspaceUI.selectTool();
        this.tool = tool;
        if (tool) {
            VisualNotes.selectedNotes = [];
            VisualNotes.selectedNote = null;
            VisualNotes.render();
        }
        if (tool && !VisualNotes.drawingsVisible) {
            VisualNotes.drawingsVisible = true;
            VisualNotes.saveBoard();
        }
        this.syncView();
        this.updateControls();
    },
    toggleTool() {
        this.setTool(this.tool ? null : "pen");
    },
    toggleVisibility() {
        this.finish();
        VisualNotes.drawingsVisible = !VisualNotes.drawingsVisible;
        if (!VisualNotes.drawingsVisible) this.setTool(null);
        this.syncView();
        this.updateControls();
        VisualNotes.saveBoard();
    },
    point(event) {
        const point = VisualNotes.screenToCanvas(event.clientX, event.clientY);
        return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
    },
    start(event) {
        if (!this.tool || event.button !== 0 || this.pointerId !== null) return;
        event.preventDefault();
        VisualNotes.finishZoomAnimation();
        VisualNotes.commitHistoryTransaction();
        VisualNotes.beginHistoryTransaction();
        this.pointerId = event.pointerId;
        this.previousPoint = this.point(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        if (this.tool === "pen") {
            this.stroke = { color: document.getElementById("drawingColor").value,
                width: Number(document.getElementById("drawingSize").value), points: [this.previousPoint] };
            VisualNotes.drawings.push(this.stroke);
            this.addElement(this.stroke);
        } else {
            this.erase(this.previousPoint, this.previousPoint);
        }
    },
    move(event) {
        if (event.pointerId !== this.pointerId) return;
        event.preventDefault();
        const events = event.getCoalescedEvents?.() || [];
        (events.length ? events : [event]).forEach(sample => {
            const point = this.point(sample);
            if (this.stroke) {
                const last = this.stroke.points[this.stroke.points.length - 1];
                if (Math.hypot(point.x - last.x, point.y - last.y) * VisualNotes.zoom < 1.5) return;
                this.stroke.points.push(point);
            } else {
                this.erase(this.previousPoint, point);
            }
            this.previousPoint = point;
        });
        if (this.stroke) this.elements.get(this.stroke).path.setAttribute("d", this.path(this.stroke));
    },
    finish(event) {
        if (this.pointerId === null || (event && event.pointerId !== this.pointerId)) return;
        if (event?.type === "pointerup") this.move(event);
        const pointerId = this.pointerId;
        this.pointerId = null;
        if (this.stroke) this.elements.get(this.stroke).bounds = this.getBounds([this.stroke]);
        this.stroke = null;
        const layer = document.getElementById("drawingLayer");
        if (layer.hasPointerCapture(pointerId)) layer.releasePointerCapture(pointerId);
        if (VisualNotes.commitHistoryTransaction()) VisualNotes.saveBoard();
    },
    pointSegmentDistance(point, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        const fraction = lengthSquared ? Math.max(0, Math.min(1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
        return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy);
    },
    erase(from, to) {
        const radius = 12 / VisualNotes.zoom;
        VisualNotes.drawings = VisualNotes.drawings.filter(stroke => {
            const { bounds, path } = this.elements.get(stroke);
            if (Math.max(from.x, to.x) + radius < bounds.x || Math.min(from.x, to.x) - radius > bounds.x + bounds.width ||
                Math.max(from.y, to.y) + radius < bounds.y || Math.min(from.y, to.y) - radius > bounds.y + bounds.height) return true;
            const hit = stroke.points.some((a, index) => {
                const b = stroke.points[index + 1] || a;
                return CanvasUtils.lineIntersects(from, to, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }) ||
                    Math.min(this.pointSegmentDistance(from, a, b), this.pointSegmentDistance(to, a, b),
                        this.pointSegmentDistance(a, from, to), this.pointSegmentDistance(b, from, to)) <= radius + stroke.width / 2;
            });
            if (hit) { path.remove(); this.elements.delete(stroke); }
            return !hit;
        });
    },
    drawToContext(context, strokes) {
        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        strokes.forEach(stroke => {
            context.strokeStyle = stroke.color;
            context.lineWidth = stroke.width;
            context.stroke(new Path2D(this.path(stroke)));
        });
        context.restore();
    },
    init() {
        const layer = document.getElementById("drawingLayer");
        layer.addEventListener("pointerdown", event => this.start(event));
        layer.addEventListener("pointermove", event => this.move(event));
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => layer.addEventListener(type, event => this.finish(event)));
        window.addEventListener("blur", () => this.finish());
        document.addEventListener("visibilitychange", () => { if (document.hidden) this.finish(); });
        this.updateControls();
        this.render();
    }
};
window.DrawingLayer = DrawingLayer;
