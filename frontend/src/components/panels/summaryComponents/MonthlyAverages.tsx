// ============================================================
// File: src/components/panels/summaryComponents/MonthlyAverages.tsx
// Podsumowanie › Struktura wydatków: the month against its previous months.
//
//   <WithMonthlyAverages month> — loads the averages (useMonthlyAverages)
//     only when rendered, i.e. while the collapsible section is open, and
//     hands them to its children (null while loading).
//   <AveragesRow> — Wpływy / Transfery / Oszczędności / Wydatki, each with
//     its AveragePill. Transfers get their own tile: they are returns and
//     money moved around, so they are kept out of Wpływy and never coloured
//     good or bad.
// ============================================================

import type { ReactNode } from "react";
import { c } from "../../../styles/tokens";
import { fmt } from "../../../utils/helpers";
import { AveragePill, type GoodDirection } from "../../ui/AveragePill";
import { AVERAGE_MONTHS, useMonthlyAverages } from "../../../hooks/useMonthlyAverages";
import type { MonthlyAverages, TotalsType } from "../../../utils/monthTotals";

export function WithMonthlyAverages({ month, children }: { month: string; children: (averages: MonthlyAverages | null) => ReactNode }) {
  return <>{children(useMonthlyAverages(month))}</>;
}

const TILES: Array<{ type: TotalsType; icon: string; label: string; color: string; good: GoodDirection }> = [
  { type: "INCOME",   icon: "💰", label: "Wpływy",       color: c.success, good: "up" },
  { type: "TRANSFER", icon: "🔄", label: "Transfery",    color: c.success, good: null },
  { type: "SAVING",   icon: "🏦", label: "Oszczędności", color: c.info,    good: "up" },
  { type: "EXPENSE",  icon: "💸", label: "Wydatki",      color: c.danger,  good: "down" },
];

interface AveragesRowProps {
  current:    Record<TotalsType, number>;
  averages:   MonthlyAverages | null;
  inProgress: boolean;
}

export function AveragesRow({ current, averages, inProgress }: AveragesRowProps) {
  // Transfers only when there are any, now or in the average — like the KPI tile.
  const tiles = TILES.filter(t => t.type !== "TRANSFER" || current.TRANSFER > 0 || (averages?.types.TRANSFER.mean ?? 0) > 0);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {tiles.map(t => (
          <div key={t.type} style={{ background: c.surface, border: `1px solid ${c.borderStrong}`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: c.textSecondary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {t.icon} {t.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.color, margin: "2px 0 6px" }}>{fmt(current[t.type])}</div>
            {averages
              ? <AveragePill current={current[t.type]} stat={averages.types[t.type]} good={t.good} inProgress={inProgress} />
              : <span style={{ fontSize: 11, color: c.textMuted }}>liczę średnie…</span>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>
        {averages && averages.months.length === 0
          ? "Brak poprzednich miesięcy do porównania."
          : `Średnia i mediana z ${averages?.months.length ?? AVERAGE_MONTHS} poprzednich mies.${inProgress ? " · miesiąc w toku: procent średniej" : " · strzałka względem średniej"}`}
      </div>
    </div>
  );
}
