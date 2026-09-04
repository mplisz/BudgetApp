// ============================================================
// File: src/utils/tagBreakdown.test.ts
// The arithmetic behind "ile kosztował ten wyjazd".
// ============================================================

import { describe, it, expect } from "vitest";
import { summariseTags, buildTagBreakdown, type TagTransaction } from "./tagBreakdown";

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

// ── summariseTags ─────────────────────────────────────────────

describe("summariseTags", () => {
  it("totals per tag with the date span", () => {
    const [row] = summariseTags([
      tx({ amount: 100, date: "2026-07-15" }),
      tx({ amount: 50,  date: "2026-07-12" }),
      tx({ amount: 25,  date: "2026-07-20" }),
    ]);
    expect(row.tagId).toBe("trip");
    expect(row.total).toBe(175);
    expect(row.count).toBe(3);
    expect(row.firstDate).toBe("2026-07-12");
    expect(row.lastDate).toBe("2026-07-20");
  });

  it("counts a multi-tag transaction under each of its tags", () => {
    const rows = summariseTags([tx({ amount: 80, tags: ["trip", "dziecko"] })]);
    expect(rows.map(r => [r.tagId, r.total])).toEqual(
      expect.arrayContaining([["trip", 80], ["dziecko", 80]]),
    );
  });

  it("sorts by spend so trips surface first", () => {
    const rows = summariseTags([
      tx({ amount: 10,   tags: ["mały"] }),
      tx({ amount: 5000, tags: ["wakacje"] }),
    ]);
    expect(rows[0].tagId).toBe("wakacje");
  });

  it("ignores income and untagged expenses", () => {
    expect(summariseTags([
      tx({ type: "INCOME", tags: ["trip"] }),
      tx({ tags: [] }),
      tx({ tags: undefined }),
    ])).toEqual([]);
  });
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

  it("reports the biggest purchase gross, as it appeared on the receipt", () => {
    const out = buildTagBreakdown([
      tx({ amount: 300, description: "Nocleg", date: "2026-07-16", returns: [{ cashAmount: 250 }] }),
      tx({ amount: 100, description: "Obiad",  date: "2026-07-15" }),
    ], "trip");
    expect(out.biggest).toMatchObject({ description: "Nocleg", amount: 300 });
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
    ], "trip");
    expect(out.total).toBe(100);
    expect(out.count).toBe(1);
  });
});
