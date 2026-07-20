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
  cleanProductLabel,
  catalogKey,
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
  items?: PricedTransaction["lineItems"];
  type?: string;
  amount?: number;
  description?: string | null;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
}): PricedTransaction {
  return {
    type:            o.type ?? "EXPENSE",
    date:            o.date,
    budgetMonth:     o.date.slice(0, 7),
    merchant:        o.merchant,
    amount:          o.amount ?? 0,
    description:     o.description,
    subcategoryId:   o.subcategoryId,
    subcategoryName: o.subcategoryName,
    lineItems:       o.items,
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
      .toEqual({ nameKey: "maslo ekstra", size: 200, unit: "g", packSize: 200 });
  });

  it("handles size glued to the name with a dot", () => {
    expect(normalizeProductName("MASLO EKST.200G"))
      .toEqual({ nameKey: "maslo ekst", size: 200, unit: "g", packSize: 200 });
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
      .toEqual({ nameKey: "mleko uht 3,2%", size: 1000, unit: "ml", packSize: 1000 });
  });

  it("multiplies multipacks into the size", () => {
    expect(normalizeProductName("WODA 6x1,5L")).toMatchObject({ size: 9000, unit: "ml", packSize: 1500 });
    expect(normalizeProductName("Piwo 4 x 500 ml")).toMatchObject({ size: 2000, unit: "ml" });
  });

  it("handles the multipack SUFFIX form (size before xN)", () => {
    expect(normalizeProductName("Żubr puszka 0,5 l x4"))
      .toEqual({ nameKey: "zubr puszka", size: 2000, unit: "ml", packSize: 500 });
    expect(computeUnitPrice(35.12, 2000, "ml")).toBeCloseTo(17.56, 2);   // zł/l, not ×4
  });

  it("treats a bare xN with no size as N pieces", () => {
    expect(normalizeProductName("BUŁKA KAJZERKA x6"))
      .toMatchObject({ nameKey: "bulka kajzerka", size: 6, unit: "szt" });
  });

  it("supports pieces (szt)", () => {
    expect(normalizeProductName("JAJA L 10SZT"))
      .toEqual({ nameKey: "jaja l", size: 10, unit: "szt", packSize: 10 });
  });

  it("returns null size when none present", () => {
    expect(normalizeProductName("Chleb wiejski"))
      .toEqual({ nameKey: "chleb wiejski", size: null, unit: null, packSize: null });
  });

  it("falls back to the folded raw name when only a size remains", () => {
    const parsed = normalizeProductName("200g");
    expect(parsed.nameKey.length).toBeGreaterThan(0);
  });
});

