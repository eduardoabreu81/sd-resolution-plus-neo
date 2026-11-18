// Resolution Plus for Forge Neo: the controls next to Width / Height (ratio lock, megapixel tier, presets) and the size
// line under the sliders. The math is in resolution_plus_math.js; the settings come from Forge's `opts`. Values are
// written the way Forge's own scripts do (input.value + updateInput), so Python always sees what is on screen.

(() => {
    const NAME = "Resolution Plus";
    const KEY = {
        ratios: "resolution_plus_ratios",
        tiers: "resolution_plus_tiers",
        presets: "resolution_plus_presets",
        img2img: "resolution_plus_img2img",
        keepRatio: "resolution_plus_tier_keeps_ratio",
        yieldRatio: "resolution_plus_yield_ratio",
    };
    const DEFAULTS = {
        [KEY.ratios]: "1:1, 2:3, 3:4, 4:5, 9:16, 9:21",
        [KEY.tiers]: "1, 2, 4, 8, 16",
        [KEY.presets]: "",
        [KEY.img2img]: true,
        [KEY.keepRatio]: true,
        [KEY.yieldRatio]: true,
    };
    // Aspect Ratio Helper (Neo), abzaloff/forge-neo-aspect-ratio-helper: its ratio <select>, and the box where it puts
    // it with its own copy of Forge's ⇅ (it takes Forge's button out of the column)
    const HELPER = { select: (tab) => `${tab}_select_aspect_ratio`, box: (tab) => `${tab}_size_toolbox` };
    const LOCK = "lock";
    const OFF = "off";

    const M = () => window.ResolutionPlusMath;
    const app = () => (typeof gradioApp === "function" ? gradioApp() : document);
    const byId = (id) => document.getElementById(id) || app().querySelector(`#${id}`);
    // the server's current values first (the page's `opts` can be older than config.json: see fetchOptions)
    let server = {};
    const opt = (key) => {
        if (server[key] !== undefined && server[key] !== null) return server[key];
        const all = typeof opts === "object" && opts ? opts : {};
        return all[key] === undefined || all[key] === null ? DEFAULTS[key] : all[key];
    };

    async function fetchOptions() {
        try {
            const res = await fetch("./resolution_plus/options", { cache: "no-store" });
            if (res.ok) server = (await res.json()) || {};
        } catch {
            /* no route (older script on the server): Forge's opts are used */
        }
    }
    const store = {
        get(key) {
            try {
                return localStorage.getItem(key);
            } catch {
                return null;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch {
                /* private window: nothing remembered */
            }
        },
    };

    function el(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        Object.assign(node, props);
        for (const child of children) node.append(child);
        return node;
    }

    const ICON = {
        portrait:
            '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3" ' +
            'aria-hidden="true"><rect x="3" y="1" width="6" height="10" rx="1"/></svg>',
        landscape:
            '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3" ' +
            'aria-hidden="true"><rect x="1" y="3" width="10" height="6" rx="1"/></svg>',
        // three frames: portrait, landscape, square
        presets:
            '<svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" ' +
            'stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="2.5" width="5.4" height="9" rx="1.2"/>' +
            '<rect x="9.2" y="2.5" width="7" height="4.6" rx="1.2"/><rect x="9.2" y="9.6" width="5" height="5" rx="1.2"/>' +
            '<path d="M1.8 15.5h5.4"/></svg>',
        lock:
            '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" ' +
            'stroke-linecap="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6"/>' +
            '<path d="M5.4 7V5a2.6 2.6 0 0 1 5.2 0v2"/></svg>',
    };

    // one floating layer at a time (a menu or the presets popup), closed by a click outside it or Esc
    let popup = null;

    function closePopup() {
        if (!popup) return;
        popup.node.remove();
        document.removeEventListener("mousedown", popup.outside, true);
        document.removeEventListener("keydown", popup.escape, true);
        popup.anchor.classList.remove("resolution-plus-open");
        popup = null;
    }

    // "below": under the button, left-aligned (menus); "side": to the right of it (the presets popup)
    function showLayer(owner, kind, node, anchor, placement) {
        closePopup();
        (app().querySelector(".gradio-container") || document.body).append(node);
        const a = anchor.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        let left;
        let top;
        if (placement === "side") {
            left = a.right + 8;
            if (left + box.width > window.innerWidth - 8) left = a.left - box.width - 8;
            top = Math.min(a.top, window.innerHeight - box.height - 8);
        } else {
            left = Math.min(a.left, window.innerWidth - box.width - 8);
            top = a.bottom + 4;
            if (top + box.height > window.innerHeight - 8) top = a.top - box.height - 4;
        }
        node.style.left = `${Math.max(8, left)}px`;
        node.style.top = `${Math.max(8, top)}px`;
        anchor.classList.add("resolution-plus-open");

        const outside = (e) => {
            if (!node.contains(e.target) && !anchor.contains(e.target)) closePopup();
        };
        const escape = (e) => {
            if (e.key === "Escape") closePopup();
        };
        document.addEventListener("mousedown", outside, true);
        document.addEventListener("keydown", escape, true);
        popup = { node, outside, escape, owner, kind, anchor };
    }

    // a small list under a button, in the manner of Aspect Ratio+'s ratio list
    function openMenu(owner, kind, anchor, items, selected, pick) {
        const node = el(
            "div",
            { className: "resolution-plus-menu", role: "listbox" },
            items.map((item) => {
                const b = el("button", { type: "button", role: "option" });
                if (item.html) b.innerHTML = item.html;
                else b.append(el("span", { textContent: item.label }));
                const on = item.value === selected;
                b.classList.toggle("selected", on);
                b.setAttribute("aria-selected", String(on));
                b.addEventListener("click", () => {
                    closePopup();
                    pick(item.value);
                });
                return b;
            }),
        );
        showLayer(owner, kind, node, anchor, "below");
        node.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
    }

    class Controller {
        constructor(tab) {
            this.tab = tab;
            this.busy = false;
            this.last = "";
            this.mode = store.get(`resolution_plus_mode_${tab}`) || OFF;
            this.lock = null;
        }

        // region fields

        box(side) {
            return byId(`${this.tab}_${side === "w" ? "width" : "height"}`);
        }

        number(side) {
            const box = this.box(side);
            return box && box.querySelector('input[type="number"]');
        }

        read() {
            return {
                w: parseInt(this.number("w")?.value, 10) || 0,
                h: parseInt(this.number("h")?.value, 10) || 0,
            };
        }

        // the sliders' own limits (their maximum is the one set in Settings) and Forge's resolution step
        lim() {
            const w = this.number("w");
            const h = this.number("h");
            const max = Math.min(parseInt(w?.max, 10) || 2048, parseInt(h?.max, 10) || 2048);
            const min = Math.max(parseInt(w?.min, 10) || 64, parseInt(h?.min, 10) || 64);
            return { min, max, step: parseInt(opt("res_step"), 10) || 64 };
        }

        set(side, value) {
            const input = this.number(side);
            if (!input || parseInt(input.value, 10) === value) return;
            input.value = value;
            updateInput(input);
        }

        write(w, h) {
            this.busy = true;
            try {
                this.set("w", w);
                this.set("h", h);
            } finally {
                this.busy = false;
            }
            this.refresh();
        }

        // endregion

        // region ratio

        ratios() {
            return M().parseRatios(opt(KEY.ratios));
        }

        tiers() {
            return M().parseTiers(opt(KEY.tiers));
        }

        ratioValue() {
            if (this.mode === OFF) return null;
            if (this.mode === LOCK) return this.lock;
            const ratio = M().parseRatio(this.mode);
            return ratio ? ratio.value : null;
        }

        setMode(mode, { resize = true } = {}) {
            const { w, h } = this.read();
            this.mode = mode;
            store.set(`resolution_plus_mode_${this.tab}`, mode);
            if (mode === LOCK) {
                this.lock = w && h ? w / h : 1;
            } else if (mode !== OFF && resize && w && h) {
                // a new ratio keeps the size's megapixels (the tier's, when the size is on one)
                const tier = M().matchTier(w, h, this.tiers());
                const size = M().sizeFor(this.ratioValue(), tier || M().megapixels(w, h), this.lim());
                this.write(size.w, size.h);
            }
            this.showMode();
            this.refresh();
        }

        // after a preset: keep the lock on, now with the preset's ratio
        adoptRatio(w, h) {
            if (this.mode === OFF) return;
            const label = M().ratioLabel(w, h, this.ratios(), 0.0001);
            if (this.ratios().some((r) => r.label === label)) {
                this.mode = label;
            } else {
                this.mode = LOCK;
                this.lock = w / h;
            }
            store.set(`resolution_plus_mode_${this.tab}`, this.mode);
            this.showMode();
        }

        // the ratio follows the orientation of the sliders: after Forge's ⇅ (a round trip to the server, seconds on a
        // remote machine), a paste or a UI Preset, 2:3 becomes 3:2 once the sizes actually lie down, never before
        followOrientation() {
            const { w, h } = this.read();
            const ratio = this.ratioValue();
            if (!w || !h || w === h || !ratio || ratio === 1 || w > h === ratio > 1) return;
            if (this.mode === LOCK) {
                this.lock = 1 / this.lock;
            } else {
                const [a, b] = this.mode.split(":");
                const flipped = `${b}:${a}`;
                if (this.ratios().some((r) => r.label === flipped)) {
                    this.mode = flipped;
                } else {
                    this.mode = LOCK;
                    this.lock = 1 / ratio;
                }
                store.set(`resolution_plus_mode_${this.tab}`, this.mode);
            }
            this.showMode();
        }

        // a slider was dragged or a number typed: the other side follows the ratio
        moved(side, raw) {
            this.followOrientation();
            const value = parseFloat(raw);
            const ratio = this.ratioValue();
            if (!(value > 0) || !ratio) {
                this.refresh();
                return;
            }
            const size = M().follow(side, value, ratio, this.lim());
            this.write(size.w, size.h);
        }

        // endregion

        // region tiers and presets

        applyPreset(w, h) {
            const { top } = M().limits(this.lim());
            let size = { w, h };
            if (w > top || h > top) size = M().follow(w >= h ? "w" : "h", top, w / h, this.lim());
            this.adoptRatio(size.w, size.h);
            this.write(size.w, size.h);
        }

        // endregion

        // region screen

        mount() {
            const swap = byId(`${this.tab}_res_switch_btn`);
            const wBox = this.box("w");
            const hBox = this.box("h");
            if (!swap || !wBox || !hBox || swap.dataset.resolutionPlus) return false;
            swap.dataset.resolutionPlus = "1";

            // the same element and classes as Forge's own ⇅ ToolButton, so the three look like it
            const button = (kind, title) =>
                el("button", { className: `${swap.className} resolution-plus-button resolution-plus-${kind}`, type: "button", title });
            this.modeButton = button("mode", `${NAME}: aspect ratio (Off, lock the current one, or a ratio)`);
            this.presetButton = button("presets", `${NAME}: presets and megapixel tiers`);
            this.presetButton.innerHTML = ICON.presets;
            // before Aspect Ratio Helper's box when it got here first (Forge's ⇅ is then its copy, inside the box)
            const anchor = byId(HELPER.box(this.tab)) || swap;
            this.tools = el("div", { className: "resolution-plus-tools" }, [this.modeButton, this.presetButton]);
            anchor.before(this.tools);
            anchor.parentElement.classList.add("resolution-plus-column");

            this.readout = el("div", { className: "resolution-plus-readout" });
            hBox.after(this.readout);

            const toggle = (kind, open) => (e) => {
                e.preventDefault();
                if (popup && popup.owner === this && popup.kind === kind) closePopup();
                else open();
            };
            this.modeButton.addEventListener("click", toggle("mode", () => this.openModeMenu()));
            this.presetButton.addEventListener("click", toggle("presets", () => this.openPresets()));

            for (const side of ["w", "h"]) {
                const box = this.box(side);
                // range: follow while dragging; number: follow once the typing is done (Enter or leaving the field)
                box.addEventListener("input", (e) => {
                    if (this.busy) return;
                    if (e.target.type === "range") this.moved(side, e.target.value);
                });
                box.addEventListener("change", (e) => {
                    if (this.busy) return;
                    if (e.target.type === "number") this.moved(side, e.target.value);
                });
            }

            if (this.mode === LOCK) {
                const { w, h } = this.read();
                this.lock = w && h ? w / h : 1;
            } else if (this.mode !== OFF && !M().parseRatio(this.mode)) {
                this.mode = OFF;
            }
            this.showMode();
            this.refresh();
            return true;
        }

        // Settings changed: the lists are read again
        reload() {
            this.showMode();
            this.last = "";
            this.refresh();
        }

        showMode() {
            if (!this.modeButton) return;
            if (this.mode !== OFF && this.mode !== LOCK && !this.ratios().some((r) => r.label === this.mode)) {
                // a ratio no longer in Settings: keep it as a lock on that ratio
                const ratio = M().parseRatio(this.mode);
                this.mode = ratio ? LOCK : OFF;
                this.lock = ratio ? ratio.value : null;
            }
            // text in a span: a font size on the button itself would shrink Forge's em-sized ToolButton
            if (this.mode === LOCK) this.modeButton.innerHTML = ICON.lock;
            else
                this.modeButton.replaceChildren(
                    el("span", { className: "resolution-plus-label", textContent: this.mode === OFF ? "Off" : this.mode }),
                );
            this.modeButton.classList.toggle("resolution-plus-on", this.mode !== OFF);
        }

        // the size line and the tier shown; cheap, and skipped when nothing changed
        // with Aspect Ratio Helper (Neo) on, the ratio lock and ⇅ are its job: our Ratio button steps aside (and stays
        // Off, so two locks never pull the sliders apart); presets, megapixel pages and the size line stay. It sets up
        // on its own timer, before or after this script, so this is checked on every refresh.
        coexist() {
            const helper = !!byId(HELPER.select(this.tab));
            const yielding = helper && !!opt(KEY.yieldRatio);
            if (yielding === !!this.yielding) return;
            this.yielding = yielding;
            this.modeButton.classList.toggle("resolution-plus-hidden", yielding);
            if (yielding) {
                this.mode = OFF; // not stored: our own choice comes back if the helper is turned off
            } else {
                this.mode = store.get(`resolution_plus_mode_${this.tab}`) || OFF;
                if (this.mode === LOCK) {
                    const { w, h } = this.read();
                    this.lock = w && h ? w / h : 1;
                }
            }
            if (popup && popup.owner === this && popup.kind === "mode") closePopup();
            this.showMode();
        }

        refresh() {
            if (!this.readout) return;
            this.coexist();
            this.followOrientation();
            const { w, h } = this.read();
            const { top } = M().limits(this.lim());
            const key = `${w}x${h}:${top}:${this.mode}`;
            if (key === this.last) return;
            this.last = key;
            if (!w || !h) return;
            const ratio = M().ratioLabel(w, h, this.ratios());
            this.readout.textContent = `${w} × ${h} · ${M().formatMP(w, h)} · ${ratio} · max ${top}`;
        }

        // each ratio once, in the orientation of the image on screen (2:3 while it stands, 3:2 while it lies); ⇅ flips
        // the one in use
        openModeMenu() {
            const { w, h } = this.read();
            const lying = w > h;
            const oriented = M()
                .ratioPairs(opt(KEY.ratios))
                .map((pair) => {
                    const [a, b] = pair.label.split(":");
                    const written = pair.values[0];
                    if (written === 1) return pair.label;
                    return lying === written > 1 ? pair.label : `${b}:${a}`;
                });
            const items = [
                { value: OFF, label: "Off" },
                { value: LOCK, html: `${ICON.lock}<span>Lock</span>` },
                ...oriented.map((label) => ({ value: label, label })),
            ];
            openMenu(this, "mode", this.modeButton, items, this.mode, (value) => this.setMode(value));
        }

        openPresets() {
            closePopup();
            const lim = this.lim();
            const ratios = this.ratios();
            const tiers = this.tiers();
            const current = this.read();
            // each tier page starts with the size at the ratio in use (the lock's, or the current proportion), so changing
            // only the megapixels is one click
            let keep = this.ratioValue();
            if (!keep && opt(KEY.keepRatio) && current.w && current.h) keep = current.w / current.h;
            const pairs = M().ratioPairs(opt(KEY.ratios));
            // not when the ratio already has its own row
            const listed = keep && pairs.some((p) => p.values.some((v) => Math.abs(Math.log(keep / v)) < 0.0001));
            const sameRatio = (t) => (keep && !listed ? [M().toRow("Current", [M().sizeFor(keep, t, lim)])] : []);
            const pages = [["mine", "My presets", () => M().presetRows(opt(KEY.presets))]];
            for (const t of tiers)
                pages.push([String(t), `${t} MP`, () => [...sameRatio(t), ...M().tierRows(pairs, t, lim)]]);

            const remembered = store.get("resolution_plus_page");
            let page = pages.some(([id]) => id === remembered) ? remembered : "mine";
            const tierNow = M().matchTier(current.w, current.h, tiers);
            if (remembered === null && tierNow) page = String(tierNow);

            const nav = el("div", { className: "resolution-plus-nav" });
            const body = el("div", { className: "resolution-plus-body" });
            const close = el("button", { className: "resolution-plus-close", type: "button", textContent: "×", title: "Close" });
            close.addEventListener("click", closePopup);
            const node = el("div", { className: "resolution-plus-popup" }, [
                el("div", { className: "resolution-plus-head" }, [nav, close]),
                body,
            ]);

            const render = () => {
                nav.replaceChildren(
                    ...pages.map(([id, label]) => {
                        const b = el("button", { type: "button", textContent: label });
                        b.classList.toggle("selected", id === page);
                        b.addEventListener("click", () => {
                            page = id;
                            store.set("resolution_plus_page", id);
                            render();
                        });
                        return b;
                    }),
                );
                const rows = pages.find(([id]) => id === page)[2]();
                if (!rows.length) {
                    body.replaceChildren(
                        el("p", {
                            className: "resolution-plus-empty",
                            textContent: "No presets yet: add them in Settings > Resolution Plus > My presets.",
                        }),
                    );
                    return;
                }
                const now = this.read();
                const { top } = M().limits(lim);
                // how many sizes share a line in a cell: 1 when no cell has more (the megapixel pages), else 2
                const most = Math.max(1, ...rows.flatMap((r) => [r.portrait.length, r.landscape.length]));
                body.style.setProperty("--rp-per-cell", String(Math.min(2, most)));
                // one ratio per row: its sizes need only the megapixels; a mixed row also shows each size's ratio
                const chip = (s, rowLabel) => {
                    const ratio = M().ratioLabel(s.w, s.h, ratios);
                    const [a, b] = rowLabel.split(":");
                    const same = ratio === rowLabel || ratio === `${b}:${a}`;
                    const button = el("button", { type: "button", className: "resolution-plus-chip" }, [
                        el("span", { className: "resolution-plus-size", textContent: `${s.w} × ${s.h}` }),
                        el("span", {
                            className: "resolution-plus-meta",
                            textContent: same ? M().formatMP(s.w, s.h) : `${ratio} · ${M().formatMP(s.w, s.h)}`,
                        }),
                    ]);
                    button.classList.toggle("selected", s.w === now.w && s.h === now.h);
                    if (s.w > top || s.h > top) button.title = `Above the slider maximum (${top}); it will be scaled down`;
                    button.addEventListener("click", () => {
                        this.applyPreset(s.w, s.h);
                        closePopup();
                    });
                    return button;
                };
                const cell = (sizes, label, extra = "") =>
                    sizes.length
                        ? el("div", { className: `resolution-plus-cell ${extra}` }, sizes.map((s) => chip(s, label)))
                        : el("div", { className: `resolution-plus-cell resolution-plus-none ${extra}`, textContent: "—" });
                const head = el("div", { className: "resolution-plus-row resolution-plus-colhead" }, [
                    el("span"),
                    el("span", { innerHTML: `${ICON.portrait}Portrait` }),
                    el("span", { innerHTML: `${ICON.landscape}Landscape` }),
                ]);
                body.replaceChildren(
                    head,
                    ...rows.map((row) => {
                        const parts = [el("span", { className: "resolution-plus-rowlabel", textContent: row.label })];
                        const sided = row.portrait.length || row.landscape.length;
                        if (sided) parts.push(cell(row.portrait, row.label), cell(row.landscape, row.label));
                        if (row.square.length) parts.push(cell(row.square, row.label, "resolution-plus-wide"));
                        return el("div", { className: "resolution-plus-row" }, parts);
                    }),
                );
            };
            render();
            showLayer(this, "presets", node, this.presetButton, "side");
        }

        // endregion
    }

    const controllers = {};

    function mountAll() {
        if (!M()) return;
        const wanted = opt(KEY.img2img) ? ["txt2img", "img2img"] : ["txt2img"];
        for (const tab of wanted) {
            if (controllers[tab]) continue;
            const c = new Controller(tab);
            if (c.mount()) controllers[tab] = c;
        }
    }

    const reloadAll = () => Object.values(controllers).forEach((c) => c.reload());

    onUiLoaded(() => {
        onOptionsAvailable(() => {
            mountAll();
            fetchOptions().then(reloadAll);
            // values changed by Forge or other extensions (paste, UI Preset, swap) do not fire DOM events
            setInterval(() => Object.values(controllers).forEach((c) => c.refresh()), 500);
        });
    });

    // Apply settings: Forge's opts are new now; the server's copy is fetched again so neither is stale
    onOptionsChanged(() => {
        server = {};
        reloadAll();
        fetchOptions().then(reloadAll);
    });
})();
