// ============================================================
// File: src/components/panels/safetyNetComponents/computations.test.ts
//
// Unit tests for the pure logic of PanelSafetyNet.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - lastNMonths: edge cases around year boundaries
//   - computeCostLayers: cumulation, average division, missing priority
//   - computeIncomeSources: keying, averaging, sorting
//   - computeRemainingIncome: exclusion math
//   - computeLevelDeficits: deficit / target / runway formulas
//   - sumAssets: defensive against bad data
//   - computeSavingCapability: income - expenses
//   - computeEta: what-if math, including the double-cut effect
// ============================================================

import { describe, it, expect } from "vitest";
import {
  lastNMonths,
  nextNMonths,
  isInWindow,
  computeCostLayers,
  computeIncomeSources,
  computeRemainingIncome,
  computeLevelDeficits,
  sumAssets,
  computeSavingCapability,
  computeEta,
  computeUpcomingPlanned,
  sumPlannedForLevel,
  formatMonthsPretty,
  formatDaysPretty,
} from "./computations";
import type { SnTransaction, CostLayer, AssetBucket, UpcomingPlanned } from "./types";
import type { PlannedDoc, VirtualSaving } from "../../../hooks/usePlanned";

// ── Test fixtures ────────────────────────────────────────────

function tx(o: Partial<SnTransaction> & Pick<SnTransaction, "amount" | "budgetMonth">): SnTransaction {
  return {
    id:           o.id ?? `tx_${Math.random()}`,
    type:         o.type ?? "EXPENSE",
    date:         o.date ?? `${o.budgetMonth}-15`,
    budgetMonth:  o.budgetMonth,
    categoryId:   o.categoryId ?? "cat_test",
    categoryName: o.categoryName ?? "Test Category",
    subcategoryId:   o.subcategoryId,
    subcategoryName: o.subcategoryName,
    amount:       o.amount,
    netAmount:    o.netAmount,
    priority:     o.priority,
    tags:         o.tags,
    returns:      o.returns,
  };
}

// ── lastNMonths ──────────────────────────────────────────────

