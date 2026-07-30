// ============================================================
// File: backend/utils/categoryType.test.js
// The server-side authority for a transaction's type.
// Run:  node --test
//
// The regression behind this module: the type used to be whatever the client
// sent, and a form that defaulted it to "EXPENSE" on edit-load silently
// converted SAVING transactions. These tests pin the rule that the category
// wins — and that an unresolvable category degrades to the client's answer
// rather than blocking the save.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { resolveTxType, applyTxType } = require("./categoryType");

// ── Fake Cosmos container ─────────────────────────────────────

const FAMILY = "MMs";

function fakeContainer(docs, { throwOn } = {}) {
  const reads = [];
  return {
    reads,
    item(id, partitionKey) {
      return {
        async read() {
          reads.push(id);
          assert.equal(partitionKey, FAMILY, "must read within the family partition");
          if (throwOn === id) throw new Error("boom");
          const doc = docs[id];
          if (!doc) { const e = new Error("not found"); e.code = 404; throw e; }
          return { resource: doc };
        },
      };
    },
  };
}

const CATEGORIES = {
  // Root categories
  cat_oszczednosci:  { id: "cat_oszczednosci",  type: "SAVING" },
  cat_spozywcze:     { id: "cat_spozywcze",     type: "EXPENSE" },
  // Subcategory carrying its own inherited type (the normal case)
  sub_wakacje:       { id: "sub_wakacje", parentCategoryId: "cat_oszczednosci", type: "SAVING" },
  // Legacy subcategory with no type of its own
  sub_legacy:        { id: "sub_legacy",  parentCategoryId: "cat_oszczednosci" },
  // Subcategory with a junk type
  sub_junk:          { id: "sub_junk",    parentCategoryId: "cat_spozywcze", type: "NONSENSE" },
};

// ── resolveTxType ─────────────────────────────────────────────

describe("resolveTxType", () => {
  test("takes the type from the subcategory", async () => {
    const c = fakeContainer(CATEGORIES);
    const out = await resolveTxType(c, FAMILY, { subcategoryId: "sub_wakacje" }, "EXPENSE");
    assert.equal(out, "SAVING");
  });

  test("overrides a wrong client answer", async () => {
    const c = fakeContainer(CATEGORIES);
    // "EXPENSE" is what the buggy form used to send for this very subcategory.
    const out = await resolveTxType(c, FAMILY, { subcategoryId: "sub_wakacje" }, "EXPENSE");
    assert.equal(out, "SAVING");
  });

  test("falls back to the parent when the subcategory carries no type", async () => {
    const c = fakeContainer(CATEGORIES);
    const out = await resolveTxType(
      c, FAMILY, { subcategoryId: "sub_legacy", categoryId: "cat_oszczednosci" }, "EXPENSE",
    );
    assert.equal(out, "SAVING");
  });

  test("ignores a junk type on the subcategory and asks the parent", async () => {
    const c = fakeContainer(CATEGORIES);
    const out = await resolveTxType(c, FAMILY, { subcategoryId: "sub_junk" }, "SAVING");
    assert.equal(out, "EXPENSE");
  });

  test("keeps the fallback when the category is gone", async () => {
    const c = fakeContainer(CATEGORIES);
    const out = await resolveTxType(c, FAMILY, { subcategoryId: "sub_deleted" }, "SAVING");
    assert.equal(out, "SAVING");
  });

  test("keeps the fallback when the read throws — a save must not break", async () => {
    const c = fakeContainer(CATEGORIES, { throwOn: "sub_wakacje" });
    const out = await resolveTxType(c, FAMILY, { subcategoryId: "sub_wakacje" }, "SAVING");
    assert.equal(out, "SAVING");
  });

  test("keeps the fallback when there is no category at all", async () => {
    const c = fakeContainer(CATEGORIES);
    const out = await resolveTxType(c, FAMILY, {}, "TRANSFER");
    assert.equal(out, "TRANSFER");
    assert.equal(c.reads.length, 0, "no id to read → no I/O");
  });

  test("reads once per distinct subcategory when a cache is shared", async () => {
    const c = fakeContainer(CATEGORIES);
    const cache = new Map();
    for (let i = 0; i < 5; i++) {
      await resolveTxType(c, FAMILY, { subcategoryId: "sub_wakacje" }, "EXPENSE", cache);
    }
    await resolveTxType(c, FAMILY, { subcategoryId: "sub_junk" }, "EXPENSE", cache);
    // sub_wakacje once, then sub_junk + its parent lookup.
    assert.deepEqual(c.reads, ["sub_wakacje", "sub_junk", "cat_spozywcze"]);
  });

  test("caches an unresolvable category too, without losing the fallback", async () => {
    const c = fakeContainer(CATEGORIES);
    const cache = new Map();
    const a = await resolveTxType(c, FAMILY, { subcategoryId: "sub_gone" }, "SAVING", cache);
    const b = await resolveTxType(c, FAMILY, { subcategoryId: "sub_gone" }, "SAVING", cache);
    assert.equal(a, "SAVING");
    assert.equal(b, "SAVING");
    assert.equal(c.reads.length, 1, "second call served from cache");
  });
});

// ── applyTxType ───────────────────────────────────────────────

describe("applyTxType", () => {
  test("stamps the resolved type onto a copy, leaving other fields alone", async () => {
    const c = fakeContainer(CATEGORIES);
    const payload = { type: "EXPENSE", subcategoryId: "sub_wakacje", amount: 2000, description: "Wakacje" };
    const out = await applyTxType(c, FAMILY, payload);
    assert.equal(out.type, "SAVING");
    assert.equal(out.amount, 2000);
    assert.equal(out.description, "Wakacje");
    assert.equal(payload.type, "EXPENSE", "input must not be mutated");
  });

  test("defaults to EXPENSE when the client sent nothing and nothing resolves", async () => {
    const c = fakeContainer(CATEGORIES);
    const out = await applyTxType(c, FAMILY, { subcategoryId: "sub_gone" });
    assert.equal(out.type, "EXPENSE");
  });
});
