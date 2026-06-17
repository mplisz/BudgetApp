// ============================================================
// File: backend/utils/helpers.js
// ============================================================

const { z } = require('zod');
const { cleanMerchant } = require("./merchant");

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

// ── Voucher model helpers ─────────────────────────────────────
//
// Pure (no I/O) helpers describing voucher semantics. Used by the
// transaction saga, the batch endpoint, and validation.
//
// valueType:
//   "amount"  — depleting PLN balance (initialValue − Σ used).
//   "percent" — ONE-SHOT percentage discount (percentValue). No balance;
//               "used up" the moment usedInTransactions is non-empty.

const isPercentVoucher = (v) => (v?.valueType ?? "amount") === "percent";

/**
 * Read-time fallback for transactions (no migration — decyzja 3):
 * the new array shape wins; otherwise synthesize a single-element array
 * from the legacy scalar fields; otherwise empty.
 */
const getVoucherAllocations = (tx) => {
  if (Array.isArray(tx?.voucherAllocations)) return tx.voucherAllocations;
  if (tx?.voucherId) {
    return [{ voucherId: tx.voucherId, amount: roundMoney(tx.voucherAmount || 0) }];
  }
  return [];
};

/** Remaining PLN balance — meaningful only for amount-type vouchers. */
const voucherRemaining = (v) => {
  const used = (v.usedInTransactions || []).reduce((s, u) => s + (u.amount || 0), 0);
  return roundMoney(Math.max(0, (v.initialValue || 0) - used));
};

/**
 * Can this voucher still be applied?
 *   amount  → has remaining balance
 *   percent → one-shot, so usable only while never used
 */
const isVoucherUsable = (v) => {
  if (!v || v.isArchived) return false;
  return isPercentVoucher(v)
    ? (v.usedInTransactions || []).length === 0
    : voucherRemaining(v) > 0;
};

/**
 * PLN discount this voucher yields against a given gross base amount.
 *   percent → round(base × percentValue / 100)
 *   amount  → min(remaining, base)
 */
const computeVoucherValue = (v, baseAmount) => {
  const base = roundMoney(baseAmount);
  if (isPercentVoucher(v)) return roundMoney(base * (v.percentValue || 0) / 100);
  return roundMoney(Math.min(voucherRemaining(v), base));
};

// Store matching (feature d). Store is now ALWAYS present on new vouchers,
// so a non-empty merchant match is required. Canonicalized via cleanMerchant
// so "Medicover" / "medicover " / "MEDICOVER" all compare equal.
const normStore = (s) => (cleanMerchant(s) || "").toLowerCase();

const voucherMatchesMerchant = (v, merchant) => {
  const m = normStore(merchant);
  return m !== "" && normStore(v.store) === m;
};

// ── Voucher batch sync (multiple vouchers per transaction) ────
//
// Thin wrappers over syncVoucherUsage / revertVoucherSync so the
// transaction saga can apply N voucher mutations atomically: if any
// one fails, every successful one applied so far is rolled back.

/**
 * ops: [{ voucherId, op }]  where op is the { type, transactionId, ... }
 *      shape accepted by syncVoucherUsage.
 *
 * Returns:
 *   { ok: true,  snapshots: [...] }   — caller keeps snapshots for its own
 *                                        rollback if a LATER step (tx upsert) fails.
 *   { ok: false, failedVoucherId }    — nothing left applied; already rolled back.
 */
const syncVoucherBatch = async (vouchersContainer, familyId, ops) => {
  const snapshots = [];
  for (const { voucherId, op } of (ops || [])) {
    const result = await syncVoucherUsage(vouchersContainer, voucherId, familyId, op);
    if (!result) {
      // Missing / archived voucher → unwind everything applied so far.
      await revertVoucherBatch(vouchersContainer, snapshots);
      return { ok: false, failedVoucherId: voucherId, snapshots: [] };
    }
    snapshots.push(result.previousState);
  }
  return { ok: true, snapshots };
};

/** Revert a batch (reverse order, best-effort). */
const revertVoucherBatch = async (vouchersContainer, snapshots) => {
  for (const snap of [...(snapshots || [])].reverse()) {
    await revertVoucherSync(vouchersContainer, snap);
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

// ── ENV file helpers ─────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development'
const sameSitePolicy = isProduction ? 'none' : 'strict';



// ── Money rounding ───────────────────────────────────────────
// Safety rounding to 2 decimal places
// Standard Math.round(x * 100) / 100 contains IEEE 754 errors for some amounts (np. 1.005, 2.675). Number.EPSILON solves that

const round2 = (n) => {
  if (typeof n !== "number" || isNaN(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};
/**
 * Round a monetary value to 2 decimal places.
 *
 * Delegates to round2() for IEEE 754-safe rounding.
 * Adds defensive Number() coercion so callers can pass strings or
 * falsy values without crashing.
 *
 * Single source of truth — if storage ever migrates to integer grosze,
 * only this function needs to change.
 */
const roundMoney = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return round2(n); 
};



module.exports = {
  generateId,
  readItem,
  readItemWithEtag,
  syncVoucherUsage,
  revertVoucherSync,
  // Voucher model helpers
  isPercentVoucher,
  getVoucherAllocations,
  voucherRemaining,
  isVoucherUsable,
  computeVoucherValue,
  voucherMatchesMerchant,
  // Voucher batch sync
  syncVoucherBatch,
  revertVoucherBatch,
  roundMoney,
  sumMoney,
  IdParamSchema,
  BudgetMonthSchema,
  BUDGET_MONTH_REGEX,
  currentServerMonth,
  prevServerMonth,
  isProduction,
  isDevelopment,
  sameSitePolicy,
  round2
};
