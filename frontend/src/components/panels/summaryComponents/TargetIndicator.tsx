// ============================================================
// File: src/components/panels/summaryComponents/TargetIndicator.tsx
// ============================================================

import { fmt } from "../../../utils/helpers";
import { ProgressBar } from "../../ui/summaryUi";
import type { IndicatorStatus } from "../../../types/summary";

interface TargetIndicatorProps {
  icon: string;
  label: string;
  spent: number;
  targetPercent: number;
  totalIncome: number;
  direction: "max" | "min";
}

type InternalStatus = IndicatorStatus | "no-data";

interface StatusMeta {
  icon: string;
  color: string;
  label: string;
}

const STATUS_META_MAX: Record<InternalStatus, StatusMeta> = {
  ok:        { icon: "✅", color: "#10b981", label: "OK"           },
  warning:   { icon: "⚠️", color: "#f59e0b", label: "Uwaga"        },
  danger:    { icon: "🔴", color: "#ef4444", label: "Przekroczono" },
  "no-data": { icon: "—",  color: "#334155", label: "Brak danych"  },
};

const STATUS_META_MIN: Record<InternalStatus, StatusMeta> = {
  ok:        { icon: "✅", color: "#10b981", label: "OK"        },
  warning:   { icon: "⚠️", color: "#f59e0b", label: "Za mało"   },
  danger:    { icon: "🔴", color: "#ef4444", label: "Za mało"   },
  "no-data": { icon: "—",  color: "#334155", label: "Brak danych" },
};

function getStatus(
  spent: number,
  targetPercent: number,
  totalIncome: number,
  direction: "max" | "min",
): InternalStatus {
  if (totalIncome <= 0) return "no-data";

  // "min" wskaźniki (emerytura, oszczędności): brak transakcji = brak danych,
  // nie naruszenie celu — użytkownik jeszcze nic nie dodał w tym miesiącu.
  if (direction === "min" && spent === 0) return "no-data";

  const pct = (spent / totalIncome) * 100;

  if (direction === "max") {
    if (pct <= targetPercent * 0.85) return "ok";
    if (pct <= targetPercent)        return "warning";
    return "danger";
  }

  if (pct >= targetPercent)        return "ok";
  if (pct >= targetPercent * 0.75) return "warning";
  return "danger";
}

export function TargetIndicator({ icon, label, spent, targetPercent, totalIncome, direction }: TargetIndicatorProps) {
  const status        = getStatus(spent, targetPercent, totalIncome, direction);
  const meta          = (direction === "min" ? STATUS_META_MIN : STATUS_META_MAX)[status];
  const isNoData      = status === "no-data";
  const actualPercent = totalIncome > 0 ? (spent / totalIncome) * 100 : 0;
  const barPct        = isNoData ? 0 : Math.min((actualPercent / (targetPercent * 1.5)) * 100, 100);

  return (
    <div style={{
      background: "#1e293b",
      border: `1px solid ${meta.color}44`,
      borderRadius: 14,
      padding: "14px 16px",
      flex: 1,
      minWidth: 180,
      opacity: isNoData ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>{icon} {label}</div>
        <div style={{ fontSize: 13 }}>
          {meta.icon}{" "}
          <span style={{ color: meta.color, fontWeight: 700, fontSize: 11 }}>{meta.label}</span>
        </div>
      </div>

      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>
        {isNoData ? (
          <span style={{ color: "#475569" }}>
            {totalIncome <= 0 ? "Brak wpływów w tym miesiącu" : "Brak transakcji tego typu"}
          </span>
        ) : (
          <>
            {fmt(spent)}{" "}
            <span style={{ color: "#475569" }}>
              / {direction === "max" ? "max" : "min"} {targetPercent}% z {fmt(totalIncome)} wpływów
            </span>
          </>
        )}
      </div>

      <ProgressBar percent={barPct} color={meta.color} height={6} />

      <div style={{ textAlign: "right", marginTop: 4 }}>
        {isNoData ? (
          <span style={{ fontSize: 11, color: "#334155" }}>—</span>
        ) : (
          <>
            <span style={{ fontSize: 11, color: meta.color, fontWeight: 700 }}>
              {actualPercent.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: "#475569", marginLeft: 4 }}>
              (cel: {targetPercent}%)
            </span>
          </>
        )}
      </div>
    </div>
  );
}