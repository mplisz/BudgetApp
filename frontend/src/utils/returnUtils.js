// ============================================================
// File: src/utils/returnUtils.js
//
// Pure utility functions for return (zwrot) calculations.
// No side effects, no API calls — safe to use anywhere.
//
// Key concepts:
//   - effectiveAmount = amount - totalCashReturned (in given budgetMonth)
//   - Voucher returns don't reduce cash effectiveAmount
//   - Cross-month returns create a TRANSFER transaction automatically (backend)
// ============================================================

import { currentCalendarMonth, formatBudgetMonth } from "./helpers";

// ── Return totals ─────────────────────────────────────────────

export function calculateTotalReturned(tx) {
  return (tx.returns || []).reduce((sum, r) => sum + r.amount, 0);
}

export function calculateTotalCashReturned(tx) {
  return (tx.returns || []).reduce((sum, r) => sum + (r.cashAmount || 0), 0);
}

export function calculateTotalVoucherReturned(tx) {
  return (tx.returns || []).reduce((sum, r) => sum + (r.voucherAmount || 0), 0);
}

// Returns cash returned specifically in the given budgetMonth.
// Used for same-month effectiveAmount calculation.
export function calculateCashReturnedInMonth(tx, budgetMonth) {
  return (tx.returns || [])
    .filter(r => r.moneyReturnedInMonth === budgetMonth)
    .reduce((sum, r) => sum + (r.cashAmount || 0), 0);
}

// ── Effective amount ──────────────────────────────────────────

// The amount that "counts" as expense in the given budgetMonth.
// Subtracts only cash returns in that month — voucher returns are separate assets.
export function calculateEffectiveAmount(tx, budgetMonth) {
  const cashReturnedThisMonth = calculateCashReturnedInMonth(tx, budgetMonth);
  const base = tx.netAmount ?? tx.amount;
  return Math.max(0, base - cashReturnedThisMonth);
}

// ── Status flags ──────────────────────────────────────────────

export function isFullyReturned(tx) {
  return calculateTotalReturned(tx) >= tx.amount;
}

export function isPartiallyReturned(tx) {
  const total = calculateTotalReturned(tx);
  return total > 0 && total < tx.amount;
}

export function remainingToReturn(tx) {
  return Math.round(Math.max(0, tx.amount - calculateTotalReturned(tx)) * 100) / 100;
}

export function canAddReturn(tx) {
  if (tx.isDeleted) return false;
  return remainingToReturn(tx) > 0;
}

// ── Budget month bounds for return ────────────────────────────

// Returns the allowed range for moneyReturnedInMonth:
//   - max: current calendar month
//   - min: one month back from current
// User cannot assign a return to a past or closed month (backend also validates).
export function getReturnMonthBounds() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const currentMonth = formatBudgetMonth(month, year);

  // minMonth: one month back — user can register a return that arrived recently
  const minMonth = month === 0
    ? formatBudgetMonth(11, year - 1)
    : formatBudgetMonth(month - 1, year);

  // maxMonth: no upper limit — returns can happen months or years after purchase
  // (e.g. warranty returns, delayed refunds)
  const maxMonth = null;

  return { minMonth, maxMonth, currentMonth };
}

// Returns true if the given budgetMonth is within the allowed return window.
export function isReturnMonthAllowed(budgetMonth, minMonth) {
  const bounds = getReturnMonthBounds();
  const min = minMonth ?? bounds.minMonth;
  // No upper limit — maxMonth is null
  return budgetMonth >= min;
}

// ── Cross-month detection ─────────────────────────────────────

// Returns true if the return should trigger a TRANSFER transaction.
// Condition: moneyReturnedInMonth is DIFFERENT from the original transaction's budgetMonth.
export function isCrossMonthReturn(tx, moneyReturnedInMonth) {
  return moneyReturnedInMonth !== tx.budgetMonth;
}

// ── TRANSFER payload builder ──────────────────────────────────

// Builds the payload for the auto-created TRANSFER transaction
// when a cash return happens in a different month than the purchase.
// The backend creates this — this function lives here for documentation/reference.
export function buildReturnTransferPayload({
  tx,
  cashAmount,
  moneyReturnedInMonth,
  returnedAt,
  reason,
  returnSubcategoryId   = "cat_root_srodki_zwroty_MMs",
  returnSubcategoryName = "Zwroty",
  returnCategoryId      = "cat_srodki",
  returnCategoryName    = "Środki własne",
}) {
  return {
    type:             "TRANSFER",
    categoryId:       returnCategoryId,
    categoryName:     returnCategoryName,
    subcategoryId:    returnSubcategoryId,
    subcategoryName:  returnSubcategoryName,
    amount:           cashAmount,
    originalAmount:   cashAmount,
    originalCurrency: "PLN",
    fxRate:           1,
    date:             returnedAt,
    budgetMonth:      moneyReturnedInMonth,
    priority:         2,
    tags:             [],
    description:      `Zwrot: ${tx.categoryName} › ${tx.subcategoryName}${reason ? ` — ${reason}` : ""}`,
    sourceTransactionId: tx.id,  // link back to original transaction
  };
}

// ── Display helpers ───────────────────────────────────────────

// Returns the display label for a return entry
export function returnSummaryLabel(returnEntry) {
  const { amount, cashAmount, voucherAmount, moneyReturnedInMonth, reason } = returnEntry;
  const parts = [];
  if (cashAmount > 0)    parts.push(`${cashAmount} PLN gotówka`);
  if (voucherAmount > 0) parts.push(`${voucherAmount} PLN voucher`);
  return `${moneyReturnedInMonth}: ${parts.join(" + ")}${reason ? ` (${reason})` : ""}`;
}