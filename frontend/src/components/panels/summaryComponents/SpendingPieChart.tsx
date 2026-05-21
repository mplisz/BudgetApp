// ============================================================
// File: src/components/panels/summaryComponents/SpendingPieChart.tsx
// Pie chart of expenses by category with subcategory drill-down.
// ============================================================

import { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { fmt } from "../../../utils/helpers";
import type { CategorySummary, SubcategorySummary } from "../../../types/summary";

const PIE_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

interface SpendingPieChartProps {
  categories: CategorySummary[];
  getSubcategories: (categoryId: string) => SubcategorySummary[];
  totalExpenses: number;
}

interface PieEntry {
  name: string;
  value: number;
  categoryId: string;
  icon: string;
}

// Recharts passes (data, index, event) to onClick — only data is typed here
type PieClickHandler = (data: PieEntry) => void;

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PieEntry }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: 10,
      padding: "10px 14px",
      fontSize: 13,
    }}>
      <div style={{ color: "#e2e8f0", fontWeight: 700 }}>{d.icon} {d.name}</div>
      <div style={{ color: "#10b981", fontWeight: 800, marginTop: 4 }}>{fmt(d.value)}</div>
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: 200,
  color: "#64748b",
};

export function SpendingPieChart({ categories, getSubcategories, totalExpenses }: SpendingPieChartProps) {
  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null);

  const drillCategory = drillCategoryId
    ? categories.find(c => c.categoryId === drillCategoryId) ?? null
    : null;

  // ── Main view ─────────────────────────────────────────────
  if (!drillCategory) {
    const data: PieEntry[] = categories
      .filter(c => c.spent > 0)
      .map(c => ({
        name:       c.categoryName,
        value:      c.spent,
        categoryId: c.categoryId,
        icon:       c.categoryIcon,
      }));

    if (data.length === 0) {
      return (
        <div style={emptyStyle}>
          <span style={{ fontSize: 32 }}>🥧</span>
          <div style={{ marginTop: 8 }}>Brak wydatków w tym miesiącu</div>
        </div>
      );
    }

    const handleClick: PieClickHandler = (entry) => {
      setDrillCategoryId(entry.categoryId);
    };

    return (
      <div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>
          Kliknij wycinek → podgląd subkategorii
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={100}
              dataKey="value"
              onClick={handleClick}
              style={{ cursor: "pointer" }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: "#e2e8f0", fontSize: 12 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Drill-down view ────────────────────────────────────────
  const subs = getSubcategories(drillCategory.categoryId);

  const subData: PieEntry[] = subs.map(s => ({
    name:       s.subcategoryName,
    value:      s.spent,
    categoryId: drillCategory.categoryId,
    icon:       "›",
  }));

  return (
    <div>
      {/* Back button + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button
          onClick={() => setDrillCategoryId(null)}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#e2e8f0",
            padding: "4px 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ← Wróć
        </button>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>
          {drillCategory.categoryIcon} {drillCategory.categoryName} › subkategorie
        </span>
      </div>

      {subData.length === 0 ? (
        <div style={emptyStyle}>
          <div>Brak subkategorii</div>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={subData} cx="50%" cy="50%" outerRadius={90} dataKey="value">
                {subData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span style={{ color: "#e2e8f0", fontSize: 11 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Subcategory table */}
          <div style={{ marginTop: 10 }}>
            {subs.map((sub, i) => (
              <div key={sub.subcategoryId} style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: i < subs.length - 1 ? "1px solid #1e293b" : "none",
                fontSize: 12,
              }}>
                <span style={{ color: "#94a3b8" }}>› {sub.subcategoryName}</span>
                <span style={{ color: "#e2e8f0" }}>
                  {fmt(sub.spent)}{" "}
                  <span style={{ color: "#475569" }}>
                    ({sub.percentOfCategory.toFixed(1)}% kat. / {sub.percentOfTotal.toFixed(1)}% ogółu)
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
