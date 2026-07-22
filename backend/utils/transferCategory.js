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

/**
 * Full TRANSFER document for money coming back from a return flow — the
 * single-transaction return (incl. surplus over the purchase amount) and
 * the consolidated batch/deposit return build the exact same shape here,
 * so the two endpoints can't drift apart field by field.
 * `sourceTransactionId` is only stamped when the transfer traces back to
 * one specific transaction (batch transfers don't).
 */
function buildReturnTransferDoc({
  familyId, target, amount, date, budgetMonth, description, user,
  idSlug, sourceTransactionId = null,
}) {
  return {
    id:               `tx_${familyId}_${budgetMonth.replace("-", "")}_${idSlug}_${Date.now()}`,
    userId:           familyId,
    type:             "TRANSFER",
    categoryId:       target.categoryId,
    categoryName:     target.categoryName,
    subcategoryId:    target.subcategoryId,
    subcategoryName:  target.subcategoryName,
    amount,
    originalAmount:   amount,
    originalCurrency: "PLN",
    fxRate:           1,
    date,
    budgetMonth,
    priority:         2,
    tags:             [],
    description,
    ...(sourceTransactionId ? { sourceTransactionId } : {}),
    useVoucher:       false,
    voucherId:        null,
    voucherAmount:    0,
    isRecurring:      false,
    recurringId:      null,
    netAmount:        amount,
    returns:          [],
    author:           user.name || user.email,
    authorId:         user.id,
    isArchived:       false,
    archivedAt:       null,
    archivedBy:       null,
    archivedById:     null,
    createdAt:        new Date().toISOString(),
  };
}

module.exports = { resolveSubcategoryFull, resolveTransferTarget, buildReturnTransferDoc };
