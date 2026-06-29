// ============================================================
// File: src/components/panels/summaryComponents/TargetIndicator.tsx
// ============================================================

import { c } from "../../../styles/tokens";
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
  ok:        { icon: "✅", color: c.success, label: "OK"           },
  warning:   { icon: "⚠️", color: c.warning, label: "Uwaga"        },
  danger:    { icon: "🔴", color: c.danger, label: "Przekroczono" },
  "no-data": { icon: "—",  color: c.borderStrong, label: "Brak danych"  },
};

const STATUS_META_MIN: Record<InternalStatus, StatusMeta> = {
  ok:        { icon: "✅", color: c.success, label: "OK"        },
  warning:   { icon: "⚠️", color: c.warning, label: "Za mało"   },
  danger:    { icon: "🔴", color: c.danger, label: "Za mało"   },
  "no-data": { icon: "—",  color: c.borderStrong, label: "Brak danych" },
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
      background: c.border,
      border: `1px solid ${meta.color}44`,
      borderRadius: 14,
      padding: "14px 16px",
      flex: 1,
      minWidth: 180,
      opacity: isNoData ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ color: c.text, fontWeight: 700, fontSize: 13 }}>{icon} {label}</div>
        <div style={{ fontSize: 13 }}>
          {meta.icon}{" "}
          <span style={{ color: meta.color, fontWeight: 700, fontSize: 11 }}>{meta.label}</span>
        </div>
      </div>

    <div style={{ color: c.textTertiary, fontSize: 12, marginBottom: 8 }}>
      {isNoData ? (
        <span style={{ color: c.textMuted }}>
          {totalIncome <= 0 ? "Brak wpływów w tym miesiącu" : "Brak transakcji tego typu"}
        </span>
      ) : (
        <>
          <span style={{ color: c.text, fontWeight: 700 }}>{fmt(spent)}</span>
          {" "}
          <span style={{ color: c.textMuted }}>
            / {direction === "max" ? "max" : "min"}{" "}
            {fmt((targetPercent / 100) * totalIncome)}
            <span style={{ fontSize: 10, marginLeft: 4 }}>({targetPercent}%)</span>
          </span>
        </>
      )}
    </div>

      <ProgressBar percent={barPct} color={meta.color} height={6} />

      <div style={{ textAlign: "right", marginTop: 4 }}>
        {isNoData ? (
          <span style={{ fontSize: 11, color: c.borderStrong }}>—</span>
        ) : (
          <>
            <span style={{ fontSize: 11, color: meta.color, fontWeight: 700 }}>
              {actualPercent.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: c.textMuted, marginLeft: 4 }}>
              (cel: {targetPercent}%)
            </span>
          </>
        )}
      </div>
    </div>
  );
}