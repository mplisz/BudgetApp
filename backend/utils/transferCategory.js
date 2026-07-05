// ============================================================
// File: backend/utils/transferCategory.js
// Resolves a user-configured transfer target (stored in settings as a single
// subcategoryId) into the full { categoryId, categoryName, subcategoryId,
// subcategoryName } needed to build a TRANSFER transaction.
//
// Categories are stored flat (each subcategory is its own document with a
// parentCategoryId), so resolving is two point reads: sub → parent.
//
// Used by every flow that auto-creates a transfer (returns, bottle deposits,
// envelope purchase) so the mapping lives in one place — no env vars.
// ============================================================

const { settingsContainer, categoriesContainer } = require("../cosmos");
const { readItem } = require("./helpers");

// subcategoryId → { categoryId, categoryName, subcategoryId, subcategoryName } | null
async function resolveSubcategoryFull(familyId, subcategoryId) {
  if (!subcategoryId) return null;
  const sub = await readItem(categoriesContainer, subcategoryId, familyId);
  if (!sub || sub.isArchived || !sub.parentCategoryId) return null;
  const parent = await readItem(categoriesContainer, sub.parentCategoryId, familyId);
  if (!parent) return null;
  return {
    categoryId:      parent.id,
    categoryName:    parent.name,
    subcategoryId:   sub.id,
    subcategoryName: sub.name,
  };
}

/**
 * Resolve the transfer target configured under `settingsField`.
 * @returns {{ ok: true, target }} | {{ ok: false, reason: "not-configured" | "not-found" }}
 */
async function resolveTransferTarget(familyId, settingsField) {
  const settings = await readItem(settingsContainer, `settings_${familyId}`, familyId);
  const subId = settings?.[settingsField];
  if (!subId) return { ok: false, reason: "not-configured" };
  const target = await resolveSubcategoryFull(familyId, subId);
  if (!target) return { ok: false, reason: "not-found" };
  return { ok: true, target };
}

module.exports = { resolveSubcategoryFull, resolveTransferTarget };
