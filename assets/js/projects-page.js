const ProjectsPage = {
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },
    init() {
        const listContainer = document.getElementById("projectList");
        if (!listContainer) return;

        const newButton = document.getElementById("newProjectButton");
        if (newButton) {
            newButton.onclick = () => {
                const title = prompt("Project title:", "New Project") || "New Project";
                const project = ProjectManager.createProject({
                    title,
                    notes: [],
                    connections: [],
                    zoom: 1
                });
                window.location.href = `visual-notes.html?projectId=${project.id}`;
            };
        }
        this.render();
    },
    render() {
        const listContainer = document.getElementById("projectList");
        if (!listContainer) return;

        const projects = ProjectManager.loadProjects();
        listContainer.innerHTML = projects.map(project => {
            const title = typeof project.title === "string" ? project.title : "Untitled Project";
            const modified = new Date(project.modifiedAt || project.createdAt || Date.now()).toLocaleString();
            return `
                <div class="project-card" data-id="${project.id}">
                    <h2 data-placeholder="No title">${this.escapeHtml(title)}</h2>
                    <div>Saved: ${this.escapeHtml(modified)}</div>
                    <div class="project-actions">
                        <button class="button openProjectButton" data-id="${project.id}">Open</button>
                        <button class="button deleteProjectButton" data-id="${project.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join("") || "<div>No projects yet. Create one to start.</div>";

        listContainer.querySelectorAll(".openProjectButton").forEach(button => {
            button.onclick = event => {
                const id = event.currentTarget.dataset.id;
                window.location.href = `visual-notes.html?projectId=${id}`;
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

window.ProjectsPage = ProjectsPage;
