const SettingsPage = {
    recordingAction: null,
    statusElement: null,

    setStatus(message, state = "neutral") {
        if (!this.statusElement) return;
        this.statusElement.textContent = message;
        this.statusElement.dataset.state = state;
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

        list.querySelectorAll(".shortcutBinding").forEach(button => {
            button.addEventListener("click", () => this.startRecording(button.dataset.action));
        });
        list.querySelectorAll(".shortcutReset").forEach(button => {
            button.addEventListener("click", () => {
                AppSettings.resetShortcut(button.dataset.resetAction);
                this.recordingAction = null;
                this.renderShortcuts();
                this.setStatus("Shortcut restored to its default.", "success");
            });
        });
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
            this.recordingAction = null;
            this.renderShortcuts();
            this.setStatus("Shortcut change cancelled.");
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
        this.recordingAction = null;
        this.renderShortcuts();
        this.setStatus(`Shortcut changed to ${AppSettings.formatBinding(binding)}.`, "success");
    },

    init() {
        this.statusElement = document.getElementById("settingsStatus");
        const colorInput = document.getElementById("themeColorInput");
        if (colorInput) {
            colorInput.addEventListener("input", () => {
                AppSettings.setThemeColor(colorInput.value);
                this.renderTheme();
                this.setStatus("Theme color saved.", "success");
            });
        }
        document.querySelectorAll(".themePreset").forEach(button => {
            button.addEventListener("click", () => {
                AppSettings.setThemeColor(button.dataset.color);
                this.renderTheme();
                this.setStatus("Theme color saved.", "success");
            });
        });
        document.getElementById("resetThemeButton")?.addEventListener("click", () => {
            AppSettings.resetTheme();
            this.renderTheme();
            this.setStatus("Theme restored to the Visual Notes default.", "success");
        });
        document.getElementById("resetShortcutsButton")?.addEventListener("click", () => {
            AppSettings.resetShortcuts();
            this.recordingAction = null;
            this.renderShortcuts();
            this.setStatus("All shortcuts restored to their defaults.", "success");
        });
        document.addEventListener("keydown", event => this.captureShortcut(event), true);
        this.renderTheme();
        this.renderShortcuts();
    }
};

window.SettingsPage = SettingsPage;
window.addEventListener("DOMContentLoaded", () => SettingsPage.init());
