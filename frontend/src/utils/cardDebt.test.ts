import { describe, it, expect } from "vitest";
import {
  addDays, daysBetween, statementWindow,
  cardCharge, cardDebt, debtChangeInMonth, cardStatus, cardsOverview,
} from "./cardDebt";
import type { CardData, CardRepayment, CardTransaction, CreditCard } from "../types/creditCard";

const card = (extra: Partial<CreditCard> = {}): CreditCard =>
  ({ id: "a", name: "Karta", openingBalance: 0, statementDay: 5, graceDays: 26, isArchived: false, ...extra });

let seq = 0;
const buy = (date: string, amount: number, extra: Partial<CardTransaction> = {}): CardTransaction =>
  ({ id: `t${++seq}`, cardId: "a", date, budgetMonth: date.slice(0, 7), amount, returns: [], ...extra });

const repay = (date: string, amount: number, extra: Partial<CardRepayment> = {}): CardRepayment =>
  ({ id: `r${++seq}`, cardId: "a", date, budgetMonth: date.slice(0, 7), amount, ...extra });

const data = (transactions: CardTransaction[] = [], repayments: CardRepayment[] = [], cards = [card()]): CardData =>
  ({ cards, repayments, transactions });

// ── Dates ─────────────────────────────────────────────────────

describe("addDays / daysBetween", () => {
  it("cross month and year boundaries", () => {
    expect(addDays("2026-10-05", 26)).toBe("2026-10-31");
    expect(addDays("2026-12-20", 26)).toBe("2027-01-15");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("count whole days, negative once past — also across a clock change", () => {
    expect(daysBetween("2026-10-09", "2026-10-31")).toBe(22);
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2);
    expect(daysBetween("2026-10-20", "2026-10-30")).toBe(10);   // DST ends 25.10
  });
});

describe("statementWindow", () => {
  it("uses this month's close once the day has come — the day itself included", () => {
    expect(statementWindow(card(), "2026-10-09")).toEqual({
      closeDate: "2026-10-05", previousCloseDate: "2026-09-05", dueDate: "2026-10-31",
    });
    expect(statementWindow(card(), "2026-10-05").closeDate).toBe("2026-10-05");
  });

  it("falls back to last month's close before the day", () => {
    expect(statementWindow(card(), "2026-10-04")).toMatchObject({
      closeDate: "2026-09-05", previousCloseDate: "2026-08-05", dueDate: "2026-10-01",
    });
  });

  it("crosses the year", () => {
    expect(statementWindow(card({ statementDay: 20 }), "2027-01-03")).toMatchObject({
      closeDate: "2026-12-20", previousCloseDate: "2026-11-20", dueDate: "2027-01-15",
    });
  });

  it("clamps a day the month doesn't have", () => {
    const eom = card({ statementDay: 31, graceDays: 0 });
    expect(statementWindow(eom, "2026-03-15")).toMatchObject({ closeDate: "2026-02-28", previousCloseDate: "2026-01-31" });
    expect(statementWindow(eom, "2026-03-31")).toMatchObject({ closeDate: "2026-03-31", previousCloseDate: "2026-02-28" });
  });
});

// ── What a purchase weighs ────────────────────────────────────

describe("cardCharge", () => {
  it("is what the card was charged — after vouchers", () => {
    expect(cardCharge(buy("2026-10-01", 100))).toBe(100);
    expect(cardCharge(buy("2026-10-01", 100, { netAmount: 70 }))).toBe(70);
  });

  it("goes down with a return to the shop, and with one older than `kind`", () => {
    expect(cardCharge(buy("2026-10-01", 100, {
      returns: [
        { amount: 30, cashAmount: 30, moneyReturnedInMonth: "2026-10", kind: "store" },
        { amount: 10, cashAmount: 10, moneyReturnedInMonth: "2026-11" },
      ],
    }))).toBe(60);
  });

  it("ignores money that came back to the account, and store credit", () => {
    expect(cardCharge(buy("2026-10-01", 100, {
      returns: [
        { amount: 40, cashAmount: 40, moneyReturnedInMonth: "2026-10", kind: "reimbursement" },
        { amount: 5,  cashAmount: 5,  moneyReturnedInMonth: "2026-10", kind: "deposit" },
        { amount: 20, cashAmount: 0, voucherAmount: 20, moneyReturnedInMonth: "2026-10", kind: "store" },
      ],
    }))).toBe(100);
  });
});

// ── Debt ──────────────────────────────────────────────────────

describe("cardDebt", () => {
  it("is opening balance + purchases − repayments, for that card only", () => {
    const d = data(
      [buy("2026-09-10", 1200), buy("2026-09-12", 999, { cardId: "b" })],
      [repay("2026-10-01", 800), repay("2026-10-01", 500, { cardId: "b" })],
    );
    expect(cardDebt(card({ openingBalance: 300 }), d)).toBe(700);
  });

  it("goes negative when the card is overpaid", () => {
    expect(cardDebt(card(), data([buy("2026-09-10", 400)], [repay("2026-10-01", 415)]))).toBe(-15);
  });

  it("interest booked with a repayment raises the debt by what the repayment then pays off", () => {
    const d = data(
      [buy("2026-09-10", 400), buy("2026-10-06", 15)],   // the second one is the interest expense
      [repay("2026-10-06", 415, { interestAmount: 15 })],
    );
    expect(cardDebt(card(), d)).toBe(0);
  });
});

describe("debtChangeInMonth", () => {
  it("rises in the month of the purchase and falls in the month of the repayment", () => {
    const d = data([buy("2026-09-10", 1200)], [repay("2026-10-20", 800), repay("2026-11-20", 400)]);
    expect(debtChangeInMonth(d, "2026-09")).toBe(1200);
    expect(debtChangeInMonth(d, "2026-10")).toBe(-800);
    expect(debtChangeInMonth(d, "2026-11")).toBe(-400);
    expect(debtChangeInMonth(d, "2026-12")).toBe(0);
  });

  it("goes by budget month, not by date", () => {
    const d = data([buy("2026-09-30", 100, { budgetMonth: "2026-10" })]);
    expect(debtChangeInMonth(d, "2026-09")).toBe(0);
    expect(debtChangeInMonth(d, "2026-10")).toBe(100);
  });

  it("takes a shop return in the month the money came back", () => {
    const d = data([buy("2026-09-10", 300, {
      returns: [{ amount: 100, cashAmount: 100, moneyReturnedInMonth: "2026-10", kind: "store" }],
    })]);
    expect(debtChangeInMonth(d, "2026-09")).toBe(300);
    expect(debtChangeInMonth(d, "2026-10")).toBe(-100);
  });

  it("leaves a reimbursement out — that money reached the account", () => {
    const d = data([buy("2026-09-10", 300, {
      returns: [{ amount: 100, cashAmount: 100, moneyReturnedInMonth: "2026-09", kind: "reimbursement" }],
    })]);
    expect(debtChangeInMonth(d, "2026-09")).toBe(300);
  });

  it("counts every card", () => {
    const d = data([buy("2026-09-10", 100), buy("2026-09-11", 50, { cardId: "b" })]);
    expect(debtChangeInMonth(d, "2026-09")).toBe(150);
  });
});

// ── Statement ─────────────────────────────────────────────────

describe("cardStatus", () => {
  const TODAY = "2026-10-09";   // statement closed 5.10, due 31.10

  it("asks only for what was bought up to the close", () => {
    const s = cardStatus(card(), data([buy("2026-09-20", 900), buy("2026-10-05", 100), buy("2026-10-07", 250)]), TODAY);
    expect(s).toMatchObject({ debt: 1250, sinceClose: 250, statementDue: 1000, notYetDue: 250, dueDate: "2026-10-31", daysLeft: 22 });
  });

  it("counts the opening balance as already asked for", () => {
    expect(cardStatus(card({ openingBalance: 500 }), data(), TODAY)).toMatchObject({ debt: 500, statementDue: 500 });
  });

  it("lets a repayment from before the close cover the statement", () => {
    const s = cardStatus(card(), data([buy("2026-09-20", 300)], [repay("2026-09-20", 300)]), TODAY);
    expect(s).toMatchObject({ debt: 0, statementDue: 0 });
  });

  it("shows the rest after a partial repayment", () => {
    const s = cardStatus(card(), data([buy("2026-09-20", 1200)], [repay("2026-10-08", 800)]), TODAY);
    expect(s).toMatchObject({ debt: 400, statementDue: 400 });
  });

  it("puts a repayment larger than the statement toward the new purchases", () => {
    const s = cardStatus(card(), data([buy("2026-09-20", 300), buy("2026-10-07", 200)], [repay("2026-10-08", 400)]), TODAY);
    expect(s).toMatchObject({ debt: 100, sinceClose: 200, statementDue: 0, notYetDue: 100 });
  });

  it("never asks for a negative amount when the card is overpaid", () => {
    expect(cardStatus(card(), data([], [repay("2026-10-08", 50)]), TODAY))
      .toMatchObject({ debt: -50, statementDue: 0, notYetDue: 0 });
  });

  it("goes overdue once the due date has passed", () => {
    expect(cardStatus(card(), data([buy("2026-09-20", 100)]), "2026-11-02").daysLeft).toBe(-2);
  });

  it("a shop return after the close still lowers what is asked for", () => {
    const s = cardStatus(card(), data([buy("2026-09-20", 300, {
      returns: [{ amount: 100, cashAmount: 100, moneyReturnedInMonth: "2026-10", returnedAt: "2026-10-08", kind: "store" }],
    })]), TODAY);
    expect(s).toMatchObject({ debt: 200, statementDue: 200 });
  });
});

describe("cardsOverview", () => {
  const TODAY = "2026-10-09";

  it("adds up every card and picks the statement due first", () => {
    const cards = [card(), card({ id: "b", statementDay: 20, graceDays: 20, isArchived: true })];
    const o = cardsOverview(data([buy("2026-09-20", 300), buy("2026-09-10", 50, { cardId: "b" })], [], cards), TODAY);

    expect(o.totalDebt).toBe(350);
    expect(o.cards.map(s => s.card.id)).toEqual(["a", "b"]);
    // b closed 20.09 and was due 10.10 — before a's 31.10.
    expect(o.nextDue?.card.id).toBe("b");
  });

  it("has nothing due when every statement is covered", () => {
    expect(cardsOverview(data([buy("2026-10-07", 100)]), TODAY)).toMatchObject({ totalDebt: 100, nextDue: null });
  });

  it("is empty without cards", () => {
    expect(cardsOverview(data([], [], []), TODAY)).toEqual({ cards: [], totalDebt: 0, nextDue: null });
  });
});
