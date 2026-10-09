// ============================================================
// File: backend/utils/monthStatus.js
// The one place that knows what "this month is closed" means.
//
// A month is CLOSED when its document exists in the Months container and
// OPEN when it does not (see routes/months.js — closing creates the document,
// reopening deletes it). There is no flag to read: the returns endpoint used
// to test `monthDoc?.isClosed`, a field no code ever wrote, so the check never
// fired and returns landed in closed months.
//
// A closed month is fully locked: no transaction may be created in it, edited,
// moved in or out of it, or archived — to correct one, reopen the month. The
// one write that still reaches a closed month is a return entry on a purchase
// made there, when the money comes back in a later, open month: that return
// is booked as a TRANSFER in the open month and leaves the closed month's
// sums alone.
// ============================================================

const { readItem } = require("./helpers");

function monthDocId(familyId, budgetMonth) {
  return `month_${familyId}_${budgetMonth}`;
}

/**
 * True when `budgetMonth` is closed for the family.
 *
 * A failed read throws — a guard that cannot tell must not wave the write
 * through.
 *
 * The container is a parameter (not a module import) so the rule can be
 * unit-tested against a fake — see monthStatus.test.js.
 */
async function isMonthClosed(monthsContainer, familyId, budgetMonth) {
  const doc = await readItem(monthsContainer, monthDocId(familyId, budgetMonth), familyId);
  return doc !== null;
}

/**
 * The first closed month among `budgetMonths`, or null when all are open.
 *
 * For writes that touch more than one month — a batch, or an edit that moves
 * a transaction from one month to another. Blanks are skipped and each
 * distinct month is read once.
 */
async function findClosedMonth(monthsContainer, familyId, budgetMonths) {
  for (const budgetMonth of new Set(budgetMonths.filter(Boolean))) {
    if (await isMonthClosed(monthsContainer, familyId, budgetMonth)) return budgetMonth;
  }
  return null;
}

module.exports = { monthDocId, isMonthClosed, findClosedMonth };
