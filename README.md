<div align="center">

# ✦ Visual Notes

### Turn scattered thoughts into connected ideas — and ideas into action.

![HTML](https://img.shields.io/badge/HTML5-111111?style=for-the-badge&logo=html5&logoColor=E34F26)
![CSS](https://img.shields.io/badge/CSS3-111111?style=for-the-badge&logo=css&logoColor=1572B6)
![JavaScript](https://img.shields.io/badge/JavaScript-111111?style=for-the-badge&logo=javascript&logoColor=F7DF1E)
![Local First](https://img.shields.io/badge/Local--First-388E3C?style=for-the-badge)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-388E3C?style=for-the-badge)

A lightweight, browser-based thinking space that combines a visual idea canvas with a practical task tracker. No account, backend, build step, or installation required.

</div>

---

## What you can do

### 🧠 Think visually

- Create multiple visual-note projects.
- Place, move, resize, and edit notes on a large canvas.
- Connect related notes to build idea maps.
- Draw titled, resizable background shapes to visually group related notes.
- Color groups of notes and see connections blend between their colors.
- Select and move several notes together.
- Pan and zoom through complex boards.

### ✅ Turn ideas into action

- Create tasks and break them into smaller steps.
- Track completion with automatic progress counts and percentages.
- Reorder tasks and steps with drag and drop.
- Pin important tasks and attach extra notes.
- Organize work into custom categories.

### 🔒 Keep everything local

Your projects and tasks stay on your device. Browser storage keeps the app fast, while the **Backups** panel can download a complete workspace backup or mirror changed data to a local JSON file every five minutes in supported browsers. Pending changes are also written when you use the app's menu-return buttons or press **Ctrl/Cmd + S**. Visual Notes has no server and sends no workspace data anywhere.

## How it fits together

```mermaid
flowchart LR
    A[Main Menu] --> B[Task Tracker]
    A --> C[Visual Notes Projects]
    C --> D[Adaptive Canvas]
    D --> E[Notes]
    D --> F[Connections]
    D --> G[Colors]
    D --> J[Background Groups]
    B --> H[Tasks, Steps & Progress]
    E & F & G & H & J --> I[(Browser localStorage)]
```

## Run it

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Start mapping ideas or tracking tasks.

```bash
git clone https://github.com/SzymonRembalski/visual-notes.git
cd visual-notes
```

Then open `index.html`. There is nothing to install and no build command to run.

> [!IMPORTANT]
> Browser data belongs to the profile and origin where you created it. Use **Backups → Choose auto-backup file** or **Download backup** to keep a copy that survives clearing browser data. Restore that file from any page with **Backups → Restore backup**.

## Useful canvas controls

| Action | Control |
| --- | --- |
| Create a note | **New Note** |
| Resize a note | Left-drag any border or corner; image notes keep their proportions |
| Move around the canvas | Right-click and drag |
| Center the camera on all notes | Press the mouse wheel |
| Save to the connected backup file | **Ctrl/Cmd + S** |
| Zoom | Mouse wheel |
| Select several notes | Drag on empty canvas or `Ctrl` + click |
| Delete selected notes | `Delete` |
| Undo the last change | `Ctrl` + `Z` |
| Redo an undone change | `Ctrl` + `Shift` + `Z` |
| Connect notes | Turn on **Add Connections**, then draw through notes |
| Remove links | Turn on **Remove Connections**, then draw through connections |
| Color notes | Select notes, enable **Color Mode**, choose a color, and apply |
| Create a background group | Enable **Shapes Mode**, then drag on empty canvas |
| Edit a group | In **Shapes Mode**, drag it to move, click its title to rename, or drag an edge/corner to resize |
| Delete a group | Select it in **Shapes Mode**, then press `Delete` or use its × button |

## Project structure

```text
visual-notes/
├── index.html                # Main navigation
├── projects.html             # Visual project library
├── visual-notes.html         # Visual notes workspace
├── tasks.html                # Task tracker
└── assets/
    ├── css/
    │   └── styles.css        # Shared dark interface
    └── js/
        ├── app.js            # Page initialization and action bindings
        ├── canvas-utils.js   # Canvas coordinates, bounds, and geometry
        ├── history-manager.js # 30-step undo and redo history
        ├── project-manager.js # Project persistence
        ├── projects-page.js  # Project library interface
        ├── task-tracker.js   # Task tracker behavior
        └── visual-notes.js   # Canvas and note interactions
```

## Built with

Plain HTML, CSS, and JavaScript — intentionally. The project stays easy to open, understand, modify, and carry anywhere.

---

<div align="center">

**Map the thought. Connect the idea. Finish the task.**

</div>
