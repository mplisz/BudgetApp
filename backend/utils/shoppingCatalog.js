// ============================================================
// File: backend/utils/shoppingCatalog.js
// The family's SHOPPING CATALOG — every product name ever put on the
// shopping list, ranked by how often (and how recently) it was used.
// This is what feeds the "Najczęstsze" pills and the autocomplete, so
// adding milk costs one tap instead of typing.
//
// Same storage decision as the merchant registry (utils/merchant.js):
// ONE document per family in the Settings container, shopping_catalog_
// ${familyId}. It is a small config list read whole on every panel
// open — a dedicated container would buy nothing and cost a query.
//
// Deliberately NOT the Products container: that one is a WHITELIST the
// user curates by hand for price history ("Ceny produktów"), where a
// junk entry pollutes analytics. This catalog is the opposite — it
// learns from whatever gets typed, and a junk entry just sits low in
// the ranking until it is pruned.
//
// Writes are best-effort and never throw: failing to learn "mleko" must
// not fail the request that added mleko to the list.
// ============================================================

const { upsertSettingsDoc, readSettingsDoc } = require("./settingsDoc");
const { foldProductName } = require("./productCatalog");

const CATALOG_DOC = (familyId) => `shopping_catalog_${familyId}`;

// Cap on catalog size. Well above a family's real vocabulary (a few
// hundred products at most), so the prune below is a safety net against
// unbounded growth, not something a normal user ever hits.
const MAX_ENTRIES = 400;

// Half-life of the recency weight, in days — see scoreEntry.
const RECENCY_DAYS = 30;

/** Identity key for a catalog entry: the folded name (diacritics,
 *  punctuation and case removed), so "Masło", "maslo " and "MASŁO"
 *  are one entry. Returns null for an empty name. */
function shoppingKey(name) {
  const folded = foldProductName(name);
  return folded || null;
}

/** Trimmed display name, or null when there is nothing to store. */
function cleanItemName(raw) {
  const t = (raw == null ? "" : String(raw)).trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > 120 ? t.slice(0, 120) : t;
}

/**
 * Ranking score. Frequency alone would freeze the pills to whatever was
 * bought in the first weeks of use; recency alone would make one odd
 * purchase outrank the weekly bread. The quotient keeps a product that
 * is bought often AND lately on top, and lets anything abandoned decay
 * out of the way on its own.
 *
 * Pure function of (count, lastUsedAt, now) — unit-tested.
 */
function scoreEntry(entry, now = Date.now()) {
  const count = Number(entry?.count) || 0;
  if (count <= 0) return 0;
  const last = Date.parse(entry?.lastUsedAt || "");
  // An entry with no usable timestamp is treated as used right now
  // rather than dropped: its count is still real information.
  const days = Number.isNaN(last) ? 0 : Math.max(0, (now - last) / 86_400_000);
  return count / (1 + days / RECENCY_DAYS);
}

/** Catalog entries sorted best-first. Ties break alphabetically so the
 *  order is stable between calls (the pills must not shuffle). */
function rankEntries(entries, now = Date.now()) {
  return [...(entries || [])].sort((a, b) => {
    const diff = scoreEntry(b, now) - scoreEntry(a, now);
    if (diff !== 0) return diff;
    return (a.name || "").localeCompare(b.name || "");
  });
}

/** Drops the weakest entries once the catalog exceeds MAX_ENTRIES. */
function pruneEntries(entries, now = Date.now()) {
  if (entries.length <= MAX_ENTRIES) return entries;
  return rankEntries(entries, now).slice(0, MAX_ENTRIES);
}

/** The whole catalog, ranked. Missing document → empty list. */
async function fetchCatalog(settingsContainer, familyId) {
  const { doc } = await readSettingsDoc(settingsContainer, CATALOG_DOC(familyId), familyId);
  const items = Array.isArray(doc?.items) ? doc.items : [];
  return rankEntries(items);
}

/**
 * Record that a product was put on the list: bump its count, refresh
 * its timestamp, seed the entry when new. Best-effort and idempotent in
 * the sense that matters — calling it twice means the product really
 * was added twice, which is exactly what the ranking should reflect.
 *
 * `unit` is remembered so the quick-add can pre-fill it next time;
 * the last one used wins (a product's unit rarely changes, and when it
 * does the new one is the interesting one).
 */
async function rememberShoppingItem(settingsContainer, familyId, name, unit = null) {
  const clean = cleanItemName(name);
  const key   = shoppingKey(clean);
  if (!key) return;

  await upsertSettingsDoc(settingsContainer, {
    id:     CATALOG_DOC(familyId),
    familyId,
    type:   "SHOPPING_CATALOG",
    logTag: "SHOPPING_CATALOG",
    mutate: (doc) => {
      const now   = new Date().toISOString();
      const items = Array.isArray(doc.items) ? doc.items : [];
      const idx   = items.findIndex(e => e.key === key);

      const next = idx === -1
        ? [...items, { key, name: clean, unit, count: 1, firstUsedAt: now, lastUsedAt: now }]
        : items.map((e, i) => i !== idx ? e : {
            ...e,
            // The name is refreshed from the latest spelling: both fold
            // to the same key, and what the user typed most recently is
            // what they expect to see back on the pill.
            name:       clean,
            unit:       unit || e.unit || null,
            count:      (Number(e.count) || 0) + 1,
            lastUsedAt: now,
          });

      return { ...doc, items: pruneEntries(next) };
    },
  });
}

/** Remove one entry from the suggestions (the user pruning junk).
 *  Returns the remaining entries, ranked. */
async function forgetShoppingItem(settingsContainer, familyId, key) {
  await upsertSettingsDoc(settingsContainer, {
    id:     CATALOG_DOC(familyId),
    familyId,
    type:   "SHOPPING_CATALOG",
    logTag: "SHOPPING_CATALOG",
    mutate: (doc) => {
      const items = Array.isArray(doc.items) ? doc.items : [];
      if (!items.some(e => e.key === key)) return null;   // nothing to do → skip the write
      return { ...doc, items: items.filter(e => e.key !== key) };
    },
  });
  return fetchCatalog(settingsContainer, familyId);
}

module.exports = {
  MAX_ENTRIES,
  shoppingKey,
  cleanItemName,
  scoreEntry,
  rankEntries,
  pruneEntries,
  fetchCatalog,
  rememberShoppingItem,
  forgetShoppingItem,
};
