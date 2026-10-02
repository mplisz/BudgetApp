// ============================================================
// File: backend/utils/ocrEan.js
// Barcode (EAN/GTIN) → what the user taught us about that product.
//
// Many receipts print the product's barcode next to each line. Unlike the
// description (shortened differently by every shop, and re-read by the AI
// each time), the barcode never changes — so a correction keyed on it
// carries across scans AND across shops.
//
// Storage: ONE Settings doc per family, ocr_ean_${familyId}:
//   entries: { [ean]: { lastDesc, count, lastAt,
//                       categoryName?, subcategoryName?, learnedDesc?, product? } }
// The parts (category / description / product) are the same optional set
// the name-keyed store uses — see utils/ocrLearning.js. This store is
// consulted FIRST on a scan; the name store is the fallback for lines
// without a (known) barcode.
// ============================================================

const { readSettingsDoc, upsertSettingsDoc } = require("./settingsDoc");
const {
  normDesc, cleanLearnedParts, hasLearnedParts, applyLearnedParts,
} = require("./ocrLearning");

const EAN_DOC     = (familyId) => `ocr_ean_${familyId}`;
const MAX_ENTRIES = 3000;   // ~250 B each → well under the 2 MB doc limit

// GTIN check digit: weights 3,1,3,1… from the right, check digit excluded.
function hasValidCheckDigit(digits) {
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) {
    sum += Number(digits[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

// Normalize whatever the model read into a storable barcode, or null.
//   - digits only, GTIN-8/12/13/14 with a valid check digit (a misread digit
//     must not teach the wrong product);
//   - UPC-A (12) is stored as EAN-13 with a leading 0 — same product space;
//   - 13-digit codes starting with 2 are in-store codes (weighed goods,
//     the shop's own labels) — they identify a price tag, not a product.
function cleanEan(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (!hasValidCheckDigit(digits)) return null;
  if (digits.length === 12) digits = `0${digits}`;
  if (digits.length === 13 && digits[0] === "2") return null;
  return digits;
}

// Point-read the family's barcode map. Returns the entries object (or {}).
async function fetchEanEntries(container, familyId) {
  const { doc } = await readSettingsDoc(container, EAN_DOC(familyId), familyId);
  const e = doc?.entries;
  return e && typeof e === "object" && !Array.isArray(e) ? e : {};
}

// Entry for a (cleaned) barcode, or undefined. Barcodes are digits only, so
// the own-property check is belt-and-braces against prototype keys.
function lookupEan(entries, ean) {
  return ean && Object.prototype.hasOwnProperty.call(entries || {}, ean) ? entries[ean] : undefined;
}

// Merge a batch of corrections into the barcode map. Each correction needs
// a valid `ean` plus at least one learnable part. A repeat bumps count and
// overwrites only the parts it carries. Caps at MAX_ENTRIES with the same
// count-aware eviction as the name store. Best-effort, never throws.
async function rememberEanCorrections(container, familyId, corrections) {
  const clean = (corrections || [])
    .map(c => ({
      ean:      cleanEan(c.ean),
      lastDesc: normDesc(c.description),
      parts:    cleanLearnedParts(c),
    }))
    .filter(c => c.ean && hasLearnedParts(c.parts));
  if (!clean.length) return;

  await upsertSettingsDoc(container, {
    id: EAN_DOC(familyId),
    familyId,
    type:   "OCR_EAN",
    logTag: "OCR_EAN",
    mutate: (doc) => {
      const entries = { ...(doc.entries && typeof doc.entries === "object" && !Array.isArray(doc.entries) ? doc.entries : {}) };
      const now     = new Date().toISOString();

      for (const c of clean) {
        const existing = Object.prototype.hasOwnProperty.call(entries, c.ean) ? { ...entries[c.ean] } : null;
        const entry = existing || { count: 0 };
        applyLearnedParts(entry, c.parts);
        entry.lastDesc = c.lastDesc;
        entry.count    = (entry.count || 0) + 1;
        entry.lastAt   = now;
        entries[c.ean] = entry;
      }

      const keys = Object.keys(entries);
      if (keys.length > MAX_ENTRIES) {
        // Keep the most-confirmed, then most-recent.
        keys.sort((a, b) =>
          (entries[b].count - entries[a].count) || (entries[b].lastAt || "").localeCompare(entries[a].lastAt || ""));
        const kept = {};
        for (const k of keys.slice(0, MAX_ENTRIES)) kept[k] = entries[k];
        return { ...doc, entries: kept };
      }
      return { ...doc, entries };
    },
  });
}

module.exports = {
  cleanEan,
  fetchEanEntries,
  lookupEan,
  rememberEanCorrections,
};
