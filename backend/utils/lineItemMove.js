// ============================================================
// File: backend/utils/lineItemMove.js
//
// Re-tagging receipt lines of a transaction that is already saved.
//
// Tags live on the transaction, and a receipt becomes one transaction per
// (subcategory, priority, tags) group — so "tag this one line differently"
// means MOVING the line to the transaction that carries those tags (an
// existing sibling from the same receipt, or a new one). This module is the
// pure part: given the source tx, the picked line indices and the target
// tags, it says what the source and target look like afterwards. No I/O.
// ============================================================

const { sumMoney } = require("./helpers");

const sameTags = (a, b) => {
  const x = [...new Set(a || [])].sort();
  const y = [...new Set(b || [])].sort();
  return x.length === y.length && x.every((t, i) => t === y[i]);
};

// A tx saved without a breakdown is one line: itself.
function linesOf(tx) {
  if (Array.isArray(tx.lineItems) && tx.lineItems.length > 0) return tx.lineItems;
  return [{
    description:      tx.description || "",
    amount:           tx.amount,
    originalAmount:   tx.originalAmount,
    originalCurrency: tx.originalCurrency,
  }];
}

// Why this tx cannot have lines moved out of it (or into it), or null.
// Returns reference lines by index and vouchers are allocated per tx
// amount — moving money between transactions would silently break both.
function moveBlocker(tx) {
  if ((tx.returns || []).length > 0) {
    return "Transakcja ma zwroty — nie można przenosić jej pozycji. Usuń zwrot albo zmień tagi całej transakcji.";
  }
  if ((tx.voucherAllocations || []).length > 0 || tx.useVoucher || (tx.voucherAmount || 0) > 0) {
    return "Transakcja ma voucher — nie można przenosić jej pozycji. Zmień tagi całej transakcji.";
  }
  return null;
}

// Totals + label for a transaction made of `lines`. `summary` is the
// description a multi-line transaction keeps (the receipt label); a single
// line is named after the product, as the cart does.
function totalsFor(lines, summary) {
  return {
    lineItems:      lines,
    amount:         sumMoney(lines.map(l => l.amount)),
    originalAmount: sumMoney(lines.map(l => l.originalAmount ?? l.amount)),
    description:    lines.length === 1 ? (lines[0].description || summary || "") : (summary || ""),
  };
}

// Does `candidate` accept lines headed for `targetTags` from `source`?
function isMergeTarget(candidate, source, targetTags) {
  return candidate.id !== source.id
    && !candidate.isArchived
    && !!source.receiptId && candidate.receiptId === source.receiptId
    && candidate.subcategoryId === source.subcategoryId
    && (candidate.priority ?? 2) === (source.priority ?? 2)
    && candidate.originalCurrency === source.originalCurrency
    && candidate.fxRate === source.fxRate
    && sameTags(candidate.tags, targetTags)
    && !moveBlocker(candidate);
}

/**
 * source:     the stored transaction
 * indices:    positions in linesOf(source) to move
 * targetTags: tag ids the moved lines should carry
 * sibling:    an already-matching transaction to merge into, or null
 *
 * → { error } | { retag: true } (every line moved: just retag the source)
 *   | { source: <fields>, target: <fields>, targetIsNew: boolean }
 */
function planLineMove(source, indices, targetTags, sibling = null) {
  const lines = linesOf(source);
  const picked = [...new Set(indices)];
  if (picked.length === 0 || picked.some(i => !Number.isInteger(i) || i < 0 || i >= lines.length)) {
    return { error: "Nieprawidłowy wybór pozycji." };
  }
  if (sameTags(source.tags, targetTags)) {
    return { error: "Te pozycje mają już takie tagi." };
  }
  const blocked = moveBlocker(source);
  if (blocked) return { error: blocked };

  if (picked.length === lines.length) return { retag: true };

  const set    = new Set(picked);
  const moved  = lines.filter((_, i) => set.has(i));
  const staying = lines.filter((_, i) => !set.has(i));

  const targetLines = sibling ? [...linesOf(sibling), ...moved] : moved;
  const targetSummary = sibling && linesOf(sibling).length > 1 ? sibling.description : source.description;

  return {
    source:      totalsFor(staying, source.description),
    target:      totalsFor(targetLines, targetSummary),
    targetIsNew: !sibling,
  };
}

module.exports = { sameTags, linesOf, moveBlocker, isMergeTarget, planLineMove };