describe("lastNMonths", () => {
  it("returns n months ending with current month", () => {
    const today = new Date(2026, 4, 15); // May 2026, month index 4
    const months = lastNMonths(3, today);
    expect(months).toEqual(["2026-03", "2026-04", "2026-05"]);
  });

  it("crosses year boundary correctly", () => {
    const today = new Date(2026, 1, 10); // Feb 2026
    const months = lastNMonths(6, today);
    expect(months).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("handles n=1", () => {
    const today = new Date(2026, 4, 15);
    expect(lastNMonths(1, today)).toEqual(["2026-05"]);
  });

  it("handles year crossing twice (n=24)", () => {
    const today = new Date(2026, 0, 1); // Jan 2026
    const months = lastNMonths(24, today);
    expect(months.length).toBe(24);
    expect(months[0]).toBe("2024-02");
    expect(months[23]).toBe("2026-01");
  });
});

// ── isInWindow ───────────────────────────────────────────────

describe("isInWindow", () => {
  const window = ["2026-03", "2026-04", "2026-05"];
  it("includes transactions in window", () => {
    expect(isInWindow(tx({ amount: 100, budgetMonth: "2026-04" }), window)).toBe(true);
  });
  it("excludes transactions outside window", () => {
    expect(isInWindow(tx({ amount: 100, budgetMonth: "2026-02" }), window)).toBe(false);
    expect(isInWindow(tx({ amount: 100, budgetMonth: "2026-06" }), window)).toBe(false);
  });
});

// ── computeCostLayers ────────────────────────────────────────

describe("computeCostLayers", () => {
  it("returns all-zero layers for empty input", () => {
    const layers = computeCostLayers([], 6);
    expect(layers).toHaveLength(4);
    expect(layers.every(l => l.monthlyCost === 0)).toBe(true);
    expect(layers.every(l => l.bucketCost === 0)).toBe(true);
  });

  it("ignores non-EXPENSE transactions", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 5000, budgetMonth: "2026-05", type: "INCOME", priority: 1 }),
      tx({ amount: 2000, budgetMonth: "2026-05", type: "SAVING", priority: 1 }),
      tx({ amount:  500, budgetMonth: "2026-05", type: "TRANSFER", priority: 1 }),
    ];
    const layers = computeCostLayers(txs, 6);
    expect(layers.every(l => l.monthlyCost === 0)).toBe(true);
  });

  it("cumulates priorities correctly (each layer = sum of P<=level)", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 1200, budgetMonth: "2026-05", priority: 1 }),
      tx({ amount:  600, budgetMonth: "2026-05", priority: 2 }),
      tx({ amount:  300, budgetMonth: "2026-05", priority: 3 }),
      tx({ amount:  150, budgetMonth: "2026-05", priority: 4 }),
    ];
    const layers = computeCostLayers(txs, 6);
    expect(layers[0].monthlyCost).toBe(200);   // P1: 1200 / 6
    expect(layers[1].monthlyCost).toBe(300);   // P1+P2: 1800 / 6
    expect(layers[2].monthlyCost).toBe(350);   // P1+P2+P3: 2100 / 6
    expect(layers[3].monthlyCost).toBe(375);   // P1..P4: 2250 / 6
  });

  it("treats missing priority as P4", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 600, budgetMonth: "2026-05" /* no priority */ }),
    ];
    const layers = computeCostLayers(txs, 6);
    expect(layers[0].monthlyCost).toBe(0);     // not in P1
    expect(layers[3].monthlyCost).toBe(100);   // 600 / 6 in P4
  });

  it("divides by lookbackMonths, not by months with data", () => {
    // A single 6000 zł expense in one month with 12-month lookback
    // should produce 500/mies — NOT 6000/mies.
    const txs = [tx({ amount: 6000, budgetMonth: "2026-05", priority: 1 })];
    const layers = computeCostLayers(txs, 12);
    expect(layers[0].monthlyCost).toBe(500);
  });

  it("deducts same-month cash returns via calculateEffectiveAmount", () => {
    const txs: SnTransaction[] = [
      tx({
        amount: 1000, budgetMonth: "2026-05", priority: 1,
        returns: [{ moneyReturnedInMonth: "2026-05", cashAmount: 300 }],
      }),
    ];
    const layers = computeCostLayers(txs, 1);
    // Effective = 1000 - 300 = 700
    expect(layers[0].monthlyCost).toBe(700);
  });

  // ── Critical subcategories (Feature #1) ──────────────────

  it("critical subcategory: diverted from priority bucket into criticalCost", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 600, budgetMonth: "2026-05", priority: 1 }),
      // P3 but subcategory is critical (e.g. preschool fees) — must NOT
      // count into bucket P3, must count into criticalCost instead.
      tx({ amount: 1200, budgetMonth: "2026-05", priority: 3,
           subcategoryId: "sub_czesne" }),
    ];
    const critical = new Set(["sub_czesne"]);
    const layers = computeCostLayers(txs, 6, critical);

    expect(layers[0].criticalCost).toBe(200);    // 1200/6, same on every layer
    expect(layers[3].criticalCost).toBe(200);

    // Bucket P3 must NOT include the critical tx
    expect(layers[2].bucketCost).toBe(0);
  });

  it("critical: added to monthlyCost of EVERY layer", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 600,  budgetMonth: "2026-05", priority: 1 }),     // P1, regular
      tx({ amount: 1200, budgetMonth: "2026-05", priority: 4,
           subcategoryId: "sub_czesne" }),                            // P4 + critical
    ];
    const layers = computeCostLayers(txs, 6, new Set(["sub_czesne"]));
    // Survival: P1 (100) + critical (200) = 300
    expect(layers[0].monthlyCost).toBe(300);
    // No Change: same P1 + critical still (no P2/P3/P4 regular) = 300
    expect(layers[3].monthlyCost).toBe(300);
  });

  it("without criticalSubcategoryIds: criticalCost is 0 (back-compat)", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 1200, budgetMonth: "2026-05", priority: 1 }),
    ];
    const layers = computeCostLayers(txs, 6);   // no critical set
    expect(layers[0].criticalCost).toBe(0);
    expect(layers[0].monthlyCost).toBe(200);    // 1200/6
  });

  it("critical subcategory present in set but no matching txs: zero criticalCost", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 600, budgetMonth: "2026-05", priority: 1 }),
    ];
    const layers = computeCostLayers(txs, 6, new Set(["sub_nonexistent"]));
    expect(layers[0].criticalCost).toBe(0);
  });
});

// ── computeIncomeSources ─────────────────────────────────────

