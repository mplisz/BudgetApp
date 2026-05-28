// ============================================================
// File: src/components/ui/AppDatePicker.tsx
// Reusable date picker with dark theme.
// Supports day picker (default) and month picker (monthPicker prop).
// ============================================================

import type { CSSProperties, ReactElement } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { pl } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

// `pl` import from date-fns/locale is typed as Locale; registerLocale expects a
// looser shape across react-datepicker versions, so cast through unknown to avoid
// a version-coupling error if either lib bumps.
registerLocale("pl", pl as unknown as Parameters<typeof registerLocale>[1]);

// ── Helpers (exported for reuse) ─────────────────────────────

export const todayLocal = (): Date => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const toYMD = (date: Date | null | undefined): string => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const fromYMD = (ymd: string | null | undefined): Date | null => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Convert Date → "YYYY-MM"
export const toYM = (date: Date | null | undefined): string => {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// Convert "YYYY-MM" → Date (first day of month)
export const fromYM = (ym: string | null | undefined): Date | null => {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1);
};

// ── Component ─────────────────────────────────────────────────

export interface AppDatePickerProps {
  /** Selected value (or null when empty). */
  value:           Date | null;
  /** Called with the new Date when the user picks one. */
  onChange:        (date: Date) => void;
  /** Latest allowable date. `undefined` → defaults to today (or null when monthPicker). */
  maxDate?:        Date | null;
  /** Earliest allowable date. */
  minDate?:        Date | null;
  /** Placeholder text. Defaults based on monthPicker mode. */
  placeholder?:    string;
  /** Disable interaction. */
  disabled?:       boolean;
  /** react-datepicker popperPlacement. Type loosened to string for back-compat
   *  with existing call sites (e.g. "bottom-start"). */
  popperPlacement?: string;
  /** Inline style override for the input. */
  style?:          CSSProperties;
  /** Show month/year picker instead of day picker. */
  monthPicker?:    boolean;
}

export function AppDatePicker({
  value,
  onChange,
  maxDate,
  minDate,
  placeholder,
  disabled = false,
  popperPlacement = "bottom-start",
  style = {},
  monthPicker = false,
}: AppDatePickerProps): ReactElement {
  const inputStyle: CSSProperties = {
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

  const defaultPlaceholder = monthPicker ? "MM.YYYY" : "dd.MM.yyyy";

  // react-datepicker's onChange signature is (date: Date | null, e?) => void,
  // but every call site in the project expects to receive a Date. We coerce
  // here so callers can keep their (d: Date) => void contract.
  const handleChange = (date: Date | null): void => {
    if (date) onChange(date);
  };

  // react-datepicker types are picky about null vs undefined. The original
  // .jsx accepted `null` for "no constraint". We map null → undefined where
  // the library expects undefined, and keep null where it accepts it.
  const resolvedMaxDate: Date | undefined =
    maxDate === null
      ? undefined
      : maxDate ?? (monthPicker ? undefined : todayLocal());

  const resolvedMinDate: Date | undefined =
    minDate === null ? undefined : minDate ?? undefined;

  // popperPlacement is a union of literal strings in react-datepicker types.
  // We accept any string from callers and pass through unchecked — callers
  // are responsible for passing valid values (e.g. "bottom-start").
  const popperPlacementProp = popperPlacement as unknown as undefined;

  return (
    <>
      <DatePicker
        selected={value}
        onChange={handleChange}
        locale="pl"
        dateFormat={monthPicker ? "MM.yyyy" : "dd.MM.yyyy"}
        placeholderText={placeholder ?? defaultPlaceholder}
        maxDate={resolvedMaxDate}
        minDate={resolvedMinDate}
        calendarStartDay={1}
        disabled={disabled}
        showMonthYearPicker={monthPicker}
        showFullMonthYearPicker={monthPicker}
        customInput={<input style={inputStyle} readOnly />}
        wrapperClassName="dp-full-width"
        popperPlacement={popperPlacement as never}
      />

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
        .react-datepicker__day--selected,
        .react-datepicker__month--selected {
          background: #10b981 !important;
          color: #fff !important;
          font-weight: 700 !important;
        }
        .react-datepicker__month-text {
          color: #e2e8f0 !important;
          border-radius: 6px !important;
          padding: 4px 8px !important;
        }
        .react-datepicker__month-text:hover { background: #1e293b !important; }
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
        
        /* Year header in month-picker mode + any dropdowns */
        .react-datepicker__header__dropdown,
        .react-datepicker__year-read-view,
        .react-datepicker__month-read-view,
        .react-datepicker__month-year-read-view {
          color: #e2e8f0 !important;
        }
        .react-datepicker__year-dropdown,
        .react-datepicker__month-dropdown,
        .react-datepicker__month-year-dropdown {
          background: #0d1424 !important;
          border: 1px solid #1e293b !important;
        }
        .react-datepicker__year-option,
        .react-datepicker__month-option,
        .react-datepicker__month-year-option {
          color: #e2e8f0 !important;
        }
        .react-datepicker__year-option:hover,
        .react-datepicker__month-option:hover {
          background: #1e293b !important;
        }
        /* The year shown in the month-picker header */
        .react-datepicker__current-month--hasMonthYearPicker,
        .react-datepicker-year-header {
          color: #e2e8f0 !important;
        }
      `}</style>
    </>
  );
}
