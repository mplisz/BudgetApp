import { describe, it, expect } from "vitest";
import { monthTotals, averageOf, monthlyAverages, type TotalsTx } from "./monthTotals";

let seq = 0;
const tx = (month: string, type: string, amount: number, extra: Partial<TotalsTx> = {}): TotalsTx =>
  ({ id: `t${++seq}`, budgetMonth: month, type, amount, categoryId: "cat", subcategoryId: "sub", returns: [], ...extra });

describe("monthTotals", () => {
  it("sums types for the month only, skipping archived", () => {
    const t = monthTotals([
      tx("2026-09", "INCOME", 9000), tx("2026-09", "TRANSFER", 300),
      tx("2026-09", "EXPENSE", 100), tx("2026-09", "SAVING", 500),
      tx("2026-08", "EXPENSE", 999), tx("2026-09", "EXPENSE", 999, { isArchived: true }),
    ], "2026-09");
    expect(t.types).toEqual({ INCOME: 9000, TRANSFER: 300, EXPENSE: 100, SAVING: 500 });
  });

  it("counts returns like Podsumowanie: headline nets same-month cash, categories net all of it", () => {
    const shoes = tx("2026-09", "EXPENSE", 300, {
      returns: [
        { cashAmount: 100, moneyReturnedInMonth: "2026-09" },
        { cashAmount: 50,  moneyReturnedInMonth: "2026-10" },
      ],
    });
    const t = monthTotals([shoes], "2026-09");
    expect(t.types.EXPENSE).toBe(200);
    expect(t.categories.get("cat")).toBe(150);
    expect(t.subcategories.get("sub")).toBe(150);
  });
});

describe("averageOf", () => {
  it("mean and median", () => {
    expect(averageOf([100, 200, 900])).toEqual({ mean: 400, median: 200, months: 3 });
    expect(averageOf([100, 300])).toMatchObject({ median: 200 });
    expect(averageOf([])).toEqual({ mean: 0, median: 0, months: 0 });
  });
});

describe("monthlyAverages", () => {
  const months = ["2026-06", "2026-07", "2026-08"];

  it("leaves out months with no data at all", () => {
    const avg = monthlyAverages([tx("2026-07", "INCOME", 8000), tx("2026-08", "INCOME", 10000)], months);
    expect(avg.months).toEqual(["2026-07", "2026-08"]);
    expect(avg.types.INCOME).toMatchObject({ mean: 9000, months: 2 });
  });

  it("counts a quiet month in a category as zero", () => {
    const avg = monthlyAverages([
      tx("2026-06", "EXPENSE", 300, { categoryId: "kino" }),
      tx("2026-07", "INCOME", 8000),
      tx("2026-08", "INCOME", 8000),
    ], months);
    expect(avg.categories.get("kino")).toEqual({ mean: 100, median: 0, months: 3 });
  });
});
