// ============================================================
// File: backend/utils/merchant.js
// Shared merchant-name normalization. Used by the OCR pipeline,
// the /api/merchants route, and transaction commit — so a junk
// value never reaches the DB or the per-shop filter from any path.
// ============================================================

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

// Case-insensitive membership check against an existing list.
function merchantExists(list, name) {
  const n = (name || "").trim().toLowerCase();
  return (list || []).some(m => m.trim().toLowerCase() === n);
}

// Append a merchant to the family's list if it's new. Best-effort and
// idempotent — used by both the OCR scan and manual transaction commit,
// so any path that produces a merchant name keeps the autocomplete list
// (and OCR canonicalization source) up to date. Never throws.
//
// settingsContainer is passed in to avoid a circular require with cosmos.js
// from a utils module.
async function rememberMerchant(settingsContainer, familyId, name) {
  const clean = cleanMerchant(name);
  if (!clean) return;
  try {
    let doc = null;
    try {
      const { resource } = await settingsContainer.item(`merchants_${familyId}`, familyId).read();
      doc = resource;
    } catch { doc = null; }
    if (!doc) {
      doc = {
        id:        `merchants_${familyId}`,
        userId:    familyId,
        type:      "MERCHANTS",
        merchants: [],
        createdAt: new Date().toISOString(),
      };
    }
    const list = Array.isArray(doc.merchants) ? doc.merchants : [];
    if (merchantExists(list, clean)) return;  // already known
    await settingsContainer.items.upsert({
      ...doc,
      merchants: [...list, clean],
      updatedAt: new Date().toISOString(),
    });
    console.log(`[MERCHANTS] Remembered "${clean}" for ${familyId}`);
  } catch (err) {
    console.error("[MERCHANTS] rememberMerchant failed (non-fatal):", err.message);
  }
}

module.exports = { cleanMerchant, merchantExists, rememberMerchant };
