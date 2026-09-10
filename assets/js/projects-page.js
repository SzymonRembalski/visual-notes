const ProjectsPage = {
    projects: [],
    createProject() {
        const title = prompt("Project title:", "New Project");
        if (title === null) return;
        const project = ProjectManager.createProject({ title: title.trim() || "New Project" });
        window.location.href = `visual-notes.html?projectId=${encodeURIComponent(project.id)}`;
    },
    init() {
        const list = document.getElementById("projectList");
        if (!list) return;
        this.projects = ProjectManager.loadProjects();
        document.getElementById("newProjectButton").onclick = () => this.createProject();
        document.getElementById("projectSearch").oninput = () => this.render();
        document.getElementById("projectSort").onchange = () => this.render();
        document.getElementById("appearanceToggle").onclick = () => AppSettings.toggleAppearance();
        window.addEventListener("pageshow", event => {
            if (!event.persisted) return;
            this.projects = ProjectManager.loadProjects();
            this.render();
        });
        list.onclick = event => {
            if (event.target.closest("[data-create-project]")) this.createProject();
            if (event.target.closest("[data-clear-search]")) {
                const search = document.getElementById("projectSearch");
                search.value = "";
                this.render();
                search.focus();
            }
            const button = event.target.closest(".deleteProjectButton");
            if (button && confirm("Delete this project?")) {
                ProjectManager.deleteProject(button.dataset.id);
                this.projects = ProjectManager.loadProjects();
                this.render();
                document.getElementById("newProjectButton").focus();
            }
        };
        AppSettings.applyTheme();
        this.render();
    },
    title(project) {
        return typeof project.title === "string" && project.title.trim() ? project.title : "Untitled Project";
    },
    timestamp(project, field = "modifiedAt") {
        const value = Number(project[field] || project.createdAt);
        return Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? value : 0;
    },
    preview(project) {
        // Bound thumbnail detail; opening a board still shows every item.
        const items = values => (Array.isArray(values) ? values : []).filter(item =>
            item && Number.isFinite(item.x) && Number.isFinite(item.y));
        const notes = items(project.notes).slice(0, 80);
        const shapes = items(project.shapes).slice(0, 20);
        if (!notes.length && !shapes.length) {
            return `<div class="projectPreview projectPreviewEmpty">${AppIcons.icon("node")}<span>A fresh canvas</span></div>`;
        }
        const bounds = CanvasUtils.getNotesBounds([...notes, ...shapes]);
        const padding = Math.max(60, Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * 0.12);
        const byId = new Map(notes.map(note => [note.id, note]));
        const colorStyle = color => /^#[0-9a-f]{6}$/i.test(color || "") ? ` style="--preview-color:${color}"` : "";
        const rectangles = (values, className) => values.map(item => {
            const box = CanvasUtils.getItemBounds(item);
            return `<rect class="${className}" x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="12"${colorStyle(item.color)}/>`;
        }).join("");
        const connections = (Array.isArray(project.connections) ? project.connections : []).slice(0, 240).map(connection => {
            const a = byId.get(connection?.a), b = byId.get(connection?.b);
            return a && b ? `<path class="previewConnection" d="${CanvasUtils.getOrthogonalConnection(a, b).path}"/>` : "";
        }).join("");
        return `<div class="projectPreview"><svg viewBox="${bounds.left - padding} ${bounds.top - padding} ${bounds.right - bounds.left + padding * 2} ${bounds.bottom - bounds.top + padding * 2}" fill="none" aria-hidden="true">
            ${rectangles(shapes, "previewGroup")}${connections}${rectangles(notes, "previewNode")}
        </svg></div>`;
    },
    render() {
        const query = document.getElementById("projectSearch").value.trim().toLocaleLowerCase();
        const sort = document.getElementById("projectSort").value;
        const projects = this.projects.filter(project => this.title(project).toLocaleLowerCase().includes(query));
        projects.sort((a, b) => sort === "name" ? this.title(a).localeCompare(this.title(b), undefined, { numeric: true })
            : this.timestamp(b, sort === "created" ? "createdAt" : "modifiedAt") - this.timestamp(a, sort === "created" ? "createdAt" : "modifiedAt"));
        document.getElementById("projectCount").textContent = query ? `${projects.length} of ${this.projects.length} projects` : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
        const list = document.getElementById("projectList");
        list.innerHTML = projects.map(project => {
            const title = escapeHtml(this.title(project));
            const time = this.timestamp(project);
            const date = time ? new Date(time) : null;
            const modified = date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not dated";
            const count = Array.isArray(project.notes) ? project.notes.length : 0;
            return `<article class="project-card" data-id="${escapeHtml(project.id)}">
                <a class="openProjectButton" href="visual-notes.html?projectId=${encodeURIComponent(project.id)}" aria-label="Open ${title}" data-backup-before-leave>
                    ${this.preview(project)}
                    <div class="projectCardHeading"><div><h2>${title}</h2><p>${count} ${count === 1 ? "node" : "nodes"}</p></div><span class="projectOpenArrow">${AppIcons.icon("arrow")}</span></div>
                </a>
                <div class="projectCardFooter"><span title="${date ? escapeHtml(date.toLocaleString()) : "No saved date"}">Edited ${escapeHtml(modified)}</span><button type="button" class="deleteProjectButton" data-id="${escapeHtml(project.id)}" aria-label="Delete ${title}">${AppIcons.icon("trash")}<span>Delete</span></button></div>
            </article>`;
        }).join("") || `<div class="projectsEmpty"><div class="projectsEmptyIcon">${AppIcons.icon(query ? "search" : "waypoints")}</div>
            <h2>${query ? "No projects found" : "Make room for an idea"}</h2>
            <p>${query ? "Try a different name or clear your search." : "Start with a node. See where it takes you."}</p>
            <button type="button" ${query ? "data-clear-search" : "data-create-project"}>${query ? "Clear search" : "Create your first project"}</button></div>`;
    }
};
window.ProjectsPage = ProjectsPage;
