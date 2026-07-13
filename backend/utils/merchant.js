// ============================================================
// File: backend/utils/merchant.js
// Shared merchant-name normalization + the family's known-merchant
// registry. Used by the OCR pipeline, the /api/merchants route, and
// transaction commit — so a junk value never reaches the DB or the
// per-shop filter from any path.
//
// The registry lives in ONE Settings doc, merchants_${familyId}:
//   - merchants: string[]              — autocomplete + prompt canonicalization
//   - nips:      { [nip]: name }       — deterministic NIP → shop-name override
// Both are maintained here through the shared settingsDoc helper.
// ============================================================

const { upsertSettingsDoc } = require("./settingsDoc");

const MERCHANTS_DOC = (familyId) => `merchants_${familyId}`;

const MERCHANT_JUNK = new Set([
  "nieznany", "nieznany sklep", "brak", "n/a", "na", "-", "—",
  "unknown", "sklep", "paragon",
]);

// Returns a trimmed name, or null if the value is empty/placeholder.
function cleanMerchant(raw) {
  const t = (raw == null ? "" : String(raw)).trim();
  if (!t) return null;
  if (MERCHANT_JUNK.has(t.toLowerCase())) return null;
  if (t.length > 150) return t.slice(0, 150);
  return t;
}

// Returns the digits-only tax id, or null when it doesn't look like one.
// PL NIP is 10 digits; the 8–15 window tolerates foreign VAT ids while
// still rejecting an OCR misread of some unrelated number.
function cleanNip(raw) {
  const digits = (raw == null ? "" : String(raw)).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

// Case-insensitive membership check against an existing list.
function merchantExists(list, name) {
  const n = (name || "").trim().toLowerCase();
  return (list || []).some(m => m.trim().toLowerCase() === n);
}

// Append a merchant to the family's list if it's new. Best-effort and
// idempotent — used by both the OCR scan and manual transaction commit,
// so any path that produces a merchant name keeps the autocomplete list
// (and OCR canonicalization source) up to date. Never throws.
async function rememberMerchant(settingsContainer, familyId, name) {
  const clean = cleanMerchant(name);
  if (!clean) return;
  await upsertSettingsDoc(settingsContainer, {
    id: MERCHANTS_DOC(familyId),
    familyId,
    type:   "MERCHANTS",
    logTag: "MERCHANTS",
    mutate: (doc) => {
      const list = Array.isArray(doc.merchants) ? doc.merchants : [];
      if (merchantExists(list, clean)) return null;   // already known → skip write
      return { ...doc, merchants: [...list, clean] };
    },
  });
}

// Learn a NIP → shop-name mapping. Called at transaction commit with the
// receipt's seller NIP and the user's FINAL merchant name (so a corrected
// name is what gets remembered; last write wins). Also ensures the name is
// in merchants[] for consistency. Best-effort, never throws.
async function rememberMerchantNip(settingsContainer, familyId, nip, name) {
  const cleanN    = cleanNip(nip);
  const cleanName = cleanMerchant(name);
  if (!cleanN || !cleanName) return;
  await upsertSettingsDoc(settingsContainer, {
    id: MERCHANTS_DOC(familyId),
    familyId,
    type:   "MERCHANTS",
    logTag: "MERCHANTS",
    mutate: (doc) => {
      const nips = (doc.nips && typeof doc.nips === "object") ? doc.nips : {};
      const list = Array.isArray(doc.merchants) ? doc.merchants : [];
      const nameKnown = merchantExists(list, cleanName);
      // No-op guard: identical mapping already stored → skip the write.
      if (nips[cleanN] === cleanName && nameKnown) return null;
      return {
        ...doc,
        nips:      { ...nips, [cleanN]: cleanName },
        merchants: nameKnown ? list : [...list, cleanName],
      };
    },
  });
}

module.exports = { cleanMerchant, cleanNip, merchantExists, rememberMerchant, rememberMerchantNip };
