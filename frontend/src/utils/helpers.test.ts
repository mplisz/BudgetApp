// ============================================================
// Characterization tests for the pure money/date helpers.
// Focus on the arithmetic that feeds amounts and budget months —
// parsing, rounding, limit resolution, recurring activation.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseDecimal,
  round2,
  roundToNearest,
  formatBudgetMonth,
  budgetMonthAfter,
  monthLabel,
  plural,
  getActiveLimit,
  recurringActiveForMonth,
} from "./helpers";

describe("plural", () => {
  const poz = (n: number) => plural(n, "pozycja", "pozycje", "pozycji");

  it("uses the singular only for exactly 1", () => {
    expect(poz(1)).toBe("pozycja");
    expect(poz(0)).toBe("pozycji");
  });
  it("uses the 2-4 form", () => {
    expect(poz(2)).toBe("pozycje");
    expect(poz(4)).toBe("pozycje");
    expect(poz(5)).toBe("pozycji");
  });
  it("keeps the teens on the many form", () => {
    expect(poz(12)).toBe("pozycji");
    expect(poz(13)).toBe("pozycji");
    expect(poz(14)).toBe("pozycji");
  });
  it("returns to the 2-4 form past the teens", () => {
    expect(poz(22)).toBe("pozycje");
    expect(poz(23)).toBe("pozycje");
    expect(poz(102)).toBe("pozycje");
    expect(poz(111)).toBe("pozycji");
  });
});

describe("monthLabel", () => {
  it("renders a budget month in Polish", () => {
    expect(monthLabel("2026-08")).toBe("Sierpień 2026");
    expect(monthLabel("2026-01")).toBe("Styczeń 2026");
    expect(monthLabel("2026-12")).toBe("Grudzień 2026");
  });
  it("returns an empty string when there is nothing to format", () => {
    expect(monthLabel("")).toBe("");
    expect(monthLabel(null)).toBe("");
    expect(monthLabel(undefined)).toBe("");
  });
  it("passes through anything that isn't a parseable YYYY-MM", () => {
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("nonsense")).toBe("nonsense");
  });
});

describe("parseDecimal", () => {
  it("returns empty string for empty/null/undefined", () => {
    expect(parseDecimal("")).toBe("");
    expect(parseDecimal(null)).toBe("");
    expect(parseDecimal(undefined)).toBe("");
  });
  it("accepts both comma and dot decimal separators", () => {
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal("1.5")).toBe(1.5);
    expect(parseDecimal("12,34")).toBe(12.34);
  });
  it("falls back to 0 for non-numeric input", () => {
    expect(parseDecimal("abc")).toBe(0);
  });
});

describe("round2", () => {
  it("rounds to 2 decimals", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
  });
  it("handles the classic IEEE-754 edge cases", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
  it("returns 0 for NaN / non-numbers", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2("5" as unknown as number)).toBe(0);
  });
});

describe("roundToNearest", () => {
  it("rounds up to the nearest multiple", () => {
    expect(roundToNearest(123, 100)).toBe(200);
    expect(roundToNearest(1, 500)).toBe(500);
  });
  it("leaves exact multiples unchanged", () => {
    expect(roundToNearest(100, 100)).toBe(100);
  });
});

describe("formatBudgetMonth", () => {
  it("formats a 0-indexed month as 'YYYY-MM'", () => {
    expect(formatBudgetMonth(0, 2026)).toBe("2026-01");
    expect(formatBudgetMonth(2, 2026)).toBe("2026-03");
    expect(formatBudgetMonth(11, 2026)).toBe("2026-12");
  });
});

describe("budgetMonthAfter", () => {
  it("is strict string comparison of 'YYYY-MM'", () => {
    expect(budgetMonthAfter("2026-04", "2026-03")).toBe(true);
    expect(budgetMonthAfter("2026-03", "2026-03")).toBe(false);
    expect(budgetMonthAfter("2025-12", "2026-01")).toBe(false);
  });
});

describe("getActiveLimit", () => {
  const doc = {
    limits: [
      { type: "base",     date: "2026-01", amount: 500 },
      { type: "base",     date: "2026-03", amount: 600 },
      { type: "override", date: "2026-03", amount: 999 },
    ],
  };

  it("returns null when the doc has no limits", () => {
    expect(getActiveLimit(null, "2026-03")).toBeNull();
    expect(getActiveLimit({ limits: [] }, "2026-03")).toBeNull();
  });
  it("prefers an exact-month override", () => {
    expect(getActiveLimit(doc, "2026-03")).toEqual({ amount: 999, type: "override", date: "2026-03" });
  });
  it("falls back to the highest base on or before the month", () => {
    expect(getActiveLimit(doc, "2026-02")).toEqual({ amount: 500, type: "base", date: "2026-01" });
    expect(getActiveLimit(doc, "2026-05")).toEqual({ amount: 600, type: "base", date: "2026-03" });
  });
  it("returns null when no base is on or before the month", () => {
    expect(getActiveLimit(doc, "2025-12")).toBeNull();
  });
});

describe("recurringActiveForMonth", () => {
  it("monthly is active every month within range", () => {
    expect(recurringActiveForMonth({ frequency: "monthly" }, 5, 2026)).toBe(true);
  });
  it("respects startMonth / endMonth bounds", () => {
    expect(recurringActiveForMonth({ frequency: "monthly", startMonth: "2026-07" }, 5, 2026)).toBe(false); // June < July
    expect(recurringActiveForMonth({ frequency: "monthly", endMonth: "2026-04" }, 5, 2026)).toBe(false);   // June > April
  });
  it("quarterly only on months where (0-indexed) m % 3 === 0", () => {
    expect(recurringActiveForMonth({ frequency: "quarterly" }, 0, 2026)).toBe(true);  // Jan
    expect(recurringActiveForMonth({ frequency: "quarterly" }, 3, 2026)).toBe(true);  // Apr
    expect(recurringActiveForMonth({ frequency: "quarterly" }, 1, 2026)).toBe(false); // Feb
  });
  it("yearly fires on scheduledMonth (1-indexed)", () => {
    expect(recurringActiveForMonth({ frequency: "yearly", scheduledMonth: 3 }, 2, 2026)).toBe(true);  // March
    expect(recurringActiveForMonth({ frequency: "yearly", scheduledMonth: 3 }, 4, 2026)).toBe(false);
  });
  it("custom fires on listed (0-indexed) activeMonths", () => {
    expect(recurringActiveForMonth({ frequency: "custom", activeMonths: [2, 8] }, 2, 2026)).toBe(true);
    expect(recurringActiveForMonth({ frequency: "custom", activeMonths: [2, 8] }, 3, 2026)).toBe(false);
  });
});
