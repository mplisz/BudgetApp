// ============================================================
// File: src/components/panels/analyticsComponents/SubcategoryComparison.tsx
// Month-to-month comparison of subcategories within ONE expense category.
// Category dropdown → heatmap (subcategory × month) + diverging delta chart
// (latest month vs. average of the preceding months in range — same baseline
// convention as the panel-level #7 chart).
// Amounts are NET of all returns (calculateNetAmount), matching the
// category heatmap and pie in PanelAnalytics.
// ============================================================

import { c } from "../../../styles/tokens";
import { useMemo, useState } from "react";
import { useAppContext } from "../../../context/AppContext";
import { theme as s } from "../../../styles/theme";
import { calculateNetAmount } from "../../../utils/returnUtils";
import { CategoryHeatmap, type HeatmapRow } from "./CategoryHeatmap";
import { MonthlyDeltaChart, type CategoryDelta } from "./MonthlyDeltaChart";

export interface SubcatTransaction {
  type:            string;
  budgetMonth:     string;
  categoryId:      string;
  categoryName:    string;
  subcategoryId:   string;
  subcategoryName: string;
  amount:          number;
  returns?:        Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
}

interface Props {
  transactions: SubcatTransaction[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

export function SubcategoryComparison({ transactions, months }: Props) {
  const { categories } = useAppContext();
  const [selectedId, setSelectedId] = useState<string>("");

  const monthsSet = useMemo(() => new Set(months), [months]);

  // Expense categories present in range, sorted by spend desc — dropdown options.
  const options = useMemo(() => {
    const byCat = new Map<string, { id: string; name: string; icon?: string; total: number }>();
    for (const tx of transactions) {
      if (tx.type !== "EXPENSE" || !monthsSet.has(tx.budgetMonth)) continue;
      let row = byCat.get(tx.categoryId);
      if (!row) {
        row = {
          id:    tx.categoryId,
          name:  tx.categoryName,
          icon:  categories.find(cat => cat.id === tx.categoryId)?.icon,
          total: 0,
        };
        byCat.set(tx.categoryId, row);
      }
      row.total += calculateNetAmount(tx);
    }
    return [...byCat.values()].sort((a, b) => b.total - a.total);
  }, [transactions, categories, monthsSet]);

  // Default = biggest spender; falls back when the picked id leaves the range.
  const effectiveId = options.some(o => o.id === selectedId)
    ? selectedId
    : (options[0]?.id ?? "");

  // Heatmap rows: subcategories of the selected category × months.
  const rows = useMemo<HeatmapRow[]>(() => {
    const bySub: Record<string, HeatmapRow> = {};
    for (const tx of transactions) {
      if (tx.type !== "EXPENSE" || tx.categoryId !== effectiveId) continue;
      if (!monthsSet.has(tx.budgetMonth)) continue;
      if (!bySub[tx.subcategoryId]) {
        bySub[tx.subcategoryId] = {
          categoryId:   tx.subcategoryId,
          categoryName: tx.subcategoryName,
          byMonth:      {},
        };
      }
      bySub[tx.subcategoryId].byMonth[tx.budgetMonth] =
        (bySub[tx.subcategoryId].byMonth[tx.budgetMonth] || 0) + calculateNetAmount(tx);
    }
    return Object.values(bySub).sort((a, b) => {
      const aTotal = months.reduce((sum, m) => sum + (a.byMonth[m] || 0), 0);
      const bTotal = months.reduce((sum, m) => sum + (b.byMonth[m] || 0), 0);
      return bTotal - aTotal;
    });
  }, [transactions, effectiveId, months, monthsSet]);

  // Delta: latest month vs. average of the preceding months (per subcategory).
  const deltas = useMemo<CategoryDelta[]>(() => {
    if (months.length < 2) return [];
    const cur        = months[months.length - 1];
    const priorCount = months.length - 1;
    return rows
      .map(r => {
        const current  = r.byMonth[cur] || 0;
        const priorSum = months.slice(0, -1).reduce((sum, m) => sum + (r.byMonth[m] || 0), 0);
        const baseline = priorSum / priorCount;
        return {
          categoryId:   r.categoryId,
          categoryName: r.categoryName,
          current,
          previous:     baseline,
          delta:        current - baseline,
        };
      })
      .filter(r => Math.abs(r.delta) > 0.005);
  }, [rows, months]);

  const deltaLabel = months.length >= 2
    ? (months.length === 2
        ? months[0]
        : `${months[0]}–${months[months.length - 2]}`)
    : "";

  if (options.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
        Brak wydatków w zakresie.
      </div>
    );
  }

  const selected = options.find(o => o.id === effectiveId);

  return (
    <div>
      {/* Category picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: c.textMuted, fontWeight: 600 }}>Kategoria:</span>
        <select
          value={effectiveId}
          onChange={e => setSelectedId(e.target.value)}
          style={{ ...s.select, width: "auto", minWidth: 220, padding: "8px 12px", fontSize: 13 }}
        >
          {options.map(o => (
            <option key={o.id} value={o.id}>
              {o.icon ? `${o.icon} ` : ""}{o.name}
            </option>
          ))}
        </select>
      </div>

      {/* Subcategory × month heatmap */}
      <CategoryHeatmap rows={rows} months={months} />

      {/* Latest month vs. baseline per subcategory */}
      {deltas.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: c.textMuted, fontWeight: 700, marginBottom: 8 }}>
            📊 {selected?.icon} {selected?.name} — {months[months.length - 1]} vs średnia ({deltaLabel})
          </div>
          <MonthlyDeltaChart data={deltas} topN={10} />
        </div>
      )}
    </div>
  );
}
