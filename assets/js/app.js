function exposeTaskActions(taskTracker) {
    window.addTask = taskTracker.addTask.bind(taskTracker);
    window.addCategory = taskTracker.addCategory.bind(taskTracker);
    window.deleteTask = taskTracker.deleteTask.bind(taskTracker);
    window.toggleStep = taskTracker.toggleStep.bind(taskTracker);
    window.addStep = taskTracker.addStep.bind(taskTracker);
    window.removeStep = taskTracker.removeStep.bind(taskTracker);
    window.editTask = taskTracker.editTask.bind(taskTracker);
    window.editStep = taskTracker.editStep.bind(taskTracker);
    window.moveStepUp = taskTracker.moveStepUp.bind(taskTracker);
    window.moveStepDown = taskTracker.moveStepDown.bind(taskTracker);
    window.toggleNotes = taskTracker.toggleNotes.bind(taskTracker);
    window.updateNotes = taskTracker.updateNotes.bind(taskTracker);
    window.togglePinned = taskTracker.togglePinned.bind(taskTracker);
    window.startStepDrag = taskTracker.startStepDrag.bind(taskTracker);
    window.dropStep = taskTracker.dropStep.bind(taskTracker);
}

function exposeVisualNoteActions(visualNotes) {
    window.createNote = visualNotes.createNote.bind(visualNotes);
    window.saveBoard = visualNotes.saveBoard.bind(visualNotes);
    window.saveProject = visualNotes.saveProject.bind(visualNotes);
    window.updateProjectTitle = visualNotes.updateProjectTitle.bind(visualNotes);
    window.deleteNote = visualNotes.deleteNote.bind(visualNotes);
    window.toggleRemoveMode = visualNotes.toggleRemoveMode.bind(visualNotes);
    window.toggleAddMode = visualNotes.toggleAddMode.bind(visualNotes);
    window.toggleColorMode = visualNotes.toggleColorMode.bind(visualNotes);
    window.toggleShapesMode = visualNotes.toggleShapesMode.bind(visualNotes);
    window.toggleSnappingMode = visualNotes.toggleSnappingMode.bind(visualNotes);
    window.applyColor = visualNotes.applyColor.bind(visualNotes);
    window.exportBoardImage = visualNotes.exportBoardImage.bind(visualNotes);
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
        exposeTaskActions(window.TaskTracker);
        window.TaskTracker.init();
    }
    if (window.VisualNotes) {
        exposeVisualNoteActions(window.VisualNotes);
        window.VisualNotes.init();
    }
    if (window.ProjectsPage) {
        window.ProjectsPage.init();
    }
});
