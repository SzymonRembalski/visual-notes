const ProjectManager = {
    storageKey: "visualProjects",
    loadProjects() {
        try {
            const projects = JSON.parse(localStorage.getItem(this.storageKey));
            return Array.isArray(projects) ? projects : [];
        } catch {
            return [];
        }
    },
    saveProjects(projects) {
        localStorage.setItem(this.storageKey, JSON.stringify(projects));
        window.LocalBackupManager?.notifyChange();
    },
    getProjectById(id) {
        if (!id) return null;
        return this.loadProjects().find(project => String(project.id) === String(id)) || null;
    },
    createProject({ title, notes, connections, shapes, drawings, drawingsVisible, panX, panY, zoom, snappingEnabled, coordinateVersion }) {
        const projects = this.loadProjects();
        const project = {
            id: Date.now().toString(),
            title: typeof title === "string" ? title : "Untitled Project",
            notes: notes || [],
            connections: connections || [],
            shapes: shapes || [],
            drawings: drawings || [],
            drawingsVisible: drawingsVisible !== false,
            panX: typeof panX === "number" ? panX : null,
            panY: typeof panY === "number" ? panY : null,
            zoom: typeof zoom === "number" ? zoom : 1,
            snappingEnabled: snappingEnabled !== false,
            coordinateVersion: coordinateVersion || 2,
            createdAt: Date.now(),
            modifiedAt: Date.now()
        };
        projects.unshift(project);
        this.saveProjects(projects);
        return project;
    },
    deleteProject(id) {
        const projects = this.loadProjects().filter(project => String(project.id) !== String(id));
        this.saveProjects(projects);
    }
};

window.ProjectManager = ProjectManager;
