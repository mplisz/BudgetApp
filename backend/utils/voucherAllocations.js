// ============================================================
// File: backend/utils/voucherAllocations.js
//
// Orchestration for multi-voucher transactions. Pure-ish: only I/O is
// reading voucher docs; all mutation happens in the caller via the
// syncVoucherBatch helpers, fed by the op lists this module produces.
//
//   resolveAllocations     — validate + server-trust amounts for ONE tx
//   buildAllocationOps     — "add"    ops for a tx's allocations
//   buildRemovalOps        — "remove" ops for a tx's allocations
//   diffAllocationOps      — minimal add/remove/update ops for a PATCH
//   splitVouchersAcrossTxs — proportional split for the batch/OCR path
//
// Money rules:
//   - amount  voucher → depleting PLN balance; client may use part of it.
//   - percent voucher → ONE-SHOT; amount is ALWAYS recomputed server-side
//     against the gross base (never trusted from the client).
// ============================================================

const {
  readItem, roundMoney,
  isPercentVoucher, voucherMatchesMerchant, computeVoucherValue,
} = require("./helpers");

/**
 * Validate a client-sent allocation list for a single transaction and
 * return server-trusted amounts.
 *
 * rawAllocations:       [{ voucherId, amount? }]
 * txAmount:             gross PLN amount of the transaction
 * merchant:             transaction's shop (for the store-match rule)
 * currentTransactionId: when editing, the tx whose existing usage must be
 *                       EXCLUDED from the voucher's balance/usability — the
 *                       tx is re-confirming its own allocation, not adding a
 *                       new use. null/undefined on create.
 *
 * Returns:
 *   { ok: true,  allocations: [{voucherId, amount}], voucherAmount }
 *   { ok: false, error }
 */
async function resolveAllocations(vouchersContainer, familyId, rawAllocations, txAmount, merchant, currentTransactionId = null) {
  const base = roundMoney(txAmount);
  const seen = new Set();
  const allocations = [];
  let running = 0;

  for (const raw of (rawAllocations || [])) {
    if (!raw || !raw.voucherId) continue;
    if (seen.has(raw.voucherId)) {
      return { ok: false, error: "Ten sam voucher nie może być przypisany dwa razy do jednej transakcji." };
    }
    seen.add(raw.voucherId);

    const voucher = await readItem(vouchersContainer, raw.voucherId, familyId);
    if (!voucher || voucher.isArchived) {
      return { ok: false, error: "Voucher nie istnieje lub jest zarchiwizowany." };
    }

    // Balance / usability EXCLUDING this transaction's own existing usage,
    // so editing a tx that already consumed (part of) the voucher works.
    const used = (voucher.usedInTransactions || [])
      .filter(u => u.transactionId !== currentTransactionId);
    const percent = isPercentVoucher(voucher);

    const usableHere = percent
      ? used.length === 0                                   // one-shot: no OTHER tx used it
      : roundMoney((voucher.initialValue || 0) - used.reduce((s, u) => s + (u.amount || 0), 0)) > 0;
    if (!usableHere) {
      return { ok: false, error: "Voucher jest już wykorzystany lub nie ma środków." };
    }

    // Store match (feature d) — store is always present on new vouchers.
    if (!voucherMatchesMerchant(voucher, merchant)) {
      return {
        ok: false,
        error: `Voucher „${voucher.description}" jest przypisany do sklepu „${voucher.store}" i nie pasuje do tej transakcji.`,
      };
    }

    const budget = roundMoney(base - running);
    if (budget <= 0) continue; // brak miejsca — kolejne vouchery pomijamy

    let value;
    if (percent) {
      // procent zawsze liczony od kwoty brutto transakcji (decyzja 2)
      value = Math.min(roundMoney(base * (voucher.percentValue || 0) / 100), budget);
    } else {
      // kwotowy — respektujemy wybór usera (można użyć części), przycięty
      // do salda (bez bieżącej transakcji) i pozostałego budżetu transakcji.
      const remaining = roundMoney((voucher.initialValue || 0) - used.reduce((s, u) => s + (u.amount || 0), 0));
      const requested = raw.amount != null ? roundMoney(raw.amount) : remaining;
      value = Math.min(requested, remaining, budget);
    }
    value = roundMoney(value);
    if (value <= 0) continue;

    allocations.push({ voucherId: voucher.id, amount: value });
    running = roundMoney(running + value);
  }

  return { ok: true, allocations, voucherAmount: roundMoney(running) };
}

