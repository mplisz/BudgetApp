// ============================================================
// File: backend/utils/voucherSync.test.js
// Automated tests for voucher usage mutation + atomic batch sync.
// Run:  node --test
//
// Covers helpers.js:
//   syncVoucherUsage   — add / remove / update on usedInTransactions
//   revertVoucherSync  — restore a snapshot
//   syncVoucherBatch   — apply N ops; roll back all on any failure
//   revertVoucherBatch — reverse-order rollback
//
// Uses a stateful in-memory fake of the Cosmos container so we can assert
// the persisted state after upserts.
// ============================================================

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  syncVoucherUsage,
  revertVoucherSync,
  syncVoucherBatch,
  revertVoucherBatch,
} = require("./helpers");

// ── Stateful fake Cosmos container ────────────────────────────
// container.item(id).read()      → { resource }   (used by readItem)
// container.items.upsert(doc)    → { resource }   (persists + logs)

function mockDb(vouchers = []) {
  const store   = new Map(vouchers.map(v => [v.id, structuredClone(v)]));
  const upserts = [];

  const container = {
    item: (id) => ({
      read: async () => ({ resource: store.has(id) ? structuredClone(store.get(id)) : undefined }),
    }),
    items: {
      upsert: async (doc) => {
        store.set(doc.id, structuredClone(doc));
        upserts.push(doc.id);
        return { resource: structuredClone(doc) };
      },
    },
  };

  return {
    container,
    upserts,
    current: (id) => store.get(id),
    usedIds: (id) => (store.get(id)?.usedInTransactions || []).map(e => e.transactionId),
    amountFor: (id, txId) =>
      (store.get(id)?.usedInTransactions || []).find(e => e.transactionId === txId)?.amount,
  };
}

const voucher = (over = {}) => ({
  id: "v1", valueType: "amount", initialValue: 50, store: "Lidl",
  description: "PLN Lidl", isArchived: false, usedInTransactions: [], ...over,
});

const addOp = (over = {}) => ({ type: "add", transactionId: "tx1", amount: 50, usedAt: "2026-06-18", description: "d", ...over });

// ============================================================
// syncVoucherUsage
// ============================================================

describe("syncVoucherUsage", () => {
  test("add: appends a usage entry and persists", async () => {
    const db = mockDb([voucher()]);
    const res = await syncVoucherUsage(db.container, "v1", "fam", addOp());
    assert.ok(res);
    assert.deepEqual(db.usedIds("v1"), ["tx1"]);
    assert.equal(db.amountFor("v1", "tx1"), 50);
    assert.equal(res.resource.usedInTransactions.length, 1);
  });

  test("add: returns an independent previousState snapshot (pre-mutation)", async () => {
    const db = mockDb([voucher({ usedInTransactions: [{ transactionId: "old", amount: 10 }] })]);
    const res = await syncVoucherUsage(db.container, "v1", "fam", addOp());
    // snapshot reflects state BEFORE the add (just "old"), and isn't mutated after
    assert.deepEqual(res.previousState.usedInTransactions.map(e => e.transactionId), ["old"]);
    assert.deepEqual(db.usedIds("v1"), ["old", "tx1"]); // live store has both
  });

  test("add: idempotent — same transactionId twice does not duplicate", async () => {
    const db = mockDb([voucher()]);
    await syncVoucherUsage(db.container, "v1", "fam", addOp());
    await syncVoucherUsage(db.container, "v1", "fam", addOp({ amount: 999 }));
    assert.deepEqual(db.usedIds("v1"), ["tx1"]);
    assert.equal(db.amountFor("v1", "tx1"), 50); // unchanged by the second add
  });

  test("remove: drops only the matching transaction", async () => {
    const db = mockDb([voucher({ usedInTransactions: [
      { transactionId: "tx1", amount: 20 }, { transactionId: "tx2", amount: 30 },
    ] })]);
    await syncVoucherUsage(db.container, "v1", "fam", { type: "remove", transactionId: "tx1" });
    assert.deepEqual(db.usedIds("v1"), ["tx2"]);
  });

  test("update: changes amount/description of the matching entry", async () => {
    const db = mockDb([voucher({ usedInTransactions: [{ transactionId: "tx1", amount: 20, description: "old" }] })]);
    await syncVoucherUsage(db.container, "v1", "fam", { type: "update", transactionId: "tx1", amount: 35, description: "new" });
    assert.equal(db.amountFor("v1", "tx1"), 35);
    assert.equal(db.current("v1").usedInTransactions[0].description, "new");
  });

  test("missing voucher → null (no upsert)", async () => {
    const db = mockDb([]);
    const res = await syncVoucherUsage(db.container, "ghost", "fam", addOp());
    assert.equal(res, null);
    assert.equal(db.upserts.length, 0);
  });

  test("archived voucher → null", async () => {
    const db = mockDb([voucher({ isArchived: true })]);
    const res = await syncVoucherUsage(db.container, "v1", "fam", addOp());
    assert.equal(res, null);
  });

  test("add: amount is money-rounded", async () => {
    const db = mockDb([voucher()]);
    await syncVoucherUsage(db.container, "v1", "fam", addOp({ amount: 16.005 }));
    assert.equal(db.amountFor("v1", "tx1"), 16.01);
  });
});

