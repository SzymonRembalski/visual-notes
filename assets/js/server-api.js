const ServerAPI = {
    user: null,
    available: false,
    async request(path, { method = 'GET', body } = {}) {
        const headers = {};
        if (method !== 'GET') headers['X-CSRF-Token'] = this.user?.csrfToken || '';
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        let response;
        try {
            response = await fetch(`/api/${path}`, { method, headers, credentials: 'same-origin',
                signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        } catch { throw Object.assign(new Error('Cannot reach the server. Your unsaved edits are still here.'), { status: 0 }); }
        let data;
        try { data = await response.json(); } catch { data = {}; }
        if (!response.ok) throw Object.assign(new Error(data.error || 'The server could not complete this request.'), { status: response.status });
        return data;
    },
    async init() {
        if (location.protocol === 'file:') return false;
        try {
            const result = await this.request('session');
            if (!Object.hasOwn(result, 'user')) throw new Error('The account service is unavailable.');
            this.user = result.user;
            this.available = true;
            return true;
        } catch (error) {
            if (error.status === 404) return false; // Existing static hosting remains local.
            throw error;
        }
    },
    boardURL(id) { return `visual-notes.html?projectId=${encodeURIComponent(id)}&storage=server`; },
    signIn(returnTo) {
        if (returnTo) try { sessionStorage.setItem('visualServerReturn', returnTo); } catch {}
        location.href = '/auth/google/start';
    },
    returnAfterLogin() {
        if (!this.user) return false;
        let target;
        try { target = sessionStorage.getItem('visualServerReturn'); sessionStorage.removeItem('visualServerReturn'); } catch {}
        if (!target) return false;
        const url = new URL(target, location.href);
        if (url.origin !== location.origin || !url.pathname.endsWith('/visual-notes.html') ||
            url.searchParams.get('storage') !== 'server' || !/^[\da-f-]{36}$/i.test(url.searchParams.get('projectId') || '')) return false;
        location.href = url.href;
        return true;
    },
    document(project) {
        return { title: typeof project.title === 'string' ? project.title : 'Untitled Project', notes: project.notes || [],
            connections: project.connections || [], shapes: project.shapes || [], drawings: project.drawings || [],
            coordinateVersion: Number(project.coordinateVersion) || 1 };
    },
    view(project) {
        const view = {};
        for (const field of ['panX', 'panY', 'zoom']) if (Number.isFinite(project[field])) view[field] = project[field];
        for (const field of ['snappingEnabled', 'drawingsVisible']) if (typeof project[field] === 'boolean') view[field] = project[field];
        return view;
    },
    async importProject(project) {
        const key = `visualImport:${this.user.id}:${project.id}`;
        let requestId = localStorage.getItem(key);
        if (!requestId) {
            requestId = crypto.randomUUID();
            localStorage.setItem(key, requestId); // Record before sending so retries cannot duplicate a project.
        }
        const saved = await this.request('projects', { method: 'POST', body: { requestId, document: this.document(project) } });
        if (saved.revision === '1') await this.request(`projects/${saved.id}/view`, { method: 'PUT', body: this.view(project) });
        return saved;
    }
};
window.ServerAPI = ServerAPI;
