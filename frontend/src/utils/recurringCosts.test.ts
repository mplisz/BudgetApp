// ============================================================
// File: src/utils/recurringCosts.test.ts
//
// Unit tests for the pure logic of the recurring cost-creep card.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - monthlyFactor / monthlyEquivalent: frequency normalization
//   - isInForce: validity windows (start, validTo, archive)
//   - costTimeline: baseline sums, raises kicking in mid-range
//   - priceChanges: raise/decrease pairs, pct, normalized delta
//   - changesInRange: window filtering
//   - subscriptionRows: sorting, annual cost, price-drift badge
// ============================================================

import { describe, it, expect } from "vitest";
import {
  monthlyFactor,
  monthlyEquivalent,
  isInForce,
  costTimeline,
  priceChanges,
  changesInRange,
  subscriptionRows,
} from "./recurringCosts";
import type { RecurringDoc } from "../types/appContext";

// ── Fixtures ─────────────────────────────────────────────────

function doc(o: Partial<RecurringDoc>): RecurringDoc {
  return {
    id:           o.id ?? "rec_1",
    description:  o.description ?? "Netflix",
    categoryName: o.categoryName ?? "Rozrywka",
    frequency:    o.frequency ?? "monthly",
    costs:        o.costs ?? [{ validFrom: "2025-01", amount: 43, amountPLN: 43 }],
    ...o,
  } as RecurringDoc;
}

const RAISED = doc({
  costs: [
    { validFrom: "2025-01", amount: 43,   amountPLN: 43 },
    { validFrom: "2026-01", amount: 49.5, amountPLN: 49.5 },
  ],
});

// ── monthlyFactor / monthlyEquivalent ────────────────────────

describe("monthlyFactor", () => {
  it("normalizes every frequency to per-month", () => {
    expect(monthlyFactor(doc({ frequency: "monthly" }))).toBe(1);
    expect(monthlyFactor(doc({ frequency: "quarterly" }))).toBe(1 / 3);
    expect(monthlyFactor(doc({ frequency: "biannual" }))).toBe(1 / 6);
    expect(monthlyFactor(doc({ frequency: "yearly" }))).toBe(1 / 12);
    expect(monthlyFactor(doc({ frequency: "custom", activeMonths: [3, 9] }))).toBe(2 / 12);
  });
});

describe("monthlyEquivalent", () => {
  it("uses the cost entry active for the month", () => {
    expect(monthlyEquivalent(RAISED, "2025-06")).toBe(43);
    expect(monthlyEquivalent(RAISED, "2026-06")).toBe(49.5);
  });

  it("spreads a yearly premium across months", () => {
    const yearly = doc({ frequency: "yearly", costs: [{ validFrom: "2025-03", amount: 1200, amountPLN: 1200 }] });
    expect(monthlyEquivalent(yearly, "2025-06")).toBe(100);
  });

  it("falls back to amount when amountPLN is missing", () => {
    const fx = doc({ costs: [{ validFrom: "2025-01", amount: 10 }] });
    expect(monthlyEquivalent(fx, "2025-06")).toBe(10);
  });
});

// ── isInForce ────────────────────────────────────────────────

describe("isInForce", () => {
  it("starts at the first cost entry", () => {
    expect(isInForce(RAISED, "2024-12")).toBe(false);
    expect(isInForce(RAISED, "2025-01")).toBe(true);
  });

  it("ends at validTo when set", () => {
    const d = doc({ validTo: "2026-03" });
    expect(isInForce(d, "2026-03")).toBe(true);
    expect(isInForce(d, "2026-04")).toBe(false);
  });

  it("drops out from archivedFrom onwards, stays in force before", () => {
    const d = doc({ isArchived: true, archivedFrom: "2026-02" });
    expect(isInForce(d, "2026-01")).toBe(true);
    expect(isInForce(d, "2026-02")).toBe(false);
  });

  it("is never in force when archived without a date", () => {
    expect(isInForce(doc({ isArchived: true }), "2026-01")).toBe(false);
  });
});

// ── costTimeline ─────────────────────────────────────────────

describe("costTimeline", () => {
  it("sums normalized costs and reflects raises from their month", () => {
    const docs = [
      RAISED,
      doc({ id: "rec_2", frequency: "yearly", costs: [{ validFrom: "2025-01", amount: 120, amountPLN: 120 }] }),
    ];
    expect(costTimeline(docs, ["2025-12", "2026-01"])).toEqual([
      { month: "2025-12", total: 43 + 10 },
      { month: "2026-01", total: 49.5 + 10 },
    ]);
  });

  it("excludes docs outside their validity window", () => {
    const docs = [doc({ isArchived: true, archivedFrom: "2026-01" })];
    expect(costTimeline(docs, ["2025-12", "2026-01"])).toEqual([
      { month: "2025-12", total: 43 },
      { month: "2026-01", total: 0 },
    ]);
  });
});

