// ============================================================
// File: src/utils/shoppingDue.ts
// Which tab a shopping item is on TODAY, and how its day reads.
//
// A dated item ("na termin") is moved to "Na już" PROMOTE_DAYS_BEFORE
// days ahead of its day — on read, here, rather than by rewriting the
// document: nothing has to run at midnight, and both phones agree as
// long as their calendars do.
//
// Every function takes `today` as "YYYY-MM-DD" so the tests can pin it.
// ============================================================

import {
  HORIZON_IDS, DEFAULT_HORIZON, DUE_DAYS_MIN, DUE_DAYS_MAX, PROMOTE_DAYS_BEFORE,
  type HorizonId,
} from "../data/constants/shoppingHorizons";
import { WEEKDAY_SHORT, weekdayOf } from "./timePatterns";

interface Horizoned {
  when?:   string | null;
  needBy?: string | null;
}

/** "YYYY-MM-DD" → local Date at midnight (no UTC shift). */
function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(ymd: string, n: number): string {
  const d = localDate(ymd);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

/** Whole days from `today` to `ymd` — negative once it has passed. */
export function daysUntil(ymd: string, today: string): number {
  return Math.round((localDate(ymd).getTime() - localDate(today).getTime()) / 86_400_000);
}

/** The horizon the item was PUT on — old items without one are "now". */
export function itemHorizon(item: Horizoned): HorizonId {
  return HORIZON_IDS.includes(item.when as HorizonId) ? (item.when as HorizonId) : DEFAULT_HORIZON;
}

/** A dated item whose day is close enough to be bought now. */
export function isDueNow(item: Horizoned, today: string): boolean {
  return itemHorizon(item) === "date" && !!item.needBy
    && daysUntil(item.needBy, today) <= PROMOTE_DAYS_BEFORE;
}

/** The tab the item shows up in today. */
export function tabOf(item: Horizoned, today: string): HorizonId {
  if (isDueNow(item, today)) return "now";
  const h = itemHorizon(item);
  // "date" without a day cannot be placed on a day — show it rather
  // than lose it.
  return h === "date" && !item.needBy ? "now" : h;
}

/** "śr 30.09" */
export function dayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${WEEKDAY_SHORT[weekdayOf(ymd)].toLowerCase()} ${d}.${m}`;
}

/** How far off the day is, in words: "na dziś", "na jutro", "za 3 dni". */
export function dueLabel(ymd: string, today: string): string {
  const n = daysUntil(ymd, today);
  if (n < 0)  return "po terminie";
  if (n === 0) return "na dziś";
  if (n === 1) return "na jutro";
  return `za ${n} dni`;
}

/** The days offered when putting an item on a date. */
export function dueChoices(today: string): string[] {
  const out: string[] = [];
  for (let n = DUE_DAYS_MIN; n <= DUE_DAYS_MAX; n++) out.push(addDays(today, n));
  return out;
}
