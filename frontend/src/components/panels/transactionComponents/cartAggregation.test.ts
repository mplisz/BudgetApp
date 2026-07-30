// ============================================================
// File: src/components/panels/transactionComponents/cartAggregation.test.ts
// Cart merge rules — the part that decides how many transactions a cart
// turns into, and which receipt each one points at.
//
// The regression that motivated these: one cart can hold several scans
// (scan → add → scan again). Aggregation used to ignore the receipt, so two
// same-subcategory lines from different receipts collapsed into one row —
// which kept only the FIRST receipt's link. The second scan then never got a
// transaction pointing at it, stayed `pending`, and died on its 2h ttl.
// ============================================================

import { describe, it, expect } from "vitest";
import { aggregateCart, purchaseKey } from "./CartPanel";
import type { CartItem } from "./CartPanel";

let seq = 0;
const item = (over: Partial<CartItem> = {}): CartItem => ({
  date:             "2026-07-30",
  type:             "EXPENSE",
  budgetMonth:      "2026-07",
  subcategoryId:    "sub_nabial",
  subcategoryName:  "Nabiał",
  categoryId:       "cat_spozywcze",
  categoryName:     "Spożywcze",
  amount:           10,
  originalAmount:   10,
  originalCurrency: "PLN",
  fxRate:           1,
  description:      "Mleko",
  tags:             [],
  priority:         2,
  useVoucher:       false,
  voucherId:        null,
  voucherAmount:    0,
  netAmount:        10,
  isRecurring:      false,
  recurringId:      null,
  _cartId:          `cart_${++seq}`,
  ...over,
} as CartItem);

// ── purchaseKey ───────────────────────────────────────────────

describe("purchaseKey", () => {
  it("keys on the receipt id when there is one", () => {
    expect(purchaseKey(item({ _ocrReceiptId: "rcpt_a" }))).toBe("r:rcpt_a");
  });

  it("prefers the receipt id over the shop name", () => {
    const a = purchaseKey(item({ _ocrReceiptId: "rcpt_a", _ocrMerchant: "Lidl" }));
    const b = purchaseKey(item({ _ocrReceiptId: "rcpt_b", _ocrMerchant: "Lidl" }));
    expect(a).not.toBe(b);
  });

  it("falls back to the blob path when the receipt entity is missing", () => {
    expect(purchaseKey(item({ _ocrReceiptPath: "blob/x.jpg" }))).toBe("r:blob/x.jpg");
  });

  it("falls back to the shop, case- and whitespace-insensitively", () => {
    expect(purchaseKey(item({ merchant: " Biedronka " })))
      .toBe(purchaseKey(item({ _ocrMerchant: "biedronka" })));
  });

  it("buckets shopless manual lines together", () => {
    expect(purchaseKey(item())).toBe("manual");
  });
});

// ── aggregateCart ─────────────────────────────────────────────

describe("aggregateCart", () => {
  it("merges same-subcategory lines within one receipt", () => {
    const out = aggregateCart([
      item({ _ocrReceiptId: "rcpt_a", amount: 10 }),
      item({ _ocrReceiptId: "rcpt_a", amount: 5, description: "Ser" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(15);
    expect(out[0]._mergedCount).toBe(2);
  });

  it("never merges across receipts, even when everything else matches", () => {
    const out = aggregateCart([
      item({ _ocrReceiptId: "rcpt_a", _ocrMerchant: "Biedronka", amount: 10 }),
      item({ _ocrReceiptId: "rcpt_b", _ocrMerchant: "Lidl",      amount: 5 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("keeps each resulting row pointed at its own receipt and shop", () => {
    const out = aggregateCart([
      item({ _ocrReceiptId: "rcpt_a", _ocrMerchant: "Biedronka" }),
      item({ _ocrReceiptId: "rcpt_b", _ocrMerchant: "Lidl" }),
    ]);
    expect(out.map(i => [i._ocrReceiptId, i._ocrMerchant])).toEqual([
      ["rcpt_a", "Biedronka"],
      ["rcpt_b", "Lidl"],
    ]);
  });

  it("does not merge manual lines from different shops", () => {
    const out = aggregateCart([
      item({ merchant: "Żabka" }),
      item({ merchant: "Lidl" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("still merges manual lines that share a shop", () => {
    const out = aggregateCart([
      item({ merchant: "Żabka", amount: 4 }),
      item({ merchant: "Żabka", amount: 6 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(10);
  });

  it("keeps subcategory as a split dimension inside one receipt", () => {
    const out = aggregateCart([
      item({ _ocrReceiptId: "rcpt_a", subcategoryId: "sub_nabial" }),
      item({ _ocrReceiptId: "rcpt_a", subcategoryId: "sub_pieczywo" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("collects a breakdown line per contribution when merging", () => {
    const out = aggregateCart([
      item({ _ocrReceiptId: "rcpt_a", amount: 10, description: "Mleko" }),
      item({ _ocrReceiptId: "rcpt_a", amount: 5,  description: "Ser" }),
    ]);
    expect(out[0]._lineItems?.map(l => l.description)).toEqual(["Mleko", "Ser"]);
  });
});