describe("computeIncomeSources", () => {
  it("returns empty for no income", () => {
    expect(computeIncomeSources([], 6)).toEqual([]);
  });

  it("keys by subcategoryId when present", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 7000, budgetMonth: "2026-05", type: "INCOME",
           categoryId: "cat_wyplata", categoryName: "Wypłata",
           subcategoryId: "sub_sopra", subcategoryName: "Sopra Steria" }),
      tx({ amount: 5500, budgetMonth: "2026-05", type: "INCOME",
           categoryId: "cat_wyplata", categoryName: "Wypłata",
           subcategoryId: "sub_pwc", subcategoryName: "PwC" }),
    ];
    const sources = computeIncomeSources(txs, 1);
    expect(sources).toHaveLength(2);
    expect(sources[0].key).toBe("sub_sopra");
    expect(sources[1].key).toBe("sub_pwc");
  });

  it("falls back to categoryId when no subcategory", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 800, budgetMonth: "2026-05", type: "INCOME",
           categoryId: "cat_800plus", categoryName: "800+" }),
    ];
    const sources = computeIncomeSources(txs, 1);
    expect(sources[0].key).toBe("cat_800plus");
    expect(sources[0].label).toBe("800+");   // no " › subcategory" suffix
  });

  it("averages over lookback months, not months seen", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 6000, budgetMonth: "2026-05", type: "INCOME", categoryId: "c", categoryName: "X" }),
    ];
    const sources = computeIncomeSources(txs, 12);
    expect(sources[0].avgMonthly).toBe(500);   // 6000 / 12
    expect(sources[0].monthsSeen).toBe(1);
  });

  it("sorts by avgMonthly descending", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 100, budgetMonth: "2026-05", type: "INCOME", categoryId: "small", categoryName: "S" }),
      tx({ amount: 9000, budgetMonth: "2026-05", type: "INCOME", categoryId: "big", categoryName: "B" }),
      tx({ amount: 500, budgetMonth: "2026-05", type: "INCOME", categoryId: "mid", categoryName: "M" }),
    ];
    const sources = computeIncomeSources(txs, 1);
    expect(sources.map(s => s.categoryId)).toEqual(["big", "mid", "small"]);
  });

  it("aggregates same key across months and counts unique months", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 7000, budgetMonth: "2026-03", type: "INCOME",
           categoryId: "cat_w", categoryName: "W",
           subcategoryId: "s1", subcategoryName: "Sopra" }),
      tx({ amount: 7000, budgetMonth: "2026-04", type: "INCOME",
           categoryId: "cat_w", categoryName: "W",
           subcategoryId: "s1", subcategoryName: "Sopra" }),
      tx({ amount: 7000, budgetMonth: "2026-05", type: "INCOME",
           categoryId: "cat_w", categoryName: "W",
           subcategoryId: "s1", subcategoryName: "Sopra" }),
    ];
    const sources = computeIncomeSources(txs, 3);
    expect(sources).toHaveLength(1);
    expect(sources[0].avgMonthly).toBe(7000);   // 21000 / 3
    expect(sources[0].monthsSeen).toBe(3);
  });
});

// ── computeRemainingIncome ───────────────────────────────────

describe("computeRemainingIncome", () => {
  const sources = [
    { key: "s1", label: "Sopra", categoryId: "c1", categoryName: "W", avgMonthly: 7000, monthsSeen: 3 },
    { key: "s2", label: "PwC",   categoryId: "c1", categoryName: "W", avgMonthly: 5500, monthsSeen: 3 },
    { key: "s3", label: "800+",  categoryId: "c2", categoryName: "B", avgMonthly:  800, monthsSeen: 3 },
  ];

  it("sums all when nothing excluded", () => {
    expect(computeRemainingIncome(sources, [])).toBe(13300);
  });
  it("subtracts excluded keys", () => {
    expect(computeRemainingIncome(sources, ["s1"])).toBe(6300);
    expect(computeRemainingIncome(sources, ["s1", "s2"])).toBe(800);
  });
  it("returns 0 when everything excluded", () => {
    expect(computeRemainingIncome(sources, ["s1", "s2", "s3"])).toBe(0);
  });
  it("ignores unknown exclude keys", () => {
    expect(computeRemainingIncome(sources, ["nonexistent"])).toBe(13300);
  });
});

// ── computeLevelDeficits ─────────────────────────────────────

describe("computeLevelDeficits", () => {
  const layers: CostLayer[] = [
    { level: 1, label: "Survival",  color: "x", monthlyCost: 4000, bucketCost: 4000, criticalCost: 0 },
    { level: 2, label: "OK",        color: "x", monthlyCost: 6000, bucketCost: 2000, criticalCost: 0 },
    { level: 3, label: "Nice",      color: "x", monthlyCost: 8000, bucketCost: 2000, criticalCost: 0 },
    { level: 4, label: "No Change", color: "x", monthlyCost: 9000, bucketCost: 1000, criticalCost: 0 },
  ];

  it("zero deficit when remaining income covers costs", () => {
    // Spec example: Survival needs 4000, partner brings 4500 → 0 cushion needed
    const deficits = computeLevelDeficits(layers, 4500, 6, 50000);
    expect(deficits[0].monthlyDeficit).toBe(0);
    expect(deficits[0].targetCushion).toBe(0);
    expect(deficits[0].runwayMonths).toBe(Infinity);
    expect(deficits[0].coveragePercent).toBe(100);   // semantic "covered"
  });

  it("computes deficit and target correctly when income gap exists", () => {
    // No Change at 9000, partner brings 4500 → deficit 4500/mies
    const deficits = computeLevelDeficits(layers, 4500, 6, 50000);
    const noChange = deficits[3];
    expect(noChange.monthlyDeficit).toBe(4500);
    expect(noChange.targetCushion).toBe(27000);       // 4500 × 6
    expect(noChange.runwayMonths).toBeCloseTo(50000 / 4500, 5);
    expect(noChange.coveragePercent).toBeCloseTo(50000 / 27000 * 100, 5);
  });

  it("runway uses 30-day month for days conversion", () => {
    // deficit 3000, assets 9000 → 3 months → 90 days
    const deficits = computeLevelDeficits(
      [{ level: 1, label: "x", color: "x", monthlyCost: 3000, bucketCost: 3000, criticalCost: 0 }] as CostLayer[],
      0, 6, 9000,
    );
    expect(deficits[0].runwayMonths).toBe(3);
    expect(deficits[0].runwayDays).toBe(90);
  });

  it("handles zero assets gracefully", () => {
    const deficits = computeLevelDeficits(layers, 0, 6, 0);
    expect(deficits[0].runwayMonths).toBe(0);
    expect(deficits[0].runwayDays).toBe(0);
    expect(deficits[0].coveragePercent).toBe(0);
  });
});

