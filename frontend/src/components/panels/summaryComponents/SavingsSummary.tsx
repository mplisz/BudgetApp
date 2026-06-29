// ============================================================
// File: src/components/panels/summaryComponents/SavingsSummary.tsx
// Redesigned — czytelna karta oszczędności z radialnym wskaźnikiem
// ============================================================

import { c } from "../../../styles/tokens";
import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { EmptyState } from "../../ui/summaryUi";
import type { Transaction } from "../../../types/summary";

interface SavingsSummaryProps {
  monthTx:           Transaction[];
  totalIncome:       number;
  minSavingsPercent: number;
}

interface SavingsCategory {
  categoryId:   string;
  categoryName: string;
  spent:        number;
}

// ── Radial ring SVG ───────────────────────────────────────────

interface RadialRingProps {
  pct:   number;   // 0–100+
  color: string;
  size?: number;
}

function RadialRing({ pct, color, size = 88 }: RadialRingProps) {
  const r        = (size - 10) / 2;
  const circ     = 2 * Math.PI * r;
  const fill     = Math.min(pct, 100);
  const dash     = (fill / 100) * circ;
  const center   = size / 2;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {/* track */}
      <circle
        cx={center} cy={center} r={r}
        fill="none"
        stroke={c.border}
        strokeWidth={8}
      />
      {/* fill */}
      <circle
        cx={center} cy={center} r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      {/* overshoot pulse ring */}
      {pct > 100 && (
        <circle
          cx={center} cy={center} r={r}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.3}
          strokeDasharray={`${circ} 0`}
        />
      )}
    </svg>
  );
}

// ── Mini bar per category ─────────────────────────────────────

interface CategoryBarProps {
  cat:        SavingsCategory;
  totalSaved: number;
  color:      string;
  isLast:     boolean;
}

function CategoryBar({ cat, totalSaved, color, isLast }: CategoryBarProps) {
  const pct = totalSaved > 0 ? (cat.spent / totalSaved) * 100 : 0;
  return (
    <div style={{
      paddingBottom: isLast ? 0 : 10,
      marginBottom:  isLast ? 0 : 10,
      borderBottom:  isLast ? "none" : `1px solid ${c.border}`,
    }}>
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   4,
      }}>
        <span style={{ color: c.textTertiary, fontSize: 12 }}>
          🏦 {cat.categoryName}
        </span>
        <span style={{ color: c.text, fontSize: 12, fontWeight: 700 }}>
          {fmt(cat.spent)}
          <span style={{ color: c.textMuted, fontSize: 10, marginLeft: 6 }}>
            {pct.toFixed(0)}%
          </span>
        </span>
      </div>
      {/* thin bar */}
      <div style={{
        height: 3,
        background: c.surface,
        borderRadius: 99,
        overflow: "hidden",
      }}>
        <div style={{
          height:     "100%",
          width:      `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 99,
          opacity:    0.7,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────

export function SavingsSummary({
  monthTx,
  totalIncome,
  minSavingsPercent,
}: SavingsSummaryProps) {

  const savingsByCategory = useMemo<SavingsCategory[]>(() => {
    const map = new Map<string, SavingsCategory>();
    for (const tx of monthTx) {
      if (tx.type !== "SAVING") continue;
      if (!map.has(tx.categoryId)) {
        map.set(tx.categoryId, {
          categoryId:   tx.categoryId,
          categoryName: tx.categoryName,
          spent:        0,
        });
      }
      map.get(tx.categoryId)!.spent += tx.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }, [monthTx]);

  const totalSaved = savingsByCategory.reduce((s, c) => s + c.spent, 0);
  const targetAmt  = totalIncome > 0 ? (minSavingsPercent / 100) * totalIncome : 0;
  const pct        = totalIncome > 0 ? (totalSaved / totalIncome) * 100 : 0;
  const isOk       = totalIncome > 0 && totalSaved >= targetAmt;
  const shortfall  = Math.max(0, targetAmt - totalSaved);

  const color = isOk
    ? c.success
    : pct >= minSavingsPercent * 0.75
      ? c.warning
      : c.danger;

  if (savingsByCategory.length === 0 && totalIncome === 0) {
    return <EmptyState message="Brak danych" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Hero card ── */}
      <div style={{
        background:   c.surface,
        borderRadius: 14,
        border:       `1px solid ${color}33`,
        padding:      "16px 18px",
        display:      "flex",
        alignItems:   "center",
        gap:          18,
      }}>

        {/* Ring */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <RadialRing pct={(targetAmt > 0 ? (totalSaved / targetAmt) * 100 : 0)} color={color} size={88} />
          {/* center label */}
          <div style={{
            position:  "absolute",
            inset:     0,
            display:   "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>
              {pct.toFixed(0)}%
            </span>
            <span style={{ fontSize: 9, color: c.textMuted, marginTop: 2 }}>
              wpływów
            </span>
          </div>
        </div>

        {/* Text block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600, marginBottom: 3 }}>
            Łącznie odłożono
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1, marginBottom: 6 }}>
            {fmt(totalSaved)}
          </div>

          {/* Target row */}
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        6,
            fontSize:   11,
          }}>
            <span style={{
              background:   `${color}18`,
              border:       `1px solid ${color}44`,
              color,
              borderRadius: 6,
              padding:      "1px 7px",
              fontWeight:   700,
              fontSize:     10,
            }}>
              Cel {minSavingsPercent}%
            </span>
            <span style={{ color: c.textMuted }}>
              = {fmt(targetAmt)}
            </span>
          </div>

          {/* Status */}
          <div style={{ marginTop: 6, fontSize: 11 }}>
            {isOk ? (
              <span style={{ color: c.success, fontWeight: 600 }}>
                ✅ Cel osiągnięty
                {totalSaved > targetAmt && targetAmt > 0 && (
                  <span style={{ color: c.textMuted, marginLeft: 5 }}>
                    (+{fmt(totalSaved - targetAmt)})
                  </span>
                )}
              </span>
            ) : targetAmt > 0 ? (
              <span style={{ color: c.textSecondary }}>
                Brakuje{" "}
                <strong style={{ color: c.warning }}>{fmt(shortfall)}</strong>
                {" "}do celu
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Category breakdown ── */}
      {savingsByCategory.length > 0 && (
        <div style={{
          background:   c.bg,
          borderRadius: 10,
          border:       `1px solid ${c.border}`,
          padding:      "12px 14px",
        }}>
          <div style={{
            fontSize:        10,
            color:           c.borderStrong,
            fontWeight:      700,
            textTransform:   "uppercase",
            letterSpacing:   "0.5px",
            marginBottom:    10,
          }}>
            Podział
          </div>
          {savingsByCategory.map((cat, i) => (
            <CategoryBar
              key={cat.categoryId}
              cat={cat}
              totalSaved={totalSaved}
              color={color}
              isLast={i === savingsByCategory.length - 1}
            />
          ))}
        </div>
      )}

      {savingsByCategory.length === 0 && (
        <EmptyState message="Brak transakcji oszczędnościowych" padding={12} />
      )}
    </div>
  );
}