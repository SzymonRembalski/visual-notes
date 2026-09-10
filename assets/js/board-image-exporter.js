const BoardImageExporter = {
    padding: 60,
    maxDimension: 8192,
    maxPixels: 32000000,
    preferredScale: 2,

    getPalette() {
        const style = getComputedStyle(document.documentElement);
        return Object.fromEntries(["page-bg", "surface", "text", "muted", "border", "dots"]
            .map(name => [name, style.getPropertyValue(`--${name}`).trim()]));
    },

    getBounds(notes, shapes) {
        const bounds = CanvasUtils.getNotesBounds([...notes, ...shapes]);
        if (!bounds) return null;
        const { left, top, right, bottom } = bounds;

        return {
            left: left - this.padding,
            top: top - this.padding,
            right: right + this.padding,
            bottom: bottom + this.padding
        };
    },

    getOutputScale(width, height) {
        const scale = Math.min(
            this.preferredScale,
            this.maxDimension / width,
            this.maxDimension / height,
            Math.sqrt(this.maxPixels / (width * height))
        );
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
    },

    roundedRect(context, x, y, width, height, radius) {
        const corner = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + corner, y);
        context.lineTo(x + width - corner, y);
        context.quadraticCurveTo(x + width, y, x + width, y + corner);
        context.lineTo(x + width, y + height - corner);
        context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
        context.lineTo(x + corner, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - corner);
        context.lineTo(x, y + corner);
        context.quadraticCurveTo(x, y, x + corner, y);
        context.closePath();
    },

    colorWithAlpha(color, alpha) {
        const match = /^#([0-9a-f]{6})$/i.exec(color || "");
        if (!match) return `rgba(255, 255, 255, ${alpha})`;
        const value = Number.parseInt(match[1], 16);
        return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
    },

    drawGrid(context, bounds, scale, palette) {
        const baseSpacing = CanvasUtils.gridSpacing;
        const columns = Math.max(1, (bounds.right - bounds.left) / baseSpacing);
        const rows = Math.max(1, (bounds.bottom - bounds.top) / baseSpacing);
        const densityStep = Math.ceil(Math.sqrt((columns * rows) / 120000));
        const visibilityStep = Math.ceil(4 / (baseSpacing * scale));
        const spacing = baseSpacing * Math.max(1, densityStep, visibilityStep);
        const startX = Math.ceil(bounds.left / spacing) * spacing;
        const startY = Math.ceil(bounds.top / spacing) * spacing;
        context.fillStyle = palette.dots;
        for (let x = startX; x <= bounds.right; x += spacing) {
            for (let y = startY; y <= bounds.bottom; y += spacing) {
                context.beginPath();
                context.arc(x, y, 1.2, 0, Math.PI * 2);
                context.fill();
            }
        }
    },

    fitText(context, text, maxWidth) {
        const value = String(text || "");
        if (context.measureText(value).width <= maxWidth) return value;
        let shortened = value;
        while (shortened && context.measureText(`${shortened}…`).width > maxWidth) {
            shortened = shortened.slice(0, -1);
        }
        return `${shortened}…`;
    },

    wrapText(context, text, maxWidth) {
        const lines = [];
        String(text || "").split(/\r?\n/).forEach(paragraph => {
            if (!paragraph) {
                lines.push("");
                return;
            }
            const words = paragraph.split(/\s+/);
            let line = "";
            words.forEach(word => {
                const candidate = line ? `${line} ${word}` : word;
                if (line && context.measureText(candidate).width > maxWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            });
            if (line) lines.push(line);
        });
        return lines;
    },

    drawShapes(context, shapes, palette) {
        shapes.forEach(shape => {
            const width = shape.width || 160;
            const height = shape.height || 100;
            this.roundedRect(context, shape.x, shape.y, width, height, 18);
            context.fillStyle = shape.color
                ? this.colorWithAlpha(shape.color, 0.08)
                : this.colorWithAlpha(palette.muted, 0.04);
            context.strokeStyle = shape.color
                ? this.colorWithAlpha(shape.color, 0.48)
                : palette.border;
            context.lineWidth = 2;
            context.fill();
            context.stroke();

            if (!shape.title) return;
            context.font = '600 12px "Segoe UI", Arial, sans-serif';
            const label = this.fitText(context, shape.title.toUpperCase(), Math.max(40, width - 64));
            const labelWidth = Math.min(width - 32, context.measureText(label).width + 20);
            const labelX = shape.x + 16;
            const labelY = shape.y - 17;
            this.roundedRect(context, labelX, labelY, labelWidth, 30, 15);
            context.fillStyle = palette["page-bg"];
            context.fill();
            context.strokeStyle = "rgba(255, 255, 255, 0.2)";
            context.lineWidth = 1;
            context.stroke();
            context.fillStyle = palette.text;
            context.textBaseline = "middle";
            context.fillText(label, labelX + 10, labelY + 15, labelWidth - 20);
        });
    },

    drawConnections(context, connections, notes, palette) {
        connections.forEach(connection => {
            const first = notes.find(note => note.id === connection.a);
            const second = notes.find(note => note.id === connection.b);
            if (!first || !second) return;
            const geometry = CanvasUtils.getOrthogonalConnection(first, second);
            const gradient = context.createLinearGradient(
                geometry.start.x,
                geometry.start.y,
                geometry.end.x,
                geometry.end.y
            );
            gradient.addColorStop(0, first.color || palette.muted);
            gradient.addColorStop(1, second.color || palette.muted);
            context.beginPath();
            context.moveTo(geometry.start.x, geometry.start.y);
            geometry.segments.forEach(segment => context.lineTo(segment.x2, segment.y2));
            context.strokeStyle = gradient;
            context.lineWidth = 2;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.stroke();
        });
    },

    loadImage(source) {
        return new Promise(resolve => {
            if (!source) {
                resolve(null);
                return;
            }
            const image = new Image();
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            if (/^https?:/i.test(source)) image.crossOrigin = "anonymous";
            image.onload = () => finish(image);
            image.onerror = () => finish(null);
            image.src = source;
            setTimeout(() => finish(null), 8000);
        });
    },

    drawContainedImage(context, image, x, y, width, height) {
        const imageRatio = image.naturalWidth / image.naturalHeight;
        const boxRatio = width / height;
        let drawWidth = width;
        let drawHeight = height;
        if (imageRatio > boxRatio) {
            drawHeight = width / imageRatio;
        } else {
            drawWidth = height * imageRatio;
        }
        const drawX = x + (width - drawWidth) / 2;
        const drawY = y + (height - drawHeight) / 2;
        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    },

    async drawNotes(context, notes, palette) {
        const loadedImages = await Promise.all(notes.map(note => this.loadImage(note.imageSrc)));
        notes.forEach((note, index) => {
            const width = note.width || CanvasUtils.defaultNoteWidth;
            const height = note.height || CanvasUtils.defaultNoteHeight;
            const titleOnlyNote = note.type !== "image" && !String(note.text || "").trim() && !note.imageSrc;
            context.save();
            context.shadowColor = "rgba(0, 0, 0, 0.5)";
            context.shadowBlur = 15;
            context.shadowOffsetY = 5;
            this.roundedRect(context, note.x, note.y, width, height, 10);
            context.fillStyle = note.color || palette.surface;
            context.fill();
            context.shadowColor = "transparent";
            context.strokeStyle = palette.border;
            context.lineWidth = 1;
            context.stroke();
            context.restore();

            const image = loadedImages[index];
            if (note.type === "image") {
                const innerX = note.x + 12;
                const innerY = note.y + 12;
                const innerWidth = Math.max(1, width - 24);
                const innerHeight = Math.max(1, height - 24);
                context.save();
                this.roundedRect(context, innerX, innerY, innerWidth, innerHeight, 8);
                context.clip();
                context.fillStyle = palette.surface;
                context.fillRect(innerX, innerY, innerWidth, innerHeight);
                if (image) this.drawContainedImage(context, image, innerX, innerY, innerWidth, innerHeight);
                context.restore();
                return;
            }

            const textColor = note.color ? AppSettings.getContrastColor(note.color) : palette.text;
            context.font = '600 14px "Segoe UI", Arial, sans-serif';
            context.fillStyle = note.title ? textColor : palette.muted;
            context.textAlign = titleOnlyNote ? "center" : "left";
            context.textBaseline = titleOnlyNote ? "middle" : "top";
            context.fillText(
                this.fitText(context, note.title || "Add title", Math.max(1, width - 32)),
                titleOnlyNote ? note.x + width / 2 : note.x + 16,
                titleOnlyNote ? note.y + height / 2 : note.y + 12,
                width - 32
            );
            context.textAlign = "left";
            if (titleOnlyNote) return;

            const textX = note.x + 12;
            const textY = note.y + 43;
            const textWidth = Math.max(1, width - 24);
            const textHeight = Math.max(1, height - 55);
            context.beginPath();
            context.moveTo(textX, textY);
            context.lineTo(textX + textWidth, textY);
            context.strokeStyle = note.color ? this.colorWithAlpha(textColor, 0.2) : palette.border;
            context.lineWidth = 1;
            context.stroke();

            context.save();
            this.roundedRect(context, textX, textY, textWidth, textHeight, 5);
            context.clip();
            context.font = '13px "Segoe UI", Arial, sans-serif';
            context.fillStyle = note.color ? textColor : palette.muted;
            context.textBaseline = "top";
            const lines = this.wrapText(context, note.text, Math.max(1, textWidth - 8));
            lines.forEach((line, lineIndex) => {
                const lineY = textY + 8 + lineIndex * 17;
                if (lineY + 17 <= textY + textHeight) {
                    context.fillText(line, textX + 4, lineY, textWidth - 8);
                }
            });
            context.restore();
        });
    },

    sanitizeFileName(title) {
        const safeTitle = String(title || "Visual Notes")
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
            .replace(/[. ]+$/g, "")
            .slice(0, 80);
        return `${safeTitle || "Visual Notes"}.png`;
    },

    canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error("The board image could not be created."));
            }, "image/png");
        });
    },

    async createImage(board) {
        const notes = board.notes || [];
        const shapes = board.shapes || [];
        const bounds = this.getBounds(notes, shapes);
        if (!bounds) throw new Error("Add at least one note or shape before exporting an image.");

        const width = Math.max(1, bounds.right - bounds.left);
        const height = Math.max(1, bounds.bottom - bounds.top);
        const scale = this.getOutputScale(width, height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image export is not supported by this browser.");

        const palette = this.getPalette();
        context.scale(scale, scale);
        context.fillStyle = palette["page-bg"];
        context.fillRect(0, 0, width, height);
        context.translate(-bounds.left, -bounds.top);
        this.drawGrid(context, bounds, scale, palette);
        this.drawShapes(context, shapes, palette);
        this.drawConnections(context, board.connections || [], notes, palette);
        await this.drawNotes(context, notes, palette);

        return {
            blob: await this.canvasToBlob(canvas),
            fileName: this.sanitizeFileName(board.title),
            width: canvas.width,
            height: canvas.height
        };
    },

    async download(board) {
        const image = await this.createImage(board);
        const url = URL.createObjectURL(image.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = image.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return image;
    }
};

window.BoardImageExporter = BoardImageExporter;
