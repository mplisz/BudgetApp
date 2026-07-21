// ============================================================
// File: backend/utils/productCatalog.js
// The family's PRODUCT CATALOG — the user's personal "inflation basket".
//
// Unlike a general product cache, this catalog is a WHITELIST: entries
// are seeded explicitly by the user (routes/products.js POST /, the
// Admin "Produkty śledzone" section) with a canonical name, a unit and a
// default size (e.g. "Coca-Cola Zero", 1.5 l). The OCR scan (routes/ocr.js)
// is only ALLOWED to attach a structured product to a receipt line when
// it recognizes one of these tracked names (see resolveTrackedProduct) —
// so nothing the user didn't explicitly register ever enters the price
// history, regardless of how many products the model could technically
// name.
//
// Why it exists:
//   - stable cross-shop identity: "Coca-Cola Zero" from Biedronka and
//     from Lidl collapse to ONE catalog doc (keyed by a normalized name
//     + unit), regardless of how each receipt spelled it,
//   - a deterministic size fallback: when a receipt doesn't print the
//     gramatura, the tracked entry's own default is used instead,
//   - a queryable product list for the price-history analytics.
//
// Writes are BEST-EFFORT and fire-and-forget, exactly like the merchant
// registry (rememberMerchant): a catalog failure must never break the
// transaction save that triggered it.
//
// The pure functions (productKey, mergeProductDoc, resolveTrackedProduct)
// are unit-tested via a standalone check — the container I/O wrapper is a
// thin shell.
// ============================================================

const { generateId } = require("./helpers");

const POLISH_FOLD = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

const MAX_SIZES   = 16;   // cap distinct package sizes tracked per product

/** Lowercase, diacritics-folded, punctuation-stripped name — the basis
 *  for both the identity key (+ unit) and whitelist name matching. */
function foldProductName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, ch => POLISH_FOLD[ch])
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalized identity key. Folds diacritics, drops ALL punctuation
 * (so "3,2%" and "3.2%" agree) and collapses whitespace, then appends
 * the unit — "Mleko 1L" (ml) stays distinct from "Mleko" (szt). Returns
 * null for an empty name so the caller can skip it.
 */
function productKey(name, unit) {
  const folded = foldProductName(name);
  if (!folded) return null;
  return `${folded}|${unit || ""}`;
}

/** Deterministic doc id from the key — lets us point-read/merge/upsert. */
function productId(familyId, key) {
  return `prod_${familyId}_${generateId(key)}`;
}

/**
 * Pure merge — folds one receipt line into a catalog doc (or seeds a new
 * one when `existing` is null). `line` = { id, key, name, size, unit,
 * merchant, date }. Deterministic given its inputs; unit-tested.
 */
function mergeProductDoc(existing, line, familyId) {
  const now = new Date().toISOString();
  const day = (line.date || now).slice(0, 10);

  if (!existing) {
    return {
      id:            line.id,
      userId:        familyId,
      type:          "PRODUCT",
      key:           line.key,
      mergedKeys:    [],      // keys folded into this one (see findByMergedKey below)
      canonicalName: line.name,
      unit:          line.unit || null,
      packSizes:     line.size ? [line.size] : [],
      merchants:     line.merchant ? [line.merchant] : [],
      purchaseCount: 1,
      firstSeen:     day,
      lastSeen:      day,
      createdAt:     now,
      updatedAt:     now,
    };
  }

  // Canonical name: prefer the longer (more complete) spelling seen —
  // unless the user locked it by hand (rename, or the whitelist entry's
  // own creation), in which case their choice is final. In practice every
  // tracked product is nameLocked from the moment it's added in Settings,
  // so this branch only ever fires on pre-whitelist legacy catalog docs.
  const canonicalName = (!existing.nameLocked && line.name &&
                         line.name.length > (existing.canonicalName || "").length)
    ? line.name
    : existing.canonicalName;

  const packSizes = line.size && !(existing.packSizes || []).includes(line.size)
    ? [...(existing.packSizes || []), line.size].slice(-MAX_SIZES)
    : (existing.packSizes || []);

  const merchants = line.merchant && !(existing.merchants || []).includes(line.merchant)
    ? [...(existing.merchants || []), line.merchant]
    : (existing.merchants || []);

  return {
    ...existing,
    canonicalName,
    packSizes,
    merchants,
    purchaseCount: (existing.purchaseCount || 0) + 1,
    firstSeen:     day < existing.firstSeen ? day : existing.firstSeen,
    lastSeen:      day > existing.lastSeen  ? day : existing.lastSeen,
    updatedAt:     now,
  };
}

/**
 * Seed a brand-new WHITELIST entry — the user explicitly registering a
 * product to track, before any purchase of it has been scanned. Shape
 * matches a normal catalog doc (mergeProductDoc's "new" branch) so the
 * very next matching purchase folds into it exactly like any other:
 * purchaseCount/packSizes/merchants start empty and accumulate from
 * there. `nameLocked` is set immediately — the user typed this spelling
 * on purpose, so no future purchase's own wording should ever silently
 * rename it.
 */
function newTrackedProduct(familyId, id, key, canonicalName, unit, defaultSize) {
  const now = new Date().toISOString();
  return {
    id,
    userId:        familyId,
    type:          "PRODUCT",
    key,
    mergedKeys:    [],
    canonicalName,
    unit,
    defaultSize:   defaultSize ?? null,
    packSizes:     [],
    merchants:     [],
    purchaseCount: 0,
    firstSeen:     null,
    lastSeen:      null,
    nameLocked:    true,
    createdAt:     now,
    updatedAt:     now,
  };
}

