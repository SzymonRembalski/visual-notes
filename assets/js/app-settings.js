const AppSettings = {
    storageKey: "visualAppSettings",
    defaultThemeColor: "#388e3c",
    shortcutDefinitions: [
        { id: "addConnections", label: "Add Connections", defaultBinding: "a" },
        { id: "removeConnections", label: "Remove Connections", defaultBinding: "r" },
        { id: "colorMode", label: "Color Mode", defaultBinding: "c" },
        { id: "shapesMode", label: "Shapes Mode", defaultBinding: "s" },
        { id: "newNode", label: "New Node", defaultBinding: "mod+b" },
        { id: "save", label: "Save", defaultBinding: "mod+s" },
        { id: "undo", label: "Undo", defaultBinding: "mod+z" },
        { id: "redo", label: "Redo", defaultBinding: "mod+shift+z" },
        { id: "deleteSelection", label: "Delete Selection", defaultBinding: "delete" }
    ],
    settings: null,

    getDefaultShortcuts() {
        return Object.fromEntries(this.shortcutDefinitions.map(definition => [
            definition.id,
            definition.defaultBinding
        ]));
    },

    normalizeColor(color) {
        return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toLowerCase() : this.defaultThemeColor;
    },

    normalizeKeyName(key) {
        const aliases = {
            " ": "space",
            "+": "plus",
            "-": "minus",
            spacebar: "space",
            esc: "escape",
            del: "delete"
        };
        const normalized = String(key || "").toLowerCase();
        return aliases[normalized] || normalized;
    },

    normalizeBinding(binding) {
        if (typeof binding !== "string") return null;
        const rawParts = binding.toLowerCase().split("+").map(part => part.trim()).filter(Boolean);
        const modifiers = new Set();
        let key = null;
        rawParts.forEach(part => {
            if (part === "ctrl" || part === "cmd" || part === "meta" || part === "mod") {
                modifiers.add("mod");
            } else if (part === "alt") {
                modifiers.add("alt");
            } else if (part === "shift") {
                modifiers.add("shift");
            } else {
                key = this.normalizeKeyName(part);
            }
        });
        if (!key || ["control", "meta", "alt", "shift"].includes(key)) return null;
        return ["mod", "alt", "shift"]
            .filter(modifier => modifiers.has(modifier))
            .concat(key)
            .join("+");
    },

    load() {
        const defaults = {
            themeColor: this.defaultThemeColor,
            shortcuts: this.getDefaultShortcuts()
        };
        try {
            const stored = JSON.parse(localStorage.getItem(this.storageKey));
            if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
            const shortcuts = { ...defaults.shortcuts };
            this.shortcutDefinitions.forEach(definition => {
                const normalized = this.normalizeBinding(stored.shortcuts && stored.shortcuts[definition.id]);
                if (normalized) shortcuts[definition.id] = normalized;
            });
            return {
                themeColor: this.normalizeColor(stored.themeColor),
                shortcuts
            };
        } catch {
            return defaults;
        }
    },

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
        this.applyTheme();
        if (window.LocalBackupManager) {
            window.LocalBackupManager.notifyChange();
        } else {
            sessionStorage.setItem("visualSettingsPendingBackup", "1");
        }
    },

    mixColor(color, target, amount) {
        const parse = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
        const sourceChannels = parse(color);
        const targetChannels = parse(target);
        return `#${sourceChannels.map((channel, index) =>
            Math.round(channel + (targetChannels[index] - channel) * amount)
                .toString(16)
                .padStart(2, "0")
        ).join("")}`;
    },

    getContrastColor(color) {
        const [red, green, blue] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
        const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
        return luminance > 0.58 ? "#171717" : "#ffffff";
    },

    applyTheme() {
        const color = this.normalizeColor(this.settings && this.settings.themeColor);
        const defaultTheme = color === this.defaultThemeColor;
        const root = document.documentElement;
        root.style.setProperty("--accent-color", color);
        root.style.setProperty("--accent-hover", defaultTheme ? "#4caf50" : this.mixColor(color, "#ffffff", 0.14));
        root.style.setProperty("--accent-soft", defaultTheme ? "#66bb6a" : this.mixColor(color, "#ffffff", 0.25));
        root.style.setProperty("--accent-focus", defaultTheme ? "#6ddc75" : this.mixColor(color, "#ffffff", 0.4));
        root.style.setProperty("--accent-highlight", defaultTheme ? "#8bc34a" : this.mixColor(color, "#ffffff", 0.32));
        root.style.setProperty("--accent-contrast", this.getContrastColor(color));
    },

    setThemeColor(color) {
        this.settings.themeColor = this.normalizeColor(color);
        this.save();
    },

    resetTheme() {
        this.setThemeColor(this.defaultThemeColor);
    },

    getShortcut(action) {
        return this.settings.shortcuts[action] || "";
    },

    setShortcut(action, binding) {
        if (!this.shortcutDefinitions.some(definition => definition.id === action)) return false;
        const normalized = this.normalizeBinding(binding);
        if (!normalized) return false;
        this.settings.shortcuts[action] = normalized;
        this.save();
        return true;
    },

    resetShortcut(action) {
        const definition = this.shortcutDefinitions.find(item => item.id === action);
        if (!definition) return;
        this.settings.shortcuts[action] = definition.defaultBinding;
        this.save();
    },

    resetShortcuts() {
        this.settings.shortcuts = this.getDefaultShortcuts();
        this.save();
    },

    eventToBinding(event) {
        const key = this.normalizeKeyName(event.key);
        if (!key || ["control", "meta", "alt", "shift"].includes(key)) return null;
        const parts = [];
        if (event.ctrlKey || event.metaKey) parts.push("mod");
        if (event.altKey) parts.push("alt");
        if (event.shiftKey) parts.push("shift");
        parts.push(key.length === 1 ? key.toLowerCase() : key);
        return parts.join("+");
    },

    matchesShortcut(event, action) {
        return this.eventToBinding(event) === this.getShortcut(action);
    },

    shortcutUsesModifier(action) {
        return /^(mod|alt|shift)\+/.test(this.getShortcut(action));
    },

    formatBinding(binding) {
        const names = {
            mod: "Ctrl/Cmd",
            alt: "Alt",
            shift: "Shift",
            delete: "Delete",
            escape: "Escape",
            space: "Space",
            enter: "Enter",
            backspace: "Backspace",
            tab: "Tab",
            arrowup: "Arrow Up",
            arrowdown: "Arrow Down",
            arrowleft: "Arrow Left",
            arrowright: "Arrow Right",
            plus: "+",
            minus: "−"
        };
        return String(binding || "")
            .split("+")
            .map(part => names[part] || (part.length === 1 ? part.toUpperCase() : part))
            .join(" + ");
    },

    getCurrentPageTarget() {
        const filename = window.location.pathname.split("/").pop() || "index.html";
        return `${filename}${window.location.search}`;
    },

    getSafeReturnTarget(target) {
        if (!target) return "index.html";
        try {
            const url = new URL(target, window.location.href);
            const currentDirectory = window.location.pathname.slice(0, window.location.pathname.lastIndexOf("/") + 1);
            const targetDirectory = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
            const filename = url.pathname.split("/").pop();
            if (targetDirectory !== currentDirectory || !["index.html", "visual-notes.html"].includes(filename)) {
                return "index.html";
            }
            return `${filename}${url.search}`;
        } catch {
            return "index.html";
        }
    },

    configureSettingsNavigation() {
        const currentTarget = this.getCurrentPageTarget();
        document.querySelectorAll("a[data-settings-link]").forEach(link => {
            link.href = `settings.html?from=${encodeURIComponent(currentTarget)}`;
        });
        const backLink = document.querySelector("a[data-settings-back]");
        if (backLink) {
            const requestedTarget = new URLSearchParams(window.location.search).get("from");
            backLink.href = this.getSafeReturnTarget(requestedTarget);
        }
    },

    init() {
        this.settings = this.load();
        this.applyTheme();
    }
};

AppSettings.init();
window.AppSettings = AppSettings;
window.addEventListener("DOMContentLoaded", () => AppSettings.configureSettingsNavigation());
