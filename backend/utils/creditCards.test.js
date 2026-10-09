// ============================================================
// File: backend/utils/creditCards.test.js
// The integrity rules of the cards document.
// Run:  node --test
//
// Two things here must never regress: a transaction can only point at one of
// the family's own, active cards — and a failed read can never turn into an
// empty document that overwrites the repayment history.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const {
  cardsDocId, readCards, findActiveCard, updateCards, applyCardId, buildInterestExpenseDoc,
} = require("./creditCards");

const FAMILY = "MMs";
const DOC_ID = cardsDocId(FAMILY);

const card = (id, extra = {}) => ({ id, name: `Karta ${id}`, isArchived: false, ...extra });

// ── Fake Cosmos container ─────────────────────────────────────
// One document, with a version that moves on every write. `failRead` throws a
// non-404; `conflicts` makes the next N writes lose the optimistic lock.

function fakeContainer({ doc = null, failRead = false, conflicts = 0 } = {}) {
  const state = { doc, version: 1, reads: 0, writes: [] };

  const write = (kind, next, options) => {
    if (conflicts > 0) {
      conflicts--;
      throw Object.assign(new Error("conflict"), { code: kind === "create" ? 409 : 412 });
    }
    if (kind === "create" && state.doc) throw Object.assign(new Error("exists"), { code: 409 });
    if (kind === "upsert") {
      assert.equal(options?.accessCondition?.condition, `v${state.version}`, "upsert must carry the ETag it read");
    }
    state.version++;
    state.doc = next;
    state.writes.push(kind);
  };

  return {
    state,
    item(id, partitionKey) {
      return {
        async read() {
          assert.equal(id, DOC_ID);
          assert.equal(partitionKey, FAMILY, "must read within the family partition");
          state.reads++;
          if (failRead) throw Object.assign(new Error("throttled"), { code: 429 });
          return state.doc
            ? { resource: state.doc, etag: `v${state.version}` }
            : { resource: undefined };
        },
      };
    },
    items: {
      async create(next)          { write("create", next); },
      async upsert(next, options) { write("upsert", next, options); },
    },
  };
}

// ── readCards / findActiveCard ────────────────────────────────

describe("readCards", () => {
  test("no document yet means no cards, not an error", async () => {
    assert.deepEqual(await readCards(fakeContainer(), FAMILY), { cards: [], repayments: [] });
  });

  test("a document missing a list still reads as two lists", async () => {
    const c = fakeContainer({ doc: { id: DOC_ID, cards: [card("a")] } });
    assert.deepEqual(await readCards(c, FAMILY), { cards: [card("a")], repayments: [] });
  });
});

describe("findActiveCard", () => {
  const state = { cards: [card("a"), card("old", { isArchived: true })], repayments: [] };

  test("finds a live card", () => assert.equal(findActiveCard(state, "a").id, "a"));
  test("an archived card is not active", () => assert.equal(findActiveCard(state, "old"), null));
  test("an unknown or empty id is not a card", () => {
    assert.equal(findActiveCard(state, "nope"), null);
    assert.equal(findActiveCard(state, null), null);
  });
});

// ── updateCards ───────────────────────────────────────────────

describe("updateCards", () => {
  test("the first save creates the document in the family partition", async () => {
    const c = fakeContainer();
    await updateCards(c, FAMILY, s => { s.cards.push(card("a")); return {}; });

    assert.deepEqual(c.state.writes, ["create"]);
    assert.equal(c.state.doc.id, DOC_ID);
    assert.equal(c.state.doc.userId, FAMILY);
    assert.deepEqual(c.state.doc.cards, [card("a")]);
    assert.deepEqual(c.state.doc.repayments, []);
  });

  test("later saves keep what was already there", async () => {
    const c = fakeContainer({ doc: { id: DOC_ID, userId: FAMILY, cards: [card("a")], repayments: [{ id: "r1" }] } });
    await updateCards(c, FAMILY, s => { s.repayments.push({ id: "r2" }); return {}; });

    assert.deepEqual(c.state.writes, ["upsert"]);
    assert.deepEqual(c.state.doc.cards, [card("a")]);
    assert.deepEqual(c.state.doc.repayments, [{ id: "r1" }, { id: "r2" }]);
  });

  test("an aborting change writes nothing and is handed back", async () => {
    const c = fakeContainer({ doc: { id: DOC_ID, cards: [], repayments: [] } });
    const out = await updateCards(c, FAMILY, () => ({ status: 404, error: "Credit card not found." }));

    assert.deepEqual(out, { status: 404, error: "Credit card not found." });
    assert.deepEqual(c.state.writes, []);
  });

  test("a lost optimistic lock re-reads and applies the change again", async () => {
    const c = fakeContainer({ doc: { id: DOC_ID, cards: [], repayments: [] }, conflicts: 1 });
    await updateCards(c, FAMILY, s => { s.repayments.push({ id: "r1" }); return {}; });

    assert.equal(c.state.reads, 2);
    assert.deepEqual(c.state.doc.repayments, [{ id: "r1" }]);
  });

  test("a conflict that never clears surfaces instead of looping", async () => {
    const c = fakeContainer({ doc: { id: DOC_ID, cards: [], repayments: [] }, conflicts: 99 });
    await assert.rejects(updateCards(c, FAMILY, () => ({})), { code: 412 });
  });

  // The reason this isn't upsertSettingsDoc: a read that fails is not a
  // missing document.
  test("a failed read throws — it never starts over from an empty document", async () => {
    const c = fakeContainer({ doc: { id: DOC_ID, cards: [card("a")], repayments: [{ id: "r1" }] }, failRead: true });
    await assert.rejects(updateCards(c, FAMILY, s => { s.cards.push(card("b")); return {}; }), { code: 429 });
    assert.deepEqual(c.state.writes, []);
  });
});

