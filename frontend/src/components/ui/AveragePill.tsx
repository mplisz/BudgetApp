// ============================================================
// File: src/components/ui/AveragePill.tsx
//
// "3 480 zł śr. / 3 210 zł med.  ▲ +8,6%" — a figure of the month next to
// its average and median over the previous months. Used for the type totals
// and every category / subcategory row in Podsumowanie › Struktura wydatków.
//
// Colour says whether the change is GOOD, not which way it went: income and
// savings above average are green, expenses above average red; transfers
// (returns, moving money around) are neither. Under 3% it's a grey "≈".
//
// The arrow compares with the MEAN; the median sits beside it as the check —
// when the two disagree, one unusual month is pulling the mean.
//
// A month still running can't be "−73% vs average" on the 13th, so there the
// pill says how far along it is instead: "27% średniej".
// ============================================================

import { c, alpha } from "../../styles/tokens";
import type { AverageStat } from "../../utils/monthTotals";

export type GoodDirection = "up" | "down" | null;

const NEUTRAL_PCT = 3;

const zl = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 });
const pct1 = (v: number) => v.toFixed(1).replace(".", ",");

interface Props {
  current:    number;
  stat:       AverageStat | undefined;
  good:       GoodDirection;
  /** The month is the running calendar month. */
  inProgress: boolean;
  size?:      "sm" | "md";
}

export function AveragePill({ current, stat, good, inProgress, size = "md" }: Props) {
  if (!stat || stat.months === 0) return null;

  let delta: { text: string; color: string };
  if (stat.mean <= 0) {
    delta = { text: "brak średniej", color: c.textMuted };
  } else if (inProgress) {
    delta = { text: `${Math.round((current / stat.mean) * 100)}% średniej`, color: c.textSecondary };
  } else {
    const d = ((current - stat.mean) / stat.mean) * 100;
    if (Math.abs(d) < NEUTRAL_PCT) {
      delta = { text: "≈", color: c.textMuted };
    } else {
      const up = d > 0;
      const color = good === null ? c.textSecondary : (up === (good === "up") ? c.success : c.danger);
      delta = { text: `${up ? "▲ +" : "▼ −"}${pct1(Math.abs(d))}%`, color };
    }
  }

  const sm = size === "sm";
  return (
    <span
      title={`Z ${stat.months} poprzednich mies.: średnia ${zl.format(stat.mean)}, mediana ${zl.format(stat.median)}` +
        (inProgress ? ". Miesiąc w toku — procent średniej zamiast różnicy." : ". Strzałka porównuje ze średnią.")}
      style={{
        display: "inline-flex", alignItems: "center", gap: sm ? 5 : 6, flexWrap: "wrap", justifyContent: "center",
        fontSize: sm ? 10 : 11, lineHeight: 1.3, color: c.textSecondary,
        background: alpha(c.bg, "aa"), border: `1px solid ${c.borderStrong}`, borderRadius: 12,
        padding: sm ? "1px 7px" : "2px 9px", whiteSpace: "nowrap",
      }}
    >
      <span>{zl.format(stat.mean)} śr. <span style={{ color: c.textMuted }}>/</span> {zl.format(stat.median)} med.</span>
      <span style={{ color: delta.color, fontWeight: 700 }}>{delta.text}</span>
    </span>
  );
}
