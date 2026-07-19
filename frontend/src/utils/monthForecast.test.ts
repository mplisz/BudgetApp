// ============================================================
// File: src/utils/monthForecast.test.ts
//
// Unit tests for the pure logic of the end-of-month forecast.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - monthProgress: current vs other months, month lengths
//   - isFixedExpense: recurring markers
//   - upcomingRecurringForMonth: confirmed/archived/frequency filters,
//     amountPLN fallback
//   - plannedTotalForMonth: month/purchased/archived filters
//   - computeMonthForecast: fixed vs variable projection, upcoming
//     attribution, limit crossing day, sorting, low-confidence flag
// ============================================================

import { describe, it, expect } from "vitest";
import {
  monthProgress,
  isFixedExpense,
  upcomingRecurringForMonth,
  plannedTotalForMonth,
  computeMonthForecast,
  MIN_PACE_DAYS,
  type ForecastTransaction,
} from "./monthForecast";
import type { RecurringDoc } from "../types/appContext";
import type { PlannedDoc } from "../hooks/usePlanned";

// ── Fixtures ─────────────────────────────────────────────────

const MONTH = "2026-06";           // 30 days
const TODAY = "2026-06-10";        // 10 of 30 elapsed → variable pace ×3

function tx(o: Partial<ForecastTransaction> & Pick<ForecastTransaction, "amount">): ForecastTransaction {
  return {
    type:         o.type ?? "EXPENSE",
    budgetMonth:  o.budgetMonth ?? MONTH,
    categoryId:   o.categoryId ?? "cat_food",
    categoryName: o.categoryName ?? "Jedzenie",
    amount:       o.amount,
    isRecurring:  o.isRecurring,
    recurringId:  o.recurringId,
    returns:      o.returns,
  };
}

function recurringDoc(o: Partial<RecurringDoc>): RecurringDoc {
  return {
    id:           o.id ?? "rec_1",
    description:  o.description ?? "Czynsz",
    categoryName: o.categoryName ?? "Mieszkanie",
    categoryId:   o.categoryId ?? "cat_home",
    plannedDay:   o.plannedDay ?? 20,
    frequency:    o.frequency ?? "monthly",
    costs:        o.costs ?? [{ validFrom: "2025-01", amount: 100, amountPLN: 100 }],
    ...o,
  } as RecurringDoc;
}

function plannedDoc(o: Partial<PlannedDoc>): PlannedDoc {
  return {
    plannedMonth:   o.plannedMonth ?? MONTH,
    totalAmountPLN: o.totalAmountPLN ?? 500,
    isPurchased:    o.isPurchased ?? false,
    isArchived:     o.isArchived ?? false,
  } as PlannedDoc;
}

function forecast(overrides: Partial<Parameters<typeof computeMonthForecast>[0]> = {}) {
  return computeMonthForecast({
    transactions:    [],
    month:           MONTH,
    todayStr:        TODAY,
    upcoming:        [],
    limitByCategory: {},
    ...overrides,
  });
}

// ── monthProgress ────────────────────────────────────────────

describe("monthProgress", () => {
  it("tracks elapsed days for the current month", () => {
    expect(monthProgress(MONTH, TODAY)).toEqual({
      daysInMonth: 30, dayOfMonth: 10, elapsedFraction: 10 / 30, isCurrentMonth: true,
    });
  });

  it("treats other months as fully elapsed", () => {
    const p = monthProgress("2026-05", TODAY);
    expect(p).toMatchObject({ daysInMonth: 31, dayOfMonth: 31, isCurrentMonth: false });
    expect(p.elapsedFraction).toBe(1);
  });

  it("knows month lengths incl. February", () => {
    expect(monthProgress("2026-02", TODAY).daysInMonth).toBe(28);
    expect(monthProgress("2028-02", TODAY).daysInMonth).toBe(29);
  });
});

// ── isFixedExpense ───────────────────────────────────────────

describe("isFixedExpense", () => {
  it("flags recurring-linked transactions", () => {
    expect(isFixedExpense({ isRecurring: true })).toBe(true);
    expect(isFixedExpense({ recurringId: "rec_1" })).toBe(true);
    expect(isFixedExpense({ recurringId: null })).toBe(false);
    expect(isFixedExpense({})).toBe(false);
  });
});

// ── upcomingRecurringForMonth ────────────────────────────────

describe("upcomingRecurringForMonth", () => {
  it("returns active unconfirmed occurrences with schedule metadata", () => {
    const docs = [recurringDoc({ costs: [{ validFrom: "2025-01", amount: 2500, amountPLN: 2500 }] })];
    expect(upcomingRecurringForMonth(docs, MONTH)).toEqual([
      { id: "rec_1", description: "Czynsz", categoryId: "cat_home", amountPLN: 2500, day: 20 },
    ]);
  });

  it("excludes occurrences already confirmed for the month", () => {
    const docs = [recurringDoc({ confirmedMonths: [MONTH] })];
    expect(upcomingRecurringForMonth(docs, MONTH)).toHaveLength(0);
  });

  it("excludes docs archived before the month", () => {
    const docs = [recurringDoc({ isArchived: true, archivedFrom: "2026-05" })];
    expect(upcomingRecurringForMonth(docs, MONTH)).toHaveLength(0);
  });

  it("respects frequency (yearly doc outside its month)", () => {
    const docs = [recurringDoc({ frequency: "yearly", costs: [{ validFrom: "2025-03", amount: 300 }] })];
    expect(upcomingRecurringForMonth(docs, MONTH)).toHaveLength(0);
    expect(upcomingRecurringForMonth(docs, "2026-03")).toHaveLength(1);
  });

  it("falls back to amount when amountPLN is missing", () => {
    const docs = [recurringDoc({ costs: [{ validFrom: "2025-01", amount: 99 }] })];
    expect(upcomingRecurringForMonth(docs, MONTH)[0].amountPLN).toBe(99);
  });
});

