import { fromYMD } from "../../ui/AppDatePicker";

export interface DateBounds { minDate: Date | null; maxDate: Date | null; }

// Min/max across items with a "YYYY-MM-DD" `date`. Empty → null bounds.
export function dateBoundsOf(items: { date: string }[]): DateBounds {
  if (items.length === 0) return { minDate: null, maxDate: null };
  let min = items[0].date, max = items[0].date;
  for (const it of items) {
    if (it.date < min) min = it.date;
    if (it.date > max) max = it.date;
  }
  return { minDate: fromYMD(min), maxDate: fromYMD(max) };
}