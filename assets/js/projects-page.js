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
        document.addEventListener('pointerdown', event => {
            const menu = document.querySelector('.accountMenu');
            if (menu && !menu.contains(event.target)) menu.open = false;
        });
        document.addEventListener('keydown', event => {
            const menu = document.querySelector('.accountMenu[open]');
            if (event.key === 'Escape' && menu) { menu.open = false; menu.querySelector('summary').focus(); event.preventDefault(); }
        });
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
        const storageBar = document.getElementById('projectStorage');
        const user = ServerAPI.user;
        const name = user?.displayName || 'Your account';
        const initials = name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] || '').join('').toLocaleUpperCase();
        bar.hidden = false;
        document.querySelector('.appHeader nav > [data-settings-link]').hidden = Boolean(user);
        bar.innerHTML = user ? `<details class="accountMenu"><summary aria-label="Account menu for ${escapeHtml(name)}"><span class="accountAvatar" aria-hidden="true">${escapeHtml(initials)}</span><span class="accountName">${escapeHtml(name)}</span>${AppIcons.icon('down')}</summary>
            <div class="accountDropdown"><div class="accountIdentity"><strong>${escapeHtml(name)}</strong><span>Signed in with Google</span></div>
            <button data-account="code">${AppIcons.icon('copy')}Copy my sharing code</button><p class="accountFeedback" role="status" hidden></p>
            <a href="settings.html" data-settings-link>Settings${AppIcons.icon('arrow')}</a>
            <div class="accountMenuDivider"></div><button data-account="logout">${AppIcons.icon('logout')}Sign out</button></div></details><input type="file" accept=".json,application/json" hidden>`
            : `<button class="accountSignIn" data-account="login" aria-label="Sign in with Google">${AppIcons.icon('user')}Sign in</button>`;
        storageBar.hidden = false;
        storageBar.innerHTML = `<div class="storageChoices" role="group" aria-label="Project location"><button data-storage="server" aria-pressed="${this.remote}">${AppIcons.icon('cloud')}Account projects</button><button data-storage="local" aria-pressed="${!this.remote}">On this device</button></div>
            ${user ? `<div class="projectStorageActions"><button data-account="file">${AppIcons.icon('upload')}Import project</button>${this.remote ? `<button data-account="refresh" aria-label="Refresh projects" title="Refresh projects">${AppIcons.icon('refresh')}</button>` : ''}</div>` : ''}`;
        const menu = bar.querySelector('.accountMenu');
        if (user?.pictureUrl) {
            const avatar = bar.querySelector('.accountAvatar');
            const image = new Image(); image.alt = ''; image.referrerPolicy = 'no-referrer';
            image.onload = () => avatar.replaceChildren(image);
            image.src = user.pictureUrl;
        }
        if (menu) menu.onfocusout = event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false; };
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
        bar.onclick = storageBar.onclick = event => {
            const button = event.target.closest('[data-storage], [data-account]');
            if (!button) return;
            return this.run(async () => {
                const { storage, account } = button.dataset;
                if (storage) {
                    this.remote = storage === 'server';
                    history.replaceState(null, '', `projects.html?storage=${storage}`);
                    this.account(); this.message(''); await this.reload();
                    document.querySelector(`[data-storage="${storage}"]`).focus();
                }
                if (account === 'login') ServerAPI.signIn();
                if (account === 'refresh') await this.reload();
                if (account === 'file') fileInput.click();
                if (account === 'code') {
                    const feedback = bar.querySelector('.accountFeedback'); feedback.hidden = false;
                    try { await navigator.clipboard.writeText(ServerAPI.user.id); feedback.textContent = 'Copied. Send it to the project owner.'; }
                    catch { feedback.textContent = `Your sharing code: ${ServerAPI.user.id}`; }
                }
                if (account === 'logout') {
                    await ServerAPI.request('logout', { method: 'POST' }); ServerAPI.user = null;
                    this.projects = []; this.account(); await this.reload();
                    bar.querySelector('[data-account="login"]').focus();
                }
            });
        };
        AppSettings.configureSettingsNavigation();
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
            document.querySelector('.projectsFooter').textContent = this.remote ? ServerAPI.user ? 'Saved to your account. Projects shared with you appear here too.' : 'Sign in to access your saved projects and projects shared with you.' : 'Your ideas stay on this device. Save a copy to your account whenever you choose.';
            if (this.remote && !ServerAPI.user) document.getElementById('projectList').innerHTML = '<div class="projectsEmpty"><h2>Your projects, wherever you are</h2><p>Sign in with Google to open your saved and shared projects.</p></div>';
        } catch (error) { if (request === this.loadRequest) this.message(error.message, true); }
        this.controls();
    },
    async share(id) {
        const dialog = document.createElement('dialog');
        dialog.className = 'sharingDialog';
        dialog.innerHTML = `<form method="dialog"><button class="dialogClose" aria-label="Close">×</button></form><h2>Share project</h2><p>${escapeHtml(this.title(this.projects.find(project => project.id === id) || {}))}</p>
            <form id="sharingForm"><label>Name or sharing code<input name="account" required maxlength="200" autocomplete="off" placeholder="Find a person or paste their code" aria-describedby="peopleHint"></label><p id="peopleHint" aria-live="polite">Search people who have signed in on this server.</p><div class="peopleResults" aria-label="Matching accounts"></div><label>Access<select name="role"><option value="editor">Can edit</option><option value="viewer">Can view</option></select></label><button type="submit">Share</button></form><p role="status"></p><div class="sharedPeople"></div>`;
        document.body.append(dialog);
        let selected, searchTimer, searchVersion = 0;
        dialog.addEventListener('close', () => { clearTimeout(searchTimer); searchVersion++; dialog.remove(); }); dialog.showModal();
        const form = dialog.querySelector('#sharingForm');
        const results = dialog.querySelector('.peopleResults');
        const hint = dialog.querySelector('#peopleHint');
        const sharingCode = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
        const clearSearch = () => { clearTimeout(searchTimer); searchVersion++; results.replaceChildren(); };
        form.elements.account.oninput = () => {
            selected = null; clearSearch(); status.textContent = '';
            const query = form.elements.account.value.trim(), version = searchVersion;
            if (sharingCode.test(query)) { hint.textContent = 'Sharing code ready. Choose access and share.'; return; }
            hint.textContent = query.length < 2 ? 'Type at least 2 characters to find someone.' : 'Searching…';
            if (query.length < 2) return;
            searchTimer = setTimeout(async () => {
                try {
                    const { users } = await ServerAPI.request(`projects/${id}/people?q=${encodeURIComponent(query)}`);
                    if (version !== searchVersion || !dialog.open) return;
                    hint.textContent = users.length ? 'Select a person below. Refine the name if needed.' : 'No matching people. Try another name or paste their sharing code.';
                    for (const user of users) {
                        const button = document.createElement('button'); button.type = 'button';
                        button.innerHTML = `<span class="accountAvatar" aria-hidden="true">${escapeHtml([...user.displayName.trim()][0] || '?')}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>Code ending ${escapeHtml(user.id.slice(-8))}${user.role ? ` · Can ${user.role === 'editor' ? 'edit' : 'view'}` : ''}</small></span>`;
                        if (user.pictureUrl) {
                            const image = new Image(); image.alt = ''; image.referrerPolicy = 'no-referrer';
                            image.onload = () => button.querySelector('.accountAvatar').replaceChildren(image);
                            image.src = user.pictureUrl;
                        }
                        button.onclick = () => {
                            selected = user; clearSearch(); form.elements.account.value = user.displayName;
                            hint.textContent = `Selected ${user.displayName} · Code ending ${user.id.slice(-8)}`;
                            if (user.role) form.elements.role.value = user.role;
                            form.elements.role.focus();
                        };
                        results.append(button);
                    }
                } catch (error) {
                    if (version === searchVersion && dialog.open) hint.textContent = `${error.message} You can still paste a sharing code.`;
                }
            }, 250);
        };
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
        form.onsubmit = async event => {
            event.preventDefault();
            const memberId = selected?.id || form.elements.account.value.trim().toLowerCase();
            if (!sharingCode.test(memberId)) { status.textContent = 'Select a person from the results or paste their sharing code.'; return; }
            const submit = form.querySelector('[type="submit"]');
            if (submit.disabled) return;
            submit.disabled = true;
            try {
                await ServerAPI.request(`projects/${id}/members/${encodeURIComponent(memberId)}`, { method: 'PUT', body: { role: form.elements.role.value } });
                status.textContent = 'Access saved. Checking sharing…';
                const members = await reload();
                const member = members.find(member => member.id === memberId);
                if (!member) throw new Error('Access could not be confirmed. Refresh sharing and try again.');
                status.textContent = `Shared with ${member.displayName}. They can find it under Account projects or open the project link.`; form.reset(); selected = null; clearSearch(); hint.textContent = 'Search people who have signed in on this server.';
            } catch (error) { failure(error); }
            finally { submit.disabled = false; }
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
