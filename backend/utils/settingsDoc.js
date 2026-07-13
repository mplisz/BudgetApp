// ============================================================
// File: backend/utils/settingsDoc.js
// Generic read-modify-upsert for per-family documents in the
// Settings container (merchants_${familyId}, ocr_corrections_${familyId},
// settings_${familyId}, ...). Every one of these follows the same
// shape: point-read by a known id, mutate a field, upsert — best-effort,
// idempotent, never throws.
//
// This module owns two shared concerns that were previously copy-pasted:
//   1. Tolerant point-read (missing doc → null, no throw).
//   2. Optimistic-concurrency upsert (IfMatch ETag + one retry), so two
//      family members saving concurrently can't silently clobber each
//      other's write.
// ============================================================

const MAX_RETRIES = 2;

// Point-read a settings doc by id. Returns { doc, etag } with doc=null
// when the document doesn't exist yet. Never throws.
async function readSettingsDoc(container, id, familyId) {
  try {
    const { resource } = await container.item(id, familyId).read();
    return { doc: resource || null, etag: resource?._etag || null };
  } catch {
    return { doc: null, etag: null };
  }
}

// Read-modify-upsert with optimistic concurrency. `mutate(doc)` receives
// the current document (or a fresh scaffold with id/userId/type/createdAt
// when none exists) and returns the document to write — or null/undefined
// to signal "nothing to do" (skips the write entirely, saving an RU).
//
// On an ETag conflict (412) or create race (409) the whole read-mutate-write
// cycle is retried, so the second writer merges against fresh data instead
// of overwriting. Best-effort: logs and returns false on any failure,
// never throws — a learning write must never break the caller.
async function upsertSettingsDoc(container, { id, familyId, type, mutate, logTag = "SETTINGS" }) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { doc, etag } = await readSettingsDoc(container, id, familyId);
      const base = doc || {
        id,
        userId:    familyId,   // partition key
        type,
        createdAt: new Date().toISOString(),
      };
      const next = mutate(base);
      if (!next) return true;  // mutate decided there's nothing to persist
      next.updatedAt = new Date().toISOString();
      const options = etag ? { accessCondition: { type: "IfMatch", condition: etag } } : {};
      await container.items.upsert(next, options);
      return true;
    } catch (err) {
      // 412 = ETag mismatch (concurrent writer won), 409 = create race.
      if ((err.code === 412 || err.code === 409) && attempt < MAX_RETRIES) continue;
      console.error(`[${logTag}] settings upsert failed (non-fatal):`, err.message);
      return false;
    }
  }
  return false;
}

module.exports = { readSettingsDoc, upsertSettingsDoc };
