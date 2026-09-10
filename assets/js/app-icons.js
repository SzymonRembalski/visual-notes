const AppIcons = {
    icons: {
        // Lucide waypoints; see assets/lucide-LICENSE.txt.
        waypoints: '<path d="m10.586 5.414-5.172 5.172m13.172 2.828-5.172 5.172M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        check: '<path d="m20 6-11 11-5-5"/>',
        grip: '<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="3"/>',
        pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/>',
        more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
        up: '<path d="m6 14 6-6 6 6"/>',
        down: '<path d="m6 10 6 6 6-6"/>',
        arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
        trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
        select: '<path d="m5 3 14 9-7 1-3 7Z"/>',
        node: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 12h8m-4-4v8"/>',
        connect: '<rect x="2" y="3" width="7" height="6" rx="2"/><rect x="15" y="15" width="7" height="6" rx="2"/><path d="M6 9v9h9"/>',
        shapes: '<rect x="3" y="3" width="14" height="14" rx="3"/><path d="M8 21h10a3 3 0 0 0 3-3V8"/>',
        color: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
        moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
        center: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>'
    },
    icon(name) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.icons[name]}</svg>`;
    },
};
window.AppIcons = AppIcons;
window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-icon]").forEach(element => {
        element.innerHTML = AppIcons.icon(element.dataset.icon);
    });
});
