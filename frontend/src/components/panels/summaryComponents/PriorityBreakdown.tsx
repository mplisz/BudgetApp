// ============================================================
// File: src/components/panels/summaryComponents/PriorityBreakdown.tsx
// ============================================================

import { c } from "../../../styles/tokens";
import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { ProgressBar, EmptyState } from "../../ui/summaryUi";
import { PRIO_META, PRIO_KEYS, sumExpensesByPriority } from "../../../types/summaryConstants";
import type { Transaction } from "../../../types/summary";

interface PriorityBreakdownProps {
  monthTx:       Transaction[];
  totalExpenses: number;
}

export function PriorityBreakdown({ monthTx, totalExpenses }: PriorityBreakdownProps) {
  const byPriority = useMemo(() => sumExpensesByPriority(monthTx), [monthTx]);

  if (!PRIO_KEYS.some(p => byPriority[p] > 0)) {
    return <EmptyState message="Brak wydatków" />;
  }

  const criticalPct = totalExpenses > 0
    ? (((byPriority[1] + byPriority[2]) / totalExpenses) * 100).toFixed(1)
    : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {PRIO_KEYS.map(p => {
        const meta  = PRIO_META[p];
        const spent = byPriority[p];
        const pct   = totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0;
        const isEmpty = spent === 0;

        return (
          <div key={p} style={{ opacity: isEmpty ? 0.35 : 1 }}>
            {/* Header row: badge + label + amount + % */}
            <div style={{
              display:        "flex",
              alignItems:     "center",
              gap:            8,
              marginBottom:   5,
            }}>
              {/* Priority badge P1/P2/... */}
              <span style={{
                background:   `${meta.color}18`,
                color:        meta.color,
                border:       `1px solid ${meta.color}44`,
                borderRadius: 5,
                padding:      "1px 6px",
                fontSize:     10,
                fontWeight:   800,
                flexShrink:   0,
              }}>
                P{p}
              </span>

              {/* Label — stretches to fill available space */}
              <span style={{
                color:    c.textSecondary,
                fontSize: 12,
                flex:     1,
                minWidth: 0,
              }}>
                {meta.desc}
              </span>

              {/* Percentage */}
              <span style={{
                color:     isEmpty ? c.borderStrong : c.textSecondary,
                fontSize:  11,
                flexShrink: 0,
              }}>
                {pct.toFixed(1)}%
              </span>

              {/* Amount */}
              <span style={{
                color:      isEmpty ? c.borderStrong : c.text,
                fontSize:   13,
                fontWeight: 700,
                flexShrink: 0,
                minWidth:   72,
                textAlign:  "right",
              }}>
                {isEmpty ? "—" : fmt(spent)}
              </span>
            </div>

            {/* Progress bar — full width */}
            <ProgressBar
              percent={pct}
              color={meta.color}
              height={5}
              trackColor={c.surface}
            />
          </div>
        );
      })}

      {/* Footer — P1+P2 combined share */}
      <div style={{
        marginTop:  2,
        paddingTop: 8,
        borderTop:  `1px solid ${c.border}`,
        display:    "flex",
        alignItems: "center",
        gap:        6,
        fontSize:   11,
        color:      c.textMuted,
      }}>
        <span>P1+P2</span>
        <span style={{
          color:      c.text,
          fontWeight: 700,
        }}>
          {criticalPct}%
        </span>
        <span>wydatków miesiąca</span>
      </div>
    </div>
  );
}