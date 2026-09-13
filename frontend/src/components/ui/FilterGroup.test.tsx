// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterGroups, listSummary, joinSummary } from "./FilterGroup";
import { dateRangeSummary } from "../panels/transactionComponents/DateRangeFilter";

beforeEach(() => localStorage.clear());

describe("useFilterGroups", () => {
  const groups = (catActive: number) => [{ id: "cat", active: catActive }, { id: "date", active: 0 }];

  it("desktop starts with every group open", () => {
    const { result } = renderHook(() => useFilterGroups("t", groups(0), false));
    expect(result.current.isOpen("cat")).toBe(true);
    expect(result.current.isOpen("date")).toBe(true);
  });

  it("mobile starts with only the filtering groups open", () => {
    const { result } = renderHook(() => useFilterGroups("t", groups(1), true));
    expect(result.current.isOpen("cat")).toBe(true);
    expect(result.current.isOpen("date")).toBe(false);
  });

  it("opens a closed group when it becomes active, and never closes it when cleared", () => {
    const { result, rerender } = renderHook(({ n }) => useFilterGroups("t", groups(n), true), { initialProps: { n: 0 } });
    expect(result.current.isOpen("cat")).toBe(false);
    rerender({ n: 2 });
    expect(result.current.isOpen("cat")).toBe(true);
    rerender({ n: 0 });
    expect(result.current.isOpen("cat")).toBe(true);
  });

  it("remembers the user's toggles per panel", () => {
    const first = renderHook(() => useFilterGroups("t", groups(0), true));
    act(() => first.result.current.toggle("date"));
    expect(first.result.current.isOpen("date")).toBe(true);

    const again = renderHook(() => useFilterGroups("t", groups(0), true));
    expect(again.result.current.isOpen("date")).toBe(true);
    const otherPanel = renderHook(() => useFilterGroups("other", groups(0), true));
    expect(otherPanel.result.current.isOpen("date")).toBe(false);
  });
});

describe("summaries", () => {
  it("listSummary shortens long lists", () => {
    expect(listSummary([])).toBe("");
    expect(listSummary(["Alkohol", "Kino"])).toBe("Alkohol, Kino");
    expect(listSummary(["Alkohol", "Kino", "Paliwo", "Media"])).toBe("Alkohol, Kino +2");
  });

  it("joinSummary skips empty parts", () => {
    expect(joinSummary("Wydatki", "", false, null, "Alkohol")).toBe("Wydatki · Alkohol");
  });

  it("dateRangeSummary", () => {
    const d = (day: number) => new Date(2026, 8, day);
    expect(dateRangeSummary(null, null)).toBe("");
    expect(dateRangeSummary(d(3), d(15))).toBe("03.09 – 15.09");
    expect(dateRangeSummary(d(3), d(3))).toBe("03.09");
    expect(dateRangeSummary(d(3), null)).toBe("od 03.09");
    expect(dateRangeSummary(null, d(15))).toBe("do 15.09");
  });
});