// ── sumAssets ────────────────────────────────────────────────

describe("sumAssets", () => {
  it("sums valid amounts", () => {
    const assets: AssetBucket[] = [
      { id: "1", label: "A", amount: 1000, liquidity: "instant" },
      { id: "2", label: "B", amount: 2500, liquidity: "fast" },
    ];
    expect(sumAssets(assets)).toBe(3500);
  });

  it("returns 0 for empty array", () => {
    expect(sumAssets([])).toBe(0);
  });

  it("treats NaN / undefined amount as 0", () => {
    const assets = [
      { id: "1", label: "A", amount: NaN, liquidity: "instant" },
      { id: "2", label: "B", amount: 100, liquidity: "fast" },
    ] as AssetBucket[];
    expect(sumAssets(assets)).toBe(100);
  });
});

// ── computeSavingCapability ──────────────────────────────────

describe("computeSavingCapability", () => {
  it("returns zeros for empty", () => {
    const cap = computeSavingCapability([], 6);
    expect(cap.avgMonthlyIncome).toBe(0);
    expect(cap.avgMonthlyExpenses).toBe(0);
    expect(cap.avgMonthlySavings).toBe(0);
  });

  it("computes income - expenses across lookback", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 6000, budgetMonth: "2026-05", type: "INCOME", categoryId: "c", categoryName: "I" }),
      tx({ amount: 4000, budgetMonth: "2026-05", type: "EXPENSE", priority: 1 }),
    ];
    const cap = computeSavingCapability(txs, 1);
    expect(cap.avgMonthlyIncome).toBe(6000);
    expect(cap.avgMonthlyExpenses).toBe(4000);
    expect(cap.avgMonthlySavings).toBe(2000);
  });

  it("can return negative savings (overspending)", () => {
    const txs: SnTransaction[] = [
      tx({ amount: 3000, budgetMonth: "2026-05", type: "INCOME", categoryId: "c", categoryName: "I" }),
      tx({ amount: 5000, budgetMonth: "2026-05", type: "EXPENSE", priority: 1 }),
    ];
    const cap = computeSavingCapability(txs, 1);
    expect(cap.avgMonthlySavings).toBe(-2000);
  });
});

// ── nextNMonths ──────────────────────────────────────────────

