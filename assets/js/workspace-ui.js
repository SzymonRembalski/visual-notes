const WorkspaceUI = {
    syncToolbarHeight() {
        CanvasUtils.toolbarHeight = document.getElementById("toolbar").offsetHeight;
        document.documentElement.style.setProperty("--toolbar-height", `${CanvasUtils.toolbarHeight}px`);
    },
    selectTool() {
        window.DrawingLayer?.setTool(null);
        if (VisualNotes.colorMode) VisualNotes.toggleColorMode();
        if (VisualNotes.shapeMode) VisualNotes.setShapeMode(false);
        VisualNotes.setConnectionMode("add", false);
        VisualNotes.setConnectionMode("remove", false, true);
        this.update();
    },
    update() {
        const board = window.VisualNotes;
        if (!board) return;
        const count = board.shapeMode ? Number(Boolean(board.selectedShapeId)) : board.selectedNotes.length;
        const zoom = board.zoomAnimationTarget?.zoom || board.zoom;
        const drawing = window.DrawingLayer?.tool;
        const state = [board.addMode, board.removeMode, board.shapeMode, board.colorMode, drawing, count, Math.round(zoom * 100)].join();
        if (state === this.lastState) return;
        this.lastState = state;
        const active = { select: !board.addMode && !board.removeMode && !board.shapeMode && !board.colorMode && !drawing,
            connect: board.addMode, shapes: board.shapeMode, color: board.colorMode, draw: Boolean(drawing) };
        document.querySelectorAll("[data-tool]").forEach(button => {
            if (button.dataset.tool === "node") return;
            button.setAttribute("aria-pressed", String(Boolean(active[button.dataset.tool])));
        });
        if (board.colorPanelElement) {
            const visible = !drawing && (board.colorMode || (count && !board.addMode && !board.removeMode));
            board.colorPanelElement.style.display = visible ? "flex" : "none";
            board.colorPanelElement.querySelector(".colorSelectionLabel").textContent =
                count ? `${count} ${board.shapeMode ? "group" : count === 1 ? "node" : "nodes"}` : "Select a node or group";
            board.colorPanelElement.querySelector(".applyColorBtn").disabled = !count;
        }
        document.getElementById("zoomLevel").textContent = `${Math.round(zoom * 100)}%`;
        document.getElementById("zoomOut").disabled = zoom <= CanvasUtils.minimumZoom;
        document.getElementById("zoomIn").disabled = zoom >= CanvasUtils.maximumZoom;
        const hint = document.getElementById("workspaceHint");
        hint.textContent = drawing ? (drawing === "eraser" ? "Sweep across strokes to erase · Ctrl/Cmd Z to undo" : "Draw freely · Right-drag to pan")
            : board.removeMode ? "Drag across connections to remove" : board.addMode ? "Drag between nodes to connect"
            : board.shapeMode ? "Drag empty canvas to draw a group" : "Right-drag to pan · Scroll to zoom";
    },
    init() {
        const actions = [
            ["select", "Select", () => this.selectTool()],
            ["node", "New node", () => { this.selectTool(); VisualNotes.createNote(); }],
            ["connect", "Connect", () => VisualNotes.toggleAddMode()],
            ["shapes", "Shapes", () => VisualNotes.toggleShapesMode()],
            ["color", "Color", () => VisualNotes.toggleColorMode()],
            ["draw", "Draw", () => DrawingLayer.toggleTool()]
        ];
        const dock = document.getElementById("quickTools");
        actions.forEach(([name, label, action]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.tool = name;
            button.title = label;
            button.setAttribute("aria-label", label);
            button.innerHTML = `${AppIcons.icon(name)}<span>${label}</span>`;
            button.onclick = action;
            dock.appendChild(button);
        });
        document.getElementById("centerView").innerHTML = AppIcons.icon("center");
        document.getElementById("centerView").onclick = () => VisualNotes.centerCameraOnSelectionOrNotes();
        ["zoomOut", "zoomIn"].forEach((id, index) => {
            document.getElementById(id).onclick = () => VisualNotes.handleZoom({ deltaY: index ? -1 : 1, preventDefault() {} });
        });
        this.lastState = null;
        this.update();
    }
};
window.WorkspaceUI = WorkspaceUI;
