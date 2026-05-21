// ============================================================
// File: src/components/panels/summaryComponents/SavingsSummary.tsx
// ============================================================

import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { ProgressBar, EmptyState, DividerRow } from "../../ui/summaryUi";
import type { Transaction } from "../../../types/summary";

interface SavingsSummaryProps {
  monthTx: Transaction[];
  totalIncome: number;
  minSavingsPercent: number;
}

interface SavingsCategory {
  categoryId: string;
  categoryName: string;
  spent: number;
}

export function SavingsSummary({ monthTx, totalIncome, minSavingsPercent }: SavingsSummaryProps) {
  const savingsByCategory = useMemo<SavingsCategory[]>(() => {
    const map = new Map<string, SavingsCategory>();
    for (const tx of monthTx) {
      if (tx.type !== "SAVING") continue;
      if (!map.has(tx.categoryId)) {
        map.set(tx.categoryId, { categoryId: tx.categoryId, categoryName: tx.categoryName, spent: 0 });
      }
      map.get(tx.categoryId)!.spent += tx.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }, [monthTx]);

  const totalSaved = savingsByCategory.reduce((s, c) => s + c.spent, 0);
  const targetAmt  = totalIncome > 0 ? (minSavingsPercent / 100) * totalIncome : 0;
  const pct        = totalIncome > 0 ? (totalSaved / totalIncome) * 100 : 0;
  const isOk       = totalIncome > 0 && totalSaved >= targetAmt;
  const barColor   = isOk ? "#10b981" : pct >= minSavingsPercent * 0.75 ? "#f59e0b" : "#ef4444";
  // Scale bar: targetAmt = 100%, overshoot clamped by ProgressBar
  const barPct     = targetAmt > 0 ? (totalSaved / targetAmt) * 100 : 0;

  if (savingsByCategory.length === 0 && totalIncome === 0) {
    return <EmptyState message="Brak danych" />;
  }

  return (
    <div>
      {/* Summary card */}
      <div style={{
        background: "#0d1424",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 14,
        border: `1px solid ${barColor}33`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
              Łącznie odłożono
            </div>
            <div style={{ color: barColor, fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              {fmt(totalSaved)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#64748b", fontSize: 11 }}>Cel: {minSavingsPercent}% wpływów</div>
            <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>{fmt(targetAmt)}</div>
          </div>
        </div>

        <ProgressBar percent={barPct} color={barColor} height={8} trackColor="#1e293b" style={{ marginBottom: 4 }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: barColor, fontWeight: 700 }}>{pct.toFixed(1)}% wpływów</span>
          {isOk
            ? <span style={{ fontSize: 11, color: "#10b981" }}>✅ Cel osiągnięty</span>
            : targetAmt > 0 && (
              <span style={{ fontSize: 11, color: "#475569" }}>
                Brakuje: {fmt(Math.max(0, targetAmt - totalSaved))}
              </span>
            )
          }
        </div>
      </div>

      {/* Per-category breakdown */}
      {savingsByCategory.length > 0 ? (
        savingsByCategory.map((cat, i) => {
          const catPct = totalSaved > 0 ? (cat.spent / totalSaved) * 100 : 0;
          return (
            <DividerRow key={cat.categoryId} isLast={i === savingsByCategory.length - 1}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13 }}
            >
              <span style={{ color: "#94a3b8" }}>🏦 {cat.categoryName}</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
                {fmt(cat.spent)}
                <span style={{ color: "#475569", marginLeft: 8, fontSize: 11 }}>{catPct.toFixed(1)}%</span>
              </span>
            </DividerRow>
          );
        })
      ) : (
        <EmptyState message="Brak transakcji oszczędnościowych w tym miesiącu" padding={12} />
      )}
    </div>
  );
}
