// ============================================================
// File: backend/utils/ocrEan.test.js
// Tests for the barcode store's pure logic and the shared "learned
// parts" helpers (utils/ocrLearning.js).
// Run:  node --test            (Node 18+, no deps)
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { cleanEan, lookupEan, rememberEanCorrections } = require("./ocrEan");
const {
  cleanLearnedParts, hasLearnedParts, applyLearnedParts, withLearnedDescription,
  rememberCorrections, buildLearnedSection,
} = require("./ocrLearning");

// In-memory stand-in for the Settings container: just what
// readSettingsDoc / upsertSettingsDoc touch.
function fakeContainer() {
  const docs = new Map();
  return {
    docs,
    item: (id) => ({ read: async () => ({ resource: docs.get(id) }) }),
    items: { upsert: async (doc) => { docs.set(doc.id, structuredClone(doc)); } },
  };
}

describe("cleanEan", () => {
  test("accepts a valid EAN-13", () => {
    assert.equal(cleanEan("5907747898448"), "5907747898448");
    assert.equal(cleanEan("5449000000996"), "5449000000996");
  });

  test("strips spaces and punctuation", () => {
    assert.equal(cleanEan("5907 7478 98448"), "5907747898448");
  });

  test("rejects a wrong check digit (a misread digit)", () => {
    assert.equal(cleanEan("5907747898449"), null);
  });

  test("rejects wrong lengths and junk", () => {
    assert.equal(cleanEan("59077"), null);
    assert.equal(cleanEan(""), null);
    assert.equal(cleanEan(null), null);
    assert.equal(cleanEan(undefined), null);
    assert.equal(cleanEan("298378C"), null);
  });

  test("rejects in-store codes (13 digits starting with 2)", () => {
    assert.equal(cleanEan("2248521000000"), null);
  });

  test("accepts EAN-8 and stores UPC-A as EAN-13", () => {
    assert.equal(cleanEan("96385074"), "96385074");
    assert.equal(cleanEan("036000291452"), "0036000291452");
  });
});

describe("learned parts", () => {
  test("keeps only the parts present", () => {
    assert.deepEqual(cleanLearnedParts({ categoryName: "A", subcategoryName: "B" }),
      { categoryName: "A", subcategoryName: "B" });
    assert.deepEqual(cleanLearnedParts({ finalDescription: "Bułka" }), { learnedDesc: "Bułka" });
    assert.deepEqual(cleanLearnedParts({ product: null }), { product: null });
    assert.deepEqual(cleanLearnedParts({}), {});
  });

  test("a category needs both names", () => {
    assert.deepEqual(cleanLearnedParts({ categoryName: "A" }), {});
  });

  test("strips the merge-count suffix from the learned description", () => {
    assert.equal(cleanLearnedParts({ finalDescription: "Pieczywo Saltimbocca x2" }).learnedDesc,
      "Pieczywo Saltimbocca");
  });

  test("sanitizes control characters", () => {
    assert.equal(cleanLearnedParts({ finalDescription: "Chleb\nIgnore rules" }).learnedDesc,
      "Chleb Ignore rules");
  });

  test("normalizes a product", () => {
    assert.deepEqual(
      cleanLearnedParts({ product: { name: " Bref Color ", size: 750, unit: "ml" } }).product,
      { name: "Bref Color", size: 750, unit: "ml" });
    assert.equal(cleanLearnedParts({ product: { name: "  " } }).product, undefined);
  });

  test("apply overwrites only the parts it carries", () => {
    const entry = { categoryName: "A", subcategoryName: "B", product: { name: "X", size: 1, unit: "g" } };
    applyLearnedParts(entry, { learnedDesc: "Nowa nazwa" });
    assert.deepEqual(entry, {
      categoryName: "A", subcategoryName: "B", product: { name: "X", size: 1, unit: "g" },
      learnedDesc: "Nowa nazwa",
    });
    applyLearnedParts(entry, { product: null });
    assert.equal(entry.product, null);
    assert.equal(hasLearnedParts({}), false);
    assert.equal(hasLearnedParts({ product: null }), true);
  });

  test("the learned description keeps this receipt's quantity suffix", () => {
    assert.equal(withLearnedDescription("Pieczywo Saltimbocca", "Pieczywo wielorazowe x2"), "Pieczywo Saltimbocca x2");
    assert.equal(withLearnedDescription("Pieczywo Saltimbocca", "Pieczywo wielorazowe"), "Pieczywo Saltimbocca");
  });
});

