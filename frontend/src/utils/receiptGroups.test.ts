// ============================================================
// File: src/utils/receiptGroups.test.ts
// The "one purchase, several transactions" rule behind the 🧾 Paragony view.
//
// What matters here: a scan that produced N transactions must come back as
// exactly ONE group (that is the whole point — the pagination unit is the
// receipt), and transactions with no receipt must never be merged into an
// invented one just because they share a shop and a day.
// ============================================================

import { describe, it, expect } from "vitest";
import { groupByReceipt, receiptKeyOf } from "./receiptGroups";
import type { Transaction } from "../types/summary";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id:              `tx_${Math.random().toString(36).slice(2)}`,
  type:            "EXPENSE",
  categoryId:      "cat_spozywcze",
  categoryName:    "Spożywcze",
  subcategoryId:   "sub_nabial",
  subcategoryName: "Nabiał",
  amount:          10,
  budgetMonth:     "2026-08",
  date:            "2026-08-14",
  ...over,
} as Transaction);

// ── receiptKeyOf ──────────────────────────────────────────────

describe("receiptKeyOf", () => {
  it("keys on the receipt entity id when there is one", () => {
    expect(receiptKeyOf(tx({ receiptId: "rcpt_a" }))).toBe("r:rcpt_a");
  });

  it("prefers the receipt id over the blob path", () => {
    expect(receiptKeyOf(tx({ receiptId: "rcpt_a", receiptBlobPath: "fam/b.jpg" }))).toBe("r:rcpt_a");
  });

  it("falls back to the blob path for transactions saved before receiptId", () => {
    expect(receiptKeyOf(tx({ receiptBlobPath: "fam/b.jpg" }))).toBe("b:fam/b.jpg");
  });

  it("returns null for a manually typed transaction", () => {
    expect(receiptKeyOf(tx())).toBeNull();
  });
});

// ── groupByReceipt ────────────────────────────────────────────

describe("groupByReceipt", () => {
  it("collapses every transaction from one scan into a single group", () => {
    const { groups, loose } = groupByReceipt([
      tx({ receiptId: "rcpt_a", merchant: "Biedronka", amount: 12.5 }),
      tx({ receiptId: "rcpt_a", merchant: "Biedronka", amount: 7.5, subcategoryName: "Pieczywo" }),
      tx({ receiptId: "rcpt_a", merchant: "Biedronka", amount: 20 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
    expect(groups[0].label).toBe("Biedronka");
    expect(groups[0].sum).toBe(40);
    expect(loose).toEqual([]);
  });

  it("keeps two different receipts apart, even in the same shop on the same day", () => {
    const { groups } = groupByReceipt([
      tx({ receiptId: "rcpt_a", merchant: "Lidl" }),
      tx({ receiptId: "rcpt_b", merchant: "Lidl" }),
    ]);
    expect(groups.map(g => g.key)).toEqual(["r:rcpt_a", "r:rcpt_b"]);
  });

  it("never invents a receipt for manually typed transactions", () => {
    const { groups, loose } = groupByReceipt([
      tx({ merchant: "Żabka", amount: 5 }),
      tx({ merchant: "Żabka", amount: 8 }),
    ]);
    expect(groups).toEqual([]);
    expect(loose).toHaveLength(2);
  });

  it("nets returns out of the group sum, like the panel totals do", () => {
    const { groups } = groupByReceipt([
      tx({ receiptId: "rcpt_a", amount: 100, effectiveAmount: 70, sameMonthReturned: 30 }),
      tx({ receiptId: "rcpt_a", amount: 20,  effectiveAmount: 20 }),
    ]);
    expect(groups[0].sum).toBe(90);
    expect(groups[0].returnedSum).toBe(30);
  });

  it("dates the receipt by its earliest line and sorts newest first", () => {
    const { groups } = groupByReceipt([
      tx({ receiptId: "rcpt_old", date: "2026-08-02" }),
      tx({ receiptId: "rcpt_new", date: "2026-08-20" }),
      tx({ receiptId: "rcpt_new", date: "2026-08-19" }),
    ]);
    expect(groups.map(g => g.key)).toEqual(["r:rcpt_new", "r:rcpt_old"]);
    expect(groups[0].date).toBe("2026-08-19");
  });

  it("flags the whole receipt as warranty when any line is, and picks a preview tx", () => {
    const { groups } = groupByReceipt([
      tx({ id: "tx_1", receiptId: "rcpt_a" }),                                    // link only, no blob
      tx({ id: "tx_2", receiptId: "rcpt_a", receiptBlobPath: "fam/a.jpg", isWarranty: true }),
    ]);
    expect(groups[0].isWarranty).toBe(true);
    expect(groups[0].previewTxId).toBe("tx_2");
  });

  it("labels a receipt with no shop name rather than leaving it blank", () => {
    const { groups } = groupByReceipt([tx({ receiptId: "rcpt_a" })]);
    expect(groups[0].label).toBe("Bez sklepu");
  });
});
