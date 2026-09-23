// ============================================================
// File: src/components/panels/shoppingComponents/PriceHint.test.ts
// Which shelf price the collapsed summary names as "widziane od".
// Mirrors the cheapestSeen tests in backend/utils/shoppingPrices.test.js.
// ============================================================

import { describe, expect, test } from "vitest";
import { cheapestSeen, packageSizes, perUnitPrice } from "./PriceHint";

const d = "2026-09-18";

describe("cheapestSeen", () => {
  test("per kilogram when every offer has a size in the same unit", () => {
    // 5,49 for 250 g is 21,96 zł/kg; 4,49 for 200 g is 22,45 zł/kg.
    const seen = [
      { i: "1", d, a: 4.49, s: "Lidl",   z: 200, zu: "g" },
      { i: "2", d, a: 5.49, s: "Auchan", z: 250, zu: "g" },
    ];
    expect(cheapestSeen(seen)?.s).toBe("Auchan");
  });

  test("by amount once one offer has no size", () => {
    const seen = [
      { i: "1", d, a: 4.49, s: "Lidl" },
      { i: "2", d, a: 5.49, s: "Auchan", z: 250, zu: "g" },
    ];
    expect(cheapestSeen(seen)?.s).toBe("Lidl");
  });

  test("by amount when the units differ", () => {
    const seen = [
      { i: "1", d, a: 4.49, s: "Lidl",   z: 200, zu: "g" },
      { i: "2", d, a: 5.49, s: "Auchan", z: 2,   zu: "szt" },
    ];
    expect(cheapestSeen(seen)?.s).toBe("Lidl");
  });

  test("nothing seen → null", () => {
    expect(cheapestSeen([])).toBeNull();
  });
});

describe("the usual price per litre / kilogram", () => {
  const obs = (i: string, a: number, z?: number, zu?: string) => ({ i, d, a, u: "szt", ...(z ? { z, zu } : {}) });

  test("one package size → the median restated per litre", () => {
    // Coca-Cola 1,75 l at 6,99 zł is 3,99 zł/l.
    const { common } = packageSizes([obs("1", 6.99, 1750, "ml"), obs("2", 6.99), obs("3", 7.49, 1750, "ml")]);
    expect(common).toEqual({ size: 1750, unit: "ml" });
    expect(perUnitPrice(6.99, "szt", common)).toBeCloseTo(3.994, 3);
  });

  test("mixed package sizes → no common size, so nothing to restate", () => {
    const sizes = packageSizes([obs("1", 4.49, 200, "g"), obs("2", 5.49, 250, "g")]);
    expect(sizes).toEqual({ common: null, mixed: true });
    expect(perUnitPrice(4.99, "szt", sizes.common)).toBeNull();
  });

  test("a weighed product is already per kilogram", () => {
    expect(perUnitPrice(12.99, "kg", { size: 1000, unit: "g" })).toBeNull();
  });

  test("a single piece already is the unit price; a pack of ten is not", () => {
    expect(perUnitPrice(3.5, "szt", { size: 1, unit: "szt" })).toBeNull();
    expect(perUnitPrice(15, "szt", { size: 10, unit: "szt" })).toBeCloseTo(1.5, 5);
  });
});
