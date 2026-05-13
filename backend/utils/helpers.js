// ============================================================
// File: backend/utils/helpers.js
// ============================================================

// ── Shared validators ─────────────────────────────────────────
const { z } = require('zod');
const IdParamSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid ID format");
const BudgetMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid budgetMonth format (YYYY-MM)");
const BUDGET_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;


const slugify = (text) => {
  if (!text || typeof text !== "string") return `${Date.now()}`;
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
};

const generateId = slugify;

const readItem = async (container, id, partitionKey) => {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource ?? null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
};

/**
 * Syncs usedInTransactions on a voucher document.
 *
 * Rebuilds the array from scratch based on the provided operation:
 *   "add"    — append a new usage entry
 *   "remove" — remove all entries for a given transactionId
 *   "update" — replace the amount for a given transactionId
 *
 * Returns the updated voucher document, or null if voucher not found.
 */
const syncVoucherUsage = async (vouchersContainer, voucherId, familyId, op) => {
  // op: { type: "add"|"remove"|"update", transactionId, amount?, usedAt? }
  const voucher = await readItem(vouchersContainer, voucherId, familyId);
  if (!voucher || voucher.isArchived) return null;

  let entries = [...(voucher.usedInTransactions || [])];

  if (op.type === "add") {
    // Guard against duplicate entries (idempotent re-runs)
    const alreadyExists = entries.some(e => e.transactionId === op.transactionId);
    if (!alreadyExists) {
      entries.push({
        transactionId: op.transactionId,
        amount:        op.amount,
        usedAt:        op.usedAt,
        description:   op.description || "",
      });
    }
  } else if (op.type === "remove") {
    entries = entries.filter(e => e.transactionId !== op.transactionId);
  } else if (op.type === "update") {
    entries = entries.map(e =>
      e.transactionId === op.transactionId
        ? { ...e, amount: op.amount, description: op.description ?? e.description }
        : e
    );
  }

  const updated = { ...voucher, usedInTransactions: entries };
  const { resource } = await vouchersContainer.items.upsert(updated);
  return resource;
};

module.exports = { generateId, readItem, syncVoucherUsage, IdParamSchema, BudgetMonthSchema, BUDGET_MONTH_REGEX };
