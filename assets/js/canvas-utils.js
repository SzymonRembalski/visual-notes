const CanvasUtils = {
    toolbarHeight: 50,
    defaultNoteWidth: 220,
    defaultNoteHeight: 140,
    screenToCanvas(clientX, clientY, panX, panY, zoom) {
        return {
            x: (clientX - panX) / zoom,
            y: (clientY - this.toolbarHeight - panY) / zoom
        };
    },
    getViewportBounds(panX, panY, zoom, viewportWidth, viewportHeight) {
        const contentHeight = Math.max(1, viewportHeight - this.toolbarHeight);
        return {
            left: -panX / zoom,
            top: -panY / zoom,
            right: (viewportWidth - panX) / zoom,
            bottom: (contentHeight - panY) / zoom
        };
    },
    calculateCanvasBounds(notes, viewport, padding = 360, resizeStep = 250) {
        let left = viewport.left;
        let top = viewport.top;
        let right = viewport.right;
        let bottom = viewport.bottom;

        if (notes.length) {
            notes.forEach(note => {
                left = Math.min(left, note.x);
                top = Math.min(top, note.y);
                right = Math.max(right, note.x + (note.width || this.defaultNoteWidth));
                bottom = Math.max(bottom, note.y + (note.height || this.defaultNoteHeight));
            });
        } else {
            left = Math.min(left, 0);
            top = Math.min(top, 0);
            right = Math.max(right, 0);
            bottom = Math.max(bottom, 0);
        }

        left -= padding;
        top -= padding;
        right += padding;
        bottom += padding;

        const viewportWidth = viewport.right - viewport.left;
        const viewportHeight = viewport.bottom - viewport.top;
        const minimumWidth = Math.max(1200, viewportWidth + padding * 2);
        const minimumHeight = Math.max(800, viewportHeight + padding * 2);

        if (right - left < minimumWidth) {
            const extra = (minimumWidth - (right - left)) / 2;
            left -= extra;
            right += extra;
        }
        if (bottom - top < minimumHeight) {
            const extra = (minimumHeight - (bottom - top)) / 2;
            top -= extra;
            bottom += extra;
        }

        return {
            left: Math.floor(left / resizeStep) * resizeStep,
            top: Math.floor(top / resizeStep) * resizeStep,
            right: Math.ceil(right / resizeStep) * resizeStep,
            bottom: Math.ceil(bottom / resizeStep) * resizeStep
        };
    },
    centeredCamera(viewportWidth, viewportHeight) {
        return {
            panX: viewportWidth / 2,
            panY: Math.max(1, viewportHeight - this.toolbarHeight) / 2
        };
    },
    rebaseNotesAroundFirst(notes, view, preserveView, viewportWidth, viewportHeight) {
        if (!notes.length) return view;

        const firstNote = notes[0];
        const originX = firstNote.x + (firstNote.width || this.defaultNoteWidth) / 2;
        const originY = firstNote.y + (firstNote.height || this.defaultNoteHeight) / 2;
        notes.forEach(note => {
            note.x -= originX;
            note.y -= originY;
        });

        if (preserveView) {
            return {
                panX: view.panX + originX * view.zoom,
                panY: view.panY + originY * view.zoom,
                zoom: view.zoom
            };
        }

        return {
            ...this.centeredCamera(viewportWidth, viewportHeight),
            zoom: view.zoom
        };
    },
    normalizeRectangle(start, end) {
        return {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y)
        };
    },
    resizeRectangle(rectangle, direction, deltaX, deltaY, minWidth = 160, minHeight = 100) {
        let { x, y, width, height } = rectangle;

        if (direction.includes("e")) width = Math.max(minWidth, width + deltaX);
        if (direction.includes("s")) height = Math.max(minHeight, height + deltaY);
        if (direction.includes("w")) {
            const nextWidth = Math.max(minWidth, width - deltaX);
            x += width - nextWidth;
            width = nextWidth;
        }
        if (direction.includes("n")) {
            const nextHeight = Math.max(minHeight, height - deltaY);
            y += height - nextHeight;
            height = nextHeight;
        }

        return { x, y, width, height };
    },
    resizeRectangleProportionally(rectangle, direction, deltaX, deltaY, aspectRatio, minWidth, minHeight) {
        const horizontal = direction.includes("e") || direction.includes("w");
        const vertical = direction.includes("n") || direction.includes("s");
        const widthDelta = direction.includes("w") ? -deltaX : deltaX;
        const heightDelta = direction.includes("n") ? -deltaY : deltaY;
        const useHeight = vertical && (!horizontal || Math.abs(heightDelta / aspectRatio) > Math.abs(widthDelta));
        const requestedWidth = useHeight
            ? (rectangle.height + heightDelta) / aspectRatio
            : rectangle.width + widthDelta;
        const width = Math.max(minWidth, minHeight / aspectRatio, requestedWidth);
        const height = width * aspectRatio;

        return {
            x: direction.includes("w") ? rectangle.x + rectangle.width - width
                : direction.includes("e") ? rectangle.x
                    : rectangle.x + (rectangle.width - width) / 2,
            y: direction.includes("n") ? rectangle.y + rectangle.height - height
                : direction.includes("s") ? rectangle.y
                    : rectangle.y + (rectangle.height - height) / 2,
            width,
            height
        };
    },
    lineIntersects(firstStart, firstEnd, secondLine) {
        const orientation = (point, next, other) =>
            (next.y - point.y) * (other.x - next.x) -
            (next.x - point.x) * (other.y - next.y);
        const onSegment = (start, point, end) =>
            point.x <= Math.max(start.x, end.x) && point.x >= Math.min(start.x, end.x) &&
            point.y <= Math.max(start.y, end.y) && point.y >= Math.min(start.y, end.y);

        const secondStart = { x: secondLine.x1, y: secondLine.y1 };
        const secondEnd = { x: secondLine.x2, y: secondLine.y2 };
        const firstOrientation = orientation(firstStart, firstEnd, secondStart);
        const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
        const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
        const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

        if (firstOrientation === 0 && onSegment(firstStart, secondStart, firstEnd)) return true;
        if (secondOrientation === 0 && onSegment(firstStart, secondEnd, firstEnd)) return true;
        if (thirdOrientation === 0 && onSegment(secondStart, firstStart, secondEnd)) return true;
        if (fourthOrientation === 0 && onSegment(secondStart, firstEnd, secondEnd)) return true;
        return firstOrientation * secondOrientation < 0 && thirdOrientation * fourthOrientation < 0;
    }
};

window.CanvasUtils = CanvasUtils;