// ============================================================
// revertVoucherSync
// ============================================================

describe("revertVoucherSync", () => {
  test("restores a snapshot via upsert", async () => {
    const db = mockDb([voucher()]);
    const { previousState } = await syncVoucherUsage(db.container, "v1", "fam", addOp());
    assert.deepEqual(db.usedIds("v1"), ["tx1"]);   // mutated
    await revertVoucherSync(db.container, previousState);
    assert.deepEqual(db.usedIds("v1"), []);        // back to pre-mutation
  });

  test("null snapshot → no-op, no throw", async () => {
    const db = mockDb([voucher()]);
    await revertVoucherSync(db.container, null);
    assert.equal(db.upserts.length, 0);
  });
});

// ============================================================
// syncVoucherBatch / revertVoucherBatch
// ============================================================

describe("syncVoucherBatch", () => {
  test("all ops succeed → ok with one snapshot per op", async () => {
    const db = mockDb([voucher({ id: "v1" }), voucher({ id: "v2" })]);
    const ops = [
      { voucherId: "v1", op: addOp({ transactionId: "tx1", amount: 10 }) },
      { voucherId: "v2", op: addOp({ transactionId: "tx1", amount: 20 }) },
    ];
    const res = await syncVoucherBatch(db.container, "fam", ops);
    assert.equal(res.ok, true);
    assert.equal(res.snapshots.length, 2);
    assert.deepEqual(db.usedIds("v1"), ["tx1"]);
    assert.deepEqual(db.usedIds("v2"), ["tx1"]);
  });

  test("ATOMIC: a failing op rolls back everything applied before it", async () => {
    // v1 exists, v2 is missing → v1's add must be unwound.
    const db = mockDb([voucher({ id: "v1" })]);
    const ops = [
      { voucherId: "v1",    op: addOp({ transactionId: "tx1", amount: 10 }) },
      { voucherId: "ghost", op: addOp({ transactionId: "tx1", amount: 20 }) },
    ];
    const res = await syncVoucherBatch(db.container, "fam", ops);
    assert.equal(res.ok, false);
    assert.equal(res.failedVoucherId, "ghost");
    assert.deepEqual(res.snapshots, []);
    assert.deepEqual(db.usedIds("v1"), []); // rolled back to empty
  });

  test("empty ops → ok with no snapshots", async () => {
    const db = mockDb([]);
    const res = await syncVoucherBatch(db.container, "fam", []);
    assert.deepEqual(res, { ok: true, snapshots: [] });
  });
});

describe("revertVoucherBatch", () => {
  test("restores every snapshot (reverse order)", async () => {
    const db = mockDb([voucher({ id: "v1" }), voucher({ id: "v2" })]);
    const s1 = await syncVoucherUsage(db.container, "v1", "fam", addOp({ transactionId: "tx1", amount: 10 }));
    const s2 = await syncVoucherUsage(db.container, "v2", "fam", addOp({ transactionId: "tx1", amount: 20 }));
    assert.deepEqual(db.usedIds("v1"), ["tx1"]);
    assert.deepEqual(db.usedIds("v2"), ["tx1"]);

    await revertVoucherBatch(db.container, [s1.previousState, s2.previousState]);
    assert.deepEqual(db.usedIds("v1"), []);
    assert.deepEqual(db.usedIds("v2"), []);
  });

  test("tolerates empty / nullish snapshot list", async () => {
    const db = mockDb([]);
    await revertVoucherBatch(db.container, []);
    await revertVoucherBatch(db.container, null);
    assert.equal(db.upserts.length, 0);
  });
});
