// ============================================================
// File: src/components/ui/UnusualThresholdSlider.tsx
//
// The "Nietypowo duże" threshold slider. One component for both places it
// appears (Wydatki filter group, Podsumowanie section) — both read and write
// the same family-wide setting through useUnusualMultiplier().
// ============================================================

import { c } from "../../styles/tokens";
import { UNUSUAL_MIN_AMOUNT, UNUSUAL_MULTIPLIER, formatMultiplier } from "../../utils/unusualExpenses";

interface Props {
  value:    number;
  onChange: (value: number) => void;
  /** Compact = no explanatory line (section headers). */
  compact?: boolean;
}

export function UnusualThresholdSlider({ value, onChange, compact = false }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180, flex: compact ? "0 1 220px" : "1 1 220px" }}>
      {!compact && (
        <div style={{ fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 }}>
          Próg: {formatMultiplier(value)} normy · min. {UNUSUAL_MIN_AMOUNT} zł
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          min={UNUSUAL_MULTIPLIER.min}
          max={UNUSUAL_MULTIPLIER.max}
          step={UNUSUAL_MULTIPLIER.step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          aria-label="Próg nietypowo dużych wydatków"
          title={`Nietypowo duży = co najmniej ${formatMultiplier(value)} zwykłej kwoty subkategorii i min. ${UNUSUAL_MIN_AMOUNT} zł`}
          style={{ flex: 1, accentColor: c.warning, cursor: "pointer" }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.warningLight, minWidth: 34, textAlign: "right" }}>
          {formatMultiplier(value)}
        </span>
      </div>
    </div>
  );
}
