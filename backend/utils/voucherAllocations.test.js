// ============================================================
// File: backend/utils/voucherAllocations.test.js
// Automated tests for the voucher module's pure logic.
// Run:  node --test            (Node 18+, no deps)
//       node --test --watch    (re-run on change)
//
// Covers helpers.js (voucher math/validation) and
// voucherAllocations.js (resolve / split / diff / build).
// resolveAllocations is exercised against a fake Cosmos container.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const {
  roundMoney,
  isPercentVoucher,
  getVoucherAllocations,
  voucherRemaining,
  isVoucherUsable,
  computeVoucherValue,
  voucherMatchesMerchant,
} = require("./helpers");

const {
  resolveAllocations,
  buildAllocationOps,
  buildRemovalOps,
  diffAllocationOps,
  splitVouchersAcrossTxs,
} = require("./voucherAllocations");

// ── Fixtures ──────────────────────────────────────────────────

const amountV = (over = {}) => ({
  id: "v_amount", valueType: "amount", initialValue: 50, percentValue: null,
  store: "Lidl", description: "PLN Lidl", isArchived: false,
  usedInTransactions: [], ...over,
});

const percentV = (over = {}) => ({
  id: "v_pct", valueType: "percent", initialValue: null, percentValue: 20,
  store: "Lidl", description: "20% Lidl", isArchived: false,
  usedInTransactions: [], ...over,
});

// Fake Cosmos container: container.item(id).read() → { resource }
function mockContainer(vouchers) {
  const byId = new Map(vouchers.map(v => [v.id, v]));
  return { item: (id) => ({ read: async () => ({ resource: byId.get(id) }) }) };
}

const CTX = { transactionId: "tx1", usedAt: "2026-06-18", description: "test" };

// ============================================================
// helpers.js
// ============================================================

describe("roundMoney", () => {
  test("rounds to 2 decimals", () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(10 / 3), 3.33);
    assert.equal(roundMoney(2.005 * 10) / 10 >= 2, true); // sanity, no throw
    assert.equal(roundMoney(16), 16);
  });
});

describe("isPercentVoucher", () => {
  test("percent → true", () => assert.equal(isPercentVoucher(percentV()), true));
  test("amount → false", () => assert.equal(isPercentVoucher(amountV()), false));
  test("missing valueType defaults to amount → false", () =>
    assert.equal(isPercentVoucher({ initialValue: 10 }), false));
});

describe("getVoucherAllocations (read-time fallback)", () => {
  test("new array shape wins", () => {
    const tx = { voucherAllocations: [{ voucherId: "a", amount: 10 }] };
    assert.deepEqual(getVoucherAllocations(tx), [{ voucherId: "a", amount: 10 }]);
  });
  test("legacy scalar synthesizes a single allocation", () => {
    const tx = { voucherId: "a", voucherAmount: 12.5 };
    assert.deepEqual(getVoucherAllocations(tx), [{ voucherId: "a", amount: 12.5 }]);
  });
  test("nothing → empty array", () => {
    assert.deepEqual(getVoucherAllocations({}), []);
    assert.deepEqual(getVoucherAllocations(null), []);
  });
});

describe("voucherRemaining (amount only)", () => {
  test("initial minus used", () =>
    assert.equal(voucherRemaining(amountV({ usedInTransactions: [{ amount: 30 }] })), 20));
  test("never below zero", () =>
    assert.equal(voucherRemaining(amountV({ usedInTransactions: [{ amount: 80 }] })), 0));
  test("no usage → full", () => assert.equal(voucherRemaining(amountV()), 50));
});

describe("isVoucherUsable", () => {
  test("amount with balance → true", () => assert.equal(isVoucherUsable(amountV()), true));
  test("amount depleted → false", () =>
    assert.equal(isVoucherUsable(amountV({ usedInTransactions: [{ amount: 50 }] })), false));
  test("percent unused → true", () => assert.equal(isVoucherUsable(percentV()), true));
  test("percent used (one-shot) → false", () =>
    assert.equal(isVoucherUsable(percentV({ usedInTransactions: [{ transactionId: "t", amount: 5 }] })), false));
  test("archived → false", () => assert.equal(isVoucherUsable(amountV({ isArchived: true })), false));
  test("null → false", () => assert.equal(isVoucherUsable(null), false));
});

describe("computeVoucherValue", () => {
  test("percent → base × pct / 100", () =>
    assert.equal(computeVoucherValue(percentV({ percentValue: 20 }), 80), 16));
  test("amount → min(remaining, base) capped by base", () =>
    assert.equal(computeVoucherValue(amountV({ initialValue: 50 }), 30), 30));
  test("amount → min(remaining, base) capped by remaining", () =>
    assert.equal(computeVoucherValue(amountV({ initialValue: 50 }), 80), 50));
});

