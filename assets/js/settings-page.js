const SettingsPage = {
    recordingAction: null,
    statusElement: null,

    setStatus(message, state = "neutral") {
        if (!this.statusElement) return;
        this.statusElement.textContent = message;
        this.statusElement.dataset.state = state;
    },
    finishRecording(message, state = "success") {
        this.recordingAction = null;
        this.renderShortcuts();
        this.setStatus(message, state);
    },
    setThemeColor(color, message = "Theme color saved.") {
        AppSettings.setThemeColor(color);
        this.renderTheme();
        this.setStatus(message, "success");
    },

    renderTheme() {
        const input = document.getElementById("themeColorInput");
        const value = document.getElementById("themeColorValue");
        if (input) input.value = AppSettings.settings.themeColor;
        if (value) value.textContent = AppSettings.settings.themeColor.toUpperCase();
        document.querySelectorAll(".themePreset").forEach(button => {
            const selected = button.dataset.color === AppSettings.settings.themeColor;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    },

    renderShortcuts() {
        const list = document.getElementById("shortcutList");
        if (!list) return;
        list.innerHTML = AppSettings.shortcutDefinitions.map(definition => `
            <div class="shortcutRow">
                <span class="shortcutLabel">${definition.label}</span>
                <button type="button" class="shortcutBinding" data-action="${definition.id}" aria-label="Change ${definition.label} shortcut">
                    ${AppSettings.formatBinding(AppSettings.getShortcut(definition.id))}
                </button>
                <button type="button" class="shortcutReset" data-reset-action="${definition.id}" title="Reset ${definition.label}" aria-label="Reset ${definition.label} shortcut">Reset</button>
            </div>
        `).join("");

    },

    startRecording(action) {
        this.recordingAction = action;
        this.renderShortcuts();
        const button = document.querySelector(`.shortcutBinding[data-action="${action}"]`);
        if (button) {
            button.classList.add("recording");
            button.textContent = "Press keys…";
            button.focus();
        }
        this.setStatus("Press the new key or key combination. Press Escape to cancel.");
    },

    captureShortcut(event) {
        if (!this.recordingAction) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
            this.finishRecording("Shortcut change cancelled.", "neutral");
            return;
        }
        const binding = AppSettings.eventToBinding(event);
        if (!binding) return;
        const conflict = AppSettings.shortcutDefinitions.find(definition =>
            definition.id !== this.recordingAction && AppSettings.getShortcut(definition.id) === binding
        );
        if (conflict) {
            this.setStatus(`${AppSettings.formatBinding(binding)} is already assigned to ${conflict.label}.`, "error");
            return;
        }
        AppSettings.setShortcut(this.recordingAction, binding);
        this.finishRecording(`Shortcut changed to ${AppSettings.formatBinding(binding)}.`);
    },

    init() {
        this.statusElement = document.getElementById("settingsStatus");
        document.getElementById("shortcutList").onclick = event => {
            const button = event.target.closest(".shortcutBinding, .shortcutReset");
            if (!button) return;
            if (button.dataset.action) this.startRecording(button.dataset.action);
            else {
                AppSettings.resetShortcut(button.dataset.resetAction);
                this.finishRecording("Shortcut restored to its default.");
            }
        };
        [
            ["appearanceSelect", "appearance", "value", "Appearance saved."],
            ["quickToolsToggle", "quickTools", "checked", "Quick tools preference saved."]
        ].forEach(([id, setting, property, message]) => {
            const control = document.getElementById(id);
            control[property] = AppSettings.settings[setting];
            control.onchange = () => {
                AppSettings.settings[setting] = control[property];
                AppSettings.save();
                this.setStatus(message, "success");
            };
        });
        const colorInput = document.getElementById("themeColorInput");
        colorInput?.addEventListener("input", () => this.setThemeColor(colorInput.value));
        document.querySelectorAll(".themePreset").forEach(button => {
            button.onclick = () => this.setThemeColor(button.dataset.color);
        });
        document.getElementById("resetThemeButton")?.addEventListener("click", () => {
            this.setThemeColor(AppSettings.defaultThemeColor, "Theme restored to the Visual Notes default.");
        });
        document.getElementById("resetShortcutsButton")?.addEventListener("click", () => {
            AppSettings.resetShortcuts();
            this.finishRecording("All shortcuts restored to their defaults.");
        });
        document.addEventListener("keydown", event => this.captureShortcut(event), true);
        this.renderTheme();
        this.renderShortcuts();
    }
};

window.SettingsPage = SettingsPage;
window.addEventListener("DOMContentLoaded", () => SettingsPage.init());