// ── plannedTotalForMonth ─────────────────────────────────────

describe("plannedTotalForMonth", () => {
  it("sums only open plans targeting the month", () => {
    const docs = [
      plannedDoc({ totalAmountPLN: 500 }),
      plannedDoc({ totalAmountPLN: 300 }),
      plannedDoc({ totalAmountPLN: 900, plannedMonth: "2026-07" }),
      plannedDoc({ totalAmountPLN: 100, isPurchased: true }),
      plannedDoc({ totalAmountPLN: 100, isArchived: true }),
    ];
    expect(plannedTotalForMonth(docs, MONTH)).toEqual({ total: 800, count: 2 });
  });
});

// ── computeMonthForecast ─────────────────────────────────────

describe("computeMonthForecast", () => {
  it("scales variable spend linearly with elapsed days", () => {
    const f = forecast({ transactions: [tx({ amount: 100 })] });
    expect(f.variableSpent).toBe(100);
    expect(f.projected).toBe(300);   // 100 / 10 days × 30 days
  });

  it("does NOT scale fixed spend — the rent-on-the-1st trap", () => {
    const f = forecast({
      transactions: [
        tx({ amount: 2500, recurringId: "rec_1", categoryId: "cat_home", categoryName: "Mieszkanie" }),
        tx({ amount: 100 }),
      ],
    });
    expect(f.fixedSpent).toBe(2500);
    expect(f.projected).toBe(2500 + 300);
  });

  it("adds upcoming recurring to the projection and its category", () => {
    const f = forecast({
      upcoming: [{ id: "r", description: "Prąd", categoryId: "cat_home", amountPLN: 200, day: 20 }],
    });
    expect(f.upcomingFixedTotal).toBe(200);
    expect(f.projected).toBe(200);
    expect(f.categories.find(c => c.categoryId === "cat_home")?.upcomingFixed).toBe(200);
  });

  it("counts upcoming without a category in totals only", () => {
    const f = forecast({
      upcoming: [{ id: "r", description: "?", categoryId: null, amountPLN: 150, day: 5 }],
    });
    expect(f.upcomingFixedTotal).toBe(150);
    expect(f.projected).toBe(150);
    expect(f.categories).toHaveLength(0);
  });

  it("estimates the limit crossing day from the variable pace", () => {
    // 200 spent in 10 days → 20/day; 100 left to the 300 limit → day 15.
    const f = forecast({
      transactions:    [tx({ amount: 200 })],
      limitByCategory: { cat_food: 300 },
    });
    const cat = f.categories[0];
    expect(cat.overBy).toBe(300);          // projected 600 − limit 300
    expect(cat.crossingDay).toBe(15);
  });

  it("reports an already-crossed limit at today's date", () => {
    const f = forecast({
      transactions:    [tx({ amount: 400 })],
      limitByCategory: { cat_food: 300 },
    });
    expect(f.categories[0].crossingDay).toBe(10);
  });

  it("keeps untouched limited categories visible and in the green", () => {
    const f = forecast({ limitByCategory: { cat_food: 300 } });
    expect(f.categories).toEqual([
      expect.objectContaining({ categoryId: "cat_food", spent: 0, overBy: 0, crossingDay: null }),
    ]);
    expect(f.limitTotal).toBe(300);
  });

  it("sorts at-risk categories first, soonest crossing on top", () => {
    const f = forecast({
      transactions: [
        tx({ amount: 100, categoryId: "cat_slow", categoryName: "Wolna" }),   // proj 300 vs 500 → safe
        tx({ amount: 290, categoryId: "cat_soon", categoryName: "Zaraz" }),   // crosses on day 11
        tx({ amount: 200, categoryId: "cat_late", categoryName: "Później" }), // crosses on day 15
      ],
      limitByCategory: { cat_slow: 500, cat_soon: 300, cat_late: 300 },
    });
    expect(f.categories.map(c => c.categoryId)).toEqual(["cat_soon", "cat_late", "cat_slow"]);
  });

  it("subtracts in-month returns via effective amounts", () => {
    const f = forecast({
      transactions: [tx({ amount: 100, returns: [{ moneyReturnedInMonth: MONTH, cashAmount: 40 }] })],
    });
    expect(f.spent).toBe(60);
  });

  it("ignores other months and non-expenses", () => {
    const f = forecast({
      transactions: [
        tx({ amount: 100, budgetMonth: "2026-05" }),
        tx({ amount: 100, type: "SAVING" }),
      ],
    });
    expect(f.spent).toBe(0);
  });

  it("flags low confidence early in the month", () => {
    expect(forecast({ todayStr: "2026-06-03" }).lowConfidence).toBe(true);
    expect(forecast({ todayStr: "2026-06-05" }).lowConfidence).toBe(false);
    expect(MIN_PACE_DAYS).toBe(5);
  });

  it("degrades to spent + upcoming for a non-current month", () => {
    const f = forecast({
      todayStr:     "2026-07-18",
      transactions: [tx({ amount: 100 })],
      upcoming:     [{ id: "r", description: "Prąd", categoryId: null, amountPLN: 50, day: 20 }],
    });
    expect(f.progress.isCurrentMonth).toBe(false);
    expect(f.projected).toBe(150);   // no extrapolation
  });
});