/**
 * Enforcement point for the whitelist: the model's own per-line product
 * guess is only kept when its NAME (folded) matches one of the user's
 * tracked products — otherwise it's dropped entirely (return null), no
 * matter how confidently the model named it. This is what keeps the
 * catalog to exactly "my inflation basket" rather than every product the
 * AI can recognize.
 *
 * The tracked entry's own `unit` is authoritative (a product's dimension
 * is part of its registered identity, not up for the model to reinterpret
 * per receipt) — the model's `size` is only trusted when its own `unit`
 * agrees, otherwise the tracked `defaultSize` fills in. `packCount` (a
 * multiplier read off "xN" text) is independent of unit and always kept.
 */
function resolveTrackedProduct(product, trackedProducts) {
  const rawName = product && typeof product.name === "string" ? product.name.trim() : "";
  if (!rawName) return null;
  const folded = foldProductName(rawName);
  const tracked = (trackedProducts || []).find(t => foldProductName(t.canonicalName) === folded);
  if (!tracked) return null;   // not on the whitelist → not tracked

  const unit = tracked.unit;
  const sizeFromReceipt = product.unit === unit && typeof product.size === "number" && product.size > 0
    ? product.size
    : null;
  return {
    name:      tracked.canonicalName,
    size:      sizeFromReceipt ?? (typeof tracked.defaultSize === "number" ? tracked.defaultSize : null),
    unit,
    packCount: (typeof product.packCount === "number" && product.packCount > 0) ? product.packCount : null,
  };
}

// ── Container I/O (thin, best-effort) ─────────────────────────

// A product whose `key` was merged INTO another product no longer owns its
// own doc — its key lives in some target's mergedKeys[]. Find that target so
// a new receipt line for a merged product folds into the survivor instead of
// resurrecting the old split. Within-partition query, only hit on a point-
// read miss (i.e. rarely).
async function findByMergedKey(container, familyId, key) {
  const { resources } = await container.items
    .query({
      query: `SELECT * FROM c WHERE c.userId = @u AND ARRAY_CONTAINS(c.mergedKeys, @k)`,
      parameters: [{ name: "@u", value: familyId }, { name: "@k", value: key }],
    })
    .fetchAll();
  return resources[0] || null;
}

// Read-modify-write for one product line. Optimistic concurrency: a
// concurrent write (412) is retried once.
//
// Whitelist-only: this NEVER creates a catalog doc. A product only exists
// here because the user explicitly registered it (routes/products.js
// POST /) — a transaction save can only fold a purchase into that already-
// existing entry. Without this guard, a stale/orphaned product name still
// sitting on a transaction (e.g. one the user deleted from Settings) would
// silently resurrect its own catalog doc the next time that transaction
// was saved or edited, defeating the whole point of an explicit whitelist.
async function upsertProductLine(container, familyId, rawLine) {
  const key = productKey(rawLine.name, rawLine.unit);
  if (!key) return;
  const ownId = productId(familyId, key);
  const line  = { ...rawLine, id: ownId, key };

  for (let attempt = 0; attempt < 2; attempt++) {
    let existing = null, etag = null;
    try {
      const r = await container.item(ownId, familyId).read();
      existing = r.resource;
      etag     = r.etag;
    } catch (err) {
      if (err.code !== 404) throw err;   // 404 = maybe untracked, maybe merged away
    }
    // Point-read missed — the key may have been merged into a survivor.
    if (!existing) {
      const target = await findByMergedKey(container, familyId, key);
      if (target) { existing = target; etag = target._etag; }
    }
    if (!existing) return;   // not (or no longer) tracked — nothing to fold into

    const doc = mergeProductDoc(existing, line, familyId);
    try {
      await container.item(existing.id, familyId).replace(doc, {
        accessCondition: { type: "IfMatch", condition: etag },
      });
      return;
    } catch (err) {
      if (err.code === 412 && attempt === 0) continue;
      throw err;
    }
  }
}

/**
 * Fold every structured lineItem of a committed transaction into the
 * catalog. Fire-and-forget: never throws, logs and moves on. Call it in
 * the transaction-save side-effect loop, next to rememberMerchant.
 */
async function rememberProducts(container, familyId, tx) {
  const items    = Array.isArray(tx.lineItems) ? tx.lineItems : [];
  const merchant = tx.merchant || null;
  for (const li of items) {
    const p = li && li.product;
    const name = p && typeof p.name === "string" ? p.name.trim() : "";
    if (!name) continue;   // no structured identity → nothing to catalog
    try {
      await upsertProductLine(container, familyId, {
        name,
        size:     typeof p.size === "number" && p.size > 0 ? p.size : null,
        unit:     p.unit || null,
        merchant,
        date:     tx.date,
      });
    } catch (err) {
      console.error(`[PRODUCTS] catalog upsert failed for "${name}" (non-fatal):`, err.message);
    }
  }
}

/**
 * The full whitelist — every tracked product's identity fields, needed
 * both to inject names into the OCR prompt and to resolve/fallback each
 * matched line (resolveTrackedProduct). Best-effort: returns [] on error,
 * which degrades a scan to "nothing tracked" rather than failing it.
 */
async function fetchTrackedProducts(container, familyId) {
  try {
    const { resources } = await container.items
      .query({
        query: `SELECT c.id, c.canonicalName, c.unit, c.defaultSize FROM c
                WHERE c.userId = @u
                ORDER BY c.canonicalName ASC`,
        parameters: [{ name: "@u", value: familyId }],
      })
      .fetchAll();
    return resources.filter(r => r.canonicalName);
  } catch (err) {
    console.error("[PRODUCTS] fetchTrackedProducts failed (non-fatal):", err.message);
    return [];
  }
}

module.exports = {
  foldProductName,
  productKey,
  productId,
  newTrackedProduct,
  resolveTrackedProduct,
  mergeProductDoc,
  rememberProducts,
  fetchTrackedProducts,
};
