// ============================================================
// File: src/utils/cardDebt.ts
//
// What is owed on a credit card — the one place that works it out. The card
// panel, Podsumowanie, Poduszka and the bell all read from here, so the
// number can't differ between them.
//
// The model: a card purchase is an ordinary EXPENSE that counts in its
// budget month; the card only means the money hasn't left the bank account
// yet. So
//
//   debt = opening balance + purchases − shop returns − repayments
//
// and it is derived every time, never stored. Three figures come out of it:
//   - the DEBT: everything owed right now;
//   - the STATEMENT amount: the part of it the bank already asked for — the
//     debt minus what was bought after the last statement closed;
//   - the MONTH amount: what the family repays by the due date — whole
//     budget months, because salaries are monthly. This is the figure the
//     budget panels, the bell and the repayment suggestion use; the
//     statement stays on the card panel as what the bank itself asks for.
//
// Everything here is a pure function — see cardDebt.test.ts.
// ============================================================

import { round2 } from "./helpers";
import { shiftMonth } from "./seasonality";
import type { CardData, CardTransaction, CreditCard } from "../types/creditCard";

// ── Dates ("YYYY-MM-DD", local, no timezone maths) ────────────

const pad = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYMD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(date: string, days: number): string {
  const d = fromYMD(date);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromYMD(to).getTime() - fromYMD(from).getTime()) / 86_400_000);
}

// The statement day in a given month, pulled back to the month's last day
// when the month is shorter (the 31st in February closes on the 28th).
// `monthIndex` may run out of 0–11; Date rolls the year.
function closeDateIn(year: number, monthIndex: number, statementDay: number): string {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return toYMD(new Date(year, monthIndex, Math.min(statementDay, lastDay)));
}

function lastCloseOnOrBefore(statementDay: number, date: string): string {
  const [y, m] = date.split("-").map(Number);
  const thisMonth = closeDateIn(y, m - 1, statementDay);
  return thisMonth <= date ? thisMonth : closeDateIn(y, m - 2, statementDay);
}

export interface StatementWindow {
  /** Last day of the most recent closed statement. */
  closeDate:         string;
  /** Last day of the one before it — where the closed statement began. */
  previousCloseDate: string;
  /** When the closed statement is due. */
  dueDate:           string;
}

export function statementWindow(
  card: Pick<CreditCard, "statementDay" | "graceDays">,
  today: string,
): StatementWindow {
  const closeDate = lastCloseOnOrBefore(card.statementDay, today);
  return {
    closeDate,
    previousCloseDate: lastCloseOnOrBefore(card.statementDay, addDays(closeDate, -1)),
    dueDate:           addDays(closeDate, card.graceDays),
  };
}

// The close that follows `closeDate`. 31 days on always lands inside the next
// period: no period is longer than 31 days, and two of them are at least 56.
const nextCloseAfter = (statementDay: number, closeDate: string) =>
  lastCloseOnOrBefore(statementDay, addDays(closeDate, 31));

/** An inclusive span of days. */
export interface DateRange { from: string; to: string }

/**
 * A statement period of the card: 0 is the one running now (it closes on
 * `to`, still ahead), -1 the last closed one, and so on back. Cut the same
 * way as statementWindow: a purchase on the close day belongs to the period
 * that closes, so on that day the running period is already the next one.
 */
export function statementPeriod(
  card: Pick<CreditCard, "statementDay">, today: string, offset: number,
): DateRange {
  let to = nextCloseAfter(card.statementDay, lastCloseOnOrBefore(card.statementDay, today));
  for (let i = 0; i > offset; i--) to = lastCloseOnOrBefore(card.statementDay, addDays(to, -1));
  return { from: addDays(lastCloseOnOrBefore(card.statementDay, addDays(to, -1)), 1), to };
}

/** A calendar month: 0 is the one `today` falls in, -1 the one before, … */
export function calendarMonth(today: string, offset: number): DateRange {
  const [y, m] = today.split("-").map(Number);
  return {
    from: toYMD(new Date(y, m - 1 + offset, 1)),
    to:   toYMD(new Date(y, m + offset, 0)),
  };
}

// ── Money ─────────────────────────────────────────────────────

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

// Only a return to the SHOP goes back onto the card. A reimbursement (family,
// LuxMed) or a bottle deposit lands in the bank account or in cash, so it
// leaves the debt alone. Entries older than `kind` count as shop returns —
// the same reading the price history gives them.
//
// This is why returnUtils.calculateNetAmount isn't reused: it nets EVERY cash
// return, which is right for what a purchase cost and wrong for what is owed.
const returnedToCard = (tx: CardTransaction) =>
  (tx.returns ?? []).filter(r => (r.kind ?? "store") === "store");

