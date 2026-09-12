// ============================================================
// File: backend/utils/shoppingPriceSync.js
// The one place where a saved receipt turns into "what things cost".
//
// Runs as a side effect of the transaction save, next to
// rememberProducts and rememberMerchant, and is best-effort in exactly
// the same way: the purchase is already recorded, and failing to learn
// a price must never fail the save that triggered it.
//
// It matches the receipt's lines against the family's SHOPPING CATALOG
// (every product they have ever put on a list), not against the list as
// it stands. A price is worth knowing whether or not the item happened
// to be on the list the day it was bought — and the catalog, unlike the
// list, never expires.
//
// Deliberately does NOT tick anything off. Matching is ~90% precise on
// real receipts, which is plenty for a median and not nearly enough to
// tell someone they already bought the thing they are standing in front
// of.
// ============================================================

const { matchLines }      = require("./shoppingMatch");
const { observationFrom } = require("./shoppingPrices");
const { fetchCatalog, rememberPrices } = require("./shoppingCatalog");

/**
 * Fire-and-forget. `tx` is the saved transaction; only its lineItems are
 * read, so a hand-typed expense (which has none) is a no-op.
 */
async function syncShoppingPrices(settingsContainer, familyId, tx) {
  try {
    const lines = Array.isArray(tx?.lineItems) ? tx.lineItems : [];
    if (lines.length === 0) return;

    const catalog = await fetchCatalog(settingsContainer, familyId);
    if (catalog.length === 0) return;

    // The catalog's entries stand in for shopping items here — same
    // shape as far as the matcher is concerned (an id, a name, a key).
    const matches = matchLines(
      catalog.map(e => ({ id: e.key, key: e.key, name: e.name })),
      lines,
    );
    if (matches.length === 0) return;

    const date = (tx.date || new Date().toISOString()).slice(0, 10);
    const priced = matches
      .map(m => ({ key: m.itemId, observation: observationFrom(lines[m.lineIndex], date, tx.merchant) }))
      .filter(p => p.observation);

    await rememberPrices(settingsContainer, familyId, priced);
  } catch (err) {
    console.error("[SHOPPING_PRICES] sync failed (non-fatal):", err.message);
  }
}

module.exports = { syncShoppingPrices };
