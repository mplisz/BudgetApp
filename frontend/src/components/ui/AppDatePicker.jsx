// ============================================================
// File: src/components/ui/AppDatePicker.jsx
// Reusable date picker with dark theme.
// Used in: PanelExpenses, PanelPlanned, PanelRecurring.
//
// Requires: npm install react-datepicker date-fns
// ============================================================

import DatePicker, { registerLocale } from "react-datepicker";
import { pl }                         from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("pl", pl);

// ── Helpers (exported for reuse) ─────────────────────────────

// Returns today as a local Date object (no UTC offset issues)
export const todayLocal = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Converts a local Date object to YYYY-MM-DD string
export const toYMD = (date) => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Restores a Date object from a YYYY-MM-DD string
export const fromYMD = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// ── Component ─────────────────────────────────────────────────

/**
 * Props:
 *   value          – Date object (selected date)
 *   onChange       – fn(date: Date)
 *   maxDate        – Date object (default: todayLocal())
 *   minDate        – Date object (optional)
 *   placeholder    – string (default: "dd.MM.yyyy")
 *   disabled       – boolean
 *   popperPlacement – string (default: "bottom-start")
 *   style          – optional style override for the input
 */
export function AppDatePicker({
  value,
  onChange,
  maxDate,
  minDate,
  placeholder = "dd.MM.yyyy",
  disabled = false,
  popperPlacement = "bottom-start",
  style = {},
}) {
  const inputStyle = {
    width:        "100%",
    background:   "#0a0f1e",
    border:       "1px solid #1e293b",
    borderRadius: 8,
    color:        "#e2e8f0",
    padding:      "9px 12px",
    fontSize:     14,
    outline:      "none",
    boxSizing:    "border-box",
    cursor:       disabled ? "not-allowed" : "pointer",
    opacity:      disabled ? 0.5 : 1,
    ...style,
  };

  return (
    <>
      <DatePicker
        selected={value}
        onChange={onChange}
        locale="pl"
        dateFormat="dd.MM.yyyy"
        placeholderText={placeholder}
        maxDate={maxDate ?? todayLocal()}
        minDate={minDate}
        calendarStartDay={1}
        disabled={disabled}
        customInput={<input style={inputStyle} readOnly />}
        wrapperClassName="dp-full-width"
        popperPlacement={popperPlacement}
      />

      {/* Dark theme — injected once, deduplicated by browser */}
      <style>{`
        .dp-full-width { width: 100%; }
        .dp-full-width .react-datepicker-wrapper { width: 100%; }
        .react-datepicker {
          background: #0d1424 !important;
          border: 1px solid #1e293b !important;
          border-radius: 12px !important;
          font-family: inherit !important;
        }
        .react-datepicker__header {
          background: #0a0f1e !important;
          border-bottom: 1px solid #1e293b !important;
          border-radius: 12px 12px 0 0 !important;
        }
        .react-datepicker__current-month,
        .react-datepicker__day-name { color: #94a3b8 !important; }
        .react-datepicker__day {
          color: #e2e8f0 !important;
          border-radius: 6px !important;
        }
        .react-datepicker__day:hover { background: #1e293b !important; }
        .react-datepicker__day--selected {
          background: #10b981 !important;
          color: #fff !important;
          font-weight: 700 !important;
        }
        .react-datepicker__day--today {
          border: 1px solid #10b98166 !important;
          background: transparent !important;
        }
        .react-datepicker__day--disabled { color: #334155 !important; }
        .react-datepicker__navigation-icon::before { border-color: #64748b !important; }
        .react-datepicker__navigation:hover .react-datepicker__navigation-icon::before {
          border-color: #10b981 !important;
        }
        .react-datepicker-popper { z-index: 9999 !important; }
      `}</style>
    </>
  );
}