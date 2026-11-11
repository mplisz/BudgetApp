// Which envelopes' paid rates still lock money in their own months.
// The case behind it: an envelope dropped in November after Sep + Oct were
// set aside must keep Sep and Oct's results where they were — the money came
// back as a transfer in November — while an envelope archived before that rule
// (no transfer ever made) keeps giving its rates back to their months.

import { describe, test, expect } from "vitest";
import { envelopePaidInMonth, keepsEnvelopeHistory, type PlannedDoc, type VirtualSaving } from "./usePlanned";

const rate = (month: string, amountPLN: number, paidByUser = true): VirtualSaving =>
  ({ month, amount: amountPLN, amountPLN, fxRate: 1, paidByUser, dismissedByUser: false });

const envelope = (over: Partial<PlannedDoc>): PlannedDoc => ({
  id: "p1", userId: "f", description: "Telewizor", totalAmount: 800, originalCurrency: "PLN",
  fxRate: 1, totalAmountPLN: 800, targetCategoryId: "c", targetCategoryName: "C",
  targetSubcategoryId: "s", targetSubcategoryName: "S", tags: [], priority: 2,
  mode: "envelope", plannedMonth: "2026-12", monthlySavingDay: 1,
  virtualSavings: [rate("2026-09", 200), rate("2026-10", 200), rate("2026-11", 0, false), rate("2026-12", 200, false)],
  isPurchased: false, purchasedMonth: null, isArchived: false,
  ...over,
});

describe("keepsEnvelopeHistory", () => {
  test("active, purchased and released envelopes keep their months locked", () => {
    expect(keepsEnvelopeHistory(envelope({}))).toBe(true);
    expect(keepsEnvelopeHistory(envelope({ isArchived: true, isPurchased: true }))).toBe(true);
    expect(keepsEnvelopeHistory(envelope({ isArchived: true, releasedInMonth: "2026-11" }))).toBe(true);
  });

  test("an envelope archived before the release rule does not", () => {
    expect(keepsEnvelopeHistory(envelope({ isArchived: true }))).toBe(false);
  });

  test("one-off plans never lock anything", () => {
    expect(keepsEnvelopeHistory(envelope({ mode: "oneoff" }))).toBe(false);
  });
});

describe("envelopePaidInMonth", () => {
  const released = envelope({ isArchived: true, releasedInMonth: "2026-11", releasedAmountPLN: 400 });

  test("a released envelope still locks September and October", () => {
    expect(envelopePaidInMonth([released], "2026-09")).toBe(200);
    expect(envelopePaidInMonth([released], "2026-10")).toBe(200);
  });

  test("the month it was dropped in is not locked any more", () => {
    expect(envelopePaidInMonth([released], "2026-11")).toBe(0);
  });

  test("an old archive gives its rates back to their months", () => {
    expect(envelopePaidInMonth([envelope({ isArchived: true })], "2026-09")).toBe(0);
  });
});
