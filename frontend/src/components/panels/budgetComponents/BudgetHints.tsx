// ============================================================
// File: src/components/panels/budgetComponents/BudgetHints.tsx
//
// The hints Baza budżetu gives while a limit is being set:
//
//   ReferenceLine — "śr. 2 450 zł · Lis 2 980 zł" under the Baza input: what
//                   the category cost over the last 12 months, and in this
//                   calendar month in earlier years. Detail in the tooltip.
//   GapBadge      — "⚠ za nisko o 350 zł" under a category whose limit can't
//                   cover what the month already committed; a click puts
//                   that amount into Nadpisanie (saving stays manual).
//   GapBanner     — one line above the table counting those categories, a
//                   click away from the first of them.
//
// The rules live in utils/budgetGaps and utils/monthTotals; this is display.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { fmt, fmtWhole, monthShort, plural } from "../../../utils/helpers";
import { MONTHS } from "../../../data/constants";
import { isHardGap, type BudgetGap } from "../../../utils/budgetGaps";
import type { AverageStat } from "../../../utils/monthTotals";

/** DOM id of a category's row — the banner scrolls to it. */
export const budgetRowId = (categoryId: string) => `budget-row-${categoryId}`;

/** Row highlight for a gap: red or amber bar on the left, a tint for red. */
export function gapRowStyle(gap: BudgetGap | null | undefined): React.CSSProperties {
  if (!gap) return {};
  const color = isHardGap(gap) ? c.danger : c.warning;
  return {
    boxShadow:  `inset 3px 0 0 ${color}`,
    background: isHardGap(gap) ? alpha(c.danger, "0d") : undefined,
  };
}

// ── ReferenceLine ─────────────────────────────────────────────

interface ReferenceLineProps {
  yearly?:    AverageStat;
  sameMonth?: AverageStat;
  /** Budget month being planned, "YYYY-MM". */
  month:      string;
  gap?:       BudgetGap | null;
}

function rangeOf(stat: AverageStat): string | null {
  const series = stat.series ?? [];
  if (series.length < 2) return null;
  const hi = series.reduce((a, b) => (b.value > a.value ? b : a));
  const lo = series.reduce((a, b) => (b.value < a.value ? b : a));
  return `Najwięcej: ${fmtWhole(hi.value)} (${monthShort(hi.month)}) · najmniej: ${fmtWhole(lo.value)} (${monthShort(lo.month)})`;
}

export function ReferenceLine({ yearly, sameMonth, month, gap }: ReferenceLineProps) {
  const hasYearly = !!yearly && yearly.months > 0;
  const hasSame   = !!sameMonth && sameMonth.months > 0;
  if (!hasYearly && !hasSame) return null;

  const monthName = MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
  const lines: string[] = [];
  if (hasYearly) {
    lines.push(`Średnio z ${yearly.months} mies.: ${fmtWhole(yearly.mean)} (mediana ${fmtWhole(yearly.median)})`);
    const range = rangeOf(yearly);
    if (range) lines.push(range);
  }
  if (hasSame) {
    const years = [...(sameMonth.series ?? [])].reverse()
      .map(p => `${p.month.slice(0, 4)}: ${fmtWhole(p.value)}`).join(" · ");
    lines.push(`${monthName} w poprzednich latach: ${years}`);
  }
  if (gap?.kind === "belowAverage") {
    lines.push(`⚠ Baza jest o ${fmtWhole(gap.shortBy)} niższa niż średnia z ostatniego roku.`);
  }

  const soft = gap?.kind === "belowAverage";
  return (
    <div title={lines.join("\n")} style={{
      fontSize: 10, marginTop: 3, cursor: "help",
      color: soft ? c.warning : c.textSecondary,
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    }}>
      {soft && "⚠ "}
      {hasYearly && <>śr. {fmtWhole(yearly.mean)}</>}
      {hasYearly && hasSame && " · "}
      {hasSame && <>{monthShort(month)} {fmtWhole(sameMonth.mean)}</>}
    </div>
  );
}

// ── GapBadge ──────────────────────────────────────────────────

export function GapBadge({ gap, month, onFill }: {
  gap:     BudgetGap | null | undefined;
  month:   string;
  /** Put this amount into Nadpisanie; absent when the row is read-only. */
  onFill?: (amount: number) => void;
}) {
  if (!isHardGap(gap)) return null;

  const fill  = Math.ceil(gap.committed);
  const text  = gap.kind === "noBase"
    ? `⚠ brak bazy, a w planie ${fmt(gap.committed)}`
    : `⚠ za nisko o ${fmt(gap.shortBy)}`;
  const title = `Wydano + zaplanowane + niepotwierdzone cykliczne: ${fmt(gap.committed)}.` +
    (onFill ? `\nKliknij, żeby wpisać ${fmtWhole(fill)} w Nadpisanie na ${month} (zapis — przyciskiem na dole).` : "");

  const style: React.CSSProperties = {
    display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 6,
    fontSize: 11, fontWeight: 700, color: c.dangerLight,
    background: alpha(c.danger, "1a"), border: `1px solid ${alpha(c.danger, "55")}`, fontFamily: "inherit",
  };
  return onFill
    ? <button type="button" title={title} onClick={() => onFill(fill)} style={{ ...style, cursor: "pointer" }}>{text}</button>
    : <span title={title} style={style}>{text}</span>;
}

// ── GapBanner ─────────────────────────────────────────────────

export function GapBanner({ gaps, order }: {
  gaps:  Map<string, BudgetGap>;
  /** Category ids in the order the rows are shown — the click goes to the first. */
  order: string[];
}) {
  const hard = order.filter(id => isHardGap(gaps.get(id)));
  const soft = order.filter(id => gaps.get(id)?.kind === "belowAverage");
  if (hard.length === 0 && soft.length === 0) return null;

  const total  = hard.reduce((sum, id) => sum + (gaps.get(id)?.shortBy ?? 0), 0);
  const target = hard[0] ?? soft[0];
  const color  = hard.length ? c.danger : c.warning;
  const scroll = () => document.getElementById(budgetRowId(target))
    ?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <button type="button" onClick={scroll} title="Pokaż pierwszą z nich" style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
      margin: "0 0 8px", padding: "10px 14px", borderRadius: 10,
      background: alpha(color, "11"), border: `1px solid ${alpha(color, "55")}`,
    }}>
      {hard.length > 0 && (
        <div style={{ fontSize: 13, fontWeight: 700, color: c.dangerLight }}>
          ⚠ {hard.length} {plural(hard.length, "kategoria ma", "kategorie mają", "kategorii ma")} bazę poniżej
          tego, co już wydane lub zaplanowane — brakuje razem {fmt(total)}
        </div>
      )}
      {soft.length > 0 && (
        <div style={{ fontSize: 12, color: c.warning, marginTop: hard.length ? 4 : 0 }}>
          {soft.length} {plural(soft.length, "kategoria", "kategorie", "kategorii")} wyraźnie poniżej
          średniej z ostatniego roku
        </div>
      )}
    </button>
  );
}
