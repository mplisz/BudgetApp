// ============================================================
// File: src/components/panels/summaryComponents/CategoryLimitBar.tsx
// Layout: nazwa + kwoty w jednym wierszu, pasek pełna szerokość pod spodem
// ============================================================

import { useState } from "react";
import { fmt } from "../../../utils/helpers";
import { ProgressBar, EmptyState, DividerRow } from "../../ui/summaryUi";
import type { CategorySummary, SubcategorySummary } from "../../../types/summary";

interface CategoryLimitBarProps {
  category: CategorySummary;
  subcategories: SubcategorySummary[];
}

interface SubcategoryListProps {
  subcategories: SubcategorySummary[];
}

function getBarColor(percent: number): string {
  if (percent >= 100) return "#ef4444";
  if (percent >= 90)  return "#f97316";
  if (percent >= 70)  return "#f59e0b";
  return "#10b981";
}

function SubcategoryList({ subcategories }: SubcategoryListProps) {
  if (subcategories.length === 0) {
    return <EmptyState message="Brak subkategorii" padding={8} />;
  }
  return (
    <div style={{
      marginTop: 6,
      background: "#0a0f1e",
      borderRadius: 8,
      padding: "6px 10px",
      border: "1px solid #1e293b",
    }}>
      {subcategories.map((sub, i) => (
        <DividerRow
          key={sub.subcategoryId}
          isLast={i === subcategories.length - 1}
          style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}
        >
          <span style={{ color: "#64748b" }}>› {sub.subcategoryName}</span>
          <span style={{ color: "#94a3b8" }}>
            {fmt(sub.spent)}
            <span style={{ color: "#475569", marginLeft: 5 }}>({sub.percentOfCategory.toFixed(1)}%)</span>
          </span>
        </DividerRow>
      ))}
    </div>
  );
}

export function CategoryLimitBar({ category, subcategories }: CategoryLimitBarProps) {
  const [expanded, setExpanded] = useState(false);

  const hasLimit  = category.limit !== null && category.limit > 0;
  const rawPct    = category.percent ?? 0;
  const barPct    = Math.min(rawPct, 100);
  const barColor  = hasLimit ? getBarColor(rawPct) : "#334155";
  const canExpand = subcategories.length > 0;
  const isOver    = hasLimit && rawPct > 100;

  const handleToggle = () => canExpand && setExpanded(v => !v);

  // ── No-limit variant ──────────────────────────────────────
  if (!hasLimit) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div
          onClick={handleToggle}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: canExpand ? "pointer" : "default", marginBottom: 4 }}
        >
          <span style={{ color: "#64748b", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            {category.categoryIcon} {category.categoryName}
            {canExpand && <span style={{ fontSize: 10, color: "#334155" }}>{expanded ? "▲" : "▼"}</span>}
          </span>
          <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>{fmt(category.spent)}</span>
        </div>
        <div style={{ height: 3, background: "#1e293b", borderRadius: 99 }} />
        {expanded && <SubcategoryList subcategories={subcategories} />}
      </div>
    );
  }

  // ── With-limit variant ────────────────────────────────────
  return (
    <div style={{ marginBottom: 14 }}>

      {/* Row 1: icon + name + spent / limit + percent */}
      <div
        onClick={handleToggle}
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, cursor: canExpand ? "pointer" : "default" }}
      >
        {/* Icon + name */}
        <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
          {category.categoryIcon} {category.categoryName}
          {canExpand && <span style={{ fontSize: 10, color: "#475569" }}>{expanded ? "▲" : "▼"}</span>}
        </span>

        {/* Spent */}
        <span style={{ fontSize: 13, fontWeight: 700, color: barColor }}>
          {fmt(category.spent)}
        </span>

        {/* Separator */}
        <span style={{ fontSize: 12, color: "#334155" }}>/</span>

        {/* Limit */}
        <span style={{ fontSize: 12, color: "#475569" }}>
          {fmt(category.limit!)}
        </span>

        {/* Percent badge */}
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: isOver ? "#ef4444" : barColor,
          background: isOver ? "#ef444418" : `${barColor}18`,
          border: `1px solid ${isOver ? "#ef444433" : `${barColor}33`}`,
          borderRadius: 6,
          padding: "1px 6px",
          minWidth: 46,
          textAlign: "right",
        }}>
          {rawPct.toFixed(1)}%
        </span>
      </div>

      {/* Row 2: full-width progress bar */}
      <ProgressBar
        percent={barPct}
        color={barColor}
        height={6}
        trackColor="#1e293b"
      />

      {/* Subcategory drill-down */}
      {expanded && <SubcategoryList subcategories={subcategories} />}
    </div>
  );
}