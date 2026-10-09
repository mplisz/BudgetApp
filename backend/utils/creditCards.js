// ============================================================
// File: backend/utils/creditCards.js
// Credit cards: the family's cards and the repayments made to them, kept in
// ONE document in the Settings container (cards_${familyId}).
//
// What a card purchase is: an ordinary EXPENSE carrying `cardId`. It counts
// in its budget month like any other expense; the card only records that the
// money has not left the bank account yet. A repayment is not a transaction —
// it would count the same cost twice — it is an entry here that brings the
// debt down.
//
// The debt itself is never stored and never computed on the server: it is
// purchases − shop returns − repayments, and the return arithmetic lives in
// the client's utils/returnUtils (see frontend utils/cardDebt.ts). This
// module owns the data and its integrity, nothing else.
//
// Containers are parameters (not module imports) so the rules can be
// unit-tested against a fake — see creditCards.test.js.
// ============================================================

const { readItem, readItemWithEtag } = require("./helpers");

const CARDS_DOC_TYPE = "creditCards";
const MAX_CARDS      = 10;
// A repayment or two a month: this is decades of history, and still a small
// document. The cap only exists so a runaway client can't grow it unbounded.
const MAX_REPAYMENTS = 2000;
const MAX_RETRIES    = 2;

const cardsDocId = (familyId) => `cards_${familyId}`;

const cardsOf = (doc) => ({
  cards:      Array.isArray(doc?.cards)      ? doc.cards      : [],
  repayments: Array.isArray(doc?.repayments) ? doc.repayments : [],
});

/** The family's cards + repayments; empty lists when nothing was saved yet. */
async function readCards(container, familyId) {
  return cardsOf(await readItem(container, cardsDocId(familyId), familyId));
}

/** A card that can still take purchases and repayments, or null. */
function findActiveCard(state, cardId) {
  if (!cardId) return null;
  return state.cards.find(card => card.id === cardId && !card.isArchived) ?? null;
}

/**
 * Read-modify-write of the cards document with optimistic concurrency.
 *
 * `change(state)` receives a mutable copy { cards, repayments } and returns
 * either { status, error } to abort without writing, or anything else, which
 * is handed back to the caller once the write went through.
 *
 * Deliberately NOT utils/settingsDoc.upsertSettingsDoc: that one treats a
 * failed read as "no document yet" and writes a fresh one — fine for a
 * best-effort merchant list, but here it would replace the repayment history
 * with an empty one. A failed read throws; only a real 404 starts a new
 * document, and that goes through create() so a concurrent first write
 * collides (409) instead of overwriting.
 */
async function updateCards(container, familyId, change) {
  const id = cardsDocId(familyId);

  for (let attempt = 0; ; attempt++) {
    const { resource, etag } = await readItemWithEtag(container, id, familyId);
    const state   = cardsOf(resource);
    const draft   = { cards: [...state.cards], repayments: [...state.repayments] };
    const outcome = change(draft);
    if (outcome?.error) return outcome;

    const now  = new Date().toISOString();
    const next = {
      ...(resource ?? { id, userId: familyId, type: CARDS_DOC_TYPE, createdAt: now }),
      ...draft,
      updatedAt: now,
    };

    try {
      if (resource) {
        await container.items.upsert(next, { accessCondition: { type: "IfMatch", condition: etag } });
      } else {
        await container.items.create(next);
      }
      return outcome;
    } catch (err) {
      // 412 = someone else saved in between, 409 = lost the race to create.
      if ((err.code === 412 || err.code === 409) && attempt < MAX_RETRIES) continue;
      throw err;
    }
  }
}

/**
 * Settle the `cardId` of a transaction payload: a copy of `data` with a
 * verified cardId, or without one.
 *
 *   - only an EXPENSE can sit on a card — on anything else the field is
 *     dropped rather than rejected, so re-categorising a card purchase into a
 *     saving doesn't fail the save;
 *   - the card must be one of the family's own, and not archived.
 *
 * `cache` is an optional Map shared across a batch: one read of the cards
 * document for a whole receipt.
 *
 * @returns {{ ok: true, data }} | {{ ok: false, error }}
 */
async function applyCardId(container, familyId, data, cache) {
  const { cardId, ...rest } = data;
  if (!cardId || data.type !== "EXPENSE") return { ok: true, data: rest };

  let state = cache?.get(familyId);
  if (!state) {
    state = await readCards(container, familyId);
    cache?.set(familyId, state);
  }
  if (!findActiveCard(state, cardId)) return { ok: false, error: "Credit card not found." };
  return { ok: true, data: { ...rest, cardId } };
}

/**
 * The EXPENSE a repayment books for the interest and fees it included. It
 * carries the cardId, so it raises the debt by exactly what the repayment
 * then pays off — the two cancel out and the purchase history stays the only
 * thing the debt is made of.
 */
function buildInterestExpenseDoc({ familyId, target, card, amount, date, budgetMonth, user }) {
  return {
    id:               `tx_${familyId}_${date.replace(/-/g, "")}_odsetki_karty_${Date.now()}`,
    userId:           familyId,
    type:             "EXPENSE",
    categoryId:       target.categoryId,
    categoryName:     target.categoryName,
    subcategoryId:    target.subcategoryId,
    subcategoryName:  target.subcategoryName,
    amount,
    originalAmount:   amount,
    originalCurrency: "PLN",
    fxRate:           1,
    date,
    budgetMonth,
    priority:         1,
    tags:             [],
    description:      `Odsetki i opłaty — ${card.name}`,
    cardId:           card.id,
    useVoucher:       false,
    voucherId:        null,
    voucherAmount:    0,
    voucherAllocations: [],
    netAmount:        amount,
    isRecurring:      false,
    recurringId:      null,
    returns:          [],
    author:           user.name || user.email,
    authorId:         user.id,
    isArchived:       false,
    archivedAt:       null,
    archivedBy:       null,
    archivedById:     null,
    createdAt:        new Date().toISOString(),
  };
}

module.exports = {
  CARDS_DOC_TYPE, MAX_CARDS, MAX_REPAYMENTS,
  cardsDocId, readCards, findActiveCard, updateCards, applyCardId,
  buildInterestExpenseDoc,
};