describe("nextNMonths", () => {
  it("returns n months starting from current month", () => {
    const today = new Date(2026, 4, 15);  // May 2026
    const months = nextNMonths(6, today);
    expect(months).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("crosses year boundary forward", () => {
    const today = new Date(2026, 9, 1);   // Oct 2026
    const months = nextNMonths(6, today);
    expect(months).toEqual([
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
  });

  it("handles n=1", () => {
    const today = new Date(2026, 4, 15);
    expect(nextNMonths(1, today)).toEqual(["2026-05"]);
  });
});

// ── computeUpcomingPlanned ───────────────────────────────────

function vs(month: string, amountPLN: number, paid = false, dismissed = false): VirtualSaving {
  return {
    month,
    amount:          amountPLN,
    amountPLN,
    fxRate:          1,
    paidByUser:      paid,
    dismissedByUser: dismissed,
  };
}

function pl(opts: Partial<PlannedDoc> & Pick<PlannedDoc, "id" | "mode" | "plannedMonth" | "totalAmountPLN">): PlannedDoc {
  return {
    id:                   opts.id,
    userId:               "u",
    description:          opts.description ?? "Test plan",
    totalAmount:          opts.totalAmount ?? opts.totalAmountPLN,
    originalCurrency:     "PLN",
    fxRate:               1,
    totalAmountPLN:       opts.totalAmountPLN,
    targetCategoryId:     opts.targetCategoryId ?? "cat",
    targetCategoryName:   opts.targetCategoryName ?? "Kategoria",
    targetSubcategoryId:  opts.targetSubcategoryId ?? "sub",
    targetSubcategoryName: opts.targetSubcategoryName ?? "Subkategoria",
    tags:                 [],
    priority:             opts.priority ?? 2,
    mode:                 opts.mode,
    plannedMonth:         opts.plannedMonth,
    monthlySavingDay:     1,
    virtualSavings:       opts.virtualSavings ?? [],
    isPurchased:          opts.isPurchased ?? false,
    purchasedMonth:       null,
    isArchived:           opts.isArchived ?? false,
  };
}

describe("computeUpcomingPlanned", () => {
  const today = new Date(2026, 4, 15);   // May 2026

  it("returns empty for no planned", () => {
    expect(computeUpcomingPlanned([], 6, today)).toEqual([]);
  });

  it("skips archived and purchased plans", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "a", mode: "oneoff", plannedMonth: "2026-06", totalAmountPLN: 1000, isArchived: true }),
      pl({ id: "b", mode: "oneoff", plannedMonth: "2026-06", totalAmountPLN: 1000, isPurchased: true }),
    ];
    expect(computeUpcomingPlanned(plans, 6, today)).toEqual([]);
  });

  it("includes oneoff in window — full amount", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "oc", description: "OC auto", mode: "oneoff",
           plannedMonth: "2026-07", totalAmountPLN: 3000, priority: 1 }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("oc");
    expect(r[0].amountInHorizon).toBe(3000);
    expect(r[0].priority).toBe(1);
  });

  it("excludes oneoff outside window", () => {
    // Horizon 6 mies → covers May..Oct 2026. Dec is OUT.
    const plans: PlannedDoc[] = [
      pl({ id: "dec", mode: "oneoff", plannedMonth: "2026-12", totalAmountPLN: 5000 }),
    ];
    expect(computeUpcomingPlanned(plans, 6, today)).toEqual([]);
  });

  it("envelope with deadline IN window → totalAmountPLN - sumPaid", () => {
    const plans: PlannedDoc[] = [
      pl({
        id: "vac", description: "Wakacje", mode: "envelope",
        plannedMonth: "2026-08",
        totalAmountPLN: 6000,
        priority: 4,
        virtualSavings: [
          vs("2026-03", 1500, true),   // already paid
          vs("2026-04", 1500, true),   // already paid
          vs("2026-05", 1500),
          vs("2026-06", 1500),
        ],
      }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today);
    expect(r).toHaveLength(1);
    // 6000 - 3000 paid = 3000 still needed
    expect(r[0].amountInHorizon).toBe(3000);
    expect(r[0].paidPLN).toBe(3000);
  });

  it("envelope with deadline BEYOND window → only unpaid savings inside window", () => {
    // Horizon May..Oct. plannedMonth Dec → out of window.
    // virtualSavings include past (paid), current (unpaid) and future (out).
    const plans: PlannedDoc[] = [
      pl({
        id: "obo", description: "Obóz Karol", mode: "envelope",
        plannedMonth: "2026-12",
        totalAmountPLN: 8000,
        priority: 3,
        virtualSavings: [
          vs("2026-03", 1000, true),    // paid, out of window
          vs("2026-04", 1000, true),    // paid, out of window
          vs("2026-05", 1000),          // unpaid, IN window
          vs("2026-06", 1000),          // unpaid, IN window
          vs("2026-07", 1000),          // unpaid, IN window
          vs("2026-11", 1000),          // unpaid, OUT of window
          vs("2026-12", 1000),          // unpaid, OUT of window
        ],
      }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today);
    expect(r).toHaveLength(1);
    // Only May, Jun, Jul, Aug, Sep, Oct entries — 3 of them at 1000 each
    expect(r[0].amountInHorizon).toBe(3000);
  });

  it("envelope with deadline BEYOND window and no unpaid savings in window → excluded", () => {
    const plans: PlannedDoc[] = [
      pl({
        id: "far", mode: "envelope",
        plannedMonth: "2027-06",
        totalAmountPLN: 12000,
        virtualSavings: [vs("2027-01", 1000), vs("2027-02", 1000)],
      }),
    ];
    expect(computeUpcomingPlanned(plans, 6, today)).toEqual([]);
  });

  it("envelope with deadline BEYOND window skips dismissed and paid in-window entries", () => {
    const plans: PlannedDoc[] = [
      pl({
        id: "mix", mode: "envelope",
        plannedMonth: "2026-12",
        totalAmountPLN: 5000,
        virtualSavings: [
          vs("2026-05", 800, true),       // paid → excluded
          vs("2026-06", 800, false, true), // dismissed → excluded
          vs("2026-07", 800),              // counts
          vs("2026-08", 800),              // counts
        ],
      }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today);
    expect(r).toHaveLength(1);
    expect(r[0].amountInHorizon).toBe(1600);
  });

  it("sorts by plannedMonth ascending", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "c", description: "Trzeci",  mode: "oneoff", plannedMonth: "2026-09", totalAmountPLN: 1000 }),
      pl({ id: "a", description: "Pierwszy", mode: "oneoff", plannedMonth: "2026-06", totalAmountPLN: 1000 }),
      pl({ id: "b", description: "Drugi",    mode: "oneoff", plannedMonth: "2026-07", totalAmountPLN: 1000 }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today);
    expect(r.map(u => u.id)).toEqual(["a", "b", "c"]);
  });

  it("handles missing virtualSavings array gracefully", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "x", mode: "oneoff", plannedMonth: "2026-06", totalAmountPLN: 500 }),
    ];
    // Should not throw
    expect(() => computeUpcomingPlanned(plans, 6, today)).not.toThrow();
  });

  // ── Critical subcategory propagation (Feature #1) ──────────

  it("flags isCritical=true when plan targets a critical subcategory", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "edu", description: "Czesne sierpień", mode: "oneoff",
           plannedMonth: "2026-07", totalAmountPLN: 1500, priority: 4,
           targetSubcategoryId: "sub_czesne" }),
    ];
    const critical = new Set(["sub_czesne"]);
    const r = computeUpcomingPlanned(plans, 6, today, critical);
    expect(r).toHaveLength(1);
    expect(r[0].isCritical).toBe(true);
    expect(r[0].subcategoryId).toBe("sub_czesne");
  });

  it("isCritical=false when targeted subcategory is not in critical set", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "vac", mode: "oneoff", plannedMonth: "2026-07",
           totalAmountPLN: 3000, priority: 4,
           targetSubcategoryId: "sub_wakacje" }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today, new Set(["sub_czesne"]));
    expect(r[0].isCritical).toBe(false);
  });

  it("defaults to isCritical=false when no critical set provided", () => {
    const plans: PlannedDoc[] = [
      pl({ id: "x", mode: "oneoff", plannedMonth: "2026-07",
           totalAmountPLN: 1000,
           targetSubcategoryId: "sub_anything" }),
    ];
    const r = computeUpcomingPlanned(plans, 6, today);
    expect(r[0].isCritical).toBe(false);
  });
});