/** "add" op for every allocation on a transaction. */
function buildAllocationOps(allocations, { transactionId, usedAt, description }) {
  return (allocations || []).map(a => ({
    voucherId: a.voucherId,
    op: { type: "add", transactionId, amount: a.amount, usedAt, description: description || "" },
  }));
}

/** "remove" op for every allocation on a transaction. */
function buildRemovalOps(allocations, transactionId) {
  return (allocations || []).map(a => ({
    voucherId: a.voucherId,
    op: { type: "remove", transactionId },
  }));
}

/**
 * Diff old vs new allocations for a PATCH → minimal op set.
 * old/new: [{voucherId, amount}]
 */
function diffAllocationOps(oldAllocations, newAllocations, { transactionId, usedAt, description }) {
  const oldMap = new Map((oldAllocations || []).map(a => [a.voucherId, roundMoney(a.amount)]));
  const newMap = new Map((newAllocations || []).map(a => [a.voucherId, roundMoney(a.amount)]));
  const ops = [];

  // removed — in old, gone from new
  for (const [voucherId] of oldMap) {
    if (!newMap.has(voucherId)) ops.push({ voucherId, op: { type: "remove", transactionId } });
  }
  // added / changed
  for (const [voucherId, amount] of newMap) {
    if (!oldMap.has(voucherId)) {
      ops.push({ voucherId, op: { type: "add", transactionId, amount, usedAt, description: description || "" } });
    } else if (oldMap.get(voucherId) !== amount) {
      ops.push({ voucherId, op: { type: "update", transactionId, amount, description } });
    }
  }
  return ops;
}

/**
 * Batch / OCR path (decyzja 2): the selected vouchers apply to the WHOLE
 * cart gross total and are split proportionally across the resulting txs.
 *
 * selectedVouchers: voucher docs (already read + store/usable-validated)
 * txs:              [{ amount }] in order
 *
 * Returns perTx: [ [{voucherId, amount}], ... ] aligned with txs.
 *
 * For a single resulting tx this degenerates to "full voucher value on
 * that tx"; for a percent voucher the proportional split is mathematically
 * identical to "percent × each tx amount".
 */
function splitVouchersAcrossTxs(selectedVouchers, txs) {
  const amounts = txs.map(t => roundMoney(t.amount));
  const T = roundMoney(amounts.reduce((s, a) => s + a, 0));
  const perTx = txs.map(() => []);
  if (T <= 0) return perTx;

  // Remaining budget per tx so vouchers never push any tx below zero.
  const budgets = [...amounts];

  for (const voucher of selectedVouchers) {
    let V = roundMoney(computeVoucherValue(voucher, T));
    const globalLeft = roundMoney(budgets.reduce((s, b) => s + b, 0));
    V = Math.min(V, globalLeft);
    if (V <= 0) continue;

    // Proportional by tx amount; the last receiving tx absorbs the rounding
    // remainder so the parts sum back to V. Each share capped at its budget.
    let allocated = 0;
    const shares = amounts.map((a, i) => {
      const raw = (i === amounts.length - 1)
        ? roundMoney(V - allocated)
        : roundMoney(V * a / T);
      const capped = Math.min(roundMoney(raw), budgets[i]);
      allocated = roundMoney(allocated + capped);
      return capped;
    });

    shares.forEach((share, i) => {
      if (share > 0) {
        perTx[i].push({ voucherId: voucher.id, amount: share });
        budgets[i] = roundMoney(budgets[i] - share);
      }
    });
  }

  return perTx;
}

module.exports = {
  resolveAllocations,
  buildAllocationOps,
  buildRemovalOps,
  diffAllocationOps,
  splitVouchersAcrossTxs,
};
