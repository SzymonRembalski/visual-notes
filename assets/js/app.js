function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    })[character]);
}

function exposeActions(controller, actions) {
    actions.forEach(action => {
        window[action] = controller[action].bind(controller);
    });
}

function setupToolbarMenus() {
    const toolbar = document.getElementById("toolbar");
    if (!toolbar) return;
    const menus = Array.from(toolbar.querySelectorAll(".toolbarMenu"));
    if (!menus.length) return;

    menus.forEach(menu => {
        menu.addEventListener("toggle", () => {
            if (!menu.open) return;
            menus.forEach(otherMenu => {
                if (otherMenu !== menu) otherMenu.open = false;
            });
        });
    });

    toolbar.addEventListener("click", event => {
        if (!event.target.closest("[data-close-menu]")) return;
        const menu = event.target.closest(".toolbarMenu");
        if (menu) menu.open = false;
    });

    document.addEventListener("click", event => {
        if (event.target.closest(".toolbarMenu")) return;
        menus.forEach(menu => {
            menu.open = false;
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        menus.forEach(menu => {
            menu.open = false;
        });
    });
}

window.addEventListener("DOMContentLoaded", () => {
    setupToolbarMenus();
    if (window.TaskTracker) {
        exposeActions(window.TaskTracker, [
            "addTask", "addCategory", "deleteTask", "toggleStep", "addStep", "removeStep",
            "editTask", "editStep", "toggleNotes", "updateNotes", "togglePinned",
            "startStepDrag", "dropStep"
        ]);
        window.TaskTracker.init();
    }
    if (window.VisualNotes) {
        exposeActions(window.VisualNotes, [
            "createNote", "updateProjectTitle", "toggleRemoveMode", "toggleAddMode",
            "toggleColorMode", "toggleShapesMode", "toggleSnappingMode", "exportBoardImage"
        ]);
        window.VisualNotes.init();
    }
    if (window.ProjectsPage) {
        window.ProjectsPage.init();
    }
});
