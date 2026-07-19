// ============================================================
// File: src/utils/seasonality.test.ts
//
// Unit tests for the pure logic of the seasonality section.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - shiftMonth / enumerateMonths: year wrap-around
//   - yearOverlay: pivot, gaps for months outside the window
//   - yoyEligibleMonths / defaultYoyMonth / yoyUnlockMonth: gating
//   - yoyComparison: per-category deltas, totals, netting returns
// ============================================================

import { describe, it, expect } from "vitest";
import {
  shiftMonth,
  enumerateMonths,
  yearOverlay,
  yoyEligibleMonths,
  defaultYoyMonth,
  yoyUnlockMonth,
  yoyComparison,
  type SeasonalityTx,
} from "./seasonality";

// ── Fixtures ─────────────────────────────────────────────────

function tx(o: Partial<SeasonalityTx> & Pick<SeasonalityTx, "amount" | "budgetMonth">): SeasonalityTx {
  return {
    type:         o.type ?? "EXPENSE",
    budgetMonth:  o.budgetMonth,
    categoryId:   o.categoryId ?? "cat_food",
    categoryName: o.categoryName ?? "Jedzenie",
    amount:       o.amount,
    returns:      o.returns,
  };
}

// ── Month arithmetic ─────────────────────────────────────────

describe("shiftMonth", () => {
  it("shifts across year boundaries in both directions", () => {
    expect(shiftMonth("2026-01", -2)).toBe("2025-11");
    expect(shiftMonth("2025-11", 2)).toBe("2026-01");
    expect(shiftMonth("2026-07", -12)).toBe("2025-07");
    expect(shiftMonth("2026-07", 0)).toBe("2026-07");
  });
});

describe("enumerateMonths", () => {
  it("lists inclusive months across a year boundary", () => {
    expect(enumerateMonths("2025-11", "2026-02"))
      .toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

// ── yearOverlay ──────────────────────────────────────────────

describe("yearOverlay", () => {
  const months = enumerateMonths("2025-11", "2026-02");

  it("pivots expenses into calendar-month rows with per-year columns", () => {
    const { rows, years } = yearOverlay([
      tx({ budgetMonth: "2025-12", amount: 100 }),
      tx({ budgetMonth: "2025-12", amount: 50 }),
      tx({ budgetMonth: "2026-01", amount: 70 }),
    ], months);
    expect(years).toEqual(["2025", "2026"]);
    expect(rows[11]["2025"]).toBe(150);   // December
    expect(rows[0]["2026"]).toBe(70);     // January
  });

  it("leaves months outside the window keyless (chart gap, not zero)", () => {
    const { rows } = yearOverlay([], months);
    expect(rows[0]["2026"]).toBe(0);          // Jan 2026 inside window
    expect(rows[0]["2025"]).toBeUndefined();  // Jan 2025 outside window
    expect(rows[5]["2026"]).toBeUndefined();  // Jun 2026 outside window
  });

  it("ignores non-expenses and months outside the window", () => {
    const { rows } = yearOverlay([
      tx({ budgetMonth: "2025-12", amount: 100, type: "SAVING" }),
      tx({ budgetMonth: "2025-05", amount: 100 }),
    ], months);
    expect(rows[11]["2025"]).toBe(0);
  });
});

// ── YoY gating ───────────────────────────────────────────────

describe("yoyEligibleMonths", () => {
  it("keeps only months whose year-earlier month is also present", () => {
    const months = enumerateMonths("2025-05", "2026-07");
    expect(yoyEligibleMonths(months)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("is empty for a window shorter than 13 months", () => {
    expect(yoyEligibleMonths(enumerateMonths("2026-01", "2026-07"))).toEqual([]);
  });
});

describe("defaultYoyMonth", () => {
  it("prefers the latest FULL month before the current one", () => {
    expect(defaultYoyMonth(["2026-05", "2026-06", "2026-07"], "2026-07")).toBe("2026-06");
  });
  it("falls back to the latest eligible month", () => {
    expect(defaultYoyMonth(["2026-07"], "2026-07")).toBe("2026-07");
  });
  it("returns null when nothing is eligible", () => {
    expect(defaultYoyMonth([], "2026-07")).toBeNull();
  });
});

describe("yoyUnlockMonth", () => {
  it("is a year after the first data month", () => {
    expect(yoyUnlockMonth("2025-09")).toBe("2026-09");
  });
});

// ── yoyComparison ────────────────────────────────────────────

describe("yoyComparison", () => {
  it("splits per category into current vs year-earlier", () => {
    const { deltas, totals } = yoyComparison([
      tx({ budgetMonth: "2026-06", amount: 300 }),
      tx({ budgetMonth: "2025-06", amount: 200 }),
      tx({ budgetMonth: "2025-06", amount: 80, categoryId: "cat_fun", categoryName: "Rozrywka" }),
    ], "2026-06");
    expect(totals).toEqual({ current: 300, previous: 280 });
    expect(deltas).toContainEqual(
      expect.objectContaining({ categoryId: "cat_food", current: 300, previous: 200, delta: 100 }),
    );
    expect(deltas).toContainEqual(
      expect.objectContaining({ categoryId: "cat_fun", current: 0, previous: 80, delta: -80 }),
    );
  });

  it("ignores unrelated months and nets returns", () => {
    const { deltas, totals } = yoyComparison([
      tx({ budgetMonth: "2026-05", amount: 999 }),
      tx({ budgetMonth: "2026-06", amount: 100, returns: [{ moneyReturnedInMonth: "2026-07", cashAmount: 40 }] }),
    ], "2026-06");
    expect(totals.current).toBe(60);   // net of the cross-month return
    expect(deltas[0].current).toBe(60);
  });

  it("drops categories with no effective change", () => {
    const { deltas } = yoyComparison([
      tx({ budgetMonth: "2026-06", amount: 100 }),
      tx({ budgetMonth: "2025-06", amount: 100 }),
    ], "2026-06");
    expect(deltas).toHaveLength(0);
  });
});
