// ============================================================
// File: src/utils/productPricing.test.ts
//
// Unit tests for the pure logic of the "Ceny produktów" section.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - normalizeProductName: diacritics, size units, decimals, multipacks,
//     punctuation-glued sizes, percent-not-a-size, no-size fallback
//   - computeUnitPrice / formatSize: unit math and display
//   - productMetric: unit-price vs line-price fallback rules
//   - buildPriceHistory: grouping, filters, stats, shrink detection
// ============================================================

import { describe, it, expect } from "vitest";
import {
  normalizeProductName,
  computeUnitPrice,
  formatSize,
  productMetric,
  buildPriceHistory,
  MIN_OCCURRENCES,
  type PricedTransaction,
  type ProductHistory,
} from "./productPricing";

// ── Fixtures ─────────────────────────────────────────────────

function tx(o: {
  date: string;
  merchant?: string | null;
  items?: Array<{ description: string; amount: number }>;
  type?: string;
}): PricedTransaction {
  return {
    type:        o.type ?? "EXPENSE",
    date:        o.date,
    budgetMonth: o.date.slice(0, 7),
    merchant:    o.merchant,
    lineItems:   o.items,
  };
}

/** N purchases of the same item, one per month starting 2026-01. */
function purchases(description: string, amounts: number[], merchant = "Biedronka") {
  return amounts.map((amount, i) =>
    tx({
      date: `2026-${String(i + 1).padStart(2, "0")}-10`,
      merchant,
      items: [{ description, amount }],
    }));
}

// ── normalizeProductName ─────────────────────────────────────

describe("normalizeProductName", () => {
  it("extracts grams and strips diacritics", () => {
    expect(normalizeProductName("MASŁO EKSTRA 200G"))
      .toEqual({ nameKey: "maslo ekstra", size: 200, unit: "g" });
  });

  it("handles size glued to the name with a dot", () => {
    expect(normalizeProductName("MASLO EKST.200G"))
      .toEqual({ nameKey: "maslo ekst", size: 200, unit: "g" });
  });

  it("gives the same key for 200g and 195g variants (shrinkflation)", () => {
    const a = normalizeProductName("MASLO EKST.200G");
    const b = normalizeProductName("MASLO EKST. 195 G");
    expect(a.nameKey).toBe(b.nameKey);
    expect(b.size).toBe(195);
  });

  it("converts kg and l to base units", () => {
    expect(normalizeProductName("Cukier 1kg").size).toBe(1000);
    expect(normalizeProductName("Cukier 1kg").unit).toBe("g");
    expect(normalizeProductName("Woda 1,5L")).toMatchObject({ size: 1500, unit: "ml" });
    expect(normalizeProductName("Sok 0.33l")).toMatchObject({ size: 330, unit: "ml" });
  });

  it("keeps percent as part of the name, not a size", () => {
    expect(normalizeProductName("Mleko UHT 3,2% 1L"))
      .toEqual({ nameKey: "mleko uht 3,2%", size: 1000, unit: "ml" });
  });

  it("multiplies multipacks into the size", () => {
    expect(normalizeProductName("WODA 6x1,5L")).toMatchObject({ size: 9000, unit: "ml" });
    expect(normalizeProductName("Piwo 4 x 500 ml")).toMatchObject({ size: 2000, unit: "ml" });
  });

  it("supports pieces (szt)", () => {
    expect(normalizeProductName("JAJA L 10SZT"))
      .toEqual({ nameKey: "jaja l", size: 10, unit: "szt" });
  });

  it("returns null size when none present", () => {
    expect(normalizeProductName("Chleb wiejski"))
      .toEqual({ nameKey: "chleb wiejski", size: null, unit: null });
  });

  it("falls back to the folded raw name when only a size remains", () => {
    const parsed = normalizeProductName("200g");
    expect(parsed.nameKey.length).toBeGreaterThan(0);
  });
});

// ── computeUnitPrice / formatSize ────────────────────────────

describe("computeUnitPrice", () => {
  it("computes zł/kg from grams", () => {
    expect(computeUnitPrice(5, 200, "g")).toBe(25);
  });
  it("computes zł/l from millilitres", () => {
    expect(computeUnitPrice(3, 1500, "ml")).toBe(2);
  });
  it("computes zł/szt from pieces", () => {
    expect(computeUnitPrice(12, 10, "szt")).toBe(1.2);
  });
  it("returns null without a size", () => {
    expect(computeUnitPrice(5, null, null)).toBeNull();
    expect(computeUnitPrice(5, 0, "g")).toBeNull();
  });
});

describe("formatSize", () => {
  it("keeps small sizes in base units", () => {
    expect(formatSize(200, "g")).toBe("200 g");
    expect(formatSize(330, "ml")).toBe("330 ml");
    expect(formatSize(10, "szt")).toBe("10 szt");
  });
  it("scales up to kg / l with a Polish decimal comma", () => {
    expect(formatSize(1500, "g")).toBe("1,5 kg");
    expect(formatSize(2000, "ml")).toBe("2 l");
  });
});

// ── buildPriceHistory ────────────────────────────────────────

