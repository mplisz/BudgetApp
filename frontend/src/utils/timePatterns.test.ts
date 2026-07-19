// ============================================================
// File: src/utils/timePatterns.test.ts
//
// Unit tests for the pure logic of the time-patterns section.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - weekdayOf: known dates, no TZ drift
//   - weekdayProfile: occurrence normalization, variable-only filter,
//     current-month truncation at today
//   - weekdayInsights: top day, weekend vs workday
//   - dayOfMonthProfile: day 29-31 normalization
//   - detectPaydays: two salaries, weekend drift, month-end wrap,
//     one-off bonus rejected, small inflows filtered, short-range gate
//   - postPaydayAnalysis: multiplier, window truncation at next payday
//   - weekdayHeatmap: weekday x month pivot
// ============================================================

import { describe, it, expect } from "vitest";
import {
  weekdayOf,
  weekdayProfile,
  weekdayInsights,
  dayOfMonthProfile,
  detectPaydays,
  postPaydayAnalysis,
  weekdayHeatmap,
  PAYDAY_MIN_RANGE,
  type TimeTx,
  type Payday,
} from "./timePatterns";

// ── Fixtures ─────────────────────────────────────────────────

const FUTURE = "2099-01-01";   // "today" far ahead → all range days elapsed

function tx(o: Partial<TimeTx> & Pick<TimeTx, "date" | "amount">): TimeTx {
  return {
    type:        o.type ?? "EXPENSE",
    date:        o.date,
    budgetMonth: o.budgetMonth ?? o.date.slice(0, 7),
    amount:      o.amount,
    isRecurring: o.isRecurring,
    recurringId: o.recurringId,
    subcategoryName: o.subcategoryName,
    description: o.description,
  };
}

/** Salary-like income on a given day across the listed months. */
function salaries(day: number, months: string[], amount: number, subcategoryName: string): TimeTx[] {
  return months.map(m =>
    tx({ type: "INCOME", date: `${m}-${String(day).padStart(2, "0")}`, amount, subcategoryName }));
}

// ── weekdayOf ────────────────────────────────────────────────

describe("weekdayOf", () => {
  it("maps dates to Monday-first indices", () => {
    expect(weekdayOf("2026-07-13")).toBe(0);   // Monday
    expect(weekdayOf("2026-07-17")).toBe(4);   // Friday
    expect(weekdayOf("2026-07-19")).toBe(6);   // Sunday
  });
});

// ── weekdayProfile ───────────────────────────────────────────

describe("weekdayProfile", () => {
  it("normalizes by weekday occurrences, not totals", () => {
    // June 2026 has 30 days: 5 Mondays, 4 Fridays... 2026-06-01 is a Monday.
    const rows = weekdayProfile([
      tx({ date: "2026-06-05", amount: 100 }),   // Friday
      tx({ date: "2026-06-12", amount: 100 }),   // Friday
    ], ["2026-06"], FUTURE);
    expect(rows[4].days).toBe(4);
    expect(rows[4].avgPerDay).toBe(50);
    expect(rows[4].avgBasket).toBe(100);
  });

  it("skips fixed expenses by default, includes them on demand", () => {
    const txs = [
      tx({ date: "2026-06-01", amount: 2500, recurringId: "rec_rent" }),
      tx({ date: "2026-06-01", amount: 50 }),
    ];
    expect(weekdayProfile(txs, ["2026-06"], FUTURE)[0].total).toBe(50);
    expect(weekdayProfile(txs, ["2026-06"], FUTURE, true)[0].total).toBe(2550);
  });

  it("counts the current month only up to today", () => {
    // Today = Fri 2026-06-12 → June so far has 2 Fridays (5th, 12th).
    const rows = weekdayProfile([], ["2026-06"], "2026-06-12");
    expect(rows[4].days).toBe(2);
    expect(rows[5].days).toBe(1);   // one Saturday elapsed (6th)
  });
});

describe("weekdayInsights", () => {
  it("finds the priciest day and the weekend/workday split", () => {
    const rows = weekdayProfile([
      tx({ date: "2026-06-05", amount: 400 }),   // Friday
      tx({ date: "2026-06-07", amount: 100 }),   // Sunday
    ], ["2026-06"], FUTURE);
    const ins = weekdayInsights(rows);
    expect(ins.top?.weekday).toBe(4);
    expect(ins.topAbovePct).toBeGreaterThan(0);
    expect(ins.weekendAvg).toBeCloseTo(100 / 8, 5);   // 4 Sat + 4 Sun in June
    expect(ins.workdayAvg).toBeCloseTo(400 / 22, 5);
  });
});

// ── dayOfMonthProfile ────────────────────────────────────────

describe("dayOfMonthProfile", () => {
  it("normalizes days 29-31 by how many months contain them", () => {
    const months = ["2026-01", "2026-02"];   // Feb 2026 has 28 days
    const rows = dayOfMonthProfile([
      tx({ date: "2026-01-31", amount: 90 }),
    ], months, FUTURE);
    expect(rows[30].days).toBe(1);       // the 31st exists once
    expect(rows[30].avgPerDay).toBe(90);
    expect(rows[0].days).toBe(2);        // the 1st exists twice
  });
});

// ── detectPaydays ────────────────────────────────────────────

const M3 = ["2026-04", "2026-05", "2026-06"];

