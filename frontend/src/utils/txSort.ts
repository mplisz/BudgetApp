// ============================================================
// File: src/utils/txSort.ts
//
// Column sorting for the transaction tables (Wydatki, Wpływy). The single
// definition of WHAT each sortable column orders by, which direction a
// column starts in, and how a click moves the sort — the header cells, the
// mobile sort bar and both panels all read it from here.
//
// Every column sorts by the value the table actually SHOWS in it: the
// Kwota column prints tx.amount, so that is what "by amount" means — not
// the net-of-returns figure behind the group totals.
// ============================================================

export type TxSortKey = "date" | "amount" | "priority" | "author";
export type SortDir   = "asc" | "desc";

export interface TxSort {
  key: TxSortKey;
  dir: SortDir;
}

/** What the API already returns (ORDER BY c.date DESC) — so the default
 *  sort changes nothing until the user clicks a column. */
export const DEFAULT_TX_SORT: TxSort = { key: "date", dir: "desc" };

export const TX_SORT_LABELS: Record<TxSortKey, string> = {
  date:     "Data",
  amount:   "Kwota",
  priority: "Prio",
  author:   "Autor",
};

// The order you most likely want on the first click: newest, biggest,
// most important (P1) first, authors A→Z.
const FIRST_DIR: Record<TxSortKey, SortDir> = {
  date:     "desc",
  amount:   "desc",
  priority: "desc",
  author:   "asc",
};

/** Clicking the active column flips it; another column starts in its FIRST_DIR. */
export function nextTxSort(current: TxSort, key: TxSortKey): TxSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: FIRST_DIR[key] };
}

export interface SortableTx {
  date:      string;
  amount:    number;
  priority?: number;
  author?:   string;
}

const collator = new Intl.Collator("pl", { sensitivity: "base" });

/** Returns a sorted COPY. Ties fall back to newest-first, then keep the
 *  incoming order (Array#sort is stable), so equal rows don't shuffle. */
export function sortTransactions<T extends SortableTx>(items: T[], { key, dir }: TxSort): T[] {
  const sign = dir === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    let diff = 0;
    switch (key) {
      case "date":     diff = a.date.localeCompare(b.date); break;
      case "amount":   diff = a.amount - b.amount; break;
      // Sorted by IMPORTANCE, not by the digit: P1 is the most important, so
      // descending (↓) runs P1→P4 and ascending (↑) P4→P1. Same fallback the
      // table's PrioBadge renders: no priority shows as P2.
      case "priority": diff = (b.priority || 2) - (a.priority || 2); break;
      case "author": {
        // Rows with no author sit at the bottom in BOTH directions — a block
        // of "—" at the top of a descending sort is noise, not an answer.
        const aa = a.author?.trim() ?? "", bb = b.author?.trim() ?? "";
        if (!aa || !bb) {
          if (aa || bb) return aa ? -1 : 1;
          break;
        }
        diff = collator.compare(aa, bb);
        break;
      }
    }
    if (diff !== 0) return sign * diff;
    return key === "date" ? 0 : b.date.localeCompare(a.date);
  });
}