// ── applyCardId ───────────────────────────────────────────────

describe("applyCardId", () => {
  const doc = { id: DOC_ID, cards: [card("a"), card("old", { isArchived: true })], repayments: [] };
  const tx  = (extra) => ({ type: "EXPENSE", amount: 10, ...extra });

  test("keeps the card on an expense paid with the family's own card", async () => {
    const out = await applyCardId(fakeContainer({ doc }), FAMILY, tx({ cardId: "a" }));
    assert.deepEqual(out, { ok: true, data: tx({ cardId: "a" }) });
  });

  test("rejects a card that is not the family's", async () => {
    const out = await applyCardId(fakeContainer({ doc }), FAMILY, tx({ cardId: "someone_elses" }));
    assert.deepEqual(out, { ok: false, error: "Credit card not found." });
  });

  test("rejects an archived card", async () => {
    const out = await applyCardId(fakeContainer({ doc }), FAMILY, tx({ cardId: "old" }));
    assert.equal(out.ok, false);
  });

  test("drops the card from anything that is not an expense, without failing the save", async () => {
    const out = await applyCardId(fakeContainer({ doc }), FAMILY, { type: "SAVING", amount: 10, cardId: "a" });
    assert.deepEqual(out, { ok: true, data: { type: "SAVING", amount: 10 } });
  });

  test("no card: no read at all, and no cardId key left behind", async () => {
    const c = fakeContainer({ doc });
    for (const cardId of [null, undefined]) {
      const out = await applyCardId(c, FAMILY, tx({ cardId }));
      assert.deepEqual(out, { ok: true, data: tx() });
      assert.equal("cardId" in out.data, false);
    }
    assert.equal(c.state.reads, 0);
  });

  test("a shared cache reads the cards once for a whole batch", async () => {
    const c     = fakeContainer({ doc });
    const cache = new Map();
    await applyCardId(c, FAMILY, tx({ cardId: "a" }), cache);
    await applyCardId(c, FAMILY, tx({ cardId: "a" }), cache);
    assert.equal(c.state.reads, 1);
  });
});

// ── buildInterestExpenseDoc ───────────────────────────────────

describe("buildInterestExpenseDoc", () => {
  test("is a card expense in the configured subcategory", () => {
    const doc = buildInterestExpenseDoc({
      familyId: FAMILY,
      target:   { categoryId: "cat_bank", categoryName: "Bank", subcategoryId: "sub_odsetki", subcategoryName: "Odsetki" },
      card:     card("a"),
      amount:   15.5,
      date:     "2026-10-09",
      budgetMonth: "2026-10",
      user:     { id: "u1", name: "Marcin", email: "m@example.com" },
    });

    assert.equal(doc.type, "EXPENSE");
    assert.equal(doc.userId, FAMILY);
    assert.equal(doc.cardId, "a");
    assert.equal(doc.subcategoryId, "sub_odsetki");
    assert.equal(doc.amount, 15.5);
    assert.equal(doc.netAmount, 15.5);
    assert.equal(doc.budgetMonth, "2026-10");
    assert.equal(doc.isArchived, false);
    assert.match(doc.id, /^tx_MMs_20261009_odsetki_karty_\d+$/);
  });
});