// ── priceChanges ─────────────────────────────────────────────

describe("priceChanges", () => {
  it("extracts raises with pct and normalized monthly delta", () => {
    const changes = priceChanges([RAISED]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      description: "Netflix", validFrom: "2026-01",
      fromAmount: 43, toAmount: 49.5, monthlyDelta: 6.5,
    });
    expect(changes[0].deltaPct).toBeCloseTo(15.12, 1);
  });

  it("normalizes the delta for non-monthly frequencies", () => {
    const yearly = doc({
      frequency: "yearly",
      costs: [
        { validFrom: "2025-01", amount: 1200, amountPLN: 1200 },
        { validFrom: "2026-01", amount: 1440, amountPLN: 1440 },
      ],
    });
    expect(priceChanges([yearly])[0].monthlyDelta).toBe(20);   // +240 / 12
  });

  it("includes decreases and skips no-op entries", () => {
    const d = doc({
      costs: [
        { validFrom: "2025-01", amount: 50, amountPLN: 50 },
        { validFrom: "2025-06", amount: 50, amountPLN: 50 },   // no-op
        { validFrom: "2026-01", amount: 40, amountPLN: 40 },   // decrease
      ],
    });
    const changes = priceChanges([d]);
    expect(changes).toHaveLength(1);
    expect(changes[0].monthlyDelta).toBe(-10);
  });

  it("sorts newest change first across docs", () => {
    const other = doc({
      id: "rec_2", description: "Spotify",
      costs: [
        { validFrom: "2025-01", amount: 20, amountPLN: 20 },
        { validFrom: "2026-05", amount: 24, amountPLN: 24 },
      ],
    });
    expect(priceChanges([RAISED, other]).map(c => c.description)).toEqual(["Spotify", "Netflix"]);
  });
});

describe("changesInRange", () => {
  it("keeps only changes starting inside the window", () => {
    const changes = priceChanges([RAISED]);   // validFrom 2026-01
    expect(changesInRange(changes, ["2025-11", "2025-12"])).toHaveLength(0);
    expect(changesInRange(changes, ["2025-12", "2026-01", "2026-02"])).toHaveLength(1);
    expect(changesInRange(changes, [])).toHaveLength(0);
  });
});

// ── subscriptionRows ─────────────────────────────────────────

describe("subscriptionRows", () => {
  it("builds rows sorted by monthly cost with annual totals", () => {
    const docs = [
      doc({ id: "small", description: "Spotify", costs: [{ validFrom: "2025-01", amount: 20, amountPLN: 20 }] }),
      RAISED,
    ];
    const rows = subscriptionRows(docs, "2026-06");
    expect(rows.map(r => r.description)).toEqual(["Netflix", "Spotify"]);
    expect(rows[0]).toMatchObject({ monthlyCost: 49.5, annualCost: 594 });
  });

  it("reports price drift vs the first entry, null when unchanged", () => {
    const rows = subscriptionRows([RAISED, doc({ id: "flat" })], "2026-06");
    expect(rows.find(r => r.id === "rec_1")?.sinceFirstPct).toBeCloseTo(15.12, 1);
    expect(rows.find(r => r.id === "flat")?.sinceFirstPct).toBeNull();
  });

  it("excludes docs not in force at the month", () => {
    const rows = subscriptionRows([doc({ validTo: "2026-01" })], "2026-06");
    expect(rows).toHaveLength(0);
  });

  it("caps the annual cost of an installment at its remaining payments", () => {
    // 533/month, ends 2026-08 → June forward: 3 payments left, not 12.
    const installment = doc({
      validTo: "2026-08",
      costs: [{ validFrom: "2026-05", amount: 533, amountPLN: 533 }],
    });
    const [row] = subscriptionRows([installment], "2026-06");
    expect(row.annualCost).toBe(1599);
    expect(row.endsAt).toBe("2026-08");
  });

  it("keeps endsAt null for open-ended obligations", () => {
    const [row] = subscriptionRows([doc({})], "2026-06");
    expect(row.endsAt).toBeNull();
    expect(row.annualCost).toBe(43 * 12);
  });

  it("picks up already-recorded future raises inside the horizon", () => {
    const raisedAhead = doc({
      costs: [
        { validFrom: "2026-01", amount: 40, amountPLN: 40 },
        { validFrom: "2026-10", amount: 50, amountPLN: 50 },
      ],
    });
    const [row] = subscriptionRows([raisedAhead], "2026-06");
    expect(row.annualCost).toBe(4 * 40 + 8 * 50);   // 06–09 old price, 10→ new
  });
});
