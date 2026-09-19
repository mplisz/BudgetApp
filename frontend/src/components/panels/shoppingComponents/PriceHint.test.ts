// ============================================================
// File: src/components/panels/shoppingComponents/PriceHint.test.ts
// Which shelf price the collapsed summary names as "widziane od".
// Mirrors the cheapestSeen tests in backend/utils/shoppingPrices.test.js.
// ============================================================

import { describe, expect, test } from "vitest";
import { cheapestSeen } from "./PriceHint";

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
