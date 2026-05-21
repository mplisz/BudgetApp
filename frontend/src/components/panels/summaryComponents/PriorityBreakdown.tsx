// ============================================================
// File: src/components/panels/summaryComponents/PriorityBreakdown.tsx
// ============================================================

import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { ProgressBar, ColorChip, EmptyState } from "../../ui/summaryUi";
import { PRIO_META, PRIO_KEYS } from "../../../types/summaryConstants";
import type { Transaction } from "../../../types/summary";

interface PriorityBreakdownProps {
  monthTx: Transaction[];
  totalExpenses: number;
}

export function PriorityBreakdown({ monthTx, totalExpenses }: PriorityBreakdownProps) {
  const byPriority = useMemo<Record<1 | 2 | 3 | 4, number>>(() => {
    const map: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const tx of monthTx) {
      if (tx.type !== "EXPENSE") continue;
      map[tx.priority ?? 4] += tx.amount;
    }
    return map;
  }, [monthTx]);

  if (!PRIO_KEYS.some(p => byPriority[p] > 0)) {
    return <EmptyState message="Brak wydatków" />;
  }

  const criticalPct = totalExpenses > 0
    ? (((byPriority[1] + byPriority[2]) / totalExpenses) * 100).toFixed(1)
    : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {PRIO_KEYS.map(p => {
        const meta  = PRIO_META[p];
        const spent = byPriority[p];
        const pct   = totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0;

        return (
          <div key={p}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorChip label={meta.label} color={meta.color} />
                <span style={{ color: "#64748b", fontSize: 12 }}>{meta.desc}</span>
              </div>
              <div style={{ fontSize: 13, textAlign: "right" }}>
                <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{fmt(spent)}</span>
                <span style={{ color: "#475569", marginLeft: 8, fontSize: 11 }}>{pct.toFixed(1)}%</span>
              </div>
            </div>
            <ProgressBar percent={pct} color={meta.color} height={6} />
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>
        P1+P2 ={" "}
        <span style={{ color: "#e2e8f0" }}>{criticalPct}%</span>
        {" "}wydatków miesiąca
      </div>
    </div>
  );
}
