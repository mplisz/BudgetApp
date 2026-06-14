import { AppDatePicker } from "../../ui/AppDatePicker";
import { s } from "./txStyles";
import type { DateBounds } from "./dateBounds";

// txStyles is loosely typed (string-valued CSS props) — cast like the panels do.
const sx = s as any;

interface DateRangeFilterProps {
  dateFrom:      Date | null;
  dateTo:        Date | null;
  onFrom:        (d: Date) => void;
  onTo:          (d: Date) => void;
  bounds:        DateBounds;
  disabled?:     boolean;        // e.g. no transactions this month
  emptyMessage?: string;
  labels?:       { from: string; to: string };
}

export function DateRangeFilter({
  dateFrom, dateTo, onFrom, onTo, bounds,
  disabled = false,
  emptyMessage = "Brak danych w tym miesiącu — filtr dat niedostępny.",
  labels = { from: "Od", to: "Do" },
}: DateRangeFilterProps) {
  // No data → block the inputs, show a warning instead.
  if (disabled) {
    return (
      <div style={{ ...sx.filterBox, flexBasis: "100%" }}>
        <div style={{
          fontSize: 12, color: "#f59e0b",
          background: "#f59e0b11", border: "1px solid #f59e0b44",
          borderRadius: 8, padding: "8px 12px",
        }}>
          ⚠️ {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={sx.filterBox}>
        <label style={sx.filterLabel}>{labels.from}</label>
        <AppDatePicker
          value={dateFrom}
          onChange={onFrom}
          minDate={bounds.minDate}
          maxDate={dateTo ?? bounds.maxDate}
          style={sx.inp}
        />
      </div>
      <div style={sx.filterBox}>
        <label style={sx.filterLabel}>{labels.to}</label>
        <AppDatePicker
          value={dateTo}
          onChange={onTo}
          minDate={dateFrom ?? bounds.minDate}
          maxDate={bounds.maxDate}
          style={sx.inp}
        />
      </div>
    </>
  );
}