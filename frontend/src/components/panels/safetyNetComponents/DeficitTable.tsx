// ============================================================
// File: src/components/panels/safetyNetComponents/DeficitTable.tsx
// 5-column grid table: Level / Cost / Deficit / Target / Coverage.
// Each row is clickable to set the selectedLevel for the saving assistant.
//
// "Cel" column shows the TOTAL target cushion (baseTarget + plannedTarget).
// When plannedTarget > 0, a small annotation reveals the split below the
// number — full breakdown lives in the UpcomingPlanned card.
// ============================================================

import { fmt } from "../../../utils/helpers";
import { LEVEL_META } from "./types";
import type { LevelDeficit, PriorityLevel } from "./types";

interface DeficitTableProps {
  deficits:      LevelDeficit[];
  horizonMonths: number;
  selectedLevel: PriorityLevel;
  onSelectLevel: (lvl: PriorityLevel) => void;
}

export function DeficitTable({
  deficits, horizonMonths, selectedLevel, onSelectLevel,
}: DeficitTableProps) {
  return (
    <div>
      {/* Header row */}
      <div style={headerRowStyle}>
        <div>Poziom</div>
        <div style={{ textAlign: "right" }}>Koszt / mies.</div>
        <div style={{ textAlign: "right" }}>Deficyt / mies.</div>
        <div style={{ textAlign: "right" }}>Cel (×{horizonMonths} mies.)</div>
        <div style={{ textAlign: "right" }}>Pokrycie</div>
      </div>

      {deficits.map(d => {
        const meta       = LEVEL_META[d.level];
        const isSelected = selectedLevel === d.level;
        const hasPlanned = d.plannedTarget > 0;
        const isCovered  = d.coveragePercent >= 100;
        const isWarning  = d.coveragePercent >= 50 && d.coveragePercent < 100;
        const coverColor = isCovered ? "#10b981" : isWarning ? "#f59e0b" : "#ef4444";

        return (
          <div
            key={d.level}
            onClick={() => onSelectLevel(d.level)}
            style={{
              ...rowStyle,
              background: isSelected ? meta.color + "11" : "transparent",
              borderLeft: `3px solid ${isSelected ? meta.color : "transparent"}`,
              cursor: "pointer",
            }}
            onMouseEnter={e => {
              if (!isSelected) e.currentTarget.style.background = "#0d142488";
            }}
            onMouseLeave={e => {
              if (!isSelected) e.currentTarget.style.background = "transparent";
            }}
          >
            {/* Level chip */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                padding: "2px 8px",
                background: meta.color + "22",
                color: meta.color,
                border: `1px solid ${meta.color}55`,
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 800,
              }}>
                P1–P{d.level}
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                {meta.modeLabel}
              </span>
            </div>

            {/* Monthly cost */}
            <div style={{ textAlign: "right", fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
              {fmt(d.monthlyCost)}
            </div>

            {/* Monthly deficit */}
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700 }}>
              {d.monthlyDeficit > 0 ? (
                <span style={{ color: "#ef4444" }}>{fmt(d.monthlyDeficit)}</span>
              ) : (
                <span style={{ color: "#10b981", fontSize: 11, fontWeight: 600 }}>
                  dochód pokrywa ✓
                </span>
              )}
            </div>

            {/* Target cushion (with planned breakdown if present) */}
            <div style={{ textAlign: "right" }}>
              {d.targetCushion > 0 ? (
                <>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
                    {fmt(d.targetCushion)}
                  </div>
                  {hasPlanned && (
                    <div
                      style={{ fontSize: 10, color: "#a78bfa", marginTop: 2 }}
                      title={`Cel życia: ${fmt(d.baseTarget)} + planowane: ${fmt(d.plannedTarget)}`}
                    >
                      📅 + {fmt(d.plannedTarget)} planowane
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: "#475569", fontSize: 12 }}>—</span>
              )}
            </div>

            {/* Coverage */}
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: coverColor,
              }}>
                {Math.min(999, Math.round(d.coveragePercent))}%
              </div>
              <div style={{
                height: 4, background: "#1e293b",
                borderRadius: 2, marginTop: 4, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, d.coveragePercent)}%`,
                  height: "100%", background: coverColor,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const headerRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 1fr) 110px 130px 160px 110px",
  gap: 12,
  padding: "8px 10px",
  borderBottom: "1px solid #1e293b",
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 1fr) 110px 130px 160px 110px",
  gap: 12,
  alignItems: "center",
  padding: "12px 10px",
  borderBottom: "1px solid #1e293b",
  transition: "background 0.15s",
};
