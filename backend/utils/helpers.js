// ============================================================
// File: backend/utils/helpers.js
// ============================================================

const { z } = require('zod');

// ── Shared validators ─────────────────────────────────────────

const IdParamSchema      = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid ID format");
const BudgetMonthSchema  = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid budgetMonth format (YYYY-MM)");
const BUDGET_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

// ── String → ID slug ─────────────────────────────────────────

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

// ── Money rounding ───────────────────────────────────────────

/**
 * Round a monetary value to 2 decimal places.
 *
 * Why a helper instead of `Math.round(x * 100) / 100` inline:
 *   1. Single source of truth — if we ever migrate to integer-grosze
 *      storage, only this function needs to change.
 *   2. Defensive: `Number()` coerces strings, falsy values become 0.
 *   3. Documentation: every call site implicitly says "yes, this is money".
 *
 * Trade-offs:
 *   - Floating-point binary representation can still drift on huge sums
 *     (millions of zł). For a family budget that ceiling is irrelevant.
 *   - For absolute precision, switch the whole pipeline to integer
 *     grosze (×100 stored, ÷100 displayed). Out of scope today.
 */
const roundMoney = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

/** Safe sum of an array of numeric-ish values, rounded once at the end. */
const sumMoney = (values) =>
  roundMoney((values || []).reduce((s, v) => s + (Number(v) || 0), 0));

// ── Cosmos DB read helpers ────────────────────────────────────

/**
 * Reads an item from Cosmos along with its ETag. Returns null+null when
 * the document doesn't exist (404 is not an exception we surface).
 */
const readItemWithEtag = async (container, id, partitionKey) => {
  try {
    const { resource, etag } = await container.item(id, partitionKey).read();
    if (!resource) return { resource: null, etag: null };
    return { resource, etag: etag ?? resource._etag };
  } catch (err) {
    if (err.code === 404) return { resource: null, etag: null };
    throw err;
  }
};

const readItem = async (container, id, partitionKey) => {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource ?? null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
};

// ── Voucher usage sync ───────────────────────────────────────

/**
 * Syncs `usedInTransactions` on a voucher document.
 *
 * op = { type: "add" | "remove" | "update", transactionId, amount?, usedAt?, description? }
 *
 * Return value (NEW SHAPE — caller can roll back on failure):
 *   {
 *     resource:      <updated voucher document>,
 *     previousState: <voucher BEFORE the change, suitable for rollback upsert>,
 *   }
 *
 * On voucher not found / archived → returns null (no-op).
 *
 * ⚠️  KNOWN RACE CONDITION (unchanged from before):
 * Read → modify → write without optimistic locking. If two requests touch
 * the SAME voucher in the same second, last write wins. Accepted trade-off
 * for a 2-person family app. If this ever bites, add etag retry loop here.
 *
 * Why we return `previousState`: callers (POST/PATCH/DELETE on transactions)
 * mutate the voucher BEFORE saving the transaction. If the subsequent
 * transaction save fails, the caller can call `revertVoucherSync(previousState)`
 * to roll the voucher back, preventing "voucher used but transaction missing"
 * inconsistency.
 */
const syncVoucherUsage = async (vouchersContainer, voucherId, familyId, op) => {
  const voucher = await readItem(vouchersContainer, voucherId, familyId);
  if (!voucher || voucher.isArchived) return null;

  // Snapshot BEFORE mutation — used for rollback by caller.
  // Deep-ish clone of usedInTransactions so the snapshot isn't shared by ref.
  const previousState = {
    ...voucher,
    usedInTransactions: [...(voucher.usedInTransactions || [])],
  };

  let entries = [...(voucher.usedInTransactions || [])];

  if (op.type === "add") {
    // Idempotent guard — re-running the same op is a no-op.
    const alreadyExists = entries.some(e => e.transactionId === op.transactionId);
    if (!alreadyExists) {
      entries.push({
        transactionId: op.transactionId,
        amount:        roundMoney(op.amount),
        usedAt:        op.usedAt,
        description:   op.description || "",
      });
    }
  } else if (op.type === "remove") {
    entries = entries.filter(e => e.transactionId !== op.transactionId);
  } else if (op.type === "update") {
    entries = entries.map(e =>
      e.transactionId === op.transactionId
        ? { ...e, amount: roundMoney(op.amount), description: op.description ?? e.description }
        : e
    );
  }

  const updated = { ...voucher, usedInTransactions: entries };
  const { resource } = await vouchersContainer.items.upsert(updated);
  return { resource, previousState };
};

/**
 * Roll back a previously-applied voucher sync by upserting the snapshot
 * returned by syncVoucherUsage. Best-effort: logs and swallows errors
 * because the caller is already in an error path — we don't want the
 * rollback to mask the original error message.
 *
 * In the worst case (rollback ALSO fails) we end up with an inconsistent
 * voucher state and the request returns the original error. The log
 * "[SYNC ROLLBACK FAILED]" is the signal to look at the voucher manually.
 */
const revertVoucherSync = async (vouchersContainer, previousState) => {
  if (!previousState) return;
  try {
    await vouchersContainer.items.upsert(previousState);
    console.log(`[SYNC ROLLBACK] Reverted voucher ${previousState.id}`);
  } catch (rollbackErr) {
    console.error(
      `[SYNC ROLLBACK FAILED] Voucher ${previousState.id} may be in inconsistent state. ` +
      `Investigate manually. Error:`,
      rollbackErr,
    );
  }
};

// ── Server-side month helpers ─────────────────────────────────

const currentServerMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const prevServerMonth = () => {
  const now = new Date();
  const m   = now.getMonth();
  const y   = now.getFullYear();
  if (m === 0) return `${y - 1}-12`;
  return `${y}-${String(m).padStart(2, "0")}`;
};

module.exports = {
  generateId,
  readItem,
  readItemWithEtag,
  syncVoucherUsage,
  revertVoucherSync,
  roundMoney,
  sumMoney,
  IdParamSchema,
  BudgetMonthSchema,
  BUDGET_MONTH_REGEX,
  currentServerMonth,
  prevServerMonth,
};
