const BoardImageExporter = {
    padding: 60,
    maxDimension: 8192,
    maxPixels: 32000000,
    preferredScale: 2,

    getBounds(notes, shapes) {
        const items = [...notes, ...shapes];
        if (!items.length) return null;

        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        items.forEach(item => {
            const width = item.width || CanvasUtils.defaultNoteWidth;
            const height = item.height || CanvasUtils.defaultNoteHeight;
            left = Math.min(left, item.x);
            top = Math.min(top, item.y);
            right = Math.max(right, item.x + width);
            bottom = Math.max(bottom, item.y + height);
        });

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

    drawGrid(context, bounds, scale) {
        const baseSpacing = CanvasUtils.gridSpacing;
        const columns = Math.max(1, (bounds.right - bounds.left) / baseSpacing);
        const rows = Math.max(1, (bounds.bottom - bounds.top) / baseSpacing);
        const densityStep = Math.ceil(Math.sqrt((columns * rows) / 120000));
        const visibilityStep = Math.ceil(4 / (baseSpacing * scale));
        const spacing = baseSpacing * Math.max(1, densityStep, visibilityStep);
        const startX = Math.ceil(bounds.left / spacing) * spacing;
        const startY = Math.ceil(bounds.top / spacing) * spacing;
        context.fillStyle = "#555";
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

    drawShapes(context, shapes) {
        shapes.forEach(shape => {
            const width = shape.width || 160;
            const height = shape.height || 100;
            this.roundedRect(context, shape.x, shape.y, width, height, 18);
            context.fillStyle = shape.color
                ? this.colorWithAlpha(shape.color, 0.18)
                : "rgba(255, 255, 255, 0.035)";
            context.strokeStyle = shape.color
                ? this.colorWithAlpha(shape.color, 0.72)
                : "rgba(255, 255, 255, 0.24)";
            context.lineWidth = 2;
            context.fill();
            context.stroke();

            if (!shape.title) return;
            context.font = '600 21px "Segoe UI", Arial, sans-serif';
            const label = this.fitText(context, shape.title, Math.max(40, width - 64));
            const labelWidth = Math.min(width - 32, context.measureText(label).width + 20);
            const labelX = shape.x + 16;
            const labelY = shape.y - 17;
            this.roundedRect(context, labelX, labelY, labelWidth, 30, 15);
            context.fillStyle = "#2b2b2b";
            context.fill();
            context.strokeStyle = "rgba(255, 255, 255, 0.2)";
            context.lineWidth = 1;
            context.stroke();
            context.fillStyle = "#dddddd";
            context.textBaseline = "middle";
            context.fillText(label, labelX + 10, labelY + 15, labelWidth - 20);
        });
    },

    drawConnections(context, connections, notes) {
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
            gradient.addColorStop(0, first.color || "#aaaaaa");
            gradient.addColorStop(1, second.color || "#aaaaaa");
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

    async drawNotes(context, notes) {
        const loadedImages = await Promise.all(notes.map(note => this.loadImage(note.imageSrc)));
        notes.forEach((note, index) => {
            const width = note.width || CanvasUtils.defaultNoteWidth;
            const height = note.height || CanvasUtils.defaultNoteHeight;
            context.save();
            context.shadowColor = "rgba(0, 0, 0, 0.5)";
            context.shadowBlur = 15;
            context.shadowOffsetY = 5;
            this.roundedRect(context, note.x, note.y, width, height, 10);
            context.fillStyle = note.color || "#333333";
            context.fill();
            context.shadowColor = "transparent";
            context.strokeStyle = "rgba(255, 255, 255, 0.15)";
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
                context.fillStyle = "#222222";
                context.fillRect(innerX, innerY, innerWidth, innerHeight);
                if (image) this.drawContainedImage(context, image, innerX, innerY, innerWidth, innerHeight);
                context.restore();
                return;
            }

            context.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            context.fillStyle = note.title ? "#ffffff" : "#aaaaaa";
            context.textBaseline = "top";
            context.fillText(
                this.fitText(context, note.title || "Add title", Math.max(1, width - 32)),
                note.x + 16,
                note.y + 12,
                width - 32
            );

            const textX = note.x + 12;
            const textY = note.y + 43;
            const textWidth = Math.max(1, width - 24);
            const textHeight = Math.max(1, height - 55);
            this.roundedRect(context, textX, textY, textWidth, textHeight, 5);
            context.fillStyle = "#222222";
            context.fill();
            context.strokeStyle = "#555555";
            context.lineWidth = 1;
            context.stroke();

            context.save();
            this.roundedRect(context, textX, textY, textWidth, textHeight, 5);
            context.clip();
            context.font = '13px "Segoe UI", Arial, sans-serif';
            context.fillStyle = "#ffffff";
            context.textBaseline = "top";
            const lines = this.wrapText(context, note.text, Math.max(1, textWidth - 16));
            lines.forEach((line, lineIndex) => {
                const lineY = textY + 8 + lineIndex * 17;
                if (lineY + 17 <= textY + textHeight) {
                    context.fillText(line, textX + 8, lineY, textWidth - 16);
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

        context.scale(scale, scale);
        context.fillStyle = "#1b1b1b";
        context.fillRect(0, 0, width, height);
        context.translate(-bounds.left, -bounds.top);
        this.drawGrid(context, bounds, scale);
        this.drawShapes(context, shapes);
        this.drawConnections(context, board.connections || [], notes);
        await this.drawNotes(context, notes);

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
