// ============================================================
// File: src/data/constants/shoppingHorizons.ts
// WHEN an item on the shopping list is needed — the panel's three tabs,
// with every label, icon and number they run on.
//
// The ORDER of this object is the order of the tabs.
//
// Mirrored in backend/utils/shoppingHorizons.js, which validates what
// the API stores. An id added here must be added there too, or the API
// will reject it.
// ============================================================

export interface ShoppingHorizon {
  /** Tab label, and the option in the ⏱ kiedy picker. */
  label: string;
  icon:  string;
  /** Placeholder of the add field while this tab is open. "{day}" is
   *  replaced with the chosen day on the date tab. */
  addPlaceholder: string;
  /** Shown in an empty tab — says what the tab is FOR. */
  empty: string;
}

export const SHOPPING_HORIZONS = {
  now: {
    label: "Na już", icon: "🛒",
    addPlaceholder: "Dopisz na już…",
    empty: "Nic na już. Skończyło się coś? Dopisz od razu.",
  },
  date: {
    label: "Na termin", icon: "📅",
    addPlaceholder: "Dopisz na {day}…",
    empty: "Świeże rzeczy na konkretny dzień — ryba, sałata, koperek. Dzień przed terminem same przejdą do „Na już”.",
  },
  watch: {
    label: "Rozglądam się", icon: "👀",
    addPlaceholder: "Dopisz, rozejrzę się…",
    empty: "Rzeczy bez pośpiechu — kończy się kawa, proszek. Zanotuj cenę z półki 💰 i kup, gdzie taniej.",
  },
} as const satisfies Record<string, ShoppingHorizon>;

export type HorizonId = keyof typeof SHOPPING_HORIZONS;

export const HORIZON_IDS = Object.keys(SHOPPING_HORIZONS) as HorizonId[];

/** Items from before horizons existed, and anything unknown, are "now". */
export const DEFAULT_HORIZON: HorizonId = "now";

// ── Na termin ────────────────────────────────────────────────

/** The days offered for a dated item, counted from today. Tomorrow is
 *  not among them: with the move one day ahead it would land in "Na
 *  już" the moment it was added — that is just "Na już". */
export const DUE_DAYS_MIN = 2;
export const DUE_DAYS_MAX = 5;

/** A dated item moves to "Na już" this many days before its day: fresh
 *  food is bought the day before it is needed, not on the day. */
export const PROMOTE_DAYS_BEFORE = 1;
