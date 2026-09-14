// Browser persistence only. Canvas migrations and rendering remain in VisualNotes.
const BoardStorage = {
    jsonFields: ["notes", "connections", "shapes", "drawings"],
    valueFields: ["drawingsVisible", "title", "coordinateVersion", "panX", "panY", "zoom", "snappingEnabled"],
    legacyKey(field) {
        return `visual${field[0].toUpperCase()}${field.slice(1)}`;
    },
    // These live data projections are serialized immediately by the local adapter.
    // A future asynchronous adapter must snapshot its payload before queuing it.
    getDocument(board) {
        return {
            title: board.projectTitle,
            notes: board.notes,
            connections: board.connections,
            shapes: board.shapes,
            drawings: board.drawings,
            coordinateVersion: board.coordinateVersion
        };
    },
    getView(board) {
        return {
            panX: board.panX, panY: board.panY, zoom: board.zoom,
            snappingEnabled: board.snappingEnabled, drawingsVisible: board.drawingsVisible
        };
    },
    load(projectId) {
        if (window.ServerBoard?.active) return window.ServerBoard.project;
        if (projectId) return ProjectManager.getProjectById(projectId);
        const data = Object.fromEntries([...this.jsonFields, ...this.valueFields]
            .map(field => [field, localStorage.getItem(this.legacyKey(field))]));
        data.drawings ||= "[]";
        this.jsonFields.forEach(field => { data[field] = JSON.parse(data[field]) || []; });
        return data;
    },
    save(projectId, document, view) {
        if (window.ServerBoard?.active) return window.ServerBoard.save(document, view);
        const data = { ...document, ...view };
        if (projectId) {
            const projects = ProjectManager.loadProjects();
            const index = projects.findIndex(project => String(project.id) === String(projectId));
            const project = { ...data, id: projectId, modifiedAt: Date.now() };
            if (index >= 0) projects[index] = { ...projects[index], ...project };
            else projects.unshift(project);
            ProjectManager.saveProjects(projects);
        } else {
            this.jsonFields.forEach(field => localStorage.setItem(this.legacyKey(field), JSON.stringify(data[field])));
            this.valueFields.forEach(field => localStorage.setItem(this.legacyKey(field), String(data[field])));
            window.LocalBackupManager?.notifyChange();
        }
    }
};
window.BoardStorage = BoardStorage;
