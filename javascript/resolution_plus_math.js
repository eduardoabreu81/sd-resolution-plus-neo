// Resolution Plus for Forge Neo: the size math (ratios, megapixel tiers, the ratio lock, the preset list). No DOM here,
// so the same file runs in the browser (window.ResolutionPlusMath) and in the tests (node --test tests/).

(function (root) {
    const MP = 1024 * 1024; // 1 MP = 1024 x 1024, the size SDXL-era presets call "1 megapixel"

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function limits(lim) {
        const step = Math.max(1, Math.round(Number(lim && lim.step) || 64));
        const min = Number(lim && lim.min) || step;
        const max = Number(lim && lim.max) || 2048;
        const bottom = Math.ceil(min / step) * step;
        const top = Math.max(bottom, Math.floor(max / step) * step);
        return { step, bottom, top };
    }

    function snap(value, step) {
        return Math.max(step, Math.round(value / step) * step);
    }

    function parseRatio(text) {
        const m = /^\s*(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)\s*$/i.exec(String(text ?? ""));
        if (!m) return null;
        const w = parseFloat(m[1]);
        const h = parseFloat(m[2]);
        if (!(w > 0 && h > 0)) return null;
        return { label: `${m[1]}:${m[2]}`, value: w / h };
    }

    // "1:1, 2:3, 9:16" -> 1:1, 2:3, 3:2, 9:16, 16:9 (each ratio in both orientations, the written one first)
    function parseRatios(text) {
        const out = [];
        const seen = new Set();
        for (const part of String(text ?? "").split(",")) {
            const ratio = parseRatio(part);
            if (!ratio) continue;
            const [a, b] = ratio.label.split(":");
            for (const label of [`${a}:${b}`, `${b}:${a}`]) {
                if (seen.has(label)) continue;
                seen.add(label);
                out.push(parseRatio(label));
            }
        }
        return out;
    }

    function parseTiers(text) {
        const values = String(text ?? "")
            .split(",")
            .map((s) => parseFloat(s))
            .filter((v) => v > 0 && v <= 1024);
        return [...new Set(values)].sort((a, b) => a - b);
    }

    function megapixels(w, h) {
        return (w * h) / MP;
    }

    function formatMP(w, h) {
        const mp = megapixels(w, h);
        return `${mp < 10 ? mp.toFixed(2) : mp.toFixed(1)} MP`;
    }

    // one side moved to `value`: the other follows the ratio, both on the step and inside the limits (when the other
    // side would cross a limit it stops there and the moved side is brought back, so the ratio holds)
    function follow(driver, value, ratio, lim) {
        const { step, bottom, top } = limits(lim);
        const other = (a) => (driver === "w" ? a / ratio : a * ratio);
        const back = (b) => (driver === "w" ? b * ratio : b / ratio);
        let a = clamp(snap(value, step), bottom, top);
        let b = snap(other(a), step);
        if (b > top) {
            b = top;
            a = clamp(snap(back(b), step), bottom, top);
        } else if (b < bottom) {
            b = bottom;
            a = clamp(snap(back(b), step), bottom, top);
        }
        return driver === "w" ? { w: a, h: b } : { w: b, h: a };
    }

    // the size of `ratio` (width / height) closest to `mp` megapixels: a few heights on the step around the ideal one,
    // scored on the ratio first and the area second; then kept inside the limits
    function sizeFor(ratio, mp, lim) {
        const { step, bottom, top } = limits(lim);
        const area = mp * MP;
        const base = Math.round(Math.sqrt(area / ratio) / step);
        let best = null;
        for (let k = base - 2; k <= base + 2; k++) {
            const h = k * step;
            if (h < step) continue;
            const w = snap(h * ratio, step);
            const score = Math.abs(Math.log(w / h / ratio)) * 4 + Math.abs(Math.log((w * h) / area));
            if (!best || score < best.score) best = { w, h, score };
        }
        if (!best) return follow("w", step, ratio, lim);
        const { w, h } = best;
        if (w > top || h > top) return follow(w >= h ? "w" : "h", top, ratio, lim);
        if (w < bottom || h < bottom) return follow(w <= h ? "w" : "h", bottom, ratio, lim);
        return { w, h };
    }

    function matchTier(w, h, tiers, tolerance = 0.06) {
        const mp = megapixels(w, h);
        let best = null;
        for (const t of tiers || []) {
            const off = Math.abs(mp / t - 1);
            if (off <= tolerance && (best === null || off < best.off)) best = { tier: t, off };
        }
        return best ? best.tier : null;
    }

    function gcd(a, b) {
        while (b) [a, b] = [b, a % b];
        return a;
    }

    // the listed ratio the size is (close to), otherwise the reduced fraction, otherwise "1.62:1"
    function ratioLabel(w, h, ratios, tolerance = 0.03) {
        let best = null;
        for (const r of ratios || []) {
            const off = Math.abs(Math.log(w / h / r.value));
            if (off <= tolerance && (best === null || off < best.off)) best = { label: r.label, off };
        }
        if (best) return best.label;
        const g = gcd(Math.round(w), Math.round(h)) || 1;
        const a = Math.round(w) / g;
        const b = Math.round(h) / g;
        if (a <= 32 && b <= 32) return `${a}:${b}`;
        return w >= h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`;
    }

    // Aspect Ratio+ format: "> Group", "# comment", "1024 x 1536"; sizes before any group go to "Others"
    function parsePresets(text) {
        const groups = [];
        let current = null;
        for (const raw of String(text ?? "").split(/\r?\n/)) {
            const line = raw.replace(/#.*$/, "").trim();
            if (!line) continue;
            if (line.startsWith(">")) {
                current = { label: line.slice(1).trim() || "Presets", sizes: [] };
                groups.push(current);
                continue;
            }
            const m = /^(\d+)\s*[x×*,]\s*(\d+)$/i.exec(line);
            if (!m) continue;
            if (!current) {
                current = { label: "Others", sizes: [] };
                groups.push(current);
            }
            current.sizes.push({ w: parseInt(m[1], 10), h: parseInt(m[2], 10) });
        }
        return groups.filter((g) => g.sizes.length);
    }

    // a group split by orientation, for the popup's rows: portrait on the left, landscape on the right, square apart
    function toRow(label, sizes) {
        const row = { label, portrait: [], landscape: [], square: [] };
        for (const s of sizes) {
            if (s.h > s.w) row.portrait.push(s);
            else if (s.w > s.h) row.landscape.push(s);
            else row.square.push(s);
        }
        return row;
    }

    function presetRows(text) {
        return parsePresets(text).map((g) => toRow(g.label, g.sizes));
    }

    // "1:1, 2:3, 9:16" -> one row per written ratio, both orientations of it
    function ratioPairs(text) {
        const out = [];
        const seen = new Set();
        for (const part of String(text ?? "").split(",")) {
            const ratio = parseRatio(part);
            if (!ratio) continue;
            const [a, b] = ratio.label.split(":");
            const key = [a, b].sort().join(":");
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ label: ratio.label, values: ratio.value === 1 ? [1] : [ratio.value, 1 / ratio.value] });
        }
        return out;
    }

    // one tier: a row per ratio of the list, each with its portrait and landscape size
    function tierRows(pairs, mp, lim) {
        return (pairs || []).map((pair) =>
            toRow(
                pair.label,
                pair.values.map((v) => sizeFor(v, mp, lim)),
            ),
        );
    }

    const api = {
        MP,
        limits,
        snap,
        parseRatio,
        parseRatios,
        parseTiers,
        megapixels,
        formatMP,
        follow,
        sizeFor,
        matchTier,
        ratioLabel,
        parsePresets,
        toRow,
        presetRows,
        ratioPairs,
        tierRows,
    };
    root.ResolutionPlusMath = api;
    if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