/** What the card was charged: the amount left to pay after vouchers. */
const charged = (tx: CardTransaction) => tx.netAmount ?? tx.amount;

/** What a purchase still weighs on its card: the charge minus shop returns. */
export function cardCharge(tx: CardTransaction): number {
  return Math.max(0, charged(tx) - sum(returnedToCard(tx).map(r => r.cashAmount || 0)));
}

/**
 * What was spent with a card in a span of days — the figure a bank's
 * "spend at least X a month" condition looks at. By purchase DATE, not budget
 * month (the bank knows nothing of those), and net of shop returns, which
 * banks take off the turnover too. Repayments play no part: unlike the
 * statement amount, this does not go down when the card is paid.
 */
export function cardTurnover(
  cardId: string, data: Pick<CardData, "transactions">, range: DateRange,
): { amount: number; count: number } {
  const purchases = data.transactions.filter(tx =>
    tx.cardId === cardId && tx.date >= range.from && tx.date <= range.to);
  return { amount: round2(sum(purchases.map(cardCharge))), count: purchases.length };
}

/** Everything owed on one card. Negative = the card was overpaid. */
export function cardDebt(card: CreditCard, data: CardData): number {
  const purchases  = sum(data.transactions.filter(tx => tx.cardId === card.id).map(cardCharge));
  const repayments = sum(data.repayments.filter(r => r.cardId === card.id).map(r => r.amount));
  return round2(card.openingBalance + purchases - repayments);
}

/**
 * How far the debt on ALL cards moved in a budget month. Saldo counts a card
 * purchase as spent the month it was made; the bank account only feels it
 * when the card is repaid — so
 *
 *   ≈ na koncie = Saldo + debtChangeInMonth
 *
 * A shop return is taken in the month the money came back, the same month
 * Saldo sees it (as a smaller expense, or as the TRANSFER of a cross-month
 * return): the two cancel, because that money went to the card, not the
 * account.
 */
export function debtChangeInMonth(data: CardData, month: string): number {
  let change = 0;
  for (const tx of data.transactions) {
    if (tx.budgetMonth === month) change += charged(tx);
    for (const r of returnedToCard(tx)) {
      if (r.moneyReturnedInMonth === month) change -= r.cashAmount || 0;
    }
  }
  for (const r of data.repayments) {
    if (r.budgetMonth === month) change -= r.amount;
  }
  return round2(change);
}

/**
 * What is still unpaid of the opening balance and the purchases `counts`
 * picks. Repayments pay the oldest debt first, as the bank does, so ANY
 * repayment counts here, whenever it was made.
 */
function unpaidOf(card: CreditCard, data: CardData, counts: (tx: CardTransaction) => boolean): number {
  const purchases  = sum(data.transactions
    .filter(tx => tx.cardId === card.id && counts(tx))
    .map(cardCharge));
  const repayments = sum(data.repayments.filter(r => r.cardId === card.id).map(r => r.amount));
  return round2(Math.max(0, card.openingBalance + purchases - repayments));
}

/** Unpaid of what was bought up to `closeDate` — the bank's statement view. */
const unpaidThrough = (card: CreditCard, data: CardData, closeDate: string) =>
  unpaidOf(card, data, tx => tx.date <= closeDate);

/** Unpaid of what was booked in budget months before `month` — the family's
 *  view: salaries come monthly, so a whole budget month is repaid at once. */
const unpaidBefore = (card: CreditCard, data: CardData, month: string) =>
  unpaidOf(card, data, tx => tx.budgetMonth < month);

// ── Status ────────────────────────────────────────────────────

export interface CardStatus extends StatementWindow {
  card:         CreditCard;
  /** Everything owed. Negative = overpaid. */
  debt:         number;
  /** Bought since the last statement closed — owed, but not asked for yet. */
  sinceClose:   number;
  /** Still to pay of the closed statement; never below zero. Any repayment
   *  counts toward it, whenever it was made — oldest debt first, as the bank
   *  does. The bank closes on the posting date, we on the purchase date, so
   *  a purchase from the last days of a period may sit one statement off. */
  statementDue: number;
  /** What the FAMILY repays by dueDate: every budget month before the one
   *  the due date falls in, whole — salaries come monthly, so October is
   *  repaid in November in full, even the purchases the bank will only put
   *  on the next statement. Never below zero. */
  monthDue:     number;
  /** The last budget month monthDue repays ("YYYY-MM"). */
  monthDueFor:  string;
  /** Owed, but not repaid by dueDate: the debt beyond monthDue. */
  notYetDue:    number;
  /** Days until dueDate; negative once it has passed. */
  daysLeft:     number;
}

