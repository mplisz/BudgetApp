// @vitest-environment jsdom
// ============================================================
// Tests for the discount/quantity math in useDiscount — the
// per-order vs per-unit net calculation and the discount caps that
// stop a discount from exceeding the price.
// ============================================================

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiscount } from "./useDiscount";

describe("useDiscount — effectiveAmount without discount", () => {
  it("is unit price × qty, rounded", () => {
    const { result } = renderHook(() => useDiscount());
    expect(result.current.effectiveAmount("50")).toBe("50");
    act(() => result.current.setQty(3));
    expect(result.current.effectiveAmount("50")).toBe("150");
  });

  it("is empty for a zero/blank price", () => {
    const { result } = renderHook(() => useDiscount());
    expect(result.current.effectiveAmount("")).toBe("");
    expect(result.current.effectiveAmount("0")).toBe("");
  });
});

describe("useDiscount — summary (per_order)", () => {
  it("subtracts a single discount from gross × qty", () => {
    const { result } = renderHook(() => useDiscount());
    act(() => result.current.setGross("50"));
    act(() => result.current.setQty(2));
    act(() => result.current.toggle("", "")); // open (no prefill, gross already set)
    act(() => result.current.setDiscount("30"));

    const s = result.current.summary!;
    expect(s.grossTotal).toBe(100);
    expect(s.net).toBe(70);
    expect(s.pct).toBe(30);
    expect(result.current.effectiveAmount("ignored")).toBe("70");
  });
});

describe("useDiscount — summary (per_unit)", () => {
  it("multiplies the per-piece discount by qty", () => {
    const { result } = renderHook(() => useDiscount());
    act(() => result.current.setGross("50"));
    act(() => result.current.setQty(2));
    act(() => result.current.setDiscountMode("per_unit"));
    act(() => result.current.toggle("", ""));
    act(() => result.current.setDiscount("10"));

    const s = result.current.summary!;
    expect(s.grossTotal).toBe(100);
    expect(s.net).toBe(80);     // 100 − (10 × 2)
    expect(s.pct).toBe(20);
  });
});

describe("useDiscount — discount caps", () => {
  it("per_order: caps the discount just below gross × qty", () => {
    const { result } = renderHook(() => useDiscount());
    act(() => result.current.setGross("50"));
    act(() => result.current.toggle("", ""));   // qty 1
    act(() => result.current.setDiscount("100")); // way over
    expect(result.current.discountAmount).toBe("49.99");
  });

  it("per_unit: caps the per-piece discount just below the unit price", () => {
    const { result } = renderHook(() => useDiscount());
    act(() => result.current.setGross("50"));
    act(() => result.current.setDiscountMode("per_unit"));
    act(() => result.current.toggle("", ""));
    act(() => result.current.setDiscount("100"));
    expect(result.current.discountAmount).toBe("49.99");
  });
});

describe("useDiscount — setQty", () => {
  it("clamps to an integer >= 1", () => {
    const { result } = renderHook(() => useDiscount());
    act(() => result.current.setQty(0));
    expect(result.current.qty).toBe(1);
    act(() => result.current.setQty(3.9));
    expect(result.current.qty).toBe(3);
  });
});

describe("useDiscount — toggle prefill", () => {
  it("pre-fills gross from amountOrig when enabling with empty gross", () => {
    const { result } = renderHook(() => useDiscount());
    act(() => result.current.toggle("42", ""));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.amountGross).toBe("42");
  });
});
