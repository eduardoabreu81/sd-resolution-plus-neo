// node --test tests/math.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../javascript/resolution_plus_math.js");

const LIM = { min: 64, max: 8192, step: 64 };
const r = (label) => M.parseRatio(label).value;

test("ratios come in both orientations, the written one first", () => {
    const labels = M.parseRatios("1:1, 2:3, 9:16, junk, 2:3").map((x) => x.label);
    assert.deepEqual(labels, ["1:1", "2:3", "3:2", "9:16", "16:9"]);
});

test("tiers are sorted and unique", () => {
    assert.deepEqual(M.parseTiers("4, 1, 2, 1, x, 0, 1.5"), [1, 1.5, 2, 4]);
});

test("1 MP sizes are the SDXL ones", () => {
    assert.deepEqual(M.sizeFor(1, 1, LIM), { w: 1024, h: 1024 });
    assert.deepEqual(M.sizeFor(r("16:9"), 1, LIM), { w: 1344, h: 768 });
    assert.deepEqual(M.sizeFor(r("9:16"), 1, LIM), { w: 768, h: 1344 });
});

test("bigger tiers keep the ratio", () => {
    assert.deepEqual(M.sizeFor(r("16:9"), 2, LIM), { w: 1920, h: 1088 });
    assert.deepEqual(M.sizeFor(r("16:9"), 4, LIM), { w: 2752, h: 1536 });
    assert.deepEqual(M.sizeFor(1, 4, LIM), { w: 2048, h: 2048 });
    assert.deepEqual(M.sizeFor(1, 16, LIM), { w: 4096, h: 4096 });
    for (const label of ["2:3", "3:4", "4:5", "9:16", "9:21", "21:9"]) {
        for (const mp of [1, 2, 4, 8, 16]) {
            const { w, h } = M.sizeFor(r(label), mp, LIM);
            assert.equal(w % 64, 0);
            assert.equal(h % 64, 0);
            assert.ok(Math.abs(Math.log(w / h / r(label))) < 0.06, `${label} ${mp} MP -> ${w}x${h}`);
            // at 1 MP the 64 step is coarse for 9:21 (704 x 1664 is the closest pair, 1.12 MP)
            assert.ok(Math.abs(M.megapixels(w, h) / mp - 1) < 0.12, `${label} ${mp} MP -> ${w}x${h}`);
        }
    }
});

test("a tier past the slider maximum stops at it and keeps the ratio", () => {
    const small = { min: 64, max: 2048, step: 64 };
    const { w, h } = M.sizeFor(r("16:9"), 8, small);
    assert.equal(w, 2048);
    assert.equal(h, 1152);
});

test("the lock: the other side follows, inside the limits", () => {
    assert.deepEqual(M.follow("w", 1920, r("16:9"), LIM), { w: 1920, h: 1088 });
    assert.deepEqual(M.follow("h", 1536, r("2:3"), LIM), { w: 1024, h: 1536 });
    // typed off the step: rounded like Forge's own blur rounding
    assert.deepEqual(M.follow("w", 1000, 1, LIM), { w: 1024, h: 1024 });
    // height would pass the maximum: it stops there and the width comes back
    assert.deepEqual(M.follow("w", 4096, r("9:21"), { min: 64, max: 4096, step: 64 }), { w: 1728, h: 4096 });
    // height would go under the minimum
    assert.deepEqual(M.follow("w", 128, r("21:9"), { min: 128, max: 8192, step: 64 }), { w: 320, h: 128 });
});

test("matchTier and the labels", () => {
    assert.equal(M.matchTier(1344, 768, [1, 2, 4]), 1);
    assert.equal(M.matchTier(2752, 1536, [1, 2, 4]), 4);
    assert.equal(M.matchTier(1600, 1600, [1, 2, 4]), null);
    const ratios = M.parseRatios("1:1, 2:3, 9:16");
    assert.equal(M.ratioLabel(1344, 768, ratios), "16:9");
    assert.equal(M.ratioLabel(1024, 1536, ratios), "2:3");
    assert.equal(M.ratioLabel(1280, 1024, ratios), "5:4");
    assert.equal(M.ratioLabel(1000, 617, ratios), "1.62:1");
    assert.equal(M.formatMP(1024, 1024), "1.00 MP");
    assert.equal(M.formatMP(4096, 4096), "16.0 MP");
});

test("presets in the Aspect Ratio+ format", () => {
    const groups = M.parsePresets("640 x 1536\n# a comment\n> Portrait 2:3\n1024 x 1536\n1152x1728 # big\n\n> Empty\n> Wide\n1792 × 768");
    assert.deepEqual(groups, [
        { label: "Others", sizes: [{ w: 640, h: 1536 }] },
        { label: "Portrait 2:3", sizes: [{ w: 1024, h: 1536 }, { w: 1152, h: 1728 }] },
        { label: "Wide", sizes: [{ w: 1792, h: 768 }] },
    ]);
});

const flat = (sizes) => sizes.map((s) => `${s.w}x${s.h}`);

test("preset rows: portrait left, landscape right, square apart", () => {
    const rows = M.presetRows("> 2:3\n1024 x 1536\n1536 x 1024\n1152 x 1728\n> Square\n1024 x 1024\n> 21:9\n1792 x 768");
    assert.deepEqual(
        rows.map((r) => [r.label, flat(r.portrait), flat(r.landscape), flat(r.square)]),
        [
            ["2:3", ["1024x1536", "1152x1728"], ["1536x1024"], []],
            ["Square", [], [], ["1024x1024"]],
            ["21:9", [], ["1792x768"], []],
        ],
    );
});

test("ratio pairs: one per written ratio, repeats and flips dropped", () => {
    const pairs = M.ratioPairs("1:1, 2:3, 3:2, 9:16, x");
    assert.deepEqual(
        pairs.map((p) => [p.label, p.values.length]),
        [
            ["1:1", 1],
            ["2:3", 2],
            ["9:16", 2],
        ],
    );
});

test("tier rows: each ratio in both orientations", () => {
    const rows = M.tierRows(M.ratioPairs("1:1, 2:3, 16:9"), 4, LIM);
    assert.deepEqual(
        rows.map((r) => [r.label, flat(r.portrait), flat(r.landscape), flat(r.square)]),
        [
            ["1:1", [], [], ["2048x2048"]],
            ["2:3", ["1664x2496"], ["2496x1664"], []],
            ["16:9", ["1536x2752"], ["2752x1536"], []],
        ],
    );
});