describe("cleanProductLabel", () => {
  it("strips size tokens but keeps the original casing", () => {
    expect(cleanProductLabel("Filet z piersi kurczaka z grzędy 0,442 kg"))
      .toBe("Filet z piersi kurczaka z grzędy");
    expect(cleanProductLabel("MASLO EKST.200G")).toBe("MASLO EKST");
    expect(cleanProductLabel("Żubr puszka 0,5 l x4")).toBe("Żubr puszka");
    expect(cleanProductLabel("Mleko UHT 3,2% 1L")).toBe("Mleko UHT 3,2%");
  });

  it("falls back to the raw name when nothing but a size remains", () => {
    expect(cleanProductLabel("200g")).toBe("200g");
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

// ── catalogKey (must match backend productKey) ───────────────

describe("catalogKey", () => {
  it("folds diacritics, drops punctuation, appends the unit", () => {
    expect(catalogKey("Mleko UHT 3,2%", "ml")).toBe("mleko uht 3 2|ml");
    expect(catalogKey("ŻUBR PUSZKA", "ml")).toBe("zubr puszka|ml");
  });
  it("makes comma and dot agree", () => {
    expect(catalogKey("Mleko UHT 3.2%", "ml")).toBe(catalogKey("Mleko UHT 3,2%", "ml"));
  });
  it("keeps units distinct and returns null for empty", () => {
    expect(catalogKey("Mleko", "szt")).not.toBe(catalogKey("Mleko", "ml"));
    expect(catalogKey("   ", null)).toBeNull();
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

  it("includes merchant-less buys under a placeholder, skips non-expenses and non-positive amounts", () => {
    const txs = [
      ...purchases("Mleko 1l", [3, 3, 3]),
      tx({ date: "2026-04-10", type: "INCOME", merchant: "Biedronka", items: [{ description: "Mleko 1l", amount: 3 }] }),
      tx({ date: "2026-04-11", merchant: "",   items: [{ description: "Mleko 1l", amount: 3 }] }),   // no shop → placeholder
      tx({ date: "2026-04-12", merchant: "Biedronka", items: [{ description: "Mleko 1l", amount: 0 }] }), // zero → skip
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences).toHaveLength(4);          // 3 + the merchant-less one
    expect(products[0].merchants).toContain("(bez sklepu)");  // NO_MERCHANT
  });

  it("includes single-item transactions with no lineItems, named by description", () => {
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Rossmann",
      amount: 40 + i, description: "Mleko modyfikowane Bebilon 800g",
    }));
    const { products } = buildPriceHistory(txs);
    expect(products).toHaveLength(1);
    expect(products[0].occurrences).toHaveLength(3);
    expect(products[0].occurrences[0].size).toBe(800);   // parsed from the description
  });

  it("keeps size-less single-item buys (subcategory flags handle the noise now)", () => {
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Apteka", amount: 45,
      subcategoryName: "Mleko modyfikowane",
    }));
    const { products } = buildPriceHistory(txs);
    expect(products).toHaveLength(1);
    expect(products[0].label).toBe("Mleko modyfikowane");
  });

  it("filters to the tracked subcategories when the set is supplied", () => {
    const txs = [
      ...[1, 2, 3].map(i => tx({
        date: `2026-0${i}-10`, merchant: "Lidl", subcategoryId: "sub_meat",
        items: [{ description: "Mieso mielone 500g", amount: 19 }],
      })),
      // Clothing: the SHOP typed into the description — pure noise.
      ...[1, 2, 3, 4].map(i => tx({
        date: `2026-0${i}-11`, subcategoryId: "sub_clothes",
        amount: 100 + i, description: "Reserved",
      })),
    ];
    expect(buildPriceHistory(txs).products).toHaveLength(2);   // no filter → both

    const tracked = buildPriceHistory(txs, undefined, undefined, new Set(["sub_meat"]));
    expect(tracked.products).toHaveLength(1);
    expect(tracked.products[0].label).toBe("Mieso mielone");
  });

  it("keeps size-less RECEIPT line items (real products, exempt from the rule)", () => {
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Lidl",
      items: [{ description: "Chleb wiejski", amount: 5 }],
    }));
    expect(buildPriceHistory(txs).products).toHaveLength(1);
  });

  it("groups differently-named products into one via the catalog resolver", () => {
    const txs = [
      tx({ date: "2026-01-10", merchant: "Auchan",    items: [{ description: "Napój energetyczny", amount: 10.9 }] }),
      tx({ date: "2026-02-10", merchant: "Auchan",    items: [{ description: "Napój energetyczny", amount: 10.9 }] }),
      tx({ date: "2026-03-10", merchant: "Biedronka", items: [{ description: "Napój energetyczny Dzik", amount: 5.5 }] }),
      tx({ date: "2026-04-10", merchant: "Biedronka", items: [{ description: "Napój energetyczny Dzik", amount: 5.5 }] }),
    ];
    // A merge in the catalog: both keys point to one canonical product.
    const resolve = (key: string) =>
      key === "napoj energetyczny|" || key === "napoj energetyczny dzik|"
        ? { groupId: "prod_dzik", canonicalName: "Napój energetyczny Dzik" }
        : null;
    const { products } = buildPriceHistory(txs, undefined, resolve);
    expect(products).toHaveLength(1);                        // 2+2 merged (>= MIN_OCCURRENCES)
    expect(products[0].catalogId).toBe("prod_dzik");
    expect(products[0].label).toBe("Napój energetyczny Dzik");
    expect(products[0].merchants).toEqual(["Auchan", "Biedronka"]);
    expect(products[0].occurrences).toHaveLength(4);
  });

  it("without a resolver keeps the name-fold grouping (two separate products)", () => {
    const txs = [
      ...[1, 2, 3].map(i => tx({ date: `2026-0${i}-10`, merchant: "Auchan",    items: [{ description: "Napój energetyczny", amount: 11 }] })),
      ...[1, 2, 3].map(i => tx({ date: `2026-0${i}-11`, merchant: "Biedronka", items: [{ description: "Napój energetyczny Dzik", amount: 5.5 }] })),
    ];
    expect(buildPriceHistory(txs).products).toHaveLength(2);
  });

  it("restricts to the given months when provided", () => {
    const txs = purchases("Mleko 1l", [3, 3, 3, 4]);  // 2026-01..04
    const { products } = buildPriceHistory(txs, new Set(["2026-01", "2026-02", "2026-03"]));
    expect(products[0].occurrences).toHaveLength(3);
  });

  it("sorts occurrences chronologically and labels with the freshest CLEAN wording", () => {
    const txs = [
      tx({ date: "2026-02-10", merchant: "Lidl", items: [{ description: "MASLO EKSTRA 200G", amount: 6 }] }),
      tx({ date: "2026-01-10", merchant: "Lidl", items: [{ description: "Maslo ekstra 200 g", amount: 5 }] }),
      tx({ date: "2026-03-10", merchant: "Lidl", items: [{ description: "Masło Ekstra 200g", amount: 7 }] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences.map(o => o.price)).toEqual([5, 6, 7]);
    expect(products[0].label).toBe("Masło Ekstra");   // size token stripped
  });

  it("merges same-day purchases of one product into a single occurrence", () => {
    // Weighted goods: three fillet pieces on one receipt, one line each.
    const txs = [
      tx({ date: "2026-01-13", merchant: "Auchan", items: [
        { description: "Filet z piersi kurczaka 0,442 kg", amount: 16.34 },
        { description: "Filet z piersi kurczaka 0,443 kg", amount: 16.36 },
        { description: "Filet z piersi kurczaka 0,491 kg", amount: 18.14 },
      ] }),
      tx({ date: "2026-02-10", merchant: "Auchan", items: [{ description: "Filet z piersi kurczaka 0,500 kg", amount: 18.50 }] }),
      tx({ date: "2026-03-10", merchant: "Auchan", items: [{ description: "Filet z piersi kurczaka 0,450 kg", amount: 16.65 }] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products).toHaveLength(1);
    const [first] = products[0].occurrences;
    expect(first.size).toBeCloseTo(1376, 5);              // 442+443+491 g
    expect(first.price).toBeCloseTo(50.84, 2);
    expect(first.unitPrice).toBeCloseTo(36.95, 1);        // zł/kg from the sums
    expect(products[0].occurrences).toHaveLength(3);      // 3 shopping days
    expect(products[0].shrink).toBeNull();                // weighted → no shrink alarm
  });

  it("prefers AI-structured product fields over regex parsing", () => {
    const txs = [1, 2, 3].map(i =>
      tx({ date: `2026-0${i}-10`, merchant: "Lidl", items: [{
        description: "MLK UHT3.2 KART",
        amount: 4,
        product: { name: "Mleko UHT 3,2%", size: 1000, unit: "ml", packCount: 2 },
      }] }));
    const { products } = buildPriceHistory(txs);
    expect(products[0].label).toBe("Mleko UHT 3,2%");
    expect(products[0].occurrences[0].size).toBe(2000);   // size × packCount
    expect(products[0].occurrences[0].unitPrice).toBe(2); // 4 zł / 2 l
  });

  it("does not flag shrink when a double-pack day precedes a single-pack day", () => {
    const txs = [
      tx({ date: "2026-01-10", merchant: "Lidl", items: [
        { description: "Maslo ekstra 200g", amount: 7 },
        { description: "Maslo ekstra 200g", amount: 7 },   // two packs, one receipt
      ] }),
      tx({ date: "2026-02-10", merchant: "Lidl", items: [{ description: "Maslo ekstra 200g", amount: 7 }] }),
      tx({ date: "2026-03-10", merchant: "Lidl", items: [{ description: "Maslo ekstra 200g", amount: 7 }] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences[0].size).toBe(400);   // merged day
    expect(products[0].shrink).toBeNull();               // package size never shrank
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
    expect(m.unit).toBe("ml");
  });

  it("keeps unit price for the sized occurrences, dropping the size-less one", () => {
    const p = historyOf([
      { description: "Chleb wiejski 500g", amount: 5 },
      { description: "Chleb wiejski", amount: 5.5 },   // no size → off the chart
      { description: "Chleb wiejski 500g", amount: 6 },
    ]);
    const m = productMetric(p);
    expect(m.useUnitPrice).toBe(true);
    expect(m.label).toBe("zł/kg");
    // The size-less occurrence yields null (excluded), sized ones a number.
    const vals = p.occurrences.map(m.value);
    expect(vals.filter(v => v === null)).toHaveLength(1);
    expect(vals.filter(v => typeof v === "number")).toHaveLength(2);
  });

  it("picks the DOMINANT unit and nulls the minority (kg wins over szt)", () => {
    // Minced meat: 3 weight buys + one bogus "2 szt" pack.
    const p = historyOf([
      { description: "Mieso mielone 500g", amount: 19 },
      { description: "Mieso mielone 1kg",  amount: 28 },
      { description: "Mieso mielone x2",   amount: 34 },   // becomes 2 szt
      { description: "Mieso mielone 500g", amount: 20 },
    ]);
    const m = productMetric(p);
    expect(m.unit).toBe("g");
    expect(m.label).toBe("zł/kg");
    const sztOcc = p.occurrences.find(o => o.unit === "szt");
    expect(m.value(sztOcc as NonNullable<typeof sztOcc>)).toBeNull();
  });

  it("falls back to line price only when NO occurrence has a size", () => {
    const m = productMetric(historyOf([
      { description: "Chleb wiejski", amount: 5 },
      { description: "Chleb wiejski", amount: 5.5 },
      { description: "Chleb wiejski", amount: 6 },
    ]));
    expect(m.useUnitPrice).toBe(false);
    expect(m.label).toBe("zł");
  });
});
