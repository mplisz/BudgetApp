// ============================================================
// File: src/components/ui/AveragePill.tsx
//
// "3 480 zł śr. / 3 210 zł med.  ▲ +8,6%" — a figure of the month next to
// its average and median over the previous months. Used on the KPI tiles
// and every category / subcategory row in Podsumowanie.
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
//
// `withPrevious` (KPI tiles) adds a line against the last month before this
// one — "vs Sie ▲ +4,2%", or just its amount while this month is running —
// and the tooltip also names the lowest and highest month.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { MONTH_NAMES } from "../../hooks/useRecurring";
import type { AverageStat } from "../../utils/monthTotals";

export type GoodDirection = "up" | "down" | null;

const NEUTRAL_PCT = 3;

const zl = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 });
const pct1 = (v: number) => v.toFixed(1).replace(".", ",");
const monthShort = (ym: string) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym;

/** "▲ +8,6%" coloured by whether that is good; null when there is no base. */
function change(current: number, base: number, good: GoodDirection): { text: string; color: string } | null {
  if (base <= 0) return null;
  const d = ((current - base) / base) * 100;
  if (Math.abs(d) < NEUTRAL_PCT) return { text: "≈", color: c.textMuted };
  const up = d > 0;
  const color = good === null ? c.textSecondary : (up === (good === "up") ? c.success : c.danger);
  return { text: `${up ? "▲ +" : "▼ −"}${pct1(Math.abs(d))}%`, color };
}

interface Props {
  current:       number;
  stat:          AverageStat | undefined;
  good:          GoodDirection;
  /** The month is the running calendar month. */
  inProgress:    boolean;
  size?:         "sm" | "md";
  withPrevious?: boolean;
}

export function AveragePill({ current, stat, good, inProgress, size = "md", withPrevious = false }: Props) {
  if (!stat || stat.months === 0) return null;

  const delta = stat.mean <= 0
    ? { text: "brak średniej", color: c.textMuted }
    : inProgress
      ? { text: `${Math.round((current / stat.mean) * 100)}% średniej`, color: c.textSecondary }
      : change(current, stat.mean, good)!;

  const series   = stat.series ?? [];
  const previous = series.length ? series[series.length - 1] : undefined;
  const lowest   = series.reduce<typeof previous>((m, p) => (!m || p.value < m.value ? p : m), undefined);
  const highest  = series.reduce<typeof previous>((m, p) => (!m || p.value > m.value ? p : m), undefined);

  // The pill already shows the mean and median — the tooltip only adds the
  // range, which isn't on screen anywhere else.
  const title = lowest && highest && series.length > 1
    ? `Najwięcej: ${zl.format(highest.value)} (${monthShort(highest.month)})\nNajmniej: ${zl.format(lowest.value)} (${monthShort(lowest.month)})`
    : undefined;

  const sm = size === "sm";
  const prevChange = previous && !inProgress ? change(current, previous.value, good) : null;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <span
        title={title}
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
      {withPrevious && previous && (
        <span style={{ fontSize: 10, color: c.textMuted, whiteSpace: "nowrap" }} title={prevChange ? `${monthShort(previous.month)}: ${zl.format(previous.value)}` : undefined}>
          {inProgress || !prevChange
            ? <>{monthShort(previous.month)}: {zl.format(previous.value)}</>
            : <>vs {monthShort(previous.month)} <span style={{ color: prevChange.color, fontWeight: 700 }}>{prevChange.text}</span></>}
        </span>
      )}
    </span>
  );
}