// ── sumPlannedForLevel ───────────────────────────────────────

describe("sumPlannedForLevel", () => {
  const upcoming: UpcomingPlanned[] = [
    { id: "a", description: "P1", categoryName: "x", mode: "oneoff",
      priority: 1, isCritical: false, plannedMonth: "2026-06", amountInHorizon: 1000,
      totalAmountPLN: 1000, paidPLN: 0 },
    { id: "b", description: "P3", categoryName: "x", mode: "oneoff",
      priority: 3, isCritical: false, plannedMonth: "2026-07", amountInHorizon: 2000,
      totalAmountPLN: 2000, paidPLN: 0 },
    { id: "c", description: "P4", categoryName: "x", mode: "oneoff",
      priority: 4, isCritical: false, plannedMonth: "2026-08", amountInHorizon: 5000,
      totalAmountPLN: 5000, paidPLN: 0 },
  ];

  it("Survival (P1): includes only P1 items", () => {
    expect(sumPlannedForLevel(upcoming, 1)).toBe(1000);
  });
  it("OK (P2): same as P1 (no P2 items)", () => {
    expect(sumPlannedForLevel(upcoming, 2)).toBe(1000);
  });
  it("Nice (P3): includes P1 + P3", () => {
    expect(sumPlannedForLevel(upcoming, 3)).toBe(3000);
  });
  it("No Change (P4): includes everything", () => {
    expect(sumPlannedForLevel(upcoming, 4)).toBe(8000);
  });

  // ── isCritical bypass: a P4 item flagged isCritical must be included
  //    in every level, even Survival. This is exactly the "school fees"
  //    use case — they don't get cut when you tighten belts.
  it("critical items bypass the priority filter on every level", () => {
    const withCritical: UpcomingPlanned[] = [
      ...upcoming,
      // P4 normally only in P4 → with isCritical, in every level
      { id: "edu", description: "Czesne", categoryName: "Edukacja",
        subcategoryId: "sub_czesne", mode: "oneoff",
        priority: 4, isCritical: true, plannedMonth: "2026-06",
        amountInHorizon: 1500, totalAmountPLN: 1500, paidPLN: 0 },
    ];
    expect(sumPlannedForLevel(withCritical, 1)).toBe(1000 + 1500);
    expect(sumPlannedForLevel(withCritical, 2)).toBe(1000 + 1500);
    expect(sumPlannedForLevel(withCritical, 3)).toBe(1000 + 2000 + 1500);
    expect(sumPlannedForLevel(withCritical, 4)).toBe(1000 + 2000 + 5000 + 1500);
  });
});

