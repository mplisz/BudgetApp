// ============================================================
// File: src/components/panels/summaryComponents/CategoryLimitBar.tsx
// Layout: nazwa + kwoty w jednym wierszu, pasek pełna szerokość pod spodem
// ============================================================

import { c, alpha } from "../../../styles/tokens";
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
  if (percent >= 100) return c.danger;
  if (percent >= 90)  return c.orange;
  if (percent >= 70)  return c.warning;
  return c.success;
}

function SubcategoryList({ subcategories }: SubcategoryListProps) {
  if (subcategories.length === 0) {
    return <EmptyState message="Brak subkategorii" padding={8} />;
  }
  return (
    <div style={{
      marginTop: 6,
      background: c.bg,
      borderRadius: 8,
      padding: "6px 10px",
      border: `1px solid ${c.border}`,
    }}>
      {subcategories.map((sub, i) => (
        <DividerRow
          key={sub.subcategoryId}
          isLast={i === subcategories.length - 1}
          style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}
        >
          <span style={{ color: c.textSecondary }}>› {sub.subcategoryName}</span>
          <span style={{ color: c.textTertiary }}>
            {fmt(sub.spent)}
            <span style={{ color: c.textMuted, marginLeft: 5 }}>({sub.percentOfCategory.toFixed(1)}%)</span>
          </span>
        </DividerRow>
      ))}
    </div>
  );
}

export function CategoryLimitBar({ category, subcategories }: CategoryLimitBarProps) {
  const [expanded, setExpanded] = useState(false);

  // A limit of 0 is a real limit, not a missing one — it takes the with-limit
  // rendering, matching how PanelSummary groups these rows. (The two used to
  // disagree: grouped as "has a limit", drawn as "no limit".) Spend against a
  // zero limit arrives here as an infinite percent, which clamps to a full
  // red bar below.
  const hasLimit  = category.limit !== null;
  const rawPct    = category.percent ?? 0;
  const barPct    = Math.min(rawPct, 100);
  const barColor  = hasLimit ? getBarColor(rawPct) : c.borderStrong;
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
          <span style={{ color: c.textSecondary, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            {category.categoryIcon} {category.categoryName}
            {canExpand && <span style={{ fontSize: 10, color: c.borderStrong }}>{expanded ? "▲" : "▼"}</span>}
          </span>
          <span style={{ color: c.textTertiary, fontSize: 13, fontWeight: 600 }}>{fmt(category.spent)}</span>
        </div>
        <div style={{ height: 3, background: c.border, borderRadius: 99 }} />
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
        <span style={{ fontSize: 13, color: c.text, fontWeight: 600, flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
          {category.categoryIcon} {category.categoryName}
          {canExpand && <span style={{ fontSize: 10, color: c.textMuted }}>{expanded ? "▲" : "▼"}</span>}
        </span>

        {/* Spent */}
        <span style={{ fontSize: 13, fontWeight: 700, color: barColor }}>
          {fmt(category.spent)}
        </span>

        {/* Separator */}
        <span style={{ fontSize: 12, color: c.borderStrong }}>/</span>

        {/* Limit */}
        <span style={{ fontSize: 12, color: c.textMuted }}>
          {fmt(category.limit!)}
        </span>

        {/* Percent badge */}
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: isOver ? c.danger : barColor,
          background: isOver ? alpha(c.danger, "18") : `${barColor}18`,
          border: `1px solid ${isOver ? alpha(c.danger, "33") : `${barColor}33`}`,
          borderRadius: 6,
          padding: "1px 6px",
          minWidth: 46,
          textAlign: "right",
        }}
          title={Number.isFinite(rawPct) ? undefined : "Wydatek przy zerowym limicie"}
        >
          {Number.isFinite(rawPct) ? `${rawPct.toFixed(1)}%` : "∞"}
        </span>
      </div>

      {/* Row 2: full-width progress bar */}
      <ProgressBar
        percent={barPct}
        color={barColor}
        height={6}
        trackColor={c.border}
      />

      {/* Subcategory drill-down */}
      {expanded && <SubcategoryList subcategories={subcategories} />}
    </div>
  );
}