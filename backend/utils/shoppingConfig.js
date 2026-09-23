// ============================================================
// File: backend/utils/shoppingConfig.js
// Every tunable number the shopping list runs on, in one place.
//
// These were spread across four files, each sitting next to the code
// that used it — fine while writing them, useless when someone asks
// "how long do noted prices live?" and has to grep. Regexes, keyword
// dictionaries and section lists stay where they are: those are data
// and logic, not knobs, and hauling them here would only trade one
// scattering for a worse one.
//
// Changing anything here changes behaviour immediately and everywhere.
// ============================================================

module.exports = {
  // ── Price history from receipts ───────────────────────────
  /** How far back a median looks. Long enough to be a habit, short
   *  enough that last year's prices are not quoted as today's. */
  WINDOW_DAYS: 90,
  /** Purchases kept per product. Enough that one promotion cannot
   *  decide the median, few enough to keep the catalog small — it is
   *  read on every panel open, on a phone, in a shop. */
  MAX_OBSERVATIONS: 6,
  /** Below this there is no "usually" to report, only the last price.
   *  A median of two numbers is their average in disguise. */
  MIN_FOR_MEDIAN: 3,

  // ── Prices noted on a shelf ───────────────────────────────
  /** How long a hand-noted shelf price stays believable. Far shorter
   *  than a median's window: that describes a habit, this describes a
   *  shelf, and a leaflet runs a week. Matters only for items that sit
   *  open for months — a bought item expires with its notes anyway. */
  SEEN_WINDOW_DAYS: 7,
  /** Offers remembered per item (shop + condition) — a price board. */
  MAX_SEEN: 8,

  // ── Suggestion catalog ────────────────────────────────────
  /** Products remembered for the pills and autocomplete. Well above a
   *  family's real vocabulary; the prune is a safety net. */
  MAX_ENTRIES: 400,
  /** Half-life of the recency weight in the pill ranking: a product
   *  bought often but not lately drops below one bought lately. */
  RECENCY_DAYS: 30,

  // ── List items ────────────────────────────────────────────
  /** How long a ticked-off item stays visible before Cosmos drops it.
   *  Long enough to undo a mis-tap and to answer "did we buy that this
   *  week", short enough that the list never becomes an archive. */
  RESOLVED_TTL_DAYS: 7,
  /** Longest side of a stored item photo, px. A photo here answers
   *  "which bottle" on a phone screen — it is not an archive, and it is
   *  opened in a shop on whatever signal the building has. */
  PHOTO_MAX_DIMENSION: 1280,

  // ── Matching receipt lines to products ────────────────────
  /** Shorter tokens must match exactly. "woda"/"wódka" differ exactly
   *  as "jaja"/"jajka" do; no rule keeps one without the other, and
   *  buying vodka instead of water is the worse failure. */
  STEM_MIN_LENGTH: 5,
};