describe("voucherMatchesMerchant (store-match)", () => {
  const v = amountV({ store: "Lidl" });
  test("identical", () => assert.equal(voucherMatchesMerchant(v, "Lidl"), true));
  test("case-insensitive", () => assert.equal(voucherMatchesMerchant(v, "lidl"), true));
  test("whitespace-tolerant", () => assert.equal(voucherMatchesMerchant(v, "  Lidl "), true));
  test("different shop → false", () => assert.equal(voucherMatchesMerchant(v, "Biedronka"), false));
  test("empty merchant → false", () => assert.equal(voucherMatchesMerchant(v, ""), false));
});

// ============================================================
// voucherAllocations.js — op builders
// ============================================================

describe("buildAllocationOps", () => {
  test("maps each allocation to an add op", () => {
    const ops = buildAllocationOps([{ voucherId: "a", amount: 10 }], CTX);
    assert.deepEqual(ops, [{
      voucherId: "a",
      op: { type: "add", transactionId: "tx1", amount: 10, usedAt: "2026-06-18", description: "test" },
    }]);
  });
  test("empty / nullish → []", () => {
    assert.deepEqual(buildAllocationOps([], CTX), []);
    assert.deepEqual(buildAllocationOps(null, CTX), []);
  });
});

describe("buildRemovalOps", () => {
  test("maps each allocation to a remove op", () => {
    assert.deepEqual(buildRemovalOps([{ voucherId: "a", amount: 10 }], "tx1"), [
      { voucherId: "a", op: { type: "remove", transactionId: "tx1" } },
    ]);
  });
});

describe("diffAllocationOps (PATCH minimal diff)", () => {
  test("unchanged → no ops", () => {
    const ops = diffAllocationOps([{ voucherId: "a", amount: 10 }], [{ voucherId: "a", amount: 10 }], CTX);
    assert.deepEqual(ops, []);
  });
  test("added", () => {
    const ops = diffAllocationOps([], [{ voucherId: "a", amount: 10 }], CTX);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op.type, "add");
  });
  test("removed", () => {
    const ops = diffAllocationOps([{ voucherId: "a", amount: 10 }], [], CTX);
    assert.deepEqual(ops, [{ voucherId: "a", op: { type: "remove", transactionId: "tx1" } }]);
  });
  test("amount changed → update", () => {
    const ops = diffAllocationOps([{ voucherId: "a", amount: 10 }], [{ voucherId: "a", amount: 20 }], CTX);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op.type, "update");
    assert.equal(ops[0].op.amount, 20);
  });
});

// ============================================================
// voucherAllocations.js — splitVouchersAcrossTxs
// ============================================================

describe("splitVouchersAcrossTxs", () => {
  test("amount voucher splits proportionally; last absorbs remainder", () => {
    const perTx = splitVouchersAcrossTxs([amountV({ id: "v", initialValue: 50 })],
      [{ amount: 60 }, { amount: 40 }]);
    assert.deepEqual(perTx, [[{ voucherId: "v", amount: 30 }], [{ voucherId: "v", amount: 20 }]]);
  });

  test("percent split equals percent × each tx", () => {
    const perTx = splitVouchersAcrossTxs([percentV({ id: "v", percentValue: 20 })],
      [{ amount: 60 }, { amount: 40 }]);
    assert.deepEqual(perTx, [[{ voucherId: "v", amount: 12 }], [{ voucherId: "v", amount: 8 }]]);
  });

  test("rounding remainder absorbed by last tx (sum is exact)", () => {
    const perTx = splitVouchersAcrossTxs([percentV({ id: "v", percentValue: 10 })],
      [{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.34 }]);
    const total = perTx.flat().reduce((s, a) => s + a.amount, 0);
    assert.equal(roundMoney(total), 10);
    assert.equal(perTx[2][0].amount, 3.34); // last carries the extra grosz
  });

  test("second voucher skipped once budget exhausted", () => {
    const perTx = splitVouchersAcrossTxs(
      [amountV({ id: "v1", initialValue: 100 }), percentV({ id: "v2", percentValue: 20 })],
      [{ amount: 50 }, { amount: 50 }]);
    assert.deepEqual(perTx, [[{ voucherId: "v1", amount: 50 }], [{ voucherId: "v1", amount: 50 }]]);
  });

  test("zero-total cart → empty allocations", () => {
    assert.deepEqual(splitVouchersAcrossTxs([amountV()], [{ amount: 0 }]), [[]]);
  });
});

