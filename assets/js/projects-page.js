const ProjectsPage = {
    projects: [],
    async createProject() {
        if (this.loading || (this.remote && !ServerAPI.user)) return;
        const title = prompt("Project title:", "New Project");
        if (title === null) return;
        if (this.remote) {
            await this.run(async () => {
                const project = await ServerAPI.request('projects', { method: 'POST', body: {
                    requestId: this.createRequest ||= crypto.randomUUID(), document: ServerAPI.document({ title: title.trim() || 'New Project', coordinateVersion: 2 })
                } });
                this.createRequest = null;
                window.location.href = ServerAPI.boardURL(project.id);
            });
        } else {
            const project = ProjectManager.createProject({ title: title.trim() || "New Project" });
            window.location.href = `visual-notes.html?projectId=${encodeURIComponent(project.id)}`;
        }
    },
    async init() {
        const list = document.getElementById("projectList");
        if (!list) return;
        this.remote = false;
        document.getElementById("newProjectButton").onclick = () => this.createProject();
        document.getElementById("projectSearch").oninput = document.getElementById("projectSort").onchange = () => this.render();
        window.addEventListener("pageshow", event => {
            if (event.persisted) { this.reload(); this.startRefresh(); }
        });
        window.addEventListener('focus', () => this.refresh());
        window.addEventListener('online', () => this.refresh());
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
        window.addEventListener('pagehide', () => clearInterval(this.refreshTimer));
        list.onclick = async event => {
            if (event.target.closest("[data-create-project]")) this.createProject();
            if (event.target.closest("[data-clear-search]")) {
                const search = document.getElementById("projectSearch");
                search.value = "";
                this.render();
                search.focus();
            }
            const button = event.target.closest(".deleteProjectButton");
            if (button && confirm("Delete this project?")) {
                await this.run(async () => {
                    if (this.remote) await ServerAPI.request(`projects/${button.dataset.id}`, { method: 'DELETE', body: { expectedRevision: this.projects.find(project => project.id === button.dataset.id).revision } });
                    else ProjectManager.deleteProject(button.dataset.id);
                    await this.reload();
                    document.getElementById("newProjectButton").focus();
                });
            }
            const sharing = event.target.closest('[data-share]');
            if (sharing) await this.run(() => this.share(sharing.dataset.share));
            const importing = event.target.closest('[data-import]');
            if (importing) await this.run(async () => {
                importing.disabled = true;
                try {
                    const project = ProjectManager.getProjectById(importing.dataset.import);
                    const saved = await ServerAPI.importProject(project);
                    this.message('Saved to your account. The original is still on this device.');
                    const link = document.createElement('a'); link.href = ServerAPI.boardURL(saved.id); link.textContent = 'Open saved project';
                    document.getElementById('projectMessage').append(' ', link);
                } finally { importing.disabled = false; }
            });
        };
        this.loading = true;
        document.getElementById('newProjectButton').disabled = true;
        try {
            if (window.ServerAPI && await ServerAPI.init()) {
                if (ServerAPI.returnAfterLogin()) return;
                this.remote = new URLSearchParams(location.search).get('storage') !== 'local';
                this.account();
            }
            await this.reload();
        } catch (error) {
            this.unavailable = true;
            this.message(`${error.message} Reload to try again.`, true);
        } finally { this.loading = false; this.controls(); this.startRefresh(); }
    },
    startRefresh() {
        clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => this.refresh(), 15000);
    },
    async refresh() {
        if (!this.remote || !ServerAPI.user || document.hidden || this.loading || this.busy || this.refreshing || document.querySelector('.sharingDialog')) return;
        this.refreshing = true;
        try { await this.reload(true); } finally { this.refreshing = false; }
    },
    message(text, error = false) {
        const message = document.getElementById('projectMessage');
        message.hidden = !text; message.textContent = text; message.dataset.error = String(error);
    },
    async run(action) {
        if (this.busy) return;
        this.busy = true;
        try { await action(); } catch (error) { this.message(error.message, true); }
        finally { this.busy = false; }
    },
    controls() { document.getElementById('newProjectButton').disabled = this.unavailable || this.loading || (this.remote && !ServerAPI.user); },
    account() {
        const bar = document.getElementById('accountBar');
        bar.hidden = false;
        bar.innerHTML = `<div class="storageChoices"><button data-storage="server" aria-pressed="${this.remote}">My account</button><button data-storage="local" aria-pressed="${!this.remote}">On this device</button></div>
            <span>${ServerAPI.user ? escapeHtml(ServerAPI.user.displayName) : 'Sign in to save and share projects across devices.'}</span>
            ${this.remote && ServerAPI.user ? '<button data-account="refresh">Refresh projects</button>' : ''}
            ${ServerAPI.user ? '<button data-account="code">Copy my sharing code</button><button data-account="file">Import project file</button><input type="file" accept=".json,application/json" hidden><button data-account="logout">Sign out</button>' : '<button data-account="login">Sign in with Google</button>'}`;
        const fileInput = bar.querySelector('input[type="file"]');
        if (fileInput) fileInput.onchange = () => this.run(async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            if (file.size > 16 * 1024 * 1024) throw new Error('This file exceeds the 16 MB project limit.');
            const text = await file.text();
            const data = JSON.parse(text), document = data.document || data;
            if (!Array.isArray(document.notes) || !Array.isArray(document.connections)) throw new Error('Choose an individual project file. Restore workspace backups through a local board’s Save menu first.');
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
            await ServerAPI.importProject({ ...document, ...(data.view || {}), id: `file:${hash}` });
            this.remote = true; this.account(); await this.reload(); this.message('Project imported into your account.');
        });
        bar.onclick = event => this.run(async () => {
            const storage = event.target.dataset.storage;
            if (storage) {
                this.remote = storage === 'server';
                history.replaceState(null, '', `projects.html?storage=${storage}`);
                this.account(); this.message(''); await this.reload();
            }
            if (event.target.dataset.account === 'login') ServerAPI.signIn();
            if (event.target.dataset.account === 'refresh') await this.reload();
            if (event.target.dataset.account === 'file') fileInput.click();
            if (event.target.dataset.account === 'code') {
                try { await navigator.clipboard.writeText(ServerAPI.user.id); this.message('Sharing code copied. Send it to the project owner.'); }
                catch { prompt('Your sharing code:', ServerAPI.user.id); }
            }
            if (event.target.dataset.account === 'logout') {
                await ServerAPI.request('logout', { method: 'POST' }); ServerAPI.user = null;
                this.projects = []; this.account(); await this.reload();
            }
        });
        this.controls();
    },
    async reload(background = false) {
        const request = this.loadRequest = (this.loadRequest || 0) + 1;
        try {
            let projects;
            if (this.remote) {
                projects = [];
                if (ServerAPI.user) {
                    let offset = 0;
                    do {
                        const page = await ServerAPI.request(`projects?offset=${offset}`);
                        projects.push(...page.projects);
                        offset = page.nextOffset;
                    } while (offset !== null);
                }
            } else projects = ProjectManager.loadProjects();
            if (request !== this.loadRequest) return;
            projects = [...new Map(projects.map(project => [project.id, project])).values()];
            const changed = JSON.stringify(this.projects) !== JSON.stringify(projects);
            this.projects = projects;
            if (!background || changed) this.render();
            document.querySelector('.projectsFooter').textContent = this.remote ? 'Saved to your account. Projects shared with you appear here too.' : 'Your ideas stay on this device. Save a copy to your account whenever you choose.';
            if (this.remote && !ServerAPI.user) document.getElementById('projectList').innerHTML = '<div class="projectsEmpty"><h2>Your projects, wherever you are</h2><p>Sign in with Google to open your saved and shared projects.</p></div>';
        } catch (error) { if (request === this.loadRequest) this.message(error.message, true); }
        this.controls();
    },
    async share(id) {
        const dialog = document.createElement('dialog');
        dialog.className = 'sharingDialog';
        dialog.innerHTML = `<form method="dialog"><button class="dialogClose" aria-label="Close">×</button></form><h2>Share project</h2><p>${escapeHtml(this.title(this.projects.find(project => project.id === id) || {}))}</p><p>Ask the person to sign in and copy their sharing code from Projects on this server.</p>
            <form id="sharingForm"><label>Sharing code<input name="account" required autocomplete="off" placeholder="Paste their sharing code"></label><label>Access<select name="role"><option value="editor">Can edit</option><option value="viewer">Can view</option></select></label><button>Share</button></form><p role="status"></p><div class="sharedPeople"></div>`;
        document.body.append(dialog);
        dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
        const status = dialog.querySelector('[role="status"]');
        const link = document.createElement('button'); link.textContent = 'Copy project link';
        link.onclick = async () => {
            const url = new URL(ServerAPI.boardURL(id), location.href).href;
            try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied. Only accounts with access can open it.'; }
            catch { prompt('Project link:', url); }
        };
        dialog.append(link);
        const failure = error => { status.textContent = error.message + (error.requestId ? ` Reference: ${error.requestId}` : ''); };
        const reload = async () => {
            const data = await ServerAPI.request(`projects/${id}/members`);
            dialog.querySelector('.sharedPeople').innerHTML = data.members.map(member => `<div><span>${escapeHtml(member.displayName)} · ${member.role === 'editor' ? 'Can edit' : 'Can view'}</span><button data-remove="${member.id}">Remove access</button></div>`).join('') || '<p>Only you have access.</p>';
            return data.members;
        };
        dialog.querySelector('#sharingForm').onsubmit = async event => {
            event.preventDefault(); const form = event.target;
            form.querySelector('button').disabled = true;
            try {
                const memberId = form.elements.account.value.trim().toLowerCase();
                await ServerAPI.request(`projects/${id}/members/${encodeURIComponent(memberId)}`, { method: 'PUT', body: { role: form.elements.role.value } });
                status.textContent = 'Access saved. Checking sharing…';
                const members = await reload();
                const member = members.find(member => member.id === memberId);
                if (!member) throw new Error('Access could not be confirmed. Refresh sharing and try again.');
                status.textContent = `Shared with ${member.displayName}. They can find it under My account or open the project link.`; form.reset();
            } catch (error) { failure(error); }
            finally { form.querySelector('button').disabled = false; }
        };
        dialog.querySelector('.sharedPeople').onclick = async event => {
            if (!event.target.dataset.remove) return;
            try { await ServerAPI.request(`projects/${id}/members/${event.target.dataset.remove}`, { method: 'DELETE' }); await reload(); }
            catch (error) { failure(error); }
        };
        try { await reload(); } catch (error) { failure(error); }
    },
    title(project) {
        return typeof project.title === "string" && project.title.trim() ? project.title : "Untitled Project";
    },
    timestamp(project, field = "modifiedAt") {
        const raw = project[field] || project.createdAt;
        const value = this.remote ? Date.parse(raw) : Number(raw);
        return Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? value : 0;
    },
    preview(project) {
        if (this.remote) return `<div class="projectPreview projectPreviewEmpty">${AppIcons.icon('node')}<span>${project.role === 'owner' ? 'Your project' : 'Shared with you'}</span></div>`;
        // Bound thumbnail detail; opening a board still shows every item.
        const items = (values, limit) => {
            const result = [];
            for (const item of Array.isArray(values) ? values : []) {
                if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
                result.push(item);
                if (result.length === limit) break;
            }
            return result;
        };
        const notes = items(project.notes, 80);
        const shapes = items(project.shapes, 20);
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
        const field = sort === "created" ? "createdAt" : "modifiedAt";
        const compareNames = new Intl.Collator(undefined, { numeric: true }).compare;
        const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
        const projects = this.projects.filter(project => this.title(project).toLocaleLowerCase().includes(query));
        projects.sort((a, b) => sort === "name" ? compareNames(this.title(a), this.title(b))
            : this.timestamp(b, field) - this.timestamp(a, field));
        document.getElementById("projectCount").textContent = query ? `${projects.length} of ${this.projects.length} projects` : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
        const list = document.getElementById("projectList");
        list.innerHTML = projects.map(project => {
            const title = escapeHtml(this.title(project));
            const time = this.timestamp(project);
            const date = time ? new Date(time) : null;
            const modified = date ? dateFormat.format(date) : "Not dated";
            const count = Array.isArray(project.notes) ? project.notes.length : 0;
            return `<article class="project-card" data-id="${escapeHtml(project.id)}">
                <a class="openProjectButton" href="${this.remote ? ServerAPI.boardURL(project.id) : `visual-notes.html?projectId=${encodeURIComponent(project.id)}`}" aria-label="Open ${title}" data-backup-before-leave>
                    ${this.preview(project)}
                    <div class="projectCardHeading"><div><h2>${title}</h2><p>${this.remote ? ({ owner: 'Owner', editor: 'Can edit', viewer: 'Can view' }[project.role]) : `${count} ${count === 1 ? "node" : "nodes"}`}</p></div><span class="projectOpenArrow">${AppIcons.icon("arrow")}</span></div>
                </a>
                <div class="projectCardFooter"><span title="${date ? escapeHtml(date.toLocaleString()) : "No saved date"}">Edited ${escapeHtml(modified)}</span>
                ${this.remote && project.role === 'owner' ? `<button data-share="${project.id}">Share</button>` : ''}
                ${!this.remote && window.ServerAPI?.user ? `<button data-import="${escapeHtml(project.id)}">Save to account</button>` : ''}
                ${!this.remote || project.role === 'owner' ? `<button type="button" class="deleteProjectButton" data-id="${escapeHtml(project.id)}" aria-label="Delete ${title}">${AppIcons.icon("trash")}<span>Delete</span></button>` : ''}</div>
            </article>`;
        }).join("") || `<div class="projectsEmpty"><div class="projectsEmptyIcon">${AppIcons.icon(query ? "search" : "waypoints")}</div>
            <h2>${query ? "No projects found" : "Make room for an idea"}</h2>
            <p>${query ? "Try a different name or clear your search." : "Start with a node. See where it takes you."}</p>
            <button type="button" ${query ? "data-clear-search" : "data-create-project"}>${query ? "Clear search" : "Create your first project"}</button></div>`;
    }
};
window.ProjectsPage = ProjectsPage;
