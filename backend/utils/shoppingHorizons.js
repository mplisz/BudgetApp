// ============================================================
// File: backend/utils/shoppingHorizons.js
// WHEN an item on the shopping list is needed — the three tabs of the
// panel:
//   now   — na już: buy on the next trip
//   date  — na termin: needed on a given day (`needBy`), and not
//           earlier — fresh fish, lettuce, dill. Bought too soon it
//           spoils; the panel moves it to "now" the day before.
//   watch — rozglądam się: running low, no hurry; worth waiting for the
//           shop where it is cheaper
//
// Mirrored in frontend/src/data/constants/shoppingHorizons.ts, like the
// sections are: two runtimes, no shared build. An id added here must be
// added there too.
//
// Items written before horizons existed carry no `when` — read as "now",
// which is what they were: the one list there was.
// ============================================================

const HORIZON_IDS     = ["now", "date", "watch"];
const DEFAULT_HORIZON = "now";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" that is a real calendar day (no 2026-02-31). */
function isYmd(s) {
  if (typeof s !== "string" || !YMD.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The horizon an item is on, old items included. */
function itemHorizon(item) {
  return HORIZON_IDS.includes(item?.when) ? item.when : DEFAULT_HORIZON;
}

/**
 * The stored pair for a requested horizon. `needBy` only means something
 * for "date" and is required there; every other horizon clears it, so a
 * stale date can never resurface when an item is moved back.
 * Returns null when the pair is invalid.
 */
function normalizeWhen(when, needBy) {
  const w = when ?? DEFAULT_HORIZON;
  if (!HORIZON_IDS.includes(w)) return null;
  if (w !== "date") return { when: w, needBy: null };
  return isYmd(needBy) ? { when: "date", needBy } : null;
}

// now beats date beats watch; between two dates the earlier one.
const URGENCY = { now: 0, date: 1, watch: 2 };

/**
 * Adding a product that is already open merges into that item — and the
 * horizon it ends up on is the MORE URGENT of the two. "Kawa" waiting in
 * "rozglądam się" and then added again from "na już" means the search
 * is over, not that the new add should be ignored. The other way round
 * a casual "rozglądam się" add must not demote something needed today.
 */
function moreUrgent(a, b) {
  const wa = normalizeWhen(itemHorizon(a), a?.needBy) ?? { when: DEFAULT_HORIZON, needBy: null };
  const wb = normalizeWhen(itemHorizon(b), b?.needBy) ?? { when: DEFAULT_HORIZON, needBy: null };
  if (URGENCY[wa.when] !== URGENCY[wb.when]) return URGENCY[wa.when] < URGENCY[wb.when] ? wa : wb;
  if (wa.when === "date") return wa.needBy <= wb.needBy ? wa : wb;
  return wa;
}

module.exports = { HORIZON_IDS, DEFAULT_HORIZON, isYmd, itemHorizon, normalizeWhen, moreUrgent };
