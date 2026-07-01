// ============================================================
// Characterization tests for the return (zwrot) money math.
// These guard the riskiest correctness paths — a wrong number here
// means real money mis-tracked. No production code is exercised
// beyond these pure functions.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateTotalReturned,
  calculateTotalCashReturned,
  calculateTotalVoucherReturned,
  calculateCashReturnedInMonth,
  calculateEffectiveAmount,
  calculateNetAmount,
  isFullyReturned,
  isPartiallyReturned,
  remainingToReturn,
  canAddReturn,
  getReturnMonthBounds,
  isReturnMonthAllowed,
  isCrossMonthReturn,
  buildReturnTransferPayload,
  returnSummaryLabel,
} from "./returnUtils";

// Minimal transaction factory — only the fields the math reads.
type Ret = {
  amount: number; cashAmount?: number; voucherAmount?: number;
  moneyReturnedInMonth?: string;
};
function tx(over: Partial<{ amount: number; netAmount: number; budgetMonth: string; isDeleted: boolean; returns: Ret[]; id: string; categoryName: string; subcategoryName: string }> = {}) {
  return { amount: 100, budgetMonth: "2026-03", returns: [], ...over } as any;
}

describe("return totals", () => {
  it("sum to 0 when there are no returns", () => {
    expect(calculateTotalReturned(tx())).toBe(0);
    expect(calculateTotalCashReturned(tx())).toBe(0);
    expect(calculateTotalVoucherReturned(tx())).toBe(0);
  });

  it("tolerate a missing returns array", () => {
    expect(calculateTotalReturned({ amount: 50 } as any)).toBe(0);
  });

  it("sum amount / cash / voucher across entries (missing parts = 0)", () => {
    const t = tx({ returns: [
      { amount: 30, cashAmount: 20, voucherAmount: 10, moneyReturnedInMonth: "2026-03" },
      { amount: 15, cashAmount: 15,                    moneyReturnedInMonth: "2026-04" },
    ] });
    expect(calculateTotalReturned(t)).toBe(45);
    expect(calculateTotalCashReturned(t)).toBe(35);
    expect(calculateTotalVoucherReturned(t)).toBe(10);
  });
});

describe("calculateCashReturnedInMonth", () => {
  it("counts only cash returned in the given month", () => {
    const t = tx({ returns: [
      { amount: 30, cashAmount: 20, moneyReturnedInMonth: "2026-03" },
      { amount: 10, cashAmount: 10, moneyReturnedInMonth: "2026-04" },
      { amount: 5,  cashAmount: 5,  moneyReturnedInMonth: "2026-03" },
    ] });
    expect(calculateCashReturnedInMonth(t, "2026-03")).toBe(25);
    expect(calculateCashReturnedInMonth(t, "2026-04")).toBe(10);
    expect(calculateCashReturnedInMonth(t, "2026-05")).toBe(0);
  });
});

describe("calculateEffectiveAmount", () => {
  it("subtracts only same-month cash returns", () => {
    const t = tx({ amount: 100, returns: [
      { amount: 30, cashAmount: 30, moneyReturnedInMonth: "2026-03" },
    ] });
    expect(calculateEffectiveAmount(t, "2026-03")).toBe(70);
    // a different month is unaffected
    expect(calculateEffectiveAmount(t, "2026-04")).toBe(100);
  });

  it("ignores voucher returns (they are separate assets)", () => {
    const t = tx({ amount: 100, returns: [
      { amount: 40, voucherAmount: 40, moneyReturnedInMonth: "2026-03" },
    ] });
    expect(calculateEffectiveAmount(t, "2026-03")).toBe(100);
  });

  it("uses netAmount as the base when present", () => {
    const t = tx({ amount: 100, netAmount: 80, returns: [
      { amount: 10, cashAmount: 10, moneyReturnedInMonth: "2026-03" },
    ] });
    expect(calculateEffectiveAmount(t, "2026-03")).toBe(70);
  });

  it("never goes below zero", () => {
    const t = tx({ amount: 50, returns: [
      { amount: 80, cashAmount: 80, moneyReturnedInMonth: "2026-03" },
    ] });
    expect(calculateEffectiveAmount(t, "2026-03")).toBe(0);
  });
});

describe("calculateNetAmount", () => {
  it("subtracts cash returns from ANY month (unlike effectiveAmount)", () => {
    const t = tx({ amount: 100, budgetMonth: "2026-03", returns: [
      { amount: 90, cashAmount: 90, moneyReturnedInMonth: "2026-04" },  // cross-month
    ] });
    // effectiveAmount for the purchase month ignores the cross-month return…
    expect(calculateEffectiveAmount(t, "2026-03")).toBe(100);
    // …but net cost reflects it — this is what category sums use.
    expect(calculateNetAmount(t)).toBe(10);
  });

  it("sums same-month and cross-month cash returns", () => {
    const t = tx({ amount: 100, returns: [
      { amount: 30, cashAmount: 30, moneyReturnedInMonth: "2026-03" },
      { amount: 20, cashAmount: 20, moneyReturnedInMonth: "2026-05" },
    ] });
    expect(calculateNetAmount(t)).toBe(50);
  });

  it("ignores voucher returns (cash only)", () => {
    const t = tx({ amount: 100, returns: [
      { amount: 40, voucherAmount: 40, moneyReturnedInMonth: "2026-04" },
    ] });
    expect(calculateNetAmount(t)).toBe(100);
  });

  it("uses netAmount as the base and never goes below zero", () => {
    const t = tx({ amount: 100, netAmount: 80, returns: [
      { amount: 200, cashAmount: 200, moneyReturnedInMonth: "2026-09" },
    ] });
    expect(calculateNetAmount(t)).toBe(0);
  });
});

