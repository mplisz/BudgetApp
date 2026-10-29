import { describe, it, expect } from "vitest";
import { budgetGap, isHardGap, projectedCost } from "./budgetGaps";

const gap = (limit: number | null, spent = 0, plannedOpen = 0, recurringOpen = 0, average?: number) =>
  budgetGap({ limit, spent, plannedOpen, recurringOpen, average });

describe("budgetGap", () => {
  it("is short when what the month committed exceeds the limit", () => {
    expect(gap(300, 120, 1200, 0)).toEqual({ kind: "short", committed: 1320, shortBy: 1020 });
  });

  it("counts recurring and planned only while still open, so a limit that covers them is fine", () => {
    expect(gap(1500, 0, 0, 1500)).toBeNull();
    expect(gap(1400, 0, 0, 1500)).toMatchObject({ kind: "short", shortBy: 100 });
  });

  it("flags a category with costs and no limit at all", () => {
    expect(gap(null, 0, 500)).toEqual({ kind: "noBase", committed: 500, shortBy: 500 });
    expect(gap(null)).toBeNull();
  });

  it("treats a limit of 0 as a real limit", () => {
    expect(gap(0, 40)).toMatchObject({ kind: "short", shortBy: 40 });
  });

  it("warns softly when the limit sits clearly under the yearly average", () => {
    expect(gap(2000, 0, 0, 0, 2600)).toEqual({ kind: "belowAverage", average: 2600, shortBy: 600 });
  });

  it("stays quiet near the average and for small amounts", () => {
    expect(gap(2300, 0, 0, 0, 2600)).toBeNull();   // within 15%
    expect(gap(60, 0, 0, 0, 100)).toBeNull();      // 40 zł under
  });

  it("a hard gap wins over a soft one", () => {
    expect(gap(100, 500, 0, 0, 2600)?.kind).toBe("short");
  });

  it("projectedCost is the limit until the commitments outgrow it", () => {
    expect(projectedCost(2500, { spent: 640, plannedOpen: 0, recurringOpen: 0 })).toBe(2500);
    expect(projectedCost(300, { spent: 120, plannedOpen: 1200, recurringOpen: 0 })).toBe(1320);
    expect(projectedCost(null, { spent: 0, plannedOpen: 500, recurringOpen: 0 })).toBe(500);
    expect(projectedCost(null, { spent: 0, plannedOpen: 0, recurringOpen: 0 })).toBe(0);
  });

  it("isHardGap tells red from amber", () => {
    expect(isHardGap(gap(300, 400))).toBe(true);
    expect(isHardGap(gap(2000, 0, 0, 0, 2600))).toBe(false);
    expect(isHardGap(null)).toBe(false);
  });
});