// ── computeLevelDeficits with planned ────────────────────────

describe("computeLevelDeficits with upcoming planned", () => {
  const layers: CostLayer[] = [
    { level: 1, label: "Survival",  color: "x", monthlyCost: 4000, bucketCost: 4000, criticalCost: 0 },
    { level: 2, label: "OK",        color: "x", monthlyCost: 6000, bucketCost: 2000, criticalCost: 0 },
    { level: 3, label: "Nice",      color: "x", monthlyCost: 8000, bucketCost: 2000, criticalCost: 0 },
    { level: 4, label: "No Change", color: "x", monthlyCost: 9000, bucketCost: 1000, criticalCost: 0 },
  ];

  const planned: UpcomingPlanned[] = [
    { id: "oc", description: "OC", categoryName: "Auto", mode: "oneoff",
      priority: 1, isCritical: false, plannedMonth: "2026-06", amountInHorizon: 3000,
      totalAmountPLN: 3000, paidPLN: 0 },
    { id: "obo", description: "Obóz", categoryName: "Dzieci", mode: "envelope",
      priority: 3, isCritical: false, plannedMonth: "2026-08", amountInHorizon: 2000,
      totalAmountPLN: 2000, paidPLN: 0 },
  ];

  it("without planned: baseTarget == targetCushion, plannedTarget == 0", () => {
    // deficit 4500, horizon 6 → no planned
    const deficits = computeLevelDeficits(layers, 4500, 6, 50000);
    expect(deficits[3].baseTarget).toBe(27000);
    expect(deficits[3].plannedTarget).toBe(0);
    expect(deficits[3].targetCushion).toBe(27000);
  });

  it("Survival level: only P1 planned items added", () => {
    // No income loss (4500), so monthlyDeficit at Survival (4000) is 0 → baseTarget = 0
    // But OC P1 still counts → totalTarget = 3000
    const deficits = computeLevelDeficits(layers, 4500, 6, 50000, planned);
    const survival = deficits[0];
    expect(survival.baseTarget).toBe(0);
    expect(survival.plannedTarget).toBe(3000);
    expect(survival.targetCushion).toBe(3000);
  });

  it("Nice level: P1 + P3 planned", () => {
    const deficits = computeLevelDeficits(layers, 4500, 6, 50000, planned);
    const nice = deficits[2];
    // monthlyDeficit = max(0, 8000 - 4500) = 3500
    // baseTarget = 3500 × 6 = 21000
    // plannedTarget = 3000 (P1 OC) + 2000 (P3 Obóz) = 5000
    expect(nice.baseTarget).toBe(21000);
    expect(nice.plannedTarget).toBe(5000);
    expect(nice.targetCushion).toBe(26000);
  });

  it("coveragePercent uses totalTarget", () => {
    // assets 5000, target 3000 (Survival from above example) → 166% → reported clamped at >100 in UI
    const deficits = computeLevelDeficits(layers, 4500, 6, 5000, planned);
    expect(Math.round(deficits[0].coveragePercent)).toBe(167);
  });

  it("coverage 100% when totalTarget is 0 (no deficit and no planned at this level)", () => {
    // P1 level: deficit 0 (income covers), no P1 planned
    const noPlanned: UpcomingPlanned[] = [];
    const deficits = computeLevelDeficits(layers, 4500, 6, 0, noPlanned);
    expect(deficits[0].targetCushion).toBe(0);
    expect(deficits[0].coveragePercent).toBe(100);   // semantic "covered"
  });
});

// ── computeEta ───────────────────────────────────────────────

