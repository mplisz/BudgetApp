// ============================================================
// File: backend/utils/plannedSchemas.test.js
// POST / PATCH body schemas for planned expenses.
// Run:  node --test
//
// Same regression as transactionSchemas.test.js: defaults survive .partial()
// in zod 4, so every plan edit parsed `virtualSavings` to [] (the edit form
// never sends it) and `url` to "". The route only recomputes virtualSavings
// in some branches — in the others the saved months were wiped.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { PlannedPostSchema, PlannedPatchSchema, WishPostSchema } = require("./plannedSchemas");

describe("PlannedPatchSchema", () => {
  test("a single-field PATCH parses to that field and nothing else", () => {
    assert.deepEqual(PlannedPatchSchema.parse({ priority: 3 }), { priority: 3 });
  });

  test("omitted virtualSavings / url / tags / currency are not invented", () => {
    // Shape of what PlannedForm sends in edit mode (no virtualSavings, no url).
    const data = PlannedPatchSchema.parse({
      description: " Rower ", totalAmount: 3000, totalAmountPLN: 3000,
      targetCategoryId: "c", targetCategoryName: "C",
      targetSubcategoryId: "s", targetSubcategoryName: "S",
    });

    assert.equal(data.description, "Rower");
    for (const key of ["virtualSavings", "url", "tags", "priority", "monthlySavingDay", "originalCurrency", "fxRate"]) {
      assert.ok(!(key in data), `${key} must stay absent`);
    }
  });

  test("explicitly sent values still apply, including empty ones", () => {
    const data = PlannedPatchSchema.parse({ tags: [], url: "", virtualSavings: [] });
    assert.deepEqual(data, { tags: [], url: "", virtualSavings: [] });
  });

  test("entries inside virtualSavings[] still get their own defaults", () => {
    const { virtualSavings } = PlannedPatchSchema.parse({
      virtualSavings: [{ month: "2026-10", amount: 100, amountPLN: 100 }],
    });
    assert.deepEqual(virtualSavings, [{
      month: "2026-10", amount: 100, amountPLN: 100,
      fxRate: 1, paidByUser: false, dismissedByUser: false,
    }]);
  });

  test("an empty body is rejected", () => {
    const parsed = PlannedPatchSchema.safeParse({});
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.issues[0].message, "No fields to update.");
  });

  test("the URL rule still applies", () => {
    assert.equal(PlannedPatchSchema.safeParse({ url: "javascript:alert(1)" }).success, false);
    assert.equal(PlannedPatchSchema.parse({ url: " https://example.com " }).url, "https://example.com");
  });
});

describe("PlannedPostSchema", () => {
  const MINIMAL = {
    description: "Rower", totalAmount: 3000, totalAmountPLN: 3000,
    targetCategoryId: "c", targetCategoryName: "C",
    targetSubcategoryId: "s", targetSubcategoryName: "S",
    plannedMonth: "2027-03", mode: "envelope",
  };

  test("create-time defaults still fire for omitted fields", () => {
    const data = PlannedPostSchema.parse(MINIMAL);

    assert.equal(data.originalCurrency, "PLN");
    assert.equal(data.fxRate, 1);
    assert.deepEqual(data.tags, []);
    assert.equal(data.priority, 2);
    assert.equal(data.monthlySavingDay, 1);
    assert.equal(data.url, "");
    assert.deepEqual(data.virtualSavings, []);
  });

  test("mode and plannedMonth stay required", () => {
    const { mode, ...noMode } = MINIMAL;
    const { plannedMonth, ...noMonth } = MINIMAL;
    assert.equal(PlannedPostSchema.safeParse(noMode).success, false);
    assert.equal(PlannedPostSchema.safeParse(noMonth).success, false);
  });
});

describe("WishPostSchema", () => {
  test("a bare description is enough; defaults fill the rest", () => {
    const data = WishPostSchema.parse({ description: " Ekspres " });
    assert.equal(data.description, "Ekspres");
    assert.equal(data.url, "");
    assert.deepEqual(data.tags, []);
    assert.equal(data.priority, 2);
  });
});