describe("detectPaydays", () => {
  it("finds two household paydays as separate clusters with labels", () => {
    const paydays = detectPaydays([
      ...salaries(10, M3, 8000, "Wypłata"),
      ...salaries(28, M3, 6000, "Pensja Ani"),
    ], M3);
    expect(paydays.map(p => ({ day: p.day, label: p.label })))
      .toEqual([{ day: 10, label: "Wypłata" }, { day: 28, label: "Pensja Ani" }]);
  });

  it("absorbs weekend drift into one cluster", () => {
    const paydays = detectPaydays([
      tx({ type: "INCOME", date: "2026-04-10", amount: 8000, subcategoryName: "Wypłata" }),
      tx({ type: "INCOME", date: "2026-05-09", amount: 8000, subcategoryName: "Wypłata" }),
      tx({ type: "INCOME", date: "2026-06-12", amount: 8000, subcategoryName: "Wypłata" }),
    ], M3);
    expect(paydays).toHaveLength(1);
    expect([9, 10, 12]).toContain(paydays[0].day);
  });

  it("wraps month-end salaries across the 31st/1st boundary", () => {
    const paydays = detectPaydays([
      tx({ type: "INCOME", date: "2026-03-31", amount: 8000, budgetMonth: "2026-04", subcategoryName: "Wypłata" }),
      tx({ type: "INCOME", date: "2026-05-01", amount: 8000, subcategoryName: "Wypłata" }),
      tx({ type: "INCOME", date: "2026-06-01", amount: 8000, subcategoryName: "Wypłata" }),
    ], M3);
    expect(paydays).toHaveLength(1);
  });

  it("rejects a one-off bonus (fails the recurrence bar)", () => {
    const paydays = detectPaydays([
      ...salaries(10, M3, 8000, "Wypłata"),
      tx({ type: "INCOME", date: "2026-05-20", amount: 9000, subcategoryName: "Premia" }),
    ], M3);
    expect(paydays.map(p => p.label)).toEqual(["Wypłata"]);
  });

  it("filters out small recurring inflows (fails the significance bar)", () => {
    const paydays = detectPaydays([
      ...salaries(10, M3, 8000, "Wypłata"),
      ...salaries(20, M3, 50, "Kaucja"),
    ], M3);
    expect(paydays.map(p => p.label)).toEqual(["Wypłata"]);
  });

  it("detects nothing on a short range", () => {
    const short = M3.slice(0, PAYDAY_MIN_RANGE - 1);
    expect(detectPaydays(salaries(10, short, 8000, "Wypłata"), short)).toEqual([]);
  });
});

// ── postPaydayAnalysis ───────────────────────────────────────

describe("postPaydayAnalysis", () => {
  const payday = (day: number, label = "Wypłata"): Payday =>
    ({ day, label, share: 100, monthsSeen: 3 });

  it("computes the post-payday spend multiplier vs baseline", () => {
    // Spend 100/day on days 10-14 (window), 10/day on EVERY other day of
    // each month — otherwise trailing zero-spend days dilute the baseline.
    const months = ["2026-04", "2026-05", "2026-06"];
    const txs: TimeTx[] = [];
    for (const m of months) {
      const [y, mm] = m.split("-").map(Number);
      const daysInMonth = new Date(y, mm, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const inWindow = d >= 10 && d <= 14;
        txs.push(tx({ date: `${m}-${String(d).padStart(2, "0")}`, amount: inWindow ? 100 : 10 }));
      }
    }
    const rows = dayOfMonthProfile(txs, months, FUTURE);
    const [impact] = postPaydayAnalysis(rows, [payday(10)]);
    expect(impact.multiplier).not.toBeNull();
    expect(impact.multiplier as number).toBeCloseTo(10, 1);
  });

  it("truncates a window at the next payday so windows never overlap", () => {
    const months = ["2026-04"];
    const rows = dayOfMonthProfile([
      tx({ date: "2026-04-10", amount: 100 }),
      tx({ date: "2026-04-12", amount: 999 }),   // belongs to the SECOND window
      tx({ date: "2026-04-20", amount: 10 }),
    ], months, FUTURE);
    const impacts = postPaydayAnalysis(rows, [payday(10), payday(12, "Pensja Ani")]);
    // First window = days 10-11 only; the 999 must not inflate it.
    expect(impacts[0].multiplier).toBeLessThan(impacts[1].multiplier as number);
  });

  it("returns null multiplier when every day sits inside a window", () => {
    const rows = dayOfMonthProfile([tx({ date: "2026-04-10", amount: 100 })], ["2026-04"], "2026-04-12");
    const [impact] = postPaydayAnalysis(rows, [payday(9)]);
    expect(impact.multiplier).toBeNull();   // only days 9-12 elapsed, all in window
  });
});

// ── weekdayHeatmap ───────────────────────────────────────────

describe("weekdayHeatmap", () => {
  it("pivots variable spend into weekday x month cells", () => {
    const rows = weekdayHeatmap([
      tx({ date: "2026-06-05", amount: 100 }),                            // Friday
      tx({ date: "2026-06-12", amount: 40 }),                             // Friday
      tx({ date: "2026-05-04", amount: 70 }),                             // Monday
      tx({ date: "2026-06-01", amount: 999, recurringId: "rec_rent" }),   // fixed — out
    ], ["2026-05", "2026-06"]);
    expect(rows[4].byMonth).toEqual({ "2026-06": 140 });
    expect(rows[0].byMonth).toEqual({ "2026-05": 70 });
  });
});
