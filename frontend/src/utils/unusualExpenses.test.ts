import { describe, it, expect } from "vitest";
import {
  findUnusualExpenses, formatMultiplier, percentile, unusualTitle, unusualMonthStats, unusualTrend,
  type UnusualSourceTx,
} from "./unusualExpenses";

let seq = 0;
const tx = (amount: number, sub: string, cat: string, extra: Partial<UnusualSourceTx> = {}): UnusualSourceTx =>
  ({ id: `t${++seq}`, type: "EXPENSE", amount, subcategoryId: sub, categoryId: cat, ...extra });

// Past months: cinema ~60 zł (norm 65), groceries ~120 zł (norm 125).
const history = [
  tx(55, "kino", "rozrywka"), tx(60, "kino", "rozrywka"), tx(70, "kino", "rozrywka"),
  tx(110, "spozywcze", "zakupy"), tx(120, "spozywcze", "zakupy"), tx(130, "spozywcze", "zakupy"),
  tx(40, "slodycze", "zakupy"), tx(5, "slodycze", "zakupy"), tx(6, "slodycze", "zakupy"),
];

describe("percentile", () => {
  it("interpolates like PERCENTILE.INC", () => {
    expect(percentile([55, 60, 70], 0.75)).toBe(65);
    expect(percentile([20, 30, 40, 260], 0.75)).toBe(95);
    expect(percentile([7], 0.75)).toBe(7);
    expect(percentile([30, 10, 20], 0.5)).toBe(20);   // unsorted input
  });
});

describe("findUnusualExpenses", () => {
  it("compares with the subcategory's norm (75th percentile), not a flat threshold", () => {
    const imax    = tx(180, "kino", "rozrywka");
    const grocery = tx(180, "spozywcze", "zakupy");
    const found = findUnusualExpenses([imax, grocery], history, 2);
    expect(found.get(imax.id)).toMatchObject({ typical: 65, source: "subcategory", basis: 3 });
    expect(found.get(imax.id)?.ratio).toBeCloseTo(2.77, 2);
    expect(found.has(grocery.id)).toBe(false);   // 1,4× groceries is a normal big shop
  });

  it("small top-ups don't drag the grocery norm down (the 17 zł median case)", () => {
    const topUps = [12, 13, 14, 15, 16, 17, 17, 17, 18, 19, 20, 21].map(a => tx(a, "spoz", "zakupy"));
    const shops  = [110, 130, 150, 180, 210, 240].map(a => tx(a, "spoz", "zakupy"));
    const normalShop = tx(110.33, "spoz", "zakupy");
    const bigShop    = tx(500, "spoz", "zakupy");
    const found = findUnusualExpenses([normalShop, bigShop], [...topUps, ...shops], 2);
    expect(found.has(normalShop.id)).toBe(false);          // was "6,5× zwykle (17,10 zł)"
    expect(found.get(bigShop.id)).toMatchObject({ typical: 125, ratio: 4 });
  });

  it("respects the multiplier", () => {
    const imax = tx(180, "kino", "rozrywka");
    expect(findUnusualExpenses([imax], history, 2.5).has(imax.id)).toBe(true);
    expect(findUnusualExpenses([imax], history, 3).has(imax.id)).toBe(false);
  });

  it("ignores anything under 100 zł, however far above its norm", () => {
    const sweets = tx(38, "slodycze", "zakupy");
    expect(findUnusualExpenses([sweets], history, 1.5).size).toBe(0);
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
    expect(findUnusualExpenses([imax], hist, 2).get(imax.id)?.typical).toBe(65);
  });

  it("falls back to the category when the subcategory has too little history", () => {
    const shoes = tx(300, "buty-zimowe", "zakupy");   // zakupy: 5,6,40,110,120,130 → p75 117,5
    const info = findUnusualExpenses([shoes], history, 2).get(shoes.id);
    expect(info?.source).toBe("category");
    expect(info?.typical).toBe(117.5);
  });

  it("falls back to the month's own expenses when the category is new too", () => {
    const month = [tx(20, "a", "nowa"), tx(30, "b", "nowa"), tx(40, "c", "nowa"), tx(260, "rower", "nowa")];
    const bike = month[3];
    const info = findUnusualExpenses(month, [], 2).get(bike.id);
    expect(info).toMatchObject({ source: "month", typical: 95, basis: 4 });
  });

  it("has no norm at all with no history and a near-empty month", () => {
    const lone = tx(500, "x", "y");
    expect(findUnusualExpenses([lone], [], 2).size).toBe(0);
  });
});

