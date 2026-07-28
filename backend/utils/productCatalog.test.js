// ============================================================
// File: backend/utils/productCatalog.test.js
// Automated tests for the product catalog's pure logic.
// Run:  node --test            (Node 18+, no deps)
//
// Covers resolveTrackedProduct (whitelist matching, size/unit
// authority, packCount fallback) and packCountFromDescription.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const {
  packCountFromDescription,
  resolveTrackedProduct,
} = require("./productCatalog");

// ── Fixtures ──────────────────────────────────────────────────

const TRACKED = [
  { canonicalName: "Coca-Cola Zero", unit: "ml",  defaultSize: 1500 },
  { canonicalName: "Jaja L",         unit: "szt", defaultSize: 10 },
  { canonicalName: "Mleko UHT 3,2%", unit: "ml",  defaultSize: 1000 },
];

// ── packCountFromDescription ──────────────────────────────────

describe("packCountFromDescription", () => {
  test("reads a trailing xN token", () => {
    assert.equal(packCountFromDescription("Coca-Cola 1.5L x2"), 2);
    assert.equal(packCountFromDescription("Jaja L 10szt x3"), 3);
  });

  test("reads an N x prefix token", () => {
    assert.equal(packCountFromDescription("2 x Mleko UHT 3,2%"), 2);
    assert.equal(packCountFromDescription("4x Woda gazowana"), 4);
  });

  test("accepts the unicode multiplication sign", () => {
    assert.equal(packCountFromDescription("Coca-Cola ×2"), 2);
  });

  test("ignores glued size notation like 4x100g", () => {
    assert.equal(packCountFromDescription("Chusteczki 4x100g"), null);
  });

  test("ignores x1 (adds nothing over null) and counts above 99", () => {
    assert.equal(packCountFromDescription("Coca-Cola x1"), null);
  });

  test("null/empty/no-token descriptions give null", () => {
    assert.equal(packCountFromDescription(null), null);
    assert.equal(packCountFromDescription(""), null);
    assert.equal(packCountFromDescription("Mleko UHT 3,2% 1L"), null);
  });
});

// ── resolveTrackedProduct ─────────────────────────────────────

describe("resolveTrackedProduct", () => {
  test("drops products not on the whitelist", () => {
    const out = resolveTrackedProduct({ name: "Chipsy paprykowe" }, TRACKED, "Chipsy x2");
    assert.equal(out, null);
  });

  test("matches case/diacritics-insensitively and forces canonical spelling", () => {
    const out = resolveTrackedProduct({ name: "coca cola ZERO", unit: "ml", size: 1500 }, TRACKED);
    assert.equal(out.name, "Coca-Cola Zero");
  });

  test("keeps the model's packCount when set", () => {
    const out = resolveTrackedProduct(
      { name: "Coca-Cola Zero", unit: "ml", size: 1500, packCount: 4 },
      TRACKED,
      "Coca-Cola Zero 1,5L x2",     // description disagrees — model field wins
    );
    assert.equal(out.packCount, 4);
  });

  test("falls back to an xN token in the description when packCount missing", () => {
    const out = resolveTrackedProduct(
      { name: "Coca-Cola Zero", unit: "ml", size: 1500, packCount: null },
      TRACKED,
      "Coca-Cola Zero 1,5L x2",
    );
    assert.equal(out.packCount, 2);
  });

  test("no packCount anywhere → null (single purchase)", () => {
    const out = resolveTrackedProduct(
      { name: "Mleko UHT 3,2%", unit: "ml", size: 1000 },
      TRACKED,
      "Mleko UHT 3,2% 1L",
    );
    assert.equal(out.packCount, null);
  });

  test("tracked unit is authoritative; mismatched size falls back to defaultSize", () => {
    const out = resolveTrackedProduct(
      { name: "Jaja L", unit: "g", size: 550, packCount: null },
      TRACKED,
      "JAJA L 10SZT x2",
    );
    assert.equal(out.unit, "szt");
    assert.equal(out.size, 10);        // defaultSize, not the mismatched 550 g
    assert.equal(out.packCount, 2);    // description fallback still applies
  });
});
