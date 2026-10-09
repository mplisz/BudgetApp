// ============================================================
// File: backend/utils/plannedSavings.js
// Pure arithmetic over an envelope's virtualSavings[] — no I/O, so the
// rules can be tested without Cosmos (see plannedSavings.test.js).
// ============================================================

const { round2 } = require("./helpers");

// Sum of paid savings in PLN
function sumPaid(virtualSavings) {
  return (virtualSavings || [])
    .filter(v => v.paidByUser)
    .reduce((s, v) => s + v.amountPLN, 0);
}

// Generate virtualSavings months from startMonth to plannedMonth
function generateSavingsMonths(startMonth, plannedMonth, suggestion, currency, fxRate) {
  const months = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = plannedMonth.split("-").map(Number);

  while (y < ey || (y === ey && m <= em)) {
    const monthStr = `${y}-${String(m).padStart(2, "0")}`;
    months.push({
      month:           monthStr,
      amount:          suggestion,   // in original currency
      amountPLN:       0,
      fxRate:          fxRate || 1,
      paidByUser:      false,
      dismissedByUser: false,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

const nextMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// Rebuild virtualSavings after the purchase month moved.
//   - paid entries are kept as they are, whatever their month;
//   - unpaid entries after the new month are dropped;
//   - months missing up to the new month are appended;
//   - what is still to collect is split evenly over EVERY open month
//     (unpaid and not dismissed) — kept and newly added alike. Dividing by
//     the added months only, as this used to, over-collects on extending and
//     hands the whole remainder to each month on shortening.
// Dismissed months stay dismissed and get no instalment.
function rebuildSavingsForMonth(virtualSavings, { plannedMonth, totalAmountPLN, currency, fxRate, currentMonth }) {
  const savings = virtualSavings || [];
  const paid    = savings.filter(v => v.paidByUser);
  const kept    = [...paid, ...savings.filter(v => !v.paidByUser && v.month <= plannedMonth)];

  // Continue from the month after the latest kept one.
  const lastKept  = kept.reduce((max, v) => (max === null || v.month > max ? v.month : max), null);
  const startFill = lastKept ? nextMonth(lastKept) : currentMonth;
  const have      = new Set(kept.map(v => v.month));
  const added     = generateSavingsMonths(startFill, plannedMonth, 0, currency, fxRate)
    .filter(v => !have.has(v.month));

  const all       = [...kept, ...added];
  const isOpen    = v => !v.paidByUser && !v.dismissedByUser;
  const openCount = all.filter(isOpen).length;
  const remaining = totalAmountPLN - sumPaid(paid);
  const suggestion = openCount > 0 ? Math.max(0, round2(remaining / openCount)) : 0;

  return all
    .map(v => (isOpen(v) ? { ...v, amount: suggestion } : v))
    .sort((a, b) => a.month.localeCompare(b.month));
}

module.exports = { sumPaid, generateSavingsMonths, rebuildSavingsForMonth };