describe("receipt lines", () => {
  const receipt = (sub: string, ...lines: Array<[string, number]>) =>
    tx(lines.reduce((s, [, a]) => s + a, 0), sub, "zakupy", { lineItems: lines.map(([description, amount]) => ({ description, amount })) });

  // Past receipts: grocery lines 3,4,6,8,9,12,25 zł → norm (p75) 10,5 zł.
  const pastReceipts = [
    receipt("spoz", ["Mleko", 4], ["Chleb", 6], ["Masło", 8], ["Ser", 12]),
    receipt("spoz", ["Jogurt", 3], ["Kawa", 25], ["Jabłka", 9]),
  ];

  it("a big shop of ordinary items is not unusual, however many lines it has", () => {
    const bigShop = receipt("spoz", ...Array.from({ length: 30 }, (_, i) => [`Produkt ${i}`, 10] as [string, number]));
    expect(bigShop.amount).toBe(300);
    expect(findUnusualExpenses([bigShop], pastReceipts, 2).size).toBe(0);
  });

  it("one expensive line among cheap ones is flagged, and named", () => {
    const shop = receipt("spoz", ...Array.from({ length: 19 }, (_, i) => [`Drobiazg ${i}`, 5] as [string, number]), ["Wino Château", 149]);
    const info = findUnusualExpenses([shop], pastReceipts, 2).get(shop.id);
    expect(info).toMatchObject({ kind: "line", item: "Wino Château", amount: 149, typical: 10.5, source: "subcategory" });
    expect(info?.ratio).toBeCloseTo(14.19, 2);
  });

  it("reports the most unusual line when several qualify", () => {
    const shop = receipt("spoz", ["Ekspres", 900], ["Szynka", 120], ["Chleb", 6]);
    expect(findUnusualExpenses([shop], pastReceipts, 2).get(shop.id)?.item).toBe("Ekspres");
  });

  it("lines are never compared with hand-typed totals, and vice versa", () => {
    const typedTotals = [tx(180, "spoz", "zakupy"), tx(200, "spoz", "zakupy"), tx(220, "spoz", "zakupy")];
    const typed = tx(230, "spoz", "zakupy");          // an ordinary typed-in shop
    const found = findUnusualExpenses([typed], [...pastReceipts, ...typedTotals], 2);
    expect(found.has(typed.id)).toBe(false);          // 230 vs totals' norm 210, not vs 10,5 zł lines

    const scanned = receipt("spoz", ["Wołowina", 150], ["Chleb", 6]);
    expect(findUnusualExpenses([scanned], [...pastReceipts, ...typedTotals], 2).get(scanned.id))
      .toMatchObject({ kind: "line", typical: 10.5 });  // vs lines, not the 200 zł totals
  });

  it("a single line is the transaction's total, not a breakdown", () => {
    const single = tx(400, "kino", "rozrywka", { lineItems: [{ description: "Bilety", amount: 400 }] });
    expect(findUnusualExpenses([single], history, 2).get(single.id)).toMatchObject({ kind: "total", typical: 65 });
  });

  it("negative lines (discounts, deposit refunds) are ignored", () => {
    const shop = receipt("spoz", ["Zgrzewka wody", 130], ["Rabat", -20], ["Kaucja zwrot", -5]);
    const info = findUnusualExpenses([shop], pastReceipts, 2).get(shop.id);
    expect(info).toMatchObject({ item: "Zgrzewka wody", amount: 130 });
  });

  it("stats count the flagged line, not the whole receipt", () => {
    const shop = receipt("spoz", ...Array.from({ length: 10 }, (_, i) => [`P${i}`, 10] as [string, number]), ["Wino", 150]);
    const stats = unusualMonthStats("2026-09", [shop], findUnusualExpenses([shop], pastReceipts, 2));
    expect(stats).toMatchObject({ count: 1, total: 150, excess: 139.5, expenses: 250 });
  });
});

describe("unusualMonthStats / unusualTrend", () => {
  const at = (month: string, amount: number, sub = "kino", extra: Partial<UnusualSourceTx> = {}) =>
    ({ ...tx(amount, sub, "rozrywka", extra), budgetMonth: month });

  it("sums count, total, excess and share of the month's expenses", () => {
    const imax = at("2026-09", 180);
    const month = [imax, at("2026-09", 20, "x"), { ...at("2026-09", 500), type: "SAVING" }];
    const stats = unusualMonthStats("2026-09", month, findUnusualExpenses(month, history, 2));
    expect(stats).toMatchObject({ count: 1, total: 180, excess: 115, expenses: 200 });
    expect(stats.share).toBeCloseTo(0.9);
  });

  it("judges every trend month against its own previous months", () => {
    const all = [
      at("2026-01", 50), at("2026-02", 60), at("2026-03", 70),   // norm for April: 65
      at("2026-04", 200),                                         // 3,1× → unusual in April
      at("2026-05", 200), at("2026-06", 200),                     // July's norm: p75 of Jan–Jun = 200
      at("2026-07", 210),                                         // 1,05× → not unusual any more
    ];
    const trend = unusualTrend(["2026-04", "2026-07"], all, 2);
    expect(trend.map(t => [t.month, t.count])).toEqual([["2026-04", 1], ["2026-07", 0]]);
  });

  it("a month with no expenses has a zero share, not NaN", () => {
    expect(unusualTrend(["2030-01"], [], 2)[0]).toMatchObject({ count: 0, share: 0 });
  });
});

describe("formatting", () => {
  it("formatMultiplier", () => {
    expect(formatMultiplier(2)).toBe("2×");
    expect(formatMultiplier(2.5)).toBe("2,5×");
    expect(formatMultiplier(3.14159)).toBe("3,1×");
  });

  it("unusualTitle explains what was judged and against what", () => {
    expect(unusualTitle({ typical: 10, basis: 40, source: "subcategory", kind: "line", amount: 149, item: "Wino", ratio: 14.9 }).split("\n")).toEqual([
      "Pozycja: Wino — 149,00 zł",
      "Norma subkategorii: 10,00 zł",
      "75. percentyl z 40 pozycji z paragonów (6 mies.)",
      "14,9× normy · cykliczne się nie liczą",
    ]);
    const total = unusualTitle({ typical: 95, basis: 4, source: "month", kind: "total", amount: 260, ratio: 2.7 });
    expect(total).toContain("Wydatek: 260,00 zł");
    expect(total).toContain("tego miesiąca");
    expect(total).toContain("bez rozbicia");
  });
});
