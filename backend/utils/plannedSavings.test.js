// ============================================================
// File: backend/utils/plannedSavings.test.js
// Rebuilding an envelope's months after the purchase month moved.
// Run:  node --test
//
// The regression behind this module: the instalment was computed by dividing
// what is left by the number of ADDED months, then written to every unpaid
// month. Extending a plan made the months add up to far more than the
// target; shortening it gave each remaining month the whole remainder.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { rebuildSavingsForMonth, releaseSavings, sumPaid } = require("./plannedSavings");

const paid      = (month, amountPLN) => ({ month, amount: amountPLN, amountPLN, fxRate: 1, paidByUser: true,  dismissedByUser: false });
const open      = (month, amount)    => ({ month, amount, amountPLN: 0, fxRate: 1, paidByUser: false, dismissedByUser: false });
const dismissed = (month)            => ({ month, amount: 875, amountPLN: 0, fxRate: 1, paidByUser: false, dismissedByUser: true });

// "Rower": 6000 zł, Oct–Mar; Oct paid 1000, Nov paid 1500 → 3500 left on 4 months.
const SAVINGS = [
  paid("2026-10", 1000), paid("2026-11", 1500),
  open("2026-12", 875), open("2027-01", 875), open("2027-02", 875), open("2027-03", 875),
];
const OPTS = { totalAmountPLN: 6000, currency: "PLN", fxRate: 1, currentMonth: "2026-12" };

const months   = list => list.map(v => v.month);
const openSum  = list => list.filter(v => !v.paidByUser && !v.dismissedByUser).reduce((s, v) => s + v.amount, 0);

describe("rebuildSavingsForMonth", () => {
  test("extending: the remainder is split over kept AND added months", () => {
    const out = rebuildSavingsForMonth(SAVINGS, { ...OPTS, plannedMonth: "2027-06" });

    assert.deepEqual(months(out), [
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
    ]);
    for (const v of out.slice(2)) assert.equal(v.amount, 500);   // 3500 / 7
    assert.equal(openSum(out), 3500);
    assert.equal(sumPaid(out), 2500);
  });

  test("shortening: the remainder is split over the months that are left", () => {
    const out = rebuildSavingsForMonth(SAVINGS, { ...OPTS, plannedMonth: "2027-01" });

    assert.deepEqual(months(out), ["2026-10", "2026-11", "2026-12", "2027-01"]);
    assert.equal(out[2].amount, 1750);   // 3500 / 2
    assert.equal(out[3].amount, 1750);
  });

  test("paid months are untouched, even past the new month", () => {
    const savings = [paid("2026-10", 1000), open("2026-11", 500), paid("2026-12", 1500)];
    const out = rebuildSavingsForMonth(savings, { ...OPTS, plannedMonth: "2026-11" });

    assert.deepEqual(out[0], savings[0]);
    assert.deepEqual(out[2], savings[2]);
    assert.equal(out[1].amount, 3500);   // the only open month carries the rest
  });

  test("dismissed months stay dismissed and do not share the remainder", () => {
    const savings = [paid("2026-10", 1000), dismissed("2026-11"), open("2026-12", 875)];
    const out = rebuildSavingsForMonth(savings, { ...OPTS, plannedMonth: "2027-01" });

    assert.deepEqual(out[1], savings[1]);
    assert.equal(out[2].amount, 2500);   // 5000 / 2
    assert.equal(out[3].amount, 2500);
  });

  test("an empty plan is filled from the current month", () => {
    const out = rebuildSavingsForMonth([], { ...OPTS, plannedMonth: "2027-02" });

    assert.deepEqual(months(out), ["2026-12", "2027-01", "2027-02"]);
    assert.equal(out[0].amount, 2000);
  });

  test("months roll over the year end", () => {
    const out = rebuildSavingsForMonth([open("2026-12", 1)], { ...OPTS, plannedMonth: "2027-01" });
    assert.deepEqual(months(out), ["2026-12", "2027-01"]);
  });

  test("an over-paid plan never yields a negative instalment", () => {
    const out = rebuildSavingsForMonth([paid("2026-10", 7000), open("2026-11", 1)], { ...OPTS, plannedMonth: "2026-12" });
    assert.equal(out[1].amount, 0);
    assert.equal(out[2].amount, 0);
  });
});

describe("releaseSavings", () => {
  // 800 zł for December, 200 a month from September; dropped in November
  // after November's rate was already set aside.
  const ENVELOPE = [
    paid("2026-09", 200), paid("2026-10", 200), paid("2026-11", 200), open("2026-12", 200),
  ];

  test("earlier months go back as a transfer, this month's rate is just unlocked", () => {
    const { virtualSavings, releasedPLN, unlockedPLN } = releaseSavings(ENVELOPE, "2026-11");

    assert.equal(releasedPLN, 400);
    assert.equal(unlockedPLN, 200);
    // September and October keep locking their own months.
    assert.deepEqual(virtualSavings[0], ENVELOPE[0]);
    assert.deepEqual(virtualSavings[1], ENVELOPE[1]);
    // November no longer counts as set aside.
    assert.equal(virtualSavings[2].paidByUser, false);
    assert.equal(virtualSavings[2].amountPLN, 0);
    assert.deepEqual(virtualSavings[3], ENVELOPE[3]);
    assert.equal(sumPaid(virtualSavings), 400);
  });

  test("nothing paid this month: everything paid goes to the transfer", () => {
    const { releasedPLN, unlockedPLN } = releaseSavings(
      [paid("2026-09", 200), paid("2026-10", 200), open("2026-11", 200)], "2026-11",
    );
    assert.equal(releasedPLN, 400);
    assert.equal(unlockedPLN, 0);
  });

  test("only this month paid: no transfer, the lock is simply lifted", () => {
    const { virtualSavings, releasedPLN, unlockedPLN } = releaseSavings(
      [paid("2026-11", 300), open("2026-12", 300)], "2026-11",
    );
    assert.equal(releasedPLN, 0);
    assert.equal(unlockedPLN, 300);
    assert.equal(sumPaid(virtualSavings), 0);
  });

  test("dismissed and open months are left alone", () => {
    const savings = [dismissed("2026-09"), open("2026-10", 875)];
    const { virtualSavings, releasedPLN } = releaseSavings(savings, "2026-11");
    assert.deepEqual(virtualSavings, savings);
    assert.equal(releasedPLN, 0);
  });

  test("the released sum is rounded to grosze", () => {
    const { releasedPLN } = releaseSavings([paid("2026-09", 0.1), paid("2026-10", 0.2)], "2026-11");
    assert.equal(releasedPLN, 0.3);
  });
});