describe("status flags", () => {
  it("isFullyReturned at and beyond the full amount", () => {
    expect(isFullyReturned(tx({ amount: 100, returns: [{ amount: 100 }] }))).toBe(true);
    expect(isFullyReturned(tx({ amount: 100, returns: [{ amount: 120 }] }))).toBe(true);
    expect(isFullyReturned(tx({ amount: 100, returns: [{ amount: 99 }] }))).toBe(false);
  });

  it("isPartiallyReturned only strictly between 0 and amount", () => {
    expect(isPartiallyReturned(tx({ amount: 100, returns: [{ amount: 40 }] }))).toBe(true);
    expect(isPartiallyReturned(tx({ amount: 100, returns: [] }))).toBe(false);
    expect(isPartiallyReturned(tx({ amount: 100, returns: [{ amount: 100 }] }))).toBe(false);
  });
});

describe("remainingToReturn", () => {
  it("returns the unreturned remainder", () => {
    expect(remainingToReturn(tx({ amount: 100, returns: [{ amount: 30 }] }))).toBe(70);
  });
  it("floors at zero when over-returned", () => {
    expect(remainingToReturn(tx({ amount: 100, returns: [{ amount: 130 }] }))).toBe(0);
  });
  it("rounds to 2 decimals (no float drift)", () => {
    expect(remainingToReturn(tx({ amount: 100, returns: [{ amount: 33.333 }] }))).toBe(66.67);
  });
});

describe("canAddReturn", () => {
  it("false for a deleted transaction", () => {
    expect(canAddReturn(tx({ isDeleted: true }))).toBe(false);
  });
  it("false when nothing remains", () => {
    expect(canAddReturn(tx({ amount: 100, returns: [{ amount: 100 }] }))).toBe(false);
  });
  it("true while something remains", () => {
    expect(canAddReturn(tx({ amount: 100, returns: [{ amount: 99 }] }))).toBe(true);
  });
});

describe("isCrossMonthReturn", () => {
  it("true when return month differs from the purchase month", () => {
    expect(isCrossMonthReturn(tx({ budgetMonth: "2026-03" }), "2026-04")).toBe(true);
  });
  it("false when they match", () => {
    expect(isCrossMonthReturn(tx({ budgetMonth: "2026-03" }), "2026-03")).toBe(false);
  });
});

describe("getReturnMonthBounds", () => {
  afterEach(() => vi.useRealTimers());

  it("current month + one month back, no upper limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // March 2026 (month is 0-indexed)
    const b = getReturnMonthBounds();
    expect(b.currentMonth).toBe("2026-03");
    expect(b.minMonth).toBe("2026-02");
    expect(b.maxMonth).toBeNull();
  });

  it("wraps the year when current month is January", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10)); // January 2026
    const b = getReturnMonthBounds();
    expect(b.currentMonth).toBe("2026-01");
    expect(b.minMonth).toBe("2025-12");
  });
});

describe("isReturnMonthAllowed", () => {
  it("respects an explicit minimum (no upper limit)", () => {
    expect(isReturnMonthAllowed("2026-02", "2026-02")).toBe(true);
    expect(isReturnMonthAllowed("2026-01", "2026-02")).toBe(false);
    expect(isReturnMonthAllowed("2030-01", "2026-02")).toBe(true); // far future allowed
  });
});

describe("buildReturnTransferPayload", () => {
  it("builds a TRANSFER linked back to the source transaction", () => {
    const p = buildReturnTransferPayload({
      tx: tx({ id: "tx_1", categoryName: "Elektronika", subcategoryName: "Telefon" }),
      cashAmount: 42,
      moneyReturnedInMonth: "2026-04",
      returnedAt: "2026-04-05",
      reason: "uszkodzony",
    });
    expect(p.type).toBe("TRANSFER");
    expect(p.amount).toBe(42);
    expect(p.budgetMonth).toBe("2026-04");
    expect(p.date).toBe("2026-04-05");
    expect(p.sourceTransactionId).toBe("tx_1");
    expect(p.description).toBe("Zwrot: Elektronika › Telefon — uszkodzony");
  });

  it("omits the reason suffix when no reason is given", () => {
    const p = buildReturnTransferPayload({
      tx: tx({ categoryName: "Jedzenie", subcategoryName: "Restauracje" }),
      cashAmount: 10,
      moneyReturnedInMonth: "2026-04",
      returnedAt: "2026-04-05",
      reason: "",
    });
    expect(p.description).toBe("Zwrot: Jedzenie › Restauracje");
  });
});

describe("returnSummaryLabel", () => {
  it("lists cash and voucher parts with the month and reason", () => {
    expect(returnSummaryLabel({
      amount: 30, cashAmount: 20, voucherAmount: 10,
      moneyReturnedInMonth: "2026-03", reason: "rozmiar",
    })).toBe("2026-03: 20 PLN gotówka + 10 PLN voucher (rozmiar)");
  });

  it("shows only the cash part when there is no voucher", () => {
    expect(returnSummaryLabel({
      amount: 20, cashAmount: 20, voucherAmount: 0,
      moneyReturnedInMonth: "2026-03",
    })).toBe("2026-03: 20 PLN gotówka");
  });
});
