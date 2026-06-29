// ============================================================
// File: src/components/panels/summaryComponents/TopTransactions.tsx
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { ColorChip, EmptyState, DividerRow } from "../../ui/summaryUi";
import { PRIO_META } from "../../../types/summaryConstants";
import type { Transaction } from "../../../types/summary";

interface TopTransactionsProps {
  monthTx: Transaction[];
  totalExpenses: number;
  limit?: number;
}

export function TopTransactions({ monthTx, totalExpenses, limit = 5 }: TopTransactionsProps) {
  const top = useMemo(() =>
    [...monthTx]
      .filter(tx => tx.type === "EXPENSE")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit),
    [monthTx, limit],
  );

  if (top.length === 0) {
    return <EmptyState message="Brak wydatków" />;
  }

  return (
    <div>
      {top.map((tx, i) => {
        const pct  = totalExpenses > 0 ? (tx.amount / totalExpenses) * 100 : 0;
        const prio = tx.priority ?? 4;
        const { color } = PRIO_META[prio];

        return (
          <DividerRow key={tx.id} isLast={i === top.length - 1}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}
          >
            {/* Rank bubble */}
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              background: i === 0 ? alpha(c.warning, "22") : c.border,
              color:      i === 0 ? c.warning   : c.textMuted,
              fontSize: 11, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {i + 1}
            </div>

            {/* Category + subcategory + description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: c.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tx.categoryName}
              </div>
              <div style={{ color: c.textMuted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                › {tx.subcategoryName}
                {tx.description && <span style={{ color: c.borderStrong }}> · {tx.description}</span>}
              </div>
            </div>

            {/* Priority chip — reuses PRIO_META color, slightly tighter padding */}
            <ColorChip
              label={`P${prio}`}
              color={color}
              bgOpacity="18"
              borderOpacity="33"
              style={{ borderRadius: 5, padding: "1px 6px", fontSize: 10, flexShrink: 0 }}
            />

            {/* Amount */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: c.text, fontWeight: 800, fontSize: 14 }}>{fmt(tx.amount)}</div>
              <div style={{ color: c.textMuted, fontSize: 10 }}>{pct.toFixed(1)}% wydatków</div>
            </div>
          </DividerRow>
        );
      })}
    </div>
  );
}
