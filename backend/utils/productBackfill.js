// ============================================================
// File: backend/utils/productBackfill.js
// Pure logic for the retroactive "fill in missing products" action.
//
// The price history only shows receipt lines that carry a structured
// `product`. Historical transactions predate that field, so their
// purchases are invisible. This module finds what is missing and
// applies the AI's answers back onto the transaction docs.
//
// Design rules that make the action safe to press repeatedly:
//   - IDEMPOTENT: lines that already have a product are never touched,
//     so a second run is a no-op for everything the first one did.
//   - SELF-SCOPING: the caller passes whichever subcategories are
//     currently flagged `trackPrices`, so flagging a new one later
//     (e.g. fuel) brings exactly its history into scope on the next run.
//   - MINIMAL: only `lineItems[].product` is added. Amounts, dates and
//     categories are never rewritten. When a transaction has no line
//     items at all (a single-item purchase — the usual shape for fuel
//     or baby formula) ONE line is created carrying the full amount, so
//     the "sum of lineItems == transaction amount" invariant holds.
//
// Everything here is pure — see the standalone check in the commit.
// ============================================================

/** A receipt line that has no structured product yet. */
// index === null  → the transaction has no lineItems; one will be created.
function candidatesOf(tx) {
  const out = [];
  const items = Array.isArray(tx.lineItems) ? tx.lineItems : [];

  if (items.length > 0) {
    items.forEach((item, index) => {
      if (item?.product?.name) return;                    // already done
      const description = (item?.description || "").trim();
      if (!description || !(item?.amount > 0)) return;
      out.push({ txId: tx.id, index, description });
    });
    return out;
  }

  // No line items — treat the transaction itself as the single line.
  const description = (tx.description || tx.subcategoryName || "").trim();
  if (!description || !(tx.amount > 0)) return out;
  out.push({ txId: tx.id, index: null, description });
  return out;
}

/**
 * Scan transactions for lines missing a product.
 * @returns { candidates, uniqueDescriptions } — deduplicated text is what
 *   goes to the model: the same receipt wording repeats across months, so
 *   this both cuts the cost and guarantees identical text always yields
 *   the identical product (no split-by-batch).
 */
function collectCandidates(transactions) {
  const candidates = [];
  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || tx.isArchived) continue;
    candidates.push(...candidatesOf(tx));
  }
  const uniqueDescriptions = [...new Set(candidates.map(c => c.description))];
  return { candidates, uniqueDescriptions };
}

/**
 * Apply inferred products to one transaction.
 * @param productByDesc Map<description, product>
 * @returns the updated doc, or null when nothing changed (so the caller
 *   can skip the write entirely).
 */
function applyProducts(tx, productByDesc) {
  const items = Array.isArray(tx.lineItems) ? tx.lineItems : [];

  if (items.length > 0) {
    let changed = false;
    const lineItems = items.map(item => {
      if (item?.product?.name) return item;
      const product = productByDesc.get((item?.description || "").trim());
      if (!product) return item;
      changed = true;
      return { ...item, product };
    });
    return changed ? { ...tx, lineItems } : null;
  }

  // Single-item purchase: synthesize the one line the price history needs.
  const description = (tx.description || tx.subcategoryName || "").trim();
  const product = productByDesc.get(description);
  if (!product || !(tx.amount > 0)) return null;
  return {
    ...tx,
    lineItems: [{
      description,
      amount:           tx.amount,
      originalAmount:   tx.originalAmount ?? tx.amount,
      originalCurrency: tx.originalCurrency ?? "PLN",
      product,
    }],
  };
}

module.exports = { candidatesOf, collectCandidates, applyProducts };
