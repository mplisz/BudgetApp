import { c, alpha } from "../../../styles/tokens";
import { AppDatePicker, toYMD, todayLocal } from "../../ui/AppDatePicker";
import { s } from "./txStyles";
import type { DateBounds } from "./dateBounds";
import { QuickPills } from "../../ui/QuickPills";

// txStyles is loosely typed (string-valued CSS props) — cast like the panels do.
const sx = s as any;

interface DateRangeFilterProps {
  dateFrom:      Date | null;
  dateTo:        Date | null;
  onFrom: (d: Date | null) => void;
  onTo:   (d: Date | null) => void;
  bounds:        DateBounds;
  disabled?:     boolean;        // e.g. no transactions this month
  emptyMessage?: string;
  labels?:       { from: string; to: string };
  showToday?: boolean;   // filter-only quick "Dzisiaj" pill (sets from=to=today)

}

export function DateRangeFilter({
  dateFrom, dateTo, onFrom, onTo, bounds,
  disabled = false,
  emptyMessage = "Brak danych w tym miesiącu — filtr dat niedostępny.",
  labels = { from: "Od", to: "Do" },
  showToday = false,
}: DateRangeFilterProps) {
  const today = todayLocal();
  const todayActive =
    toYMD(dateFrom) === toYMD(today) && toYMD(dateTo) === toYMD(today);

  if (disabled) {
    return (
      <div style={{ ...sx.filterBox, flexBasis: "100%" }}>
        <div style={{ fontSize: 12, color: c.warning, background: alpha(c.warning, "11"), border: `1px solid ${alpha(c.warning, "44")}`, borderRadius: 8, padding: "8px 12px" }}>
          ⚠️ {emptyMessage}
        </div>
      </div>
    );
  }
  return (
    <>
      <div style={sx.filterBox}>
        <label style={sx.filterLabel}>{labels.from}</label>
        <AppDatePicker value={dateFrom} onChange={onFrom} minDate={bounds.minDate} maxDate={dateTo ?? bounds.maxDate} style={sx.inp} />
      </div>
      <div style={sx.filterBox}>
        <label style={sx.filterLabel}>{labels.to}</label>
        <AppDatePicker value={dateTo} onChange={onTo} minDate={dateFrom ?? bounds.minDate} maxDate={bounds.maxDate} style={sx.inp} />
      </div>

      {showToday && (
        <div style={sx.filterBox}>
        <QuickPills pills={[{
          label:   "Dzisiaj",
          active:  todayActive,
          onClick: () => {
            if (todayActive) { onFrom(null); onTo(null); }   // klik ponownie → reset
            else             { onFrom(today); onTo(today); }
          },
        }]} />
        </div>
      )}
    </>
  );
}