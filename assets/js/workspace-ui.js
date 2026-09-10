const WorkspaceUI = {
    icons: {
        select: '<path d="m5 3 14 9-7 1-3 7Z"/>',
        node: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 12h8m-4-4v8"/>',
        connect: '<rect x="2" y="3" width="7" height="6" rx="2"/><rect x="15" y="15" width="7" height="6" rx="2"/><path d="M6 9v9h9"/>',
        shapes: '<rect x="3" y="3" width="14" height="14" rx="3"/><path d="M8 21h10a3 3 0 0 0 3-3V8"/>',
        color: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
        moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
        center: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>'
    },
    icon(name) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.icons[name]}</svg>`;
    },
    syncToolbarHeight() {
        CanvasUtils.toolbarHeight = document.getElementById("toolbar").offsetHeight;
        document.documentElement.style.setProperty("--toolbar-height", `${CanvasUtils.toolbarHeight}px`);
    },
    selectTool() {
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
        const state = [board.addMode, board.removeMode, board.shapeMode, board.colorMode, count, Math.round(zoom * 100)].join();
        if (state === this.lastState) return;
        this.lastState = state;
        const active = { select: !board.addMode && !board.removeMode && !board.shapeMode && !board.colorMode,
            connect: board.addMode, shapes: board.shapeMode, color: board.colorMode };
        document.querySelectorAll("[data-tool]").forEach(button => {
            if (button.dataset.tool === "node") return;
            button.setAttribute("aria-pressed", String(Boolean(active[button.dataset.tool])));
        });
        if (board.colorPanelElement) {
            const visible = board.colorMode || (count && !board.addMode && !board.removeMode);
            board.colorPanelElement.style.display = visible ? "flex" : "none";
            board.colorPanelElement.querySelector(".colorSelectionLabel").textContent =
                count ? `${count} ${board.shapeMode ? "group" : count === 1 ? "node" : "nodes"}` : "Select a node or group";
            board.colorPanelElement.querySelector(".applyColorBtn").disabled = !count;
        }
        document.getElementById("zoomLevel").textContent = `${Math.round(zoom * 100)}%`;
        document.getElementById("zoomOut").disabled = zoom <= CanvasUtils.minimumZoom;
        document.getElementById("zoomIn").disabled = zoom >= CanvasUtils.maximumZoom;
        const hint = document.getElementById("workspaceHint");
        hint.textContent = board.removeMode ? "Drag across connections to remove" : board.addMode ? "Drag between nodes to connect"
            : board.shapeMode ? "Drag empty canvas to draw a group" : "Right-drag to pan · Scroll to zoom";
    },
    init() {
        const actions = [
            ["select", "Select", () => this.selectTool()],
            ["node", "New node", () => { this.selectTool(); VisualNotes.createNote(); }],
            ["connect", "Connect", () => VisualNotes.toggleAddMode()],
            ["shapes", "Shapes", () => VisualNotes.toggleShapesMode()],
            ["color", "Color", () => VisualNotes.toggleColorMode()]
        ];
        const dock = document.getElementById("quickTools");
        actions.forEach(([name, label, action]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.tool = name;
            button.title = label;
            button.setAttribute("aria-label", label);
            button.innerHTML = `${this.icon(name)}<span>${label}</span>`;
            button.onclick = action;
            dock.appendChild(button);
        });
        document.getElementById("appearanceToggle").onclick = () => AppSettings.toggleAppearance();
        document.getElementById("centerView").innerHTML = this.icon("center");
        document.getElementById("centerView").onclick = () => VisualNotes.centerCameraOnSelectionOrNotes();
        ["zoomOut", "zoomIn"].forEach((id, index) => {
            document.getElementById(id).onclick = () => VisualNotes.handleZoom({ deltaY: index ? -1 : 1, preventDefault() {} });
        });
        AppSettings.applyTheme();
        this.lastState = null;
        this.update();
    }
};
window.WorkspaceUI = WorkspaceUI;