describe("computeEta", () => {
  const today = new Date(2026, 4, 1); // May 2026

  it("returns isAlreadyReached when assets cover target", () => {
    const eta = computeEta(1000, 6, 6000, 500, { extraSavingsPerMonth: 0, cutCostsPerMonth: 0 }, today);
    expect(eta.isAlreadyReached).toBe(true);
    expect(eta.monthsToTarget).toBe(0);
  });

  it("returns isUnreachable when saving pace is zero or negative", () => {
    const eta = computeEta(1000, 6, 0, 0, { extraSavingsPerMonth: 0, cutCostsPerMonth: 0 }, today);
    expect(eta.isUnreachable).toBe(true);
    expect(eta.monthsToTarget).toBe(Infinity);
    expect(eta.etaDate).toBeNull();
  });

  it("computes basic months-to-target", () => {
    // deficit 1000, horizon 6 → target 6000
    // assets 0, pace 1000/mies → 6 months
    const eta = computeEta(1000, 6, 0, 1000, { extraSavingsPerMonth: 0, cutCostsPerMonth: 0 }, today);
    expect(eta.monthsToTarget).toBe(6);
    expect(eta.gapPLN).toBe(6000);
    expect(eta.adjustedSavingPace).toBe(1000);
  });

  it("applies extraSavingsPerMonth — pace goes up, target unchanged", () => {
    // baseline: deficit 1000, target 6000, pace 1000 → 6 months
    // +500 extra → pace 1500, target still 6000 → 4 months
    const eta = computeEta(1000, 6, 0, 1000, { extraSavingsPerMonth: 500, cutCostsPerMonth: 0 }, today);
    expect(eta.adjustedTarget).toBe(6000);
    expect(eta.adjustedSavingPace).toBe(1500);
    expect(eta.monthsToTarget).toBe(4);
  });

  it("DOUBLE effect: cutCostsPerMonth lowers BOTH target AND increases pace", () => {
    // baseline: deficit 1000, horizon 6, target 6000, pace 1000 → 6 months
    // cut 500/mies → deficit 500, target 3000, pace 1500 → 2 months
    const eta = computeEta(1000, 6, 0, 1000, { extraSavingsPerMonth: 0, cutCostsPerMonth: 500 }, today);
    expect(eta.adjustedDeficit).toBe(500);
    expect(eta.adjustedTarget).toBe(3000);
    expect(eta.adjustedSavingPace).toBe(1500);
    expect(eta.monthsToTarget).toBe(2);
  });

  it("combined what-if: extra + cut", () => {
    // deficit 2000, horizon 6, target 12000, pace 0 (no savings yet)
    // extra 1000 + cut 500 → adjustedDeficit 1500, target 9000, pace 1500 → 6 months
    const eta = computeEta(2000, 6, 0, 0, { extraSavingsPerMonth: 1000, cutCostsPerMonth: 500 }, today);
    expect(eta.adjustedTarget).toBe(9000);
    expect(eta.adjustedSavingPace).toBe(1500);
    expect(eta.monthsToTarget).toBe(6);
  });

  it("etaDate is set when reachable", () => {
    // today=May 2026, monthsToTarget=4 → eta should be ~Sep 2026
    const eta = computeEta(1000, 6, 0, 1500, { extraSavingsPerMonth: 0, cutCostsPerMonth: 0 }, today);
    expect(eta.etaDate).not.toBeNull();
    expect(eta.etaDate!.getMonth()).toBe(8);  // September (0-indexed)
    expect(eta.etaDate!.getFullYear()).toBe(2026);
  });

  it("clamps adjustedDeficit at 0 (can't go negative)", () => {
    // Cutting more than the deficit shouldn't produce a negative target
    const eta = computeEta(500, 6, 0, 1000, { extraSavingsPerMonth: 0, cutCostsPerMonth: 9999 }, today);
    expect(eta.adjustedDeficit).toBe(0);
    expect(eta.adjustedTarget).toBe(0);
    expect(eta.isAlreadyReached).toBe(true);   // gap is 0
  });
});

// ── Format helpers ───────────────────────────────────────────

describe("formatMonthsPretty", () => {
  it("formats integer months", () => {
    expect(formatMonthsPretty(6)).toBe("6 mies.");
  });
  it("formats fractional months to 1 decimal", () => {
    expect(formatMonthsPretty(3.7)).toBe("3.7 mies.");
  });
  it("returns < 1 mies. for sub-month values", () => {
    expect(formatMonthsPretty(0.5)).toBe("< 1 mies.");
  });
  it("returns ∞ for Infinity", () => {
    expect(formatMonthsPretty(Infinity)).toBe("∞");
  });
});

describe("formatDaysPretty", () => {
  it("rounds to whole days", () => {
    expect(formatDaysPretty(142.7)).toBe("143 dni");
  });
  it("returns ∞ for Infinity", () => {
    expect(formatDaysPretty(Infinity)).toBe("∞");
  });
});

// ── Integration: end-to-end Survival mode scenario ──────────

describe("integration — survival mode scenario from spec", () => {
  it("matches the spec example: 4000 zł costs, 4500 partner income → 0 cushion", () => {
    // Setup: 6 months of P1 expenses totalling 24000 zł → avg 4000/mies
    //        partner income 4500/mies
    const txs: SnTransaction[] = [];
    for (const m of ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]) {
      txs.push(tx({ amount: 4000, budgetMonth: m, type: "EXPENSE", priority: 1 }));
      txs.push(tx({ amount: 4500, budgetMonth: m, type: "INCOME",
                    categoryId: "partner", categoryName: "Partner" }));
    }

    const layers   = computeCostLayers(txs, 6);
    const sources  = computeIncomeSources(txs, 6);
    const remaining = computeRemainingIncome(sources, []);   // nothing lost
    const deficits = computeLevelDeficits(layers, remaining, 6, 50000);

    expect(layers[0].monthlyCost).toBe(4000);
    expect(remaining).toBe(4500);
    expect(deficits[0].monthlyDeficit).toBe(0);
    expect(deficits[0].targetCushion).toBe(0);
  });
});