// ============================================================
// voucherAllocations.js — resolveAllocations (async, mocked container)
// ============================================================

describe("resolveAllocations", () => {
  test("amount voucher: respects requested, sets voucherAmount", async () => {
    const c = mockContainer([amountV()]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "v_amount", amount: 50 }], 80, "Lidl");
    assert.equal(r.ok, true);
    assert.deepEqual(r.allocations, [{ voucherId: "v_amount", amount: 50 }]);
    assert.equal(r.voucherAmount, 50);
  });

  test("amount voucher capped at transaction budget", async () => {
    const c = mockContainer([amountV()]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "v_amount", amount: 50 }], 30, "Lidl");
    assert.equal(r.allocations[0].amount, 30);
  });

  test("percent voucher computed from gross, ignores requested", async () => {
    const c = mockContainer([percentV()]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "v_pct", amount: 999 }], 80, "Lidl");
    assert.equal(r.ok, true);
    assert.equal(r.allocations[0].amount, 16);
  });

  test("store mismatch → error", async () => {
    const c = mockContainer([amountV({ store: "Lidl" })]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "v_amount" }], 80, "Biedronka");
    assert.equal(r.ok, false);
    assert.match(r.error, /nie pasuje/);
  });

  test("missing voucher → error", async () => {
    const c = mockContainer([]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "ghost" }], 80, "Lidl");
    assert.equal(r.ok, false);
    assert.match(r.error, /nie istnieje/);
  });

  test("archived voucher → error", async () => {
    const c = mockContainer([amountV({ isArchived: true })]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "v_amount" }], 80, "Lidl");
    assert.equal(r.ok, false);
  });

  test("duplicate voucher in one tx → error", async () => {
    const c = mockContainer([amountV()]);
    const r = await resolveAllocations(c, "fam",
      [{ voucherId: "v_amount" }, { voucherId: "v_amount" }], 80, "Lidl");
    assert.equal(r.ok, false);
    assert.match(r.error, /dwa razy/);
  });

  test("depleted amount voucher → error", async () => {
    const c = mockContainer([amountV({ usedInTransactions: [{ transactionId: "other", amount: 50 }] })]);
    const r = await resolveAllocations(c, "fam", [{ voucherId: "v_amount", amount: 50 }], 80, "Lidl");
    assert.equal(r.ok, false);
    assert.match(r.error, /wykorzystany|środków/);
  });

  test("REGRESSION: editing a tx that consumed the voucher excludes its own usage", async () => {
    // Amount voucher fully used BY THIS tx — must stay usable when re-resolving for an edit.
    const c = mockContainer([amountV({ usedInTransactions: [{ transactionId: "tx_self", amount: 50 }] })]);
    const r = await resolveAllocations(
      c, "fam", [{ voucherId: "v_amount", amount: 50 }], 80, "Lidl", "tx_self");
    assert.equal(r.ok, true, r.error);
    assert.equal(r.allocations[0].amount, 50);
  });

  test("REGRESSION: one-shot percent re-confirmable on its own tx", async () => {
    const used = [{ transactionId: "tx_self", amount: 16 }];
    const c = mockContainer([percentV({ usedInTransactions: used })]);
    // without currentTransactionId → blocked
    const blocked = await resolveAllocations(c, "fam", [{ voucherId: "v_pct" }], 80, "Lidl");
    assert.equal(blocked.ok, false);
    // with currentTransactionId = own tx → allowed
    const ok = await resolveAllocations(c, "fam", [{ voucherId: "v_pct" }], 80, "Lidl", "tx_self");
    assert.equal(ok.ok, true, ok.error);
    assert.equal(ok.allocations[0].amount, 16);
  });

  test("Σ allocations never exceeds gross; later vouchers skipped when budget gone", async () => {
    const c = mockContainer([amountV({ id: "v_amount", initialValue: 50 }), percentV({ id: "v_pct" })]);
    const r = await resolveAllocations(c, "fam",
      [{ voucherId: "v_amount", amount: 50 }, { voucherId: "v_pct" }], 50, "Lidl");
    assert.equal(r.ok, true);
    assert.equal(r.voucherAmount, 50);
    assert.equal(r.allocations.length, 1); // percent had no budget left
  });

  test("empty allocation list → ok with zero", async () => {
    const c = mockContainer([]);
    const r = await resolveAllocations(c, "fam", [], 80, "Lidl");
    assert.deepEqual(r, { ok: true, allocations: [], voucherAmount: 0 });
  });
});
