// ============================================================
// File: src/components/panels/safetyNetComponents/IncomeSourcesToggle.tsx
// Lists every unique income source and lets the user "lose" any of
// them via checkbox. Selecting nothing = nothing lost (baseline).
// Shows running totals: full income, remaining income, lost income.
// ============================================================

import { fmt } from "../../../utils/helpers";
import { EmptyState } from "../../ui/summaryUi";
import { ToggleRow, StatTile } from "./uiBits";
import type { IncomeSource } from "./types";

interface IncomeSourcesToggleProps {
  sources:        IncomeSource[];
  excludedKeys:   string[];
  onChange:       (excludedKeys: string[]) => void;
  lookbackMonths: number;
}

export function IncomeSourcesToggle({
  sources, excludedKeys, onChange, lookbackMonths,
}: IncomeSourcesToggleProps) {
  if (sources.length === 0) {
    return (
      <EmptyState
        icon="💰"
        message="Brak wpływów w wybranym okresie — dodaj wpływy lub wydłuż okno historyczne, aby zasymulować deficyt."
      />
    );
  }

  const excluded = new Set(excludedKeys);
  const totalIncome    = sources.reduce((s, x) => s + x.avgMonthly, 0);
  const lostIncome     = sources.filter(s => excluded.has(s.key)).reduce((s, x) => s + x.avgMonthly, 0);
  const remaining      = totalIncome - lostIncome;
  const lostPct        = totalIncome > 0 ? (lostIncome / totalIncome) * 100 : 0;

  function toggle(key: string) {
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  function selectAll() { onChange(sources.map(s => s.key)); }
  function clearAll()  { onChange([]); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Bulk actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={clearAll}
          disabled={excluded.size === 0}
          style={btnGhost(excluded.size === 0)}
        >
          ✕ Wszystkie odznacz
        </button>
        <button
          type="button"
          onClick={selectAll}
          disabled={excluded.size === sources.length}
          style={btnGhost(excluded.size === sources.length)}
        >
          ⚠️ Utrata wszystkich
        </button>
      </div>

      {/* List of sources */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sources.map(src => {
          const isLost = excluded.has(src.key);
          return (
            <ToggleRow
              key={src.key}
              checked={isLost}
              onChange={() => toggle(src.key)}
              label={
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: isLost ? "#ef4444" : "#e2e8f0",
                    textDecoration: isLost ? "line-through" : "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {src.label}
                  </div>
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    Średnia: <span style={{ color: "#94a3b8", fontWeight: 600 }}>{fmt(src.avgMonthly)}</span>{" "}
                    / mies. · widoczne w {src.monthsSeen}/{lookbackMonths} mies.
                    {isLost && (
                      <span style={{ color: "#ef4444", fontWeight: 700, marginLeft: 6 }}>
                        — UTRATA
                      </span>
                    )}
                  </div>
                </div>
              }
              right={
                <div style={{
                  fontSize: 13, fontWeight: 800,
                  color: isLost ? "#ef4444" : "#10b981",
                  textDecoration: isLost ? "line-through" : "none",
                }}>
                  {fmt(src.avgMonthly)}
                </div>
              }
            />
          );
        })}
      </div>

      {/* Totals row */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatTile
          label="Pełen dochód"
          value={fmt(totalIncome)}
          sub="/ mies."
          color="#94a3b8"
        />
        <StatTile
          label="Po utracie"
          value={fmt(remaining)}
          sub={excluded.size > 0 ? `${excluded.size} źródeł odznaczone` : "wszystko aktywne"}
          color={excluded.size > 0 ? "#f59e0b" : "#10b981"}
        />
        <StatTile
          label="Utracone"
          value={fmt(lostIncome)}
          sub={`${lostPct.toFixed(0)}% wpływów`}
          color="#ef4444"
        />
      </div>
    </div>
  );
}

// ── Local styles ────────────────────────────────────────────

function btnGhost(disabled: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    background: "transparent",
    border: "1px solid #1e293b",
    color: disabled ? "#334155" : "#94a3b8",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
