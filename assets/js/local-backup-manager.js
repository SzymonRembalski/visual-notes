const LocalBackupManager = {
    format: "visual-notes-backup",
    version: 1,
    databaseName: "visualNotesFileBackups",
    handleStoreName: "handles",
    handleKey: "workspaceBackup",
    storageKeys: [
        "visualProjects", "tasksV2", "categoriesV2", "tasks", "categories",
        "visualNotes", "visualConnections", "visualShapes", "visualTitle",
        "visualCoordinateVersion", "visualPanX", "visualPanY", "visualZoom"
    ],
    jsonStorageKeys: new Set([
        "visualProjects", "tasksV2", "categoriesV2", "tasks", "categories",
        "visualNotes", "visualConnections", "visualShapes"
    ]),
    arrayStorageKeys: new Set([
        "visualProjects", "tasksV2", "categoriesV2", "tasks", "categories",
        "visualNotes", "visualConnections", "visualShapes"
    ]),
    fileHandle: null,
    backupIntervalMs: 5 * 60 * 1000,
    backupIntervalId: null,
    dirty: false,
    writing: false,
    writeQueued: false,
    queuedUserInitiated: false,
    panel: null,
    statusElement: null,
    restoreNoticeShown: false,

    buildBackup() {
        const data = {};
        this.storageKeys.forEach(key => {
            data[key] = localStorage.getItem(key);
        });
        return {
            format: this.format,
            version: this.version,
            exportedAt: new Date().toISOString(),
            data
        };
    },

    serializeBackup() {
        return JSON.stringify(this.buildBackup(), null, 2) + "\n";
    },

    getBackupFileName() {
        const activeTitle = window.VisualNotes && typeof window.VisualNotes.projectTitle === "string"
            ? window.VisualNotes.projectTitle
            : "Visual Notes";
        const safeTitle = activeTitle
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^[.\s_]+|[.\s_]+$/g, "")
            .slice(0, 80) || "Visual_Notes";
        return `${safeTitle}_backup.json`;
    },

    validateBackup(backup) {
        if (!backup || backup.format !== this.format || backup.version !== this.version ||
            !backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
            throw new Error("This is not a supported Visual Notes backup file.");
        }
        this.storageKeys.forEach(key => {
            const value = backup.data[key];
            if (value !== null && value !== undefined && typeof value !== "string") {
                throw new Error(`The backup contains an invalid ${key} value.`);
            }
            if (this.jsonStorageKeys.has(key) && typeof value === "string") {
                const parsed = JSON.parse(value);
                if (this.arrayStorageKeys.has(key) && !Array.isArray(parsed)) {
                    throw new Error(`The backup contains an invalid ${key} value.`);
                }
            }
        });
        return backup;
    },

    restoreBackup(backup) {
        this.validateBackup(backup);
        this.storageKeys.forEach(key => {
            const value = backup.data[key];
            if (value === null || value === undefined) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
            }
        });
    },

    finishRestore(backup) {
        if (window.VisualNotes) window.VisualNotes.suspendPersistence = true;

        if (window.VisualNotes && document.getElementById("canvas")) {
            const projectId = new URLSearchParams(window.location.search).get("projectId");
            if (projectId) {
                const projects = backup.data.visualProjects
                    ? JSON.parse(backup.data.visualProjects)
                    : [];
                const projectWasRestored = projects.some(project => String(project.id) === String(projectId));
                if (!projectWasRestored) {
                    window.location.replace("projects.html?backupRestored=1");
                    return;
                }
            }
        }
        const destination = new URL(window.location.href);
        destination.searchParams.set("backupRestored", "1");
        window.location.replace(destination.href);
    },

    downloadBackup() {
        const contents = this.serializeBackup();
        const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = this.getBackupFileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        this.setStatus("Backup downloaded", "success");
    },

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(this.handleStoreName)) {
                    request.result.createObjectStore(this.handleStoreName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async storeHandle(handle) {
        const database = await this.openDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(this.handleStoreName, "readwrite");
            transaction.objectStore(this.handleStoreName).put(handle, this.handleKey);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    },

    async loadHandle() {
        const database = await this.openDatabase();
        const handle = await new Promise((resolve, reject) => {
            const transaction = database.transaction(this.handleStoreName, "readonly");
            const request = transaction.objectStore(this.handleStoreName).get(this.handleKey);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        database.close();
        return handle;
    },

    async connectFile() {
        if (!("showSaveFilePicker" in window)) {
            this.downloadBackup();
            return;
        }
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: this.getBackupFileName(),
                types: [{
                    description: "Visual Notes backup",
                    accept: { "application/json": [".json"] }
                }]
            });
            this.fileHandle = handle;
            try {
                await this.storeHandle(handle);
            } catch (error) {
                // The selected file can still be used for this session when a
                // browser does not allow file handles to be stored in IndexedDB.
            }
            if (await this.writeToFile(true)) this.renderStatus(true);
        } catch (error) {
            if (error && error.name !== "AbortError") this.setStatus("Could not connect the backup file", "error");
        }
    },

    async hasWritePermission(request = false) {
        if (!this.fileHandle) return false;
        if (typeof this.fileHandle.queryPermission !== "function") return true;
        try {
            let permission = await this.fileHandle.queryPermission({ mode: "readwrite" });
            if (permission !== "granted" && request) {
                permission = await this.fileHandle.requestPermission({ mode: "readwrite" });
            }
            return permission === "granted";
        } catch (error) {
            return false;
        }
    },

    async writeToFile(userInitiated = false) {
        if (!this.fileHandle || this.writing) {
            if (this.writing) {
                this.writeQueued = true;
                this.queuedUserInitiated = this.queuedUserInitiated || userInitiated;
            }
            return false;
        }
        if (!(await this.hasWritePermission(userInitiated))) {
            this.setStatus("Reconnect the backup file to resume automatic saving", "warning");
            return false;
        }
        const hadPendingChanges = this.dirty;
        this.dirty = false;
        this.writing = true;
        try {
            const writable = await this.fileHandle.createWritable();
            await writable.write(this.serializeBackup());
            await writable.close();
            this.setStatus(`Saved to ${this.fileHandle.name}`, "success");
            return true;
        } catch (error) {
            this.dirty = this.dirty || hadPendingChanges;
            this.setStatus("Automatic backup failed—download a manual backup", "error");
            return false;
        } finally {
            this.writing = false;
            if (this.writeQueued) {
                const queuedUserInitiated = this.queuedUserInitiated;
                this.writeQueued = false;
                this.queuedUserInitiated = false;
                this.writeToFile(queuedUserInitiated);
            }
        }
    },

    notifyChange() {
        this.dirty = true;
    },

    runScheduledBackup() {
        if (!this.dirty || !this.fileHandle) return Promise.resolve(false);
        return this.writeToFile(false);
    },

    startBackupInterval() {
        clearInterval(this.backupIntervalId);
        this.backupIntervalId = setInterval(() => this.runScheduledBackup(), this.backupIntervalMs);
    },

    saveApplicationState() {
        if (window.VisualNotes && document.getElementById("canvas")) {
            window.VisualNotes.commitHistoryTransaction();
            window.VisualNotes.saveBoard();
        }
    },

    async saveNow() {
        this.saveApplicationState();
        if (!this.fileHandle) {
            await this.connectFile();
            return;
        }
        await this.writeToFile(true);
    },

    async saveBeforeNavigation(link) {
        this.saveApplicationState();
        if (this.fileHandle) await this.writeToFile(true);
        window.location.href = link.href;
    },

    async importFile(file) {
        try {
            const backup = this.validateBackup(JSON.parse(await file.text()));
            const exported = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : "an unknown date";
            if (!confirm(`Restore the backup from ${exported}?\n\nThis will replace the data currently stored in this browser.`)) return;
            this.restoreBackup(backup);
            this.finishRestore(backup);
        } catch (error) {
            alert(error instanceof SyntaxError ? "That file is not valid JSON." : error.message);
            this.setStatus("Backup was not restored", "error");
        }
    },

    setStatus(message, type = "neutral") {
        if (!this.statusElement) return;
        this.statusElement.textContent = message;
        this.statusElement.dataset.state = type;
    },

    renderStatus(permissionGranted = null) {
        if (this.fileHandle) {
            if (permissionGranted === false) {
                this.setStatus("Backup file remembered—click Save now to reconnect", "warning");
            } else {
                this.setStatus(`Automatic backup: ${this.fileHandle.name}`, "success");
            }
        } else {
            this.setStatus("Browser storage only—create a file backup for protection", "warning");
        }
    },

    createInterface() {
        const root = document.createElement("div");
        root.className = "backupControls";
        root.innerHTML = `
            <button type="button" class="backupToggle" aria-expanded="false">Backups</button>
            <section class="backupPanel" hidden aria-label="Local backup controls">
                <div class="backupPanelHeader">
                    <strong>Local backups</strong>
                    <button type="button" class="backupClose" aria-label="Close backup controls">&times;</button>
                </div>
                <p class="backupDescription">Keep a copy outside browser storage so clearing site data cannot erase your work. Changed data is written every five minutes.</p>
                <p class="backupStatus" role="status"></p>
                <div class="backupActions">
                    <button type="button" class="connectBackup">Choose auto-backup file</button>
                    <button type="button" class="saveBackupNow">Save now</button>
                    <button type="button" class="downloadBackup">Download backup</button>
                    <button type="button" class="restoreBackup">Restore backup</button>
                </div>
                <input class="backupFileInput" type="file" accept="application/json,.json" hidden>
            </section>`;
        document.body.appendChild(root);
        this.panel = root.querySelector(".backupPanel");
        this.statusElement = root.querySelector(".backupStatus");
        const toggle = root.querySelector(".backupToggle");
        const setOpen = open => {
            this.panel.hidden = !open;
            toggle.setAttribute("aria-expanded", String(open));
        };
        toggle.onclick = () => setOpen(this.panel.hidden);
        root.querySelector(".backupClose").onclick = () => setOpen(false);
        root.querySelector(".connectBackup").onclick = () => this.connectFile();
        root.querySelector(".saveBackupNow").onclick = async () => {
            await this.saveNow();
        };
        root.querySelector(".downloadBackup").onclick = () => this.downloadBackup();
        const input = root.querySelector(".backupFileInput");
        root.querySelector(".restoreBackup").onclick = () => input.click();
        input.onchange = async () => {
            if (input.files && input.files[0]) await this.importFile(input.files[0]);
            input.value = "";
        };
        if (!("showSaveFilePicker" in window)) {
            root.querySelector(".connectBackup").textContent = "Download backup file";
            root.querySelector(".saveBackupNow").hidden = true;
        }
        document.addEventListener("keydown", event => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
            event.preventDefault();
            event.stopPropagation();
            this.saveNow();
        });
        document.addEventListener("click", event => {
            const link = event.target.closest("a[data-backup-before-leave]");
            if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            this.saveBeforeNavigation(link);
        });
        this.renderStatus();
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("backupRestored") === "1") {
            currentUrl.searchParams.delete("backupRestored");
            window.history.replaceState(null, "", currentUrl.href);
            this.setStatus("Backup restored successfully", "success");
            setOpen(true);
            this.restoreNoticeShown = true;
        }
    },

    async init() {
        this.createInterface();
        this.startBackupInterval();
        if ("showSaveFilePicker" in window && "indexedDB" in window) {
            try {
                this.fileHandle = await this.loadHandle();
                if (!this.restoreNoticeShown) {
                    this.renderStatus(await this.hasWritePermission(false));
                }
            } catch (error) {
                this.fileHandle = null;
            }
        }
    }
};

window.LocalBackupManager = LocalBackupManager;
window.addEventListener("DOMContentLoaded", () => LocalBackupManager.init());
