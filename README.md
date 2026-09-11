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
- Browse board previews, search by project name, and sort by last edit, creation date, or name on the Projects page.
- Place, move, resize, and edit nodes on a large canvas. Each node has a title and can optionally contain a note.
- New nodes begin as compact, title-only cards; select one and use its **+** button to add note content.
- Connect related nodes with structured, right-angle paths to build clear idea maps.
- Draw titled, resizable, translucent colored background shapes to visually group related nodes.
- Sketch over the board on a separate drawing layer, with pen colors, line sizes, and a stroke eraser. Hide or show your drawings without deleting them.
- Color groups of nodes and see connections blend between their colors.
- Reset nodes or shapes to the app's original theme with the **Default** color preset, restoring standard connection colors.
- Select and move several nodes together.
- Optionally snap nodes and shapes to the canvas dots while moving or resizing them.
- Pan and zoom through complex boards.
- Export an entire board as a high-quality PNG image.
- Keep the workspace uncluttered with dedicated **Edit**, **Save**, and **Export** menus.
- Use the floating quick tools for selection, new nodes, connections, shapes, colors, and drawing. Hide the dock in **Settings → Workspace** if you prefer the menus and shortcuts.
- Choose **Graphite** or **Paper** appearance with the sun/moon button or in Settings. PNG exports use the selected appearance.
- Select a node or group to open its color palette, choose a preset or custom color, then press **Apply**. **Pick** samples an existing item's color.
- Personalize the app-wide accent color and remap keyboard shortcuts from **Settings**.

### ✅ Turn ideas into action

- Create tasks and break them into smaller steps.
- Track completion with automatic progress counts and percentages.
- Reorder tasks and steps with drag handles or up/down controls.
- Pin important tasks and attach extra notes.
- Assign tasks to custom categories and filter the list to in-progress or completed work.

### 🔒 Keep everything local

Your projects, tasks, theme, and shortcut preferences stay on your device. Browser storage keeps the app fast, while the canvas's **Save** menu can download a complete workspace backup or mirror changed data to a local JSON file every five minutes in supported browsers. Background backups, menu-return saving, and **Ctrl/Cmd + S** also work on the Main Menu, Projects, and Tasks pages, without displaying backup controls there. Visual Notes has no server and sends no workspace data anywhere.

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
> Browser data belongs to the profile and origin where you created it. On the canvas, use **Save → Choose auto-backup file** or **Save → Download backup** to keep a copy that survives clearing browser data. Use **Save → Restore backup** to restore it.

## Useful canvas controls

| Action | Control |
| --- | --- |
| Change the theme or shortcuts | Open **Settings** from the main menu or Visual Notes toolbar |
| Create a node | **Edit → New Node** |
| Add a note inside a node | Select one title-only node, then use the **+** beneath its title; an empty note collapses automatically |
| Resize a node | Left-drag any border or corner; image nodes keep their proportions |
| Move around the canvas | Right-click and drag |
| Center the camera | Select one or more nodes and press the mouse wheel; without a selection, it centers on all nodes and visible drawings |
| Navigate a larger node area | Drag or click the horizontal and vertical position bars |
| Save to the connected backup file | **Ctrl/Cmd + S** |
| Save the full board as an image | **Export → Export PNG** |
| Zoom | Mouse wheel (`0.2×`–`1×`) |
| Simplified overview | Use `0.2×`–`0.3×` to show readable titles, image previews, shapes, and connections |
| Image-only nodes | Display without titles in both normal and simplified views |
| Select several nodes | Drag on empty canvas or `Shift` + click |
| Delete selected nodes | `Delete` |
| Undo the last change | `Ctrl` + `Z` |
| Redo an undone change | `Ctrl` + `Shift` + `Z` |
| Connect nodes | Use **Edit → Add Connections**, then draw through nodes |
| Remove links | Use **Edit → Remove Connections**, then draw through connections |
| Color nodes | Use **Edit → Color Mode**, then left-click one node, `Shift` + click to select more, or drag a selection box; choose a color and apply |
| Reset colors | Choose the crossed-out **Default** swatch and apply it to remove custom node or shape colors |
| Reuse a board color | In **Color Mode**, choose **Pick**, then click a node or shape |
| Create a background group | Use **Edit → Shapes Mode**, then drag on empty canvas |
| Draw over the board | Choose **Draw** in the quick tools or **Edit** menu, then drag with a mouse, pen, or touch; choose **Done** to return to editing |
| Erase drawings | Choose **Erase strokes** in the drawing controls and sweep across strokes; each gesture can be undone |
| Hide or show drawings | Use **Edit → Hide drawings / Show drawings**; hidden strokes stay saved and are omitted from PNG exports |
| Color a background group | Enable **Shapes Mode** and **Color Mode** from **Edit**, select a shape, choose a color, and apply |
| Edit a group | In **Shapes Mode**, drag it to move, click its title to rename, or drag an edge/corner to resize |
| Delete a group | Select it in **Shapes Mode**, then press `Delete` or use its × button |
| Toggle grid snapping | Use **Edit → Snap: ON/OFF**; each project remembers the setting |

## Keyboard and mouse shortcuts

These are the default bindings. Select any keyboard binding on the **Settings** page and press a new key combination to replace it.

| Shortcut | Action |
| --- | --- |
| `A` | Toggle **Add Connections** |
| `R` | Toggle **Remove Connections** |
| `C` | Toggle **Color Mode** |
| `S` | Toggle **Shapes Mode** |
| `Ctrl/Cmd + B` | Create a new node |
| `Ctrl/Cmd + S` | Save to the connected backup file, or download a backup when direct file access is unavailable |
| `Ctrl/Cmd + Z` | Undo the last change |
| `Ctrl/Cmd + Shift + Z` | Redo an undone change |
| `Delete` | Delete the selected nodes, or the selected shape in Shapes Mode |
| `Shift + click` | Add or remove a node from the current selection |
| `Escape` | Close an open toolbar menu or cancel node/shape title editing |
| Mouse wheel | Zoom in or out |
| Middle-click | Center on selected nodes, or all nodes and visible drawings when nothing is selected |
| Right-click and drag | Move the camera |

The single-letter tool shortcuts work only when you are not typing and no nodes are selected. This prevents editing text or working with a selection from changing modes accidentally. `Ctrl/Cmd + B` is also disabled while typing.

## Project structure

```text
visual-notes/
├── index.html                # Main navigation
├── projects.html             # Visual project library
├── settings.html             # Theme and keyboard preferences
├── visual-notes.html         # Visual notes workspace
├── tasks.html                # Task tracker
└── assets/
    ├── css/
    │   └── styles.css        # Shared dark interface
    └── js/
        ├── app.js            # Page initialization and action bindings
        ├── app-settings.js   # Shared theme, shortcuts, and settings navigation
        ├── board-image-exporter.js # Full-board PNG renderer and download
        ├── canvas-utils.js   # Canvas coordinates, bounds, and geometry
        ├── drawing-layer.js  # Freehand drawing layer, pen, and stroke eraser
        ├── history-manager.js # 30-step undo and redo history
        ├── project-manager.js # Project persistence
        ├── projects-page.js  # Project library interface
        ├── settings-page.js  # Settings page interactions
        ├── task-tracker.js   # Task tracker behavior
        └── visual-notes.js   # Canvas and note interactions
```

## Built with

Plain HTML, CSS, and JavaScript — intentionally. The project stays easy to open, understand, modify, and carry anywhere.

---

<div align="center">

**Map the thought. Connect the idea. Finish the task.**

</div>
