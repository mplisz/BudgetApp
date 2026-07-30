// ============================================================
// File: src/components/ui/RangePicker.tsx
// Date range pills + custom month range — reusable across panels.
// Used in: PanelAnalytics, PanelPlanned (refactor).
// ============================================================

import { c } from "../../styles/tokens";
import { AppDatePicker, toYM } from "./AppDatePicker";

export interface DateRange {
  // Number of months from "today" backwards. 0 = no preset selected.
  months: number;
  // Custom range. When both set, takes precedence over months.
  from?:  Date | null;
  to?:    Date | null;
}

interface RangePicker {
  label:    string;
  months:   number;
}

const PRESET_PILLS: RangePicker[] = [
  { label: "1 msc",     months: 1  },
  { label: "3 msc",     months: 3  },
  { label: "6 msc",     months: 6  },
  { label: "12 msc",    months: 12 },
  { label: "18 msc",    months: 18 },
  { label: "24 msc",    months: 24 },   // backend /range maximum
  { label: "Wszystkie", months: 0  },
];

interface RangePickerProps {
  value:    DateRange;
  onChange: (range: DateRange) => void;
  // Show custom from/to month inputs after preset pills
  allowCustom?: boolean;
  // Show "Wszystkie" pill (no upper bound)
  allowAll?: boolean;
  // Optional second line under each pill spelling out the months it covers
  // (e.g. "08.2026 – 10.2026"). Supplied by the caller because the direction
  // differs per panel: Analytics looks back, Planowane looks forward.
  describeMonths?: (months: number) => string | null;
}

export function RangePicker({ value, onChange, allowCustom = true, allowAll = true, describeMonths }: RangePickerProps) {
  const pills = allowAll ? PRESET_PILLS : PRESET_PILLS.filter(p => p.months > 0);
  const hasCustomRange = !!(value.from || value.to);

  function selectPreset(months: number) {
    // Clear custom range when picking a preset
    onChange({ months, from: null, to: null });
  }

  function setCustomFrom(d: Date | null) {
    onChange({ months: 0, from: d, to: value.to ?? null });
  }

  function setCustomTo(d: Date | null) {
    onChange({ months: 0, from: value.from ?? null, to: d });
  }

  function clearCustom() {
    onChange({ months: 3, from: null, to: null });
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {/* Preset pills */}
      {pills.map(pill => {
        const isActive = !hasCustomRange && value.months === pill.months;
        const hint     = describeMonths ? describeMonths(pill.months) : null;
        return (
          <button
            key={pill.months}
            onClick={() => selectPreset(pill.months)}
            title={hint ?? undefined}
            style={{
              padding: hint ? "4px 14px" : "6px 14px",
              borderRadius: 20, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12, lineHeight: 1.3,
              background: isActive ? c.success : c.border,
              color:      isActive ? c.white     : c.textSecondary,
            }}
          >
            <span style={{ display: "block" }}>{pill.label}</span>
            {hint && (
              <span style={{ display: "block", fontSize: 9, fontWeight: 600, opacity: 0.75 }}>
                {hint}
              </span>
            )}
          </button>
        );
      })}

      {allowCustom && (
        <>
          <div style={{ width: 1, height: 20, background: c.border }} />

          {/* Custom from/to */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Od:
            </span>
            <AppDatePicker
              value={value.from ?? null}
              onChange={(d: Date) => setCustomFrom(d)}
              monthPicker
              maxDate={value.to ?? new Date()}
            />
          </div>

          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Do:
            </span>
            <AppDatePicker
              value={value.to ?? null}
              onChange={(d: Date) => setCustomTo(d)}
              monthPicker
              minDate={value.from ?? undefined}
            />
          </div>

          {hasCustomRange && (
            <button
              onClick={clearCustom}
              style={{
                padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.borderStrong}`,
                background: "transparent", color: c.textSecondary, fontSize: 12, cursor: "pointer",
              }}
            >
              ✕ Wyczyść
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Resolve a DateRange into concrete "YYYY-MM" from/to strings.
 * - Custom range: uses range.from / range.to
 * - Preset months: returns N months back from current month
 * - months=0 (Wszystkie): returns a wide range
 */
export function resolveRange(range: DateRange): { fromMonth: string; toMonth: string } {
  const now    = new Date();
  const curYM  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (range.from || range.to) {
    return {
      fromMonth: range.from ? toYM(range.from) : "2000-01",
      toMonth:   range.to   ? toYM(range.to)   : curYM,
    };
  }

  if (range.months === 0) {
    return { fromMonth: "2000-01", toMonth: curYM };
  }

  // N months back including current
  const back = range.months - 1;
  const monthIdx = now.getMonth() - back;
  const y = now.getFullYear() + Math.floor(monthIdx / 12);
  const m = ((monthIdx % 12) + 12) % 12;
  return {
    fromMonth: `${y}-${String(m + 1).padStart(2, "0")}`,
    toMonth:   curYM,
  };
}
