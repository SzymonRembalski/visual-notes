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
    createProject({ title, notes, connections, panX, panY, zoom, coordinateVersion }) {
        const projects = this.loadProjects();
        const project = {
            id: Date.now().toString(),
            title: title || "Untitled Project",
            notes: notes || [],
            connections: connections || [],
            panX: typeof panX === "number" ? panX : null,
            panY: typeof panY === "number" ? panY : null,
            zoom: typeof zoom === "number" ? zoom : 1,
            coordinateVersion: coordinateVersion || 2,
            createdAt: Date.now(),
            modifiedAt: Date.now()
        };
        projects.unshift(project);
        this.saveProjects(projects);
        return project;
    },
    deleteProject(id) {
        const projects = this.loadProjects();
        const filtered = projects.filter(project => String(project.id) !== String(id));
        this.saveProjects(filtered);
    }
};

window.ProjectManager = ProjectManager;
