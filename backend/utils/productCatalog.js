// ============================================================
// File: backend/utils/productCatalog.js
// The family's PRODUCT CATALOG — phase 3 of the receipt price-history
// feature. The OCR AI emits a structured product identity per line item
// ({name, size, unit, packCount}); this module turns that stream into a
// persistent, deduplicated catalog in the Products container.
//
// Why it exists:
//   - stable cross-shop identity: "Mleko UHT 3,2%" from Biedronka and
//     from Lidl collapse to ONE catalog doc (keyed by a normalized name
//     + unit), regardless of how each receipt spelled it,
//   - a learning loop: the catalog's canonical names feed back into the
//     OCR prompt, so the model keeps naming products consistently,
//   - a queryable product list for the price-history analytics and any
//     future "my products" view.
//
// Writes are BEST-EFFORT and fire-and-forget, exactly like the merchant
// registry (rememberMerchant): a catalog failure must never break the
// transaction save that triggered it.
//
// The merge logic (productKey, mergeProductDoc) is pure and unit-tested
// via a standalone check — the container I/O wrapper is a thin shell.
// ============================================================

const { generateId } = require("./helpers");

const POLISH_FOLD = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

const MAX_ALIASES = 24;   // cap the cross-shop wording record per product
const MAX_SIZES   = 16;   // cap distinct package sizes tracked per product

/**
 * Normalized identity key. Folds diacritics, drops ALL punctuation
 * (so "3,2%" and "3.2%" agree) and collapses whitespace, then appends
 * the unit — "Mleko 1L" (ml) stays distinct from "Mleko" (szt). Returns
 * null for an empty name so the caller can skip it.
 */
function productKey(name, unit) {
  const folded = String(name || "")
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, ch => POLISH_FOLD[ch])
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
 * merchant, raw, date }. Deterministic given its inputs; unit-tested.
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
      canonicalName: line.name,
      unit:          line.unit || null,
      packSizes:     line.size ? [line.size] : [],
      merchants:     line.merchant ? [line.merchant] : [],
      aliases:       [{ merchant: line.merchant || null, raw: line.raw || line.name }],
      purchaseCount: 1,
      firstSeen:     day,
      lastSeen:      day,
      createdAt:     now,
      updatedAt:     now,
    };
  }

  // Canonical name: prefer the longer (more complete) spelling seen.
  const canonicalName = line.name && line.name.length > (existing.canonicalName || "").length
    ? line.name
    : existing.canonicalName;

  const packSizes = line.size && !(existing.packSizes || []).includes(line.size)
    ? [...(existing.packSizes || []), line.size].slice(-MAX_SIZES)
    : (existing.packSizes || []);

  const merchants = line.merchant && !(existing.merchants || []).includes(line.merchant)
    ? [...(existing.merchants || []), line.merchant]
    : (existing.merchants || []);

  const raw = line.raw || line.name;
  const aliasSeen = (existing.aliases || []).some(a =>
    (a.merchant || "") === (line.merchant || "") && (a.raw || "") === raw);
  const aliases = aliasSeen
    ? existing.aliases
    : [...(existing.aliases || []), { merchant: line.merchant || null, raw }].slice(-MAX_ALIASES);

  return {
    ...existing,
    canonicalName,
    packSizes,
    merchants,
    aliases,
    purchaseCount: (existing.purchaseCount || 0) + 1,
    firstSeen:     day < existing.firstSeen ? day : existing.firstSeen,
    lastSeen:      day > existing.lastSeen  ? day : existing.lastSeen,
    updatedAt:     now,
  };
}

// ── Container I/O (thin, best-effort) ─────────────────────────

// Read-modify-write for one product line. Optimistic concurrency: a
// concurrent write (412) or a create race (409) is retried once.
async function upsertProductLine(container, familyId, rawLine) {
  const key = productKey(rawLine.name, rawLine.unit);
  if (!key) return;
  const id  = productId(familyId, key);
  const line = { ...rawLine, id, key };

  for (let attempt = 0; attempt < 2; attempt++) {
    let existing = null, etag = null;
    try {
      const r = await container.item(id, familyId).read();
      existing = r.resource;
      etag     = r.etag;
    } catch (err) {
      if (err.code !== 404) throw err;   // 404 = new product; anything else is real
    }

    const doc = mergeProductDoc(existing, line, familyId);
    try {
      if (existing) {
        await container.item(id, familyId).replace(doc, {
          accessCondition: { type: "IfMatch", condition: etag },
        });
      } else {
        await container.items.create(doc);
      }
      return;
    } catch (err) {
      if ((err.code === 412 || err.code === 409) && attempt === 0) continue;
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
        raw:      li.description || name,
        date:     tx.date,
      });
    } catch (err) {
      console.error(`[PRODUCTS] catalog upsert failed for "${name}" (non-fatal):`, err.message);
    }
  }
}

/**
 * Top canonical product names by purchase frequency — injected into the
 * OCR prompt so the model reuses the exact spelling it already learned.
 * Best-effort: returns [] on any error.
 */
async function fetchTopProductNames(container, familyId, limit = 40) {
  try {
    const { resources } = await container.items
      .query({
        query: `SELECT c.canonicalName FROM c
                WHERE c.userId = @u
                ORDER BY c.purchaseCount DESC
                OFFSET 0 LIMIT @n`,
        parameters: [
          { name: "@u", value: familyId },
          { name: "@n", value: limit },
        ],
      })
      .fetchAll();
    return resources.map(r => r.canonicalName).filter(Boolean);
  } catch (err) {
    console.error("[PRODUCTS] fetchTopProductNames failed (non-fatal):", err.message);
    return [];
  }
}

module.exports = {
  productKey,
  productId,
  mergeProductDoc,
  rememberProducts,
  fetchTopProductNames,
};
