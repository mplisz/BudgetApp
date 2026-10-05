// ============================================================
// File: backend/utils/lineItemMove.test.js
// Run:  node --test            (Node 18+, no deps)
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { planLineMove, isMergeTarget, moveBlocker } = require("./lineItemMove");

const line = (description, amount) => ({ description, amount, originalAmount: amount, originalCurrency: "PLN" });

const source = (over = {}) => ({
  id: "tx1", receiptId: "r1", subcategoryId: "s1", priority: 2,
  originalCurrency: "PLN", fxRate: 1, tags: ["t_home"], description: "Biedronka",
  amount: 60, originalAmount: 60,
  lineItems: [line("Mleko", 5), line("Szampon", 25.5), line("Chleb", 29.5)],
  returns: [], ...over,
});

describe("planLineMove", () => {
  test("moves picked lines into a new transaction and re-totals both", () => {
    const plan = planLineMove(source(), [1], ["t_kasia"]);
    assert.equal(plan.targetIsNew, true);
    assert.equal(plan.source.amount, 34.5);
    assert.equal(plan.source.lineItems.length, 2);
    assert.equal(plan.source.description, "Biedronka");
    assert.equal(plan.target.amount, 25.5);
    assert.equal(plan.target.description, "Szampon");   // single line → product name
  });

  test("a lone remaining line names its transaction after the product", () => {
    const plan = planLineMove(source(), [0, 1], ["t_kasia"]);
    assert.equal(plan.source.description, "Chleb");
    assert.equal(plan.target.description, "Biedronka");
    assert.equal(plan.target.amount, 30.5);
  });

  test("merges into a sibling and keeps its receipt label", () => {
    const sibling = source({ id: "tx2", tags: ["t_kasia"], description: "Biedronka",
      amount: 10, originalAmount: 10, lineItems: [line("Gazeta", 4), line("Guma", 6)] });
    const plan = planLineMove(source(), [0], ["t_kasia"], sibling);
    assert.equal(plan.targetIsNew, false);
    assert.equal(plan.target.lineItems.length, 3);
    assert.equal(plan.target.amount, 15);
  });

  test("a sibling saved without a breakdown becomes its own first line", () => {
    const sibling = source({ id: "tx2", tags: ["t_kasia"], description: "Gazeta", amount: 4,
      originalAmount: 4, lineItems: undefined });
    const plan = planLineMove(source(), [0], ["t_kasia"], sibling);
    assert.deepEqual(plan.target.lineItems.map(l => l.description), ["Gazeta", "Mleko"]);
    assert.equal(plan.target.amount, 9);
  });

  test("picking every line is a plain retag", () => {
    assert.deepEqual(planLineMove(source(), [0, 1, 2], ["t_kasia"]), { retag: true });
  });

  test("rejects bad indices, unchanged tags, returns and vouchers", () => {
    assert.ok(planLineMove(source(), [], ["x"]).error);
    assert.ok(planLineMove(source(), [7], ["x"]).error);
    assert.ok(planLineMove(source(), [0], ["t_home"]).error);
    assert.ok(planLineMove(source({ returns: [{ amount: 1 }] }), [0], ["x"]).error);
    assert.ok(planLineMove(source({ voucherAllocations: [{ voucherId: "v", amount: 5 }] }), [0], ["x"]).error);
  });
});

describe("isMergeTarget", () => {
  const cand = (over = {}) => source({ id: "tx2", tags: ["t_kasia"], ...over });
  test("same receipt, category, priority and tags", () => {
    assert.equal(isMergeTarget(cand(), source(), ["t_kasia"]), true);
  });
  test("tag order does not matter", () => {
    assert.equal(isMergeTarget(cand({ tags: ["b", "a"] }), source(), ["a", "b"]), true);
  });
  test("other receipt, subcategory, tags, archived or voucher → no", () => {
    assert.equal(isMergeTarget(cand({ receiptId: "r2" }), source(), ["t_kasia"]), false);
    assert.equal(isMergeTarget(cand({ subcategoryId: "s2" }), source(), ["t_kasia"]), false);
    assert.equal(isMergeTarget(cand(), source(), ["other"]), false);
    assert.equal(isMergeTarget(cand({ isArchived: true }), source(), ["t_kasia"]), false);
    assert.equal(isMergeTarget(cand({ useVoucher: true }), source(), ["t_kasia"]), false);
    assert.equal(isMergeTarget(source(), source(), ["t_home"]), false);   // itself
  });
  test("manual tx without a receipt never merges", () => {
    assert.equal(isMergeTarget(cand({ receiptId: null }), source({ receiptId: null }), ["t_kasia"]), false);
  });
});

test("moveBlocker is null for a plain transaction", () => {
  assert.equal(moveBlocker(source()), null);
});
