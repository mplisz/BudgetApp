// ============================================================
// File: src/components/panels/analyticsComponents/TagSpendingSection.tsx
// Per-tag expense analysis: heatmap (tag × month) + top-tags bar.
// Transactions carry tag IDs; names/icons resolve via AppContext.
// A transaction with N tags is counted once per tag, so tag totals may
// overlap — share is relative to tag-attributed spend (like Top sklepy).
// Amounts are NET of all returns (calculateNetAmount).
// ============================================================

import { c } from "../../../styles/tokens";
import { useMemo } from "react";
import { useAppContext } from "../../../context/AppContext";
import { calculateNetAmount } from "../../../utils/returnUtils";
import { CategoryHeatmap, type HeatmapRow } from "./CategoryHeatmap";
import { TopCategoriesBar, type CategoryTotal } from "./TopCategoriesBar";

export interface TagTransaction {
  type:        string;
  budgetMonth: string;
  amount:      number;
  tags?:       string[];   // tag IDs
  returns?:    Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
}

interface Props {
  transactions: TagTransaction[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

export function TagSpendingSection({ transactions, months }: Props) {
  const { tags } = useAppContext();

  const monthsSet = useMemo(() => new Set(months), [months]);

  const tagById = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string }>();
    for (const t of tags) map.set(t.id, { name: t.name, icon: t.icon });
    return map;
  }, [tags]);

  // Rows: tag × month. Tags no longer in AppContext (archived) still show,
  // with a fallback label, so historical spend doesn't silently vanish.
  const rows = useMemo<HeatmapRow[]>(() => {
    const byTag: Record<string, HeatmapRow> = {};
    for (const tx of transactions) {
      if (tx.type !== "EXPENSE" || !monthsSet.has(tx.budgetMonth)) continue;
      const txTags = tx.tags ?? [];
      if (txTags.length === 0) continue;
      const eff = calculateNetAmount(tx);
      for (const tagId of txTags) {
        if (!byTag[tagId]) {
          const meta = tagById.get(tagId);
          byTag[tagId] = {
            categoryId:   tagId,
            categoryName: meta?.name ?? "(archiwalny tag)",
            icon:         meta?.icon,
            byMonth:      {},
          };
        }
        byTag[tagId].byMonth[tx.budgetMonth] =
          (byTag[tagId].byMonth[tx.budgetMonth] || 0) + eff;
      }
    }
    return Object.values(byTag).sort((a, b) => {
      const aTotal = months.reduce((sum, m) => sum + (a.byMonth[m] || 0), 0);
      const bTotal = months.reduce((sum, m) => sum + (b.byMonth[m] || 0), 0);
      return bTotal - aTotal;
    });
  }, [transactions, months, monthsSet, tagById]);

  // Top-tags bar — share relative to tag-attributed spend.
  const totals = useMemo<CategoryTotal[]>(() => {
    const list = rows.map(r => ({
      categoryId:   r.categoryId,
      categoryName: r.categoryName,
      icon:         r.icon,
      total:        months.reduce((sum, m) => sum + (r.byMonth[m] || 0), 0),
      share:        0,
    }));
    const sum = list.reduce((acc, r) => acc + r.total, 0);
    return list.map(r => ({ ...r, share: sum > 0 ? (r.total / sum) * 100 : 0 }));
  }, [rows, months]);

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
        Brak wydatków z tagami w wybranym zakresie.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12 }}>
        Transakcja z kilkoma tagami liczona jest w każdym z nich — sumy tagów mogą się nakładać.
      </div>

      {/* Tag × month heatmap */}
      <CategoryHeatmap rows={rows} months={months} />

      {/* Top tags */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: c.textMuted, fontWeight: 700, marginBottom: 8 }}>
          🏆 Top tagi (cały zakres)
        </div>
        <TopCategoriesBar data={totals} topN={10} />
      </div>
    </div>
  );
}