export function cardStatus(card: CreditCard, data: CardData, today: string): CardStatus {
  const window     = statementWindow(card, today);
  const debt       = cardDebt(card, data);
  const sinceClose = round2(sum(
    data.transactions
      .filter(tx => tx.cardId === card.id && tx.date > window.closeDate)
      .map(cardCharge),
  ));
  const dueMonth = window.dueDate.slice(0, 7);
  const monthDue = unpaidBefore(card, data, dueMonth);
  return {
    ...window,
    card,
    debt,
    sinceClose,
    statementDue: unpaidThrough(card, data, window.closeDate),
    monthDue,
    monthDueFor:  shiftMonth(dueMonth, -1),
    notYetDue:    round2(Math.max(0, debt) - monthDue),
    daysLeft:     daysBetween(today, window.dueDate),
  };
}

export interface CardsOverview {
  cards:     CardStatus[];
  /** Owed on every card together, archived ones included — closing a card
   *  doesn't clear what was spent on it. */
  totalDebt: number;
  /** The repayment that comes first, if any is outstanding. */
  nextDue:   CardStatus | null;
}

export function cardsOverview(data: CardData, today: string): CardsOverview {
  const cards = data.cards.map(card => cardStatus(card, data, today));
  const due   = cards
    .filter(status => status.monthDue > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    cards,
    totalDebt: round2(sum(cards.map(status => status.debt))),
    nextDue:   due[0] ?? null,
  };
}

// ── What a budget month repays ────────────────────────────────

export interface MonthStatement {
  card:     CreditCard;
  /** The budget months repaid, "YYYY-MM" — usually one, the previous month. */
  months:   { from: string; to: string };
  /** The bank's due date that falls in the month. */
  dueDate:  string;
  /** The months repaid are over — false while the last of them still runs. */
  isClosed: boolean;
  /** Still to pay of them. While they still run: owed so far. */
  toPay:    number;
}

/**
 * What each card has to be repaid in budget month `month`: the whole of the
 * previous budget month (see CardStatus.monthDue), by the bank's due date
 * that falls in `month` — with a statement closing on the 25th and 26 days
 * of grace, November repays all of October by 20.11.
 *
 * Arrears (an older month left unpaid) belong to the running month. A month
 * ahead counts only its own budget months, so the same money is never shown
 * as due in two months. A month already past has nothing left to plan and
 * returns [].
 *
 * A card with no due date in that month (a short-grace card whose two due
 * dates straddle it) is left out — the next month repays both; an archived
 * card only while it still has something to pay.
 */
export function cardsDueInMonth(data: CardData, month: string, today: string): MonthStatement[] {
  const running = today.slice(0, 7);
  if (month < running) return [];
  const monthEnd = `${month}-31`;   // string bound: every real day sorts before it

  const out: MonthStatement[] = [];
  for (const card of data.cards) {
    // Walk the closes from far enough back that every due date in `month` is met.
    let close = lastCloseOnOrBefore(card.statementDay, addDays(`${month}-01`, -(card.graceDays + 31)));
    let firstClose: string | null = null;
    let lastClose:  string | null = null;
    for (; addDays(close, card.graceDays) <= monthEnd; close = nextCloseAfter(card.statementDay, close)) {
      if (addDays(close, card.graceDays).slice(0, 7) !== month) continue;
      firstClose ??= close;
      lastClose = close;
    }
    if (!firstClose || !lastClose) continue;

    // The month the previous due date fell in: what it repaid ends before it.
    const previousDueMonth = addDays(
      lastCloseOnOrBefore(card.statementDay, addDays(firstClose, -1)), card.graceDays,
    ).slice(0, 7);
    const toPay = round2(unpaidBefore(card, data, month)
      - (month > running ? unpaidBefore(card, data, previousDueMonth) : 0));
    if (card.isArchived && toPay <= 0) continue;

    const lastRepaid = shiftMonth(month, -1);
    out.push({
      card,
      months:   { from: previousDueMonth, to: lastRepaid },
      dueDate:  addDays(lastClose, card.graceDays),
      isClosed: lastRepaid < running,
      toPay:    Math.max(0, toPay),
    });
  }
  return out;
}

/**
 * Where the bank account lands after a month planned at `budgetResult`
 * (income − what the budget spends). The same shift Podsumowanie's
 * "≈ Na koncie" makes — debtChangeInMonth — plus what is still to be repaid
 * in the month, which is not in it until the repayment is recorded.
 */
export function accountAfterMonth(
  budgetResult: number, data: CardData, statements: MonthStatement[], month: string,
): number {
  return round2(budgetResult + debtChangeInMonth(data, month) - sum(statements.map(s => s.toPay)));
}
