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
    window.applyColor = visualNotes.applyColor.bind(visualNotes);
}

window.addEventListener("DOMContentLoaded", () => {
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