describe("buildPriceHistory", () => {
  it("groups the same product across shops by name key", () => {
    const txs = [
      ...purchases("MASLO EKST.200G", [5, 6], "Biedronka"),
      tx({ date: "2026-03-15", merchant: "Lidl", items: [{ description: "Maslo ekst 200g", amount: 7 }] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products).toHaveLength(1);
    expect(products[0].merchants).toEqual(["Biedronka", "Lidl"]);
    expect(products[0].occurrences).toHaveLength(3);
  });

  it("drops products below MIN_OCCURRENCES but counts them in stats", () => {
    const txs = [
      ...purchases("Mleko 1l", [3, 3, 3.5]),
      ...purchases("Chleb", [4, 4]),           // only 2 purchases
    ];
    const { products, stats } = buildPriceHistory(txs);
    expect(products.map(p => p.nameKey)).toEqual(["mleko"]);
    expect(stats.productsTotal).toBe(2);
    expect(stats.productsTracked).toBe(1);
    expect(MIN_OCCURRENCES).toBe(3);
  });

  it("skips non-expenses, missing merchants and non-positive amounts", () => {
    const txs = [
      ...purchases("Mleko 1l", [3, 3, 3]),
      tx({ date: "2026-04-10", type: "INCOME", merchant: "Biedronka", items: [{ description: "Mleko 1l", amount: 3 }] }),
      tx({ date: "2026-04-11", merchant: "",   items: [{ description: "Mleko 1l", amount: 3 }] }),
      tx({ date: "2026-04-12", merchant: "Biedronka", items: [{ description: "Mleko 1l", amount: 0 }] }),
    ];
    const { products, stats } = buildPriceHistory(txs);
    expect(products[0].occurrences).toHaveLength(3);
    expect(stats.txWithItems).toBe(4);  // the zero-amount tx still has items
  });

  it("restricts to the given months when provided", () => {
    const txs = purchases("Mleko 1l", [3, 3, 3, 4]);  // 2026-01..04
    const { products } = buildPriceHistory(txs, new Set(["2026-01", "2026-02", "2026-03"]));
    expect(products[0].occurrences).toHaveLength(3);
  });

  it("sorts occurrences chronologically and labels with the freshest wording", () => {
    const txs = [
      tx({ date: "2026-02-10", merchant: "Lidl", items: [{ description: "MASLO EKSTRA 200G", amount: 6 }] }),
      tx({ date: "2026-01-10", merchant: "Lidl", items: [{ description: "Maslo ekstra 200 g", amount: 5 }] }),
      tx({ date: "2026-03-10", merchant: "Lidl", items: [{ description: "Masło Ekstra 200g", amount: 7 }] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences.map(o => o.price)).toEqual([5, 6, 7]);
    expect(products[0].label).toBe("Masło Ekstra 200g");
  });

  it("detects shrinkflation between consecutive sized purchases", () => {
    const shrunk = buildPriceHistory([
      ...purchases("MASLO EKST.200G", [7, 7]),
      tx({ date: "2026-03-10", merchant: "Biedronka", items: [{ description: "MASLO EKST.195G", amount: 7 }] }),
    ]).products[0];
    expect(shrunk.shrink).toEqual({ date: "2026-03-10", fromSize: 200, toSize: 195, unit: "g" });
  });

  it("does not flag shrink when the size grows back or stays equal", () => {
    const grown = buildPriceHistory([
      ...purchases("MASLO EKST.200G", [7, 7]),
      tx({ date: "2026-03-10", merchant: "Biedronka", items: [{ description: "MASLO EKST.250G", amount: 8 }] }),
    ]).products[0];
    expect(grown.shrink).toBeNull();
  });

  it("sorts products by purchase count", () => {
    const txs = [
      ...purchases("Mleko 1l", [3, 3, 3, 3]),
      ...purchases("Chleb", [4, 4, 4]),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products.map(p => p.nameKey)).toEqual(["mleko", "chleb"]);
  });
});

// ── productMetric ────────────────────────────────────────────

describe("productMetric", () => {
  function historyOf(items: Array<{ description: string; amount: number }>): ProductHistory {
    const txs = items.map((it, i) =>
      tx({ date: `2026-0${i + 1}-10`, merchant: "Lidl", items: [it] }));
    return buildPriceHistory(txs).products[0];
  }

  it("uses unit price when every occurrence has the same unit", () => {
    const m = productMetric(historyOf([
      { description: "Mleko 1l", amount: 3 },
      { description: "Mleko 1l", amount: 3.3 },
      { description: "Mleko 1l", amount: 3.6 },
    ]));
    expect(m.useUnitPrice).toBe(true);
    expect(m.label).toBe("zł/l");
  });

  it("falls back to line price when any occurrence lacks a size", () => {
    const m = productMetric(historyOf([
      { description: "Chleb wiejski 500g", amount: 5 },
      { description: "Chleb wiejski", amount: 5.5 },
      { description: "Chleb wiejski 500g", amount: 6 },
    ]));
    expect(m.useUnitPrice).toBe(false);
    expect(m.label).toBe("zł");
  });
});
