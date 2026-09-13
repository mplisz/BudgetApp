import { describe, it, expect } from "vitest";
import { findUnusualExpenses, formatMultiplier, unusualTitle, type UnusualSourceTx } from "./unusualExpenses";

let seq = 0;
const tx = (amount: number, sub: string, cat: string, extra: Partial<UnusualSourceTx> = {}): UnusualSourceTx =>
  ({ id: `t${++seq}`, type: "EXPENSE", amount, subcategoryId: sub, categoryId: cat, ...extra });

// Past months: cinema ~60 zł, groceries ~120 zł.
const history = [
  tx(55, "kino", "rozrywka"), tx(60, "kino", "rozrywka"), tx(70, "kino", "rozrywka"),
  tx(110, "spozywcze", "zakupy"), tx(120, "spozywcze", "zakupy"), tx(130, "spozywcze", "zakupy"),
  tx(40, "slodycze", "zakupy"), tx(5, "slodycze", "zakupy"), tx(6, "slodycze", "zakupy"),
];

describe("findUnusualExpenses", () => {
  it("compares with the subcategory's median, not a flat threshold", () => {
    const imax    = tx(180, "kino", "rozrywka");
    const grocery = tx(180, "spozywcze", "zakupy");
    const found = findUnusualExpenses([imax, grocery], history, 2);
    expect(found.get(imax.id)).toMatchObject({ typical: 60, ratio: 3, source: "subcategory", basis: 3 });
    expect(found.has(grocery.id)).toBe(false);   // 1,5× groceries is a normal big shop
  });

  it("respects the multiplier", () => {
    const imax = tx(180, "kino", "rozrywka");
    expect(findUnusualExpenses([imax], history, 3).has(imax.id)).toBe(true);
    expect(findUnusualExpenses([imax], history, 3.5).has(imax.id)).toBe(false);
  });

  it("ignores anything under 100 zł, however far above its norm", () => {
    const sweets = tx(38, "slodycze", "zakupy");   // 6,3× the usual 6 zł
    expect(findUnusualExpenses([sweets], history, 2).size).toBe(0);
  });

  it("never flags recurring, savings or archived transactions", () => {
    const rent    = tx(2400, "kino", "rozrywka", { isRecurring: true });
    const linked  = tx(2400, "kino", "rozrywka", { recurringId: "r1" });
    const saving  = tx(2400, "kino", "rozrywka", { type: "SAVING" });
    const archived = tx(2400, "kino", "rozrywka", { isArchived: true });
    expect(findUnusualExpenses([rent, linked, saving, archived], history, 2).size).toBe(0);
  });

  it("keeps recurring expenses out of the norm too", () => {
    const hist = [...history, tx(900, "kino", "rozrywka", { isRecurring: true }), tx(900, "kino", "rozrywka", { recurringId: "x" })];
    const imax = tx(180, "kino", "rozrywka");
    expect(findUnusualExpenses([imax], hist, 2).get(imax.id)?.typical).toBe(60);
  });

  it("falls back to the category when the subcategory has too little history", () => {
    const shoes = tx(300, "buty-zimowe", "zakupy");   // no own history; zakupy median = 40..130 → 75
    const info = findUnusualExpenses([shoes], history, 2).get(shoes.id);
    expect(info?.source).toBe("category");
    expect(info?.typical).toBe(75);
  });

  it("falls back to the month's median when the category is new too", () => {
    const month = [tx(20, "a", "nowa"), tx(30, "b", "nowa"), tx(40, "c", "nowa"), tx(260, "rower", "nowa")];
    const bike = month[3];
    const info = findUnusualExpenses(month, [], 2).get(bike.id);
    expect(info).toMatchObject({ source: "month", typical: 35, basis: 4 });
  });

  it("has no norm at all with no history and a near-empty month", () => {
    const lone = tx(500, "x", "y");
    expect(findUnusualExpenses([lone], [], 2).size).toBe(0);
  });
});

describe("formatting", () => {
  it("formatMultiplier", () => {
    expect(formatMultiplier(2)).toBe("2×");
    expect(formatMultiplier(2.5)).toBe("2,5×");
    expect(formatMultiplier(3.14159)).toBe("3,1×");
  });

  it("unusualTitle names the norm's source", () => {
    expect(unusualTitle({ typical: 60, basis: 12, source: "subcategory", ratio: 3 }))
      .toBe("Mediana subkategorii z 6 mies.: 60,00 zł (12 wydatków). Cykliczne się nie liczą.");
    expect(unusualTitle({ typical: 35, basis: 4, source: "month", ratio: 7 })).toContain("tego miesiąca");
  });
});
