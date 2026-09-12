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
const { addObservation } = require("./shoppingPrices");

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

/**
 * Display name: trimmed, whitespace collapsed, and case normalized so a
 * list typed by two people on two phones still reads as one list.
 *
 * Only the two unambiguous cases are touched. ALL CAPS is shouting, and
 * all-lowercase just wants its first letter — but anything MIXED is left
 * exactly as typed, because that is where real product spellings live:
 * "Coca-Cola", "iPhone", "pH Balance" would all be damaged by a blanket
 * rule. Identity is unaffected either way (shoppingKey folds case), so
 * this is purely about how the list looks.
 */
function cleanItemName(raw) {
  const t = (raw == null ? "" : String(raw)).trim().replace(/\s+/g, " ");
  if (!t) return null;
  const capped = t.length > 120 ? t.slice(0, 120) : t;

  const hasLower = /\p{Ll}/u.test(capped);
  const hasUpper = /\p{Lu}/u.test(capped);

  if (hasUpper && !hasLower) return sentenceCase(capped.toLowerCase());  // "KAWA" → "Kawa"
  if (hasLower && !hasUpper) return sentenceCase(capped);                // "kawa" → "Kawa"
  return capped;                                                        // mixed: as typed
}

/** Upper-cases the first letter, leaving the rest of the string alone. */
function sentenceCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
async function rememberShoppingItem(settingsContainer, familyId, name, unit = null, section = null) {
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
        ? [...items, { key, name: clean, unit, section, count: 1, firstUsedAt: now, lastUsedAt: now }]
        : items.map((e, i) => i !== idx ? e : {
            ...e,
            // The name is refreshed from the latest spelling: both fold
            // to the same key, and what the user typed most recently is
            // what they expect to see back on the pill.
            name:       clean,
            unit:       unit || e.unit || null,
            // Last section wins, so correcting one item's section is what
            // teaches every future add of that product. A null here means
            // "no opinion" and leaves the remembered one alone.
            section:    section || e.section || null,
            count:      (Number(e.count) || 0) + 1,
            lastUsedAt: now,
          });

      return { ...doc, items: pruneEntries(next) };
    },
  });
}

/**
 * Record a corrected section for a product WITHOUT touching its count or
 * recency — moving an item to the right aisle is not the same event as
 * putting it on the list, and counting it as one would distort the
 * ranking the pills are built from.
 *
 * Only updates an entry that already exists: a section correction on a
 * product the catalog has never seen has nothing to attach to.
 */
async function rememberShoppingSection(settingsContainer, familyId, key, section) {
  if (!key || !section) return;
  await upsertSettingsDoc(settingsContainer, {
    id:     CATALOG_DOC(familyId),
    familyId,
    type:   "SHOPPING_CATALOG",
    logTag: "SHOPPING_CATALOG",
    mutate: (doc) => {
      const items = Array.isArray(doc.items) ? doc.items : [];
      const idx   = items.findIndex(e => e.key === key);
      if (idx === -1 || items[idx].section === section) return null;   // nothing to do
      return { ...doc, items: items.map((e, i) => i === idx ? { ...e, section } : e) };
    },
  });
}

/**
 * Record what products cost, from the lines of one saved receipt.
 *
 * `priced` is [{ key, observation }] — the caller has already matched
 * lines to catalog entries and converted each into a comparable number
 * (see shoppingMatch + shoppingPrices). Only entries the catalog ALREADY
 * knows are touched: this is the vocabulary of things this family puts
 * on its list, not a product database, so a receipt line for something
 * never listed records nothing.
 *
 * Best-effort, like every other learning write here: the transaction it
 * hangs off has already been saved.
 */
async function rememberPrices(settingsContainer, familyId, priced) {
  const byKey = new Map();
  for (const { key, observation } of priced || []) {
    if (key && observation) byKey.set(key, observation);   // one per product per receipt
  }
  if (byKey.size === 0) return;

  await upsertSettingsDoc(settingsContainer, {
    id:     CATALOG_DOC(familyId),
    familyId,
    type:   "SHOPPING_CATALOG",
    logTag: "SHOPPING_CATALOG",
    mutate: (doc) => {
      const items = Array.isArray(doc.items) ? doc.items : [];
      let touched = false;

      const next = items.map(entry => {
        const observation = byKey.get(entry.key);
        if (!observation) return entry;
        touched = true;
        return { ...entry, prices: addObservation(entry.prices, withId(observation)) };
      });

      return touched ? { ...doc, items: next } : null;
    },
  });
}

/** Short id so a single observation can be pointed at later — the date
 *  alone is not enough, two purchases of the same thing on one day being
 *  perfectly ordinary. */
function withId(observation) {
  return { i: Math.random().toString(36).slice(2, 8), ...observation };
}

/** Drop one recorded price the user rejected as not being this product.
 *  Returns the catalog as it now stands. */
async function forgetPrice(settingsContainer, familyId, key, observationId) {
  await upsertSettingsDoc(settingsContainer, {
    id:     CATALOG_DOC(familyId),
    familyId,
    type:   "SHOPPING_CATALOG",
    logTag: "SHOPPING_CATALOG",
    mutate: (doc) => {
      const items = Array.isArray(doc.items) ? doc.items : [];
      const idx   = items.findIndex(e => e.key === key);
      if (idx === -1) return null;
      const prices = (items[idx].prices || []).filter(p => p.i !== observationId);
      if (prices.length === (items[idx].prices || []).length) return null;   // nothing removed
      return { ...doc, items: items.map((e, i) => i === idx ? { ...e, prices } : e) };
    },
  });
  return fetchCatalog(settingsContainer, familyId);
}

/** The section this product was last filed under, or null when the
 *  catalog has no opinion yet. */
async function lookupSection(settingsContainer, familyId, key) {
  if (!key) return null;
  const entries = await fetchCatalog(settingsContainer, familyId);
  return entries.find(e => e.key === key)?.section ?? null;
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
  rememberShoppingSection,
  rememberPrices,
  forgetPrice,
  lookupSection,
  forgetShoppingItem,
};