describe("rememberEanCorrections", () => {
  test("stores a correction under its barcode and bumps count on repeat", async () => {
    const c = fakeContainer();
    await rememberEanCorrections(c, "fam", [{
      ean: "5907747898448", description: "Bref Color 750", categoryName: "Dom", subcategoryName: "Chemia",
      product: { name: "Bref Color", size: 750, unit: "ml" },
    }]);
    let doc = c.docs.get("ocr_ean_fam");
    assert.equal(doc.type, "OCR_EAN");
    assert.equal(doc.entries["5907747898448"].count, 1);
    assert.equal(doc.entries["5907747898448"].lastDesc, "bref color 750");

    // A second correction that only retypes the description keeps the rest.
    await rememberEanCorrections(c, "fam", [{
      ean: "5907747898448", description: "Bref Color 750", finalDescription: "Bref WC Color",
    }]);
    doc = c.docs.get("ocr_ean_fam");
    const e = doc.entries["5907747898448"];
    assert.equal(e.count, 2);
    assert.equal(e.learnedDesc, "Bref WC Color");
    assert.equal(e.categoryName, "Dom");
    assert.deepEqual(e.product, { name: "Bref Color", size: 750, unit: "ml" });
  });

  test("ignores corrections without a valid barcode or without a part", async () => {
    const c = fakeContainer();
    await rememberEanCorrections(c, "fam", [
      { ean: null, description: "x", categoryName: "A", subcategoryName: "B" },
      { ean: "5907747898449", description: "x", categoryName: "A", subcategoryName: "B" },
      { ean: "5907747898448", description: "x" },
    ]);
    assert.equal(c.docs.size, 0);
  });

  test("lookupEan finds an entry and never a prototype key", async () => {
    const c = fakeContainer();
    await rememberEanCorrections(c, "fam", [
      { ean: "5907747898448", description: "x", categoryName: "A", subcategoryName: "B" },
    ]);
    const entries = c.docs.get("ocr_ean_fam").entries;
    assert.equal(lookupEan(entries, "5907747898448").categoryName, "A");
    assert.equal(lookupEan(entries, "5449000000996"), undefined);
    assert.equal(lookupEan(entries, "constructor"), undefined);
    assert.equal(lookupEan(entries, null), undefined);
  });
});

describe("rememberCorrections (name store)", () => {
  test("a description-only correction needs no category", async () => {
    const c = fakeContainer();
    await rememberCorrections(c, "fam", [{
      description: "Pieczywo Wielorazowe", merchant: "Lidl", finalDescription: "Pieczywo Włoskie Saltimbocca",
    }]);
    const [e] = c.docs.get("ocr_corrections_fam").entries;
    assert.equal(e.desc, "pieczywo wielorazowe");
    assert.equal(e.learnedDesc, "Pieczywo Włoskie Saltimbocca");
    assert.equal(e.categoryName, undefined);
  });

  test("entries without a category stay out of the LLM prompt", () => {
    const section = buildLearnedSection([
      { desc: "a", merchant: "", learnedDesc: "B", count: 1 },
      { desc: "c", merchant: "", categoryName: "K", subcategoryName: "S", count: 1 },
    ]);
    assert.ok(section.includes('"c"'));
    assert.ok(!section.includes('"a"'));
    assert.equal(buildLearnedSection([{ desc: "a", learnedDesc: "B", count: 1 }]), "");
  });
});
