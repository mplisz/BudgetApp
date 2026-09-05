// ============================================================
// File: src/utils/receiptGroups.ts
// One scan = one purchase, but not one transaction: the cart splits a
// receipt into one transaction per subcategory (see aggregateCart), so a
// 30-item Biedronka receipt lands in the month list as six rows that look
// unrelated. This regroups them back into the receipt they came from —
// the unit the user actually remembers standing at the till.
//
// Deliberately does NOT invent purchases: a transaction with no receipt
// stays loose (shop+date would merge two separate visits on the same day).
// ============================================================

import { round2 } from "./helpers";
import type { Transaction } from "../types/summary";

// Receipt identity of a transaction, or null when it never came from a scan.
// The Receipt entity id is authoritative; the blob path is the fallback for
// transactions saved before receiptId was stored on them.
export function receiptKeyOf(tx: Transaction): string | null {
  if (tx.receiptId)       return `r:${tx.receiptId}`;
  if (tx.receiptBlobPath) return `b:${tx.receiptBlobPath}`;
  return null;
}

export interface ReceiptGroup {
  key:         string;
  label:       string;          // shop name, or "Bez sklepu"
  date:        string;          // earliest date in the group
  items:       Transaction[];
  sum:         number;          // net of returns (effectiveAmount)
  voucherSum:  number;
  returnedSum: number;
  isWarranty:  boolean;         // any line flagged → the whole receipt is
  /** Transaction to open the receipt preview with — the first one that still
   *  carries a blob path (retention may have dropped it from the others). */
  previewTxId: string | null;
}

export interface ReceiptGrouping {
  groups: ReceiptGroup[];       // newest receipt first
  loose:  Transaction[];        // no receipt — kept out of the grouping
}

// Same fallback chain the panel totals use: returns already deducted.
const amountOf = (tx: Transaction) => tx.effectiveAmount ?? tx.netAmount ?? tx.amount;

export function groupByReceipt(txs: Transaction[]): ReceiptGrouping {
  const map   = new Map<string, ReceiptGroup>();
  const loose: Transaction[] = [];

  for (const tx of txs) {
    const key = receiptKeyOf(tx);
    if (!key) { loose.push(tx); continue; }

    let group = map.get(key);
    if (!group) {
      group = {
        key, label: "", date: tx.date, items: [],
        sum: 0, voucherSum: 0, returnedSum: 0,
        isWarranty: false, previewTxId: null,
      };
      map.set(key, group);
    }

    group.items.push(tx);
    group.sum         += amountOf(tx);
    group.voucherSum  += tx.voucherAmount     || 0;
    group.returnedSum += tx.sameMonthReturned || 0;
    group.isWarranty   = group.isWarranty || !!tx.isWarranty;
    // The receipt's date is the earliest of its lines — an edit can push one
    // line to another day without moving the purchase.
    if (tx.date < group.date) group.date = tx.date;
    if (!group.label)       group.label       = (tx.merchant || "").trim();
    if (!group.previewTxId && tx.receiptBlobPath) group.previewTxId = tx.id;
  }

  const groups = [...map.values()]
    .map(g => ({
      ...g,
      label:       g.label || "Bez sklepu",
      sum:         round2(g.sum),
      voucherSum:  round2(g.voucherSum),
      returnedSum: round2(g.returnedSum),
    }))
    // Newest purchase first; same-day receipts sorted by shop so the order is
    // stable between renders.
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));

  return { groups, loose };
}
