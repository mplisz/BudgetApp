// ============================================================
// File: src/utils/productPricing.test.ts
//
// Unit tests for the pure logic of the "Ceny produktów" section.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - scope gate: AI-structured product required (backend only attaches
//     one for a whitelist match — see backend productCatalog.js)
//   - catalogKey: must match the backend productKey byte for byte
//   - computeUnitPrice / formatSize: unit math and display
//   - productMetric: dominant-unit selection, non-comparable rows nulled
//   - buildPriceHistory: grouping, catalog identity, same-day merge,
//     shrink detection, stats
// ============================================================

import { describe, it, expect } from "vitest";
import {
  catalogKey,
  computeUnitPrice,
  formatSize,
  productMetric,
  buildPriceHistory,
  MIN_OCCURRENCES,
  type SizeUnit,
  type PriceLineItem,
  type PricedTransaction,
  type ProductHistory,
} from "./productPricing";

// ── Fixtures ─────────────────────────────────────────────────

/** A receipt line as the OCR AI delivers it: raw text + structured product. */
function line(
  name: string,
  amount: number,
  size: number | null = null,
  unit: SizeUnit | null = null,
  packCount?: number,
): PriceLineItem {
  return {
    description: `${name}${size ? ` ${size}${unit ?? ""}` : ""}`,
    amount,
    product: { name, size, unit, packCount },
  };
}

function tx(o: {
  date: string;
  merchant?: string | null;
  items?: PriceLineItem[];
  type?: string;
  returns?: PricedTransaction["returns"];
}): PricedTransaction {
  return {
    type:        o.type ?? "EXPENSE",
    date:        o.date,
    budgetMonth: o.date.slice(0, 7),
    merchant:    o.merchant,
    lineItems:   o.items,
    returns:     o.returns,
  };
}

/** N monthly purchases of one product, starting 2026-01. */
function buys(
  name: string,
  amounts: number[],
  opts: { merchant?: string; size?: number | null; unit?: SizeUnit | null } = {},
) {
  const { merchant = "Biedronka", size = null, unit = null } = opts;
  return amounts.map((amount, i) =>
    tx({
      date: `2026-${String(i + 1).padStart(2, "0")}-10`,
      merchant,
      items: [line(name, amount, size, unit)],
    }));
}

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

// ── Scope gates ──────────────────────────────────────────────

describe("buildPriceHistory — scope", () => {
  it("skips receipt lines with no AI-structured product", () => {
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Lidl",
      items: [{ description: "Napoj energetyczny", amount: 10 }],   // no product
    }));
    expect(buildPriceHistory(txs).products).toHaveLength(0);
  });

  it("skips transactions with no line items at all (hand-typed entries)", () => {
    const txs = [1, 2, 3].map(i => tx({ date: `2026-0${i}-10`, merchant: "Apteka" }));
    expect(buildPriceHistory(txs).products).toHaveLength(0);
  });

  it("skips non-expenses and non-positive amounts", () => {
    const txs = [
      ...buys("Mleko", [3, 3, 3], { size: 1000, unit: "ml" }),
      tx({ date: "2026-04-10", type: "INCOME", merchant: "Biedronka", items: [line("Mleko", 3, 1000, "ml")] }),
      tx({ date: "2026-04-12", merchant: "Biedronka", items: [line("Mleko", 0, 1000, "ml")] }),
    ];
    expect(buildPriceHistory(txs).products[0].occurrences).toHaveLength(3);
  });

  it("restricts to the given months when provided", () => {
    const txs = buys("Mleko", [3, 3, 3, 4], { size: 1000, unit: "ml" });   // 2026-01..04
    const { products } = buildPriceHistory(txs, new Set(["2026-01", "2026-02", "2026-03"]));
    expect(products[0].occurrences).toHaveLength(3);
  });
});

// ── Returned line items ──────────────────────────────────────

