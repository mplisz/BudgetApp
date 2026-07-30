// ============================================================
// File: backend/utils/categoryType.js
// A transaction's type (EXPENSE / INCOME / SAVING / TRANSFER) is a DERIVED
// property of the category it is booked under — not something a client gets
// to decide on its own.
//
// It used to arrive purely as a client-supplied field. A form bug that
// defaulted it to "EXPENSE" on every edit-load therefore rewrote SAVING
// transactions into expenses on save, and the server had no way to notice.
// The clients now derive it correctly, but this is the authority: whatever
// arrives is checked against the category tree, and the category wins.
//
// Categories are stored flat — each subcategory is its own document carrying
// a parentCategoryId AND the type it inherited from that parent at creation
// (see routes/categories.js). So one point read normally settles it, with the
// parent as a fallback for docs that predate the inherited field.
// ============================================================

const { readItem } = require("./helpers");

const TX_TYPES = new Set(["EXPENSE", "INCOME", "SAVING", "TRANSFER"]);

/**
 * Authoritative transaction type for a (subcategoryId, categoryId) pair.
 * Falls back to `fallback` when the category cannot be resolved at all — a
 * since-deleted category must never block a save.
 *
 * `cache` is an optional Map reused across a batch, so a 40-line receipt does
 * one read per DISTINCT subcategory instead of one per line.
 *
 * The container is a parameter (not a module import) so the resolution rules
 * can be unit-tested against a fake — see categoryType.test.js.
 */
async function resolveTxType(container, familyId, { subcategoryId, categoryId }, fallback, cache) {
  const key = subcategoryId || categoryId;
  if (!key) return fallback;
  if (cache && cache.has(key)) return cache.get(key) ?? fallback;

  let type = null;
  try {
    const sub = subcategoryId
      ? await readItem(container, subcategoryId, familyId)
      : null;

    if (sub && TX_TYPES.has(sub.type)) {
      type = sub.type;
    } else {
      // Older subcategory docs may carry no type of their own — ask the parent.
      const parentId = sub?.parentCategoryId || categoryId;
      const parent   = parentId ? await readItem(container, parentId, familyId) : null;
      if (parent && TX_TYPES.has(parent.type)) type = parent.type;
    }
  } catch (err) {
    // A lookup failure must never break the save — fall back to the client's
    // answer, exactly as before this module existed.
    console.error(`[TX TYPE] Lookup failed for ${key} (non-fatal):`, err.message);
  }

  if (cache) cache.set(key, type);
  return type ?? fallback;
}

/**
 * Return a copy of a transaction payload with the authoritative type stamped
 * on. Logs whenever the client's answer had to be corrected — that
 * disagreement is the early warning that some form is mis-deriving it again.
 */
async function applyTxType(container, familyId, data, cache) {
  const resolved = await resolveTxType(container, familyId, data, data.type || "EXPENSE", cache);
  if (data.type && data.type !== resolved) {
    console.warn(`[TX TYPE] Client sent ${data.type} for ${data.subcategoryId} — storing ${resolved} from the category.`);
  }
  return { ...data, type: resolved };
}

module.exports = { resolveTxType, applyTxType };
