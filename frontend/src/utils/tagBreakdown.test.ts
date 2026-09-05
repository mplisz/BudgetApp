// ============================================================
// File: src/utils/tagBreakdown.test.ts
// The arithmetic behind "ile kosztował ten wyjazd".
// ============================================================

import { describe, it, expect } from "vitest";
import { buildTagBreakdown, type TagTransaction } from "./tagBreakdown";

const tx = (over: Partial<TagTransaction> = {}): TagTransaction => ({
  type:            "EXPENSE",
  date:            "2026-07-15",
  budgetMonth:     "2026-07",
  amount:          100,
  description:     "Zakup",
  categoryId:      "cat_jedzenie",
  categoryName:    "Jedzenie",
  subcategoryId:   "sub_fastfood",
  subcategoryName: "Fast food",
  merchant:        "Bar",
  tags:            ["trip"],
  ...over,
});

// ── buildTagBreakdown ─────────────────────────────────────────

describe("buildTagBreakdown", () => {
  it("returns a valid empty shape for a tag with nothing behind it", () => {
    const out = buildTagBreakdown([tx()], "nieznany");
    expect(out.total).toBe(0);
    expect(out.count).toBe(0);
    expect(out.firstDate).toBeNull();
    expect(out.categories).toEqual([]);
    expect(out.daily).toEqual([]);
  });

  it("splits by category and subcategory with shares", () => {
    const out = buildTagBreakdown([
      tx({ amount: 60, categoryId: "c1", categoryName: "Jedzenie",  subcategoryId: "s1", subcategoryName: "Fast food" }),
      tx({ amount: 20, categoryId: "c1", categoryName: "Jedzenie",  subcategoryId: "s2", subcategoryName: "Restauracje" }),
      tx({ amount: 20, categoryId: "c2", categoryName: "Rozrywka",  subcategoryId: "s3", subcategoryName: "Pamiątki" }),
    ], "trip");

    expect(out.total).toBe(100);
    expect(out.categories.map(s => [s.name, s.total, s.share])).toEqual([
      ["Jedzenie", 80, 80],
      ["Rozrywka", 20, 20],
    ]);
    expect(out.subcategories[0]).toMatchObject({ name: "Fast food", total: 60, share: 60, count: 1 });
    expect(out.subcategories.map(s => s.name)).toEqual(["Fast food", "Restauracje", "Pamiątki"]);
  });

  it("nets out returns", () => {
    const out = buildTagBreakdown([
      tx({ amount: 100, returns: [{ cashAmount: 40 }] }),
    ], "trip");
    expect(out.total).toBe(60);
  });

  it("keeps paid, returned and net apart so the UI can show the arithmetic", () => {
    const out = buildTagBreakdown([
      tx({ amount: 300, returns: [{ cashAmount: 100 }] }),
      tx({ amount: 200 }),
    ], "trip");
    expect(out.money).toEqual({ paid: 500, returned: 100, net: 400 });
    expect(out.total).toBe(out.money.net);
  });

  it("counts what actually left the account, so a voucher-paid purchase isn't overstated", () => {
    const out = buildTagBreakdown([
      tx({ amount: 200, netAmount: 150 }),   // 50 covered by a voucher
    ], "trip");
    expect(out.money).toEqual({ paid: 150, returned: 0, net: 150 });
  });

  it("reports no return split when nothing came back", () => {
    const out = buildTagBreakdown([tx({ amount: 120 })], "trip");
    expect(out.money).toEqual({ paid: 120, returned: 0, net: 120 });
  });

  it("ranks the biggest purchase by what it ACTUALLY cost", () => {
    // Refunded almost entirely, so despite the bigger sticker price the
    // overnight stay contributed less to the trip than the meal did.
    const out = buildTagBreakdown([
      tx({ amount: 300, description: "Nocleg", date: "2026-07-16", returns: [{ cashAmount: 250 }] }),
      tx({ amount: 100, description: "Obiad",  date: "2026-07-15" }),
    ], "trip");
    expect(out.biggest).toMatchObject({ description: "Obiad", paid: 100, returned: 0, net: 100 });
  });

  it("carries all three figures on the biggest purchase", () => {
    const out = buildTagBreakdown([
      tx({ amount: 400, description: "Hotel", returns: [{ cashAmount: 50 }] }),
    ], "trip");
    expect(out.biggest).toMatchObject({ description: "Hotel", paid: 400, returned: 50, net: 350 });
  });

  it("separates days WITH spend from the calendar span", () => {
    const out = buildTagBreakdown([
      tx({ date: "2026-07-10", amount: 10 }),
      tx({ date: "2026-07-10", amount: 20 }),   // same day
      tx({ date: "2026-07-14", amount: 30 }),
    ], "trip");
    expect(out.spendingDays).toBe(2);
    expect(out.spanDays).toBe(5);              // 10th…14th inclusive
    expect(out.firstDate).toBe("2026-07-10");
    expect(out.lastDate).toBe("2026-07-14");
  });

  it("keeps quiet days in the daily series", () => {
    const out = buildTagBreakdown([
      tx({ date: "2026-07-10", amount: 10 }),
      tx({ date: "2026-07-13", amount: 40 }),
    ], "trip");
    expect(out.daily).toEqual([
      { date: "2026-07-10", amount: 10 },
      { date: "2026-07-11", amount: 0  },
      { date: "2026-07-12", amount: 0  },
      { date: "2026-07-13", amount: 40 },
    ]);
  });

  it("walks a daily series across a month boundary", () => {
    const out = buildTagBreakdown([
      tx({ date: "2026-07-31", amount: 10, budgetMonth: "2026-07" }),
      tx({ date: "2026-08-01", amount: 20, budgetMonth: "2026-08" }),
    ], "trip");
    expect(out.daily.map(d => d.date)).toEqual(["2026-07-31", "2026-08-01"]);
    expect(out.spanDays).toBe(2);
  });

  it("buckets by budget month for the long-range fallback", () => {
    const out = buildTagBreakdown([
      tx({ budgetMonth: "2026-08", date: "2026-08-02", amount: 20 }),
      tx({ budgetMonth: "2026-07", date: "2026-07-31", amount: 10 }),
    ], "trip");
    expect(out.monthly).toEqual([
      { month: "2026-07", amount: 10 },
      { month: "2026-08", amount: 20 },
    ]);
  });

  it("groups merchants and labels the shopless ones", () => {
    // Deliberately unequal totals — the ordering contract is "by spend", and
    // a tie would only assert Map insertion order, which is not the contract.
    const out = buildTagBreakdown([
      tx({ amount: 30, merchant: "Lidl" }),
      tx({ amount: 20, merchant: "Lidl" }),
      tx({ amount: 15, merchant: null }),
      tx({ amount: 15, merchant: "   " }),   // whitespace counts as no shop
    ], "trip");
    expect(out.merchants[0]).toMatchObject({ name: "Lidl", total: 50, count: 2 });
    expect(out.merchants[1]).toMatchObject({ name: "(bez sklepu)", total: 30, count: 2 });
  });

  it("ignores other tags, income and untagged rows", () => {
    const out = buildTagBreakdown([
      tx({ amount: 100 }),
      tx({ amount: 999, tags: ["inny"] }),
      tx({ amount: 999, type: "INCOME" }),
      tx({ amount: 999, tags: [] }),
      tx({ amount: 999, tags: undefined }),
    ], "trip");
    expect(out.total).toBe(100);
    expect(out.count).toBe(1);
  });

  it("counts a multi-tag transaction in full under each of its tags", () => {
    const rows = [tx({ amount: 80, tags: ["trip", "dziecko"] })];
    // No apportioning: the trip cost 80, and so did the child spend. Totals
    // across DIFFERENT tags therefore overlap — which is why the panel only
    // ever shows one tag at a time.
    expect(buildTagBreakdown(rows, "trip").total).toBe(80);
    expect(buildTagBreakdown(rows, "dziecko").total).toBe(80);
  });
});