describe("buildPriceHistory — returned line items", () => {
  it("excludes a line returned in full — its price never really happened", () => {
    const txs = [
      ...buys("Chleb żytni", [5, 5, 5], { size: 500, unit: "g" }),
      tx({
        date: "2026-04-10", merchant: "Biedronka",
        items:   [line("Chleb żytni", 12.99, 500, "g")],   // wrong price, given back
        returns: [{ returnedLineItems: [{ index: 0, amount: 12.99 }] }],
      }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences).toHaveLength(3);
    expect(products[0].occurrences.every(o => o.price === 5)).toBe(true);
  });

  it("keeps a partially returned line — the unit price stayed real", () => {
    const txs = [
      ...buys("Chleb żytni", [5, 5, 5], { size: 500, unit: "g" }),
      tx({
        date: "2026-04-10", merchant: "Biedronka",
        items:   [line("Chleb żytni", 10, 1000, "g")],     // two loaves, one back
        returns: [{ returnedLineItems: [{ index: 0, amount: 5 }] }],
      }),
    ];
    expect(buildPriceHistory(txs).products[0].occurrences).toHaveLength(4);
  });

  it("ignores transaction-level returns with no line allocation (old data)", () => {
    const txs = [
      ...buys("Chleb żytni", [5, 5], { size: 500, unit: "g" }),
      tx({
        date: "2026-03-10", merchant: "Biedronka",
        items:   [line("Chleb żytni", 5, 500, "g")],
        returns: [{}],
      }),
    ];
    expect(buildPriceHistory(txs).products[0].occurrences).toHaveLength(3);
  });

  it("sums several partial returns of one line into a full exclusion", () => {
    const txs = [
      ...buys("Chleb żytni", [5, 5, 5], { size: 500, unit: "g" }),
      tx({
        date: "2026-04-10", merchant: "Biedronka",
        items:   [line("Chleb żytni", 6, 500, "g")],
        returns: [
          { returnedLineItems: [{ index: 0, amount: 2.5 }] },
          { returnedLineItems: [{ index: 0, amount: 3.5 }] },
        ],
      }),
    ];
    expect(buildPriceHistory(txs).products[0].occurrences).toHaveLength(3);
  });

  it("only the returned line drops — the rest of the receipt still counts", () => {
    const txs = [
      ...buys("Mleko", [3, 3], { size: 1000, unit: "ml" }),
      tx({
        date: "2026-03-10", merchant: "Biedronka",
        items: [
          line("Chleb żytni", 12.99, 500, "g"),
          line("Mleko", 3, 1000, "ml"),
        ],
        returns: [{ returnedLineItems: [{ index: 0, amount: 12.99 }] }],
      }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products.map(p => p.label)).toEqual(["Mleko"]);   // Chleb: 1 occurrence returned → 0 left
    expect(products[0].occurrences).toHaveLength(3);
  });

  it("keeps a line fully covered by a REIMBURSEMENT — goods were kept, price was real", () => {
    const txs = [
      ...buys("Chleb żytni", [5, 5, 5], { size: 500, unit: "g" }),
      tx({
        date: "2026-04-10", merchant: "Biedronka",
        items:   [line("Chleb żytni", 5, 500, "g")],       // mom paid this back
        returns: [{ kind: "reimbursement", returnedLineItems: [{ index: 0, amount: 5 }] }],
      }),
    ];
    expect(buildPriceHistory(txs).products[0].occurrences).toHaveLength(4);
  });

  it("a fully returned line does not feed shrink detection", () => {
    const txs = [
      ...buys("Masło Ekstra", [7, 7], { size: 200, unit: "g" }),
      tx({
        date: "2026-03-10", merchant: "Biedronka",
        items:   [line("Masło Ekstra", 7, 180, "g")],       // smaller pack, but returned
        returns: [{ returnedLineItems: [{ index: 0, amount: 7 }] }],
      }),
      tx({ date: "2026-04-10", merchant: "Biedronka", items: [line("Masło Ekstra", 7, 200, "g")] }),
    ];
    expect(buildPriceHistory(txs).products[0].shrink).toBeNull();
  });
});

// ── Grouping ─────────────────────────────────────────────────

describe("buildPriceHistory — grouping", () => {
  it("groups the same product across shops", () => {
    const txs = [
      ...buys("Masło Ekstra", [5, 6], { merchant: "Biedronka", size: 200, unit: "g" }),
      tx({ date: "2026-03-15", merchant: "Lidl", items: [line("Masło Ekstra", 7, 200, "g")] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products).toHaveLength(1);
    expect(products[0].merchants).toEqual(["Biedronka", "Lidl"]);
    expect(products[0].occurrences).toHaveLength(3);
  });

  it("drops products below MIN_OCCURRENCES but counts them in stats", () => {
    const txs = [
      ...buys("Mleko", [3, 3, 3.5], { size: 1000, unit: "ml" }),
      ...buys("Chleb", [4, 4], { size: 500, unit: "g" }),   // only 2 purchases
    ];
    const { products, stats } = buildPriceHistory(txs);
    expect(products.map(p => p.label)).toEqual(["Mleko"]);
    expect(stats.productsTotal).toBe(2);
    expect(stats.productsTracked).toBe(1);
    expect(MIN_OCCURRENCES).toBe(3);
  });

  it("puts merchant-less buys under a placeholder", () => {
    const txs = [
      ...buys("Mleko", [3, 3, 3], { size: 1000, unit: "ml" }),
      tx({ date: "2026-04-11", merchant: "", items: [line("Mleko", 3, 1000, "ml")] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences).toHaveLength(4);
    expect(products[0].merchants).toContain("(bez sklepu)");
  });

  it("does not square a piece count echoed into both size and packCount", () => {
    // "Napój Coca-Cola Zero x2" — the model reports the count twice.
    // 11,98 zł buys TWO cans (5,99 each), not four.
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Delikatesy Centrum",
      items: [line("Coca-Cola Zero", 11.98, 2, "szt", 2)],
    }));
    const [product] = buildPriceHistory(txs).products;
    expect(product.occurrences[0].size).toBe(2);
    expect(product.occurrences[0].unitPrice).toBeCloseTo(5.99, 2);
  });

  it("still multiplies a genuine nesting (10 pieces per pack, 2 packs)", () => {
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Lidl",
      items: [line("Jaja L", 24, 10, "szt", 2)],
    }));
    const [product] = buildPriceHistory(txs).products;
    expect(product.occurrences[0].size).toBe(20);
    expect(product.occurrences[0].unitPrice).toBeCloseTo(1.2, 2);
  });

  it("multiplies multipacks into the occurrence size", () => {
    const txs = [1, 2, 3].map(i => tx({
      date: `2026-0${i}-10`, merchant: "Lidl",
      items: [line("Żubr puszka", 35.12, 500, "ml", 4)],
    }));
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences[0].size).toBe(2000);            // 500 × 4
    expect(products[0].occurrences[0].unitPrice).toBeCloseTo(17.56, 2);  // zł/l
  });

  it("sorts occurrences chronologically and labels with the canonical name", () => {
    const txs = [
      tx({ date: "2026-02-10", merchant: "Lidl", items: [line("Masło Ekstra", 6, 200, "g")] }),
      tx({ date: "2026-01-10", merchant: "Lidl", items: [line("Masło Ekstra", 5, 200, "g")] }),
      tx({ date: "2026-03-10", merchant: "Lidl", items: [line("Masło Ekstra", 7, 200, "g")] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences.map(o => o.price)).toEqual([5, 6, 7]);
    expect(products[0].label).toBe("Masło Ekstra");
  });

  it("sorts products by purchase count", () => {
    const txs = [
      ...buys("Mleko", [3, 3, 3, 3], { size: 1000, unit: "ml" }),
      ...buys("Chleb", [4, 4, 4], { size: 500, unit: "g" }),
    ];
    expect(buildPriceHistory(txs).products.map(p => p.label)).toEqual(["Mleko", "Chleb"]);
  });

  it("merges same-day purchases of one product into a single occurrence", () => {
    // Weighted goods: three fillet pieces on one receipt, one line each.
    const txs = [
      tx({ date: "2026-01-13", merchant: "Auchan", items: [
        line("Filet z piersi kurczaka", 16.34, 442, "g"),
        line("Filet z piersi kurczaka", 16.36, 443, "g"),
        line("Filet z piersi kurczaka", 18.14, 491, "g"),
      ] }),
      tx({ date: "2026-02-10", merchant: "Auchan", items: [line("Filet z piersi kurczaka", 18.50, 500, "g")] }),
      tx({ date: "2026-03-10", merchant: "Auchan", items: [line("Filet z piersi kurczaka", 16.65, 450, "g")] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products).toHaveLength(1);
    const [first] = products[0].occurrences;
    expect(first.size).toBe(1376);                    // 442 + 443 + 491
    expect(first.price).toBeCloseTo(50.84, 2);
    expect(first.unitPrice).toBeCloseTo(36.95, 1);    // zł/kg from the sums
    expect(products[0].occurrences).toHaveLength(3);  // 3 shopping days
    expect(products[0].shrink).toBeNull();            // weighted → no false alarm
  });
});

// ── Catalog identity ─────────────────────────────────────────

describe("buildPriceHistory — catalog identity", () => {
  const auchanAndBiedronka = [
    tx({ date: "2026-01-10", merchant: "Auchan",    items: [line("Napój energetyczny", 10.9)] }),
    tx({ date: "2026-02-10", merchant: "Auchan",    items: [line("Napój energetyczny", 10.9)] }),
    tx({ date: "2026-03-10", merchant: "Biedronka", items: [line("Napój energetyczny Dzik", 5.5)] }),
    tx({ date: "2026-04-10", merchant: "Biedronka", items: [line("Napój energetyczny Dzik", 5.5)] }),
  ];

  it("groups differently-named products into one via the resolver", () => {
    // A merge in the catalog: both keys point to one canonical product.
    const resolve = (key: string) =>
      key === "napoj energetyczny|" || key === "napoj energetyczny dzik|"
        ? { groupId: "prod_dzik", canonicalName: "Napój energetyczny Dzik" }
        : null;
    const { products } = buildPriceHistory(auchanAndBiedronka, undefined, resolve);
    expect(products).toHaveLength(1);                  // 2+2 merged, passes MIN_OCCURRENCES
    expect(products[0].catalogId).toBe("prod_dzik");
    expect(products[0].label).toBe("Napój energetyczny Dzik");
    expect(products[0].merchants).toEqual(["Auchan", "Biedronka"]);
    expect(products[0].occurrences).toHaveLength(4);
  });

  it("without a resolver keeps the name-fold grouping (two products)", () => {
    const txs = [
      ...[1, 2, 3].map(i => tx({ date: `2026-0${i}-10`, merchant: "Auchan",    items: [line("Napój energetyczny", 11)] })),
      ...[1, 2, 3].map(i => tx({ date: `2026-0${i}-11`, merchant: "Biedronka", items: [line("Napój energetyczny Dzik", 5.5)] })),
    ];
    expect(buildPriceHistory(txs).products).toHaveLength(2);
  });

  it("excludes a product no longer in the current whitelist when a resolver is supplied", () => {
    // Historical transactions still carry the old product tag, but the
    // resolver (built from the CURRENT catalog) knows nothing about it —
    // e.g. it was deleted from Settings, or predates the whitelist.
    const txs = [1, 2, 3].map(i => tx({ date: `2026-0${i}-10`, items: [line("Tofu naturalne", 4.5)] }));
    const resolve = () => null;
    expect(buildPriceHistory(txs, undefined, resolve).products).toHaveLength(0);
  });
});

// ── Shrinkflation ────────────────────────────────────────────

describe("buildPriceHistory — shrink detection", () => {
  it("detects a package-size drop after a stable run", () => {
    const shrunk = buildPriceHistory([
      ...buys("Masło Ekstra", [7, 7], { size: 200, unit: "g" }),
      tx({ date: "2026-03-10", merchant: "Biedronka", items: [line("Masło Ekstra", 7, 195, "g")] }),
    ]).products[0];
    expect(shrunk.shrink).toEqual({ date: "2026-03-10", fromSize: 200, toSize: 195, unit: "g" });
  });

  it("does not flag shrink when the size grows or stays equal", () => {
    const grown = buildPriceHistory([
      ...buys("Masło Ekstra", [7, 7], { size: 200, unit: "g" }),
      tx({ date: "2026-03-10", merchant: "Biedronka", items: [line("Masło Ekstra", 8, 250, "g")] }),
    ]).products[0];
    expect(grown.shrink).toBeNull();
  });

  it("does not flag shrink for a two-pack day (merge must not look like a drop)", () => {
    const txs = [
      tx({ date: "2026-01-10", merchant: "Lidl", items: [
        line("Masło Ekstra", 7, 200, "g"),
        line("Masło Ekstra", 7, 200, "g"),   // two packs, one receipt
      ] }),
      tx({ date: "2026-02-10", merchant: "Lidl", items: [line("Masło Ekstra", 7, 200, "g")] }),
      tx({ date: "2026-03-10", merchant: "Lidl", items: [line("Masło Ekstra", 7, 200, "g")] }),
    ];
    const { products } = buildPriceHistory(txs);
    expect(products[0].occurrences[0].size).toBe(400);   // merged day
    expect(products[0].shrink).toBeNull();               // package size never shrank
  });
});

// ── productMetric ────────────────────────────────────────────

describe("productMetric", () => {
  function historyOf(items: PriceLineItem[]): ProductHistory {
    const txs = items.map((it, i) =>
      tx({ date: `2026-0${i + 1}-10`, merchant: "Lidl", items: [it] }));
    return buildPriceHistory(txs).products[0];
  }

  it("uses unit price when every occurrence shares a unit", () => {
    const m = productMetric(historyOf([
      line("Mleko", 3,   1000, "ml"),
      line("Mleko", 3.3, 1000, "ml"),
      line("Mleko", 3.6, 1000, "ml"),
    ]));
    expect(m.useUnitPrice).toBe(true);
    expect(m.label).toBe("zł/l");
    expect(m.unit).toBe("ml");
  });

  it("keeps unit price for sized occurrences, dropping the size-less one", () => {
    const p = historyOf([
      line("Chleb", 5,   500, "g"),
      line("Chleb", 5.5),                // no size → off the chart
      line("Chleb", 6,   500, "g"),
    ]);
    const m = productMetric(p);
    expect(m.useUnitPrice).toBe(true);
    expect(m.label).toBe("zł/kg");
    const vals = p.occurrences.map(m.value);
    expect(vals.filter(v => v === null)).toHaveLength(1);
    expect(vals.filter(v => typeof v === "number")).toHaveLength(2);
  });

  it("picks the DOMINANT unit and nulls the minority (kg wins over szt)", () => {
    // Minced meat: 3 weight buys + one bogus "2 szt" pack.
    const p = historyOf([
      line("Mięso mielone", 19, 500,  "g"),
      line("Mięso mielone", 28, 1000, "g"),
      line("Mięso mielone", 34, 2,    "szt"),
      line("Mięso mielone", 20, 500,  "g"),
    ]);
    const m = productMetric(p);
    expect(m.unit).toBe("g");
    expect(m.label).toBe("zł/kg");
    const sztOcc = p.occurrences.find(o => o.unit === "szt");
    expect(m.value(sztOcc as NonNullable<typeof sztOcc>)).toBeNull();
  });

  it("falls back to line price only when NO occurrence has a size", () => {
    const m = productMetric(historyOf([
      line("Chleb", 5),
      line("Chleb", 5.5),
      line("Chleb", 6),
    ]));
    expect(m.useUnitPrice).toBe(false);
    expect(m.label).toBe("zł");
  });
});
