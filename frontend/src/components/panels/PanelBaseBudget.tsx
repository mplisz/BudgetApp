// ============================================================
// File: src/components/panels/PanelBaseBudget.tsx
// Panel "Baza budżetu" — per-category limits (EXPENSE + SAVING).
//
// Column layout — two visual zones separated by a vertical rule:
//
//   ◀── PLAN (budżet) ─────────────────────▶ ◀── FAKT ──▶
//   Kategoria | Baza | Nadpisanie | Aktywny ‖ Wydano | Cykl. | Plan.
//
// "Wydano"   = read-only sum of real transactions (EXPENSE or SAVING).
// "Cykliczne/Planowane" = estimated/reserved amounts, shown for EXPENSE only.
// Both sections share the SAME grid so columns align pixel-perfectly.
// The PLAN | Estymata | Faktycznie wydano separators are rendered via borderLeft on the relevant cells.
//
// Mobile (≤700px): the 7-col grid can't fit, so every row/section/total
// renders as a card instead. isMobile is resolved ONCE in the parent and
// threaded down as a prop to LimitRow / TotalsRow / SectionHeader.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppContext }  from "../../context/AppContext";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { usePanelLock }   from "../../hooks/usePanelLock";
import { useLimits, getActiveLimit } from "../../hooks/useLimits";
import type { BatchLimitChange, LimitDoc, LimitEntry, ActiveLimit } from "../../hooks/useLimits";
import { useRecurring, isActiveInMonth, isConfirmedInMonth, getActiveCost } from "../../hooks/useRecurring";
import { usePlanned, envelopePaidInMonth, type PlannedDoc } from "../../hooks/usePlanned";
import { LockBanner }     from "../ui/LockBanner";
import { BudgetInput }    from "../ui/BudgetInput";
import { fmt, todayYMD }  from "../../utils/helpers";
import { theme as s }     from "../../styles/theme";
import type { Transaction } from "../../types/summary";
import { useTransactions } from "../../hooks/useTransactions";
import { EnvelopeBreakdown } from "../ui/EnvelopeBreakdown";
import type { EnvelopeBreakdownItem } from "../ui/EnvelopeBreakdown";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useCreditCards } from "../../hooks/useCreditCards";
import { cardsDueInMonth, accountAfterMonth } from "../../utils/cardDebt";
import { CardDueStrip } from "./budgetComponents/CardDueStrip";
import { useCategoryReferences } from "../../hooks/useMonthlyAverages";
import { monthTotals, monthBalance, type AverageStat } from "../../utils/monthTotals";
import { budgetGap, projectedCost, type BudgetGap } from "../../utils/budgetGaps";
import { ReferenceLine, GapBadge, GapBanner, budgetRowId, gapRowStyle } from "./budgetComponents/BudgetHints";

// ── Types ─────────────────────────────────────────────────────

// Local view type: context AppCategory enriched with a read-only flag for
// archived categories that still carry limits.
interface AppCategory {
  id: string;
  name: string;
  icon?: string;
  type: string;
  isArchived?: boolean;
  _readOnly?: boolean;
}

interface PlannedItem {
  amount: number;
  isEnvelope: boolean;
  description: string;
}

// ── Grid — col order: Kategoria | Baza | Nadpisanie | Aktywny | Cykliczne | Planowane | Faktycznie wydano
const GRID = "1fr 140px 140px 80px 110px 130px 110px";

// Shared border style that draws the PLAN | FAKT vertical separator.
// Applied to every Wydano cell (header, data rows, totals, grand total).
const SEPARATOR: React.CSSProperties = {
  borderLeft: `1px solid ${c.borderStrong}`,
  paddingLeft: 12,
};

// ── Pure helpers ──────────────────────────────────────────────

// `openOnly`: leave out the ones already confirmed this month — their
// expense is in "Wydano" by then.
function sumRecurringForCategory(
  recurring: unknown[],
  categoryId: string,
  month: string,
  openOnly = false,
): number {
  return (recurring as any[])
    .filter(r => r.categoryId === categoryId && isActiveInMonth(r, month)
      && !(openOnly && isConfirmedInMonth(r, month)))
    .reduce((sum: number, r: any) => {
      const cost = getActiveCost(r, month);
      return sum + (cost?.amountPLN ?? cost?.amount ?? 0);
    }, 0);
}

function plannedItemsForCategory(
  planned: unknown[],
  categoryId: string,
  month: string,
): PlannedItem[] {
  return (planned as any[])
    .filter(p => !p.isArchived && !p.isPurchased && p.targetCategoryId === categoryId)
    .flatMap((p): PlannedItem[] => {
      if (p.plannedMonth === month) {
        return [{
          amount:      p.totalAmountPLN ?? p.totalAmount ?? 0,
          isEnvelope:  false,
          description: p.description || "",
        }];
      }
      return [];
    });
}

// Sum of real transactions (EXPENSE or SAVING) for a category in a given month.
function sumSpentForCategory(
  transactions: Transaction[],
  categoryId: string,
  month: string,
  txType: "EXPENSE" | "SAVING" = "EXPENSE",
): number {
  return transactions
    .filter(tx =>
      tx.categoryId === categoryId &&
      tx.budgetMonth === month &&
      tx.type === txType &&
      !tx.isArchived,
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}

// ── Mobile read-only stat tile ────────────────────────────────

function LimitStat({ label, value, color = c.text }: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: "8px 10px", minWidth: 0,
    }}>
      <div style={{
        fontSize: 10, color: c.textMuted, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ── PlannedCell ───────────────────────────────────────────────

function PlannedCell({ items }: { items: PlannedItem[] }) {
  const total = items.reduce((s, p) => s + p.amount, 0);
  if (items.length === 0) {
    return <span style={{ color: c.borderStrong, fontSize: 12 }}>—</span>;
  }
  // Single item — plain span avoids flex container causing sub-pixel drift vs Cykliczne.
  if (items.length === 1) {
    return (
      <span style={{ fontSize: 13, color: c.voucher, fontWeight: 600 }}>
        {fmt(items[0].amount)}
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
      {items.map((p, i) => (
        <div key={i} title={p.description} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {p.isEnvelope && (
            <span style={{ fontSize: 10, color: c.purpleDeep }} title="Wirtualna koperta">📋</span>
          )}
          <span style={{ fontSize: 13, color: c.voucher, fontWeight: 600 }}>
            {fmt(p.amount)}
          </span>
        </div>
      ))}
      {items.length > 1 && (
        <div style={{
          fontSize: 10, color: c.textSecondary,
          borderTop: `1px solid ${c.border}`,
          paddingTop: 2, marginTop: 1,
        }}>
          = {fmt(total)}
        </div>
      )}
    </div>
  );
}

// ── LimitRow — defined outside PanelBaseBudget to prevent remount on render ──

interface LimitRowProps {
  cat: AppCategory;
  activeBudgetMonth: string;
  getLimitDoc: (catId: string) => LimitDoc | null;
  baseEdits: Record<string, number | "">;
  overrideEdits: Record<string, number | "">;
  setBase: (catId: string, val: number | "") => void;
  setOverride: (catId: string, val: number | "") => void;
  isReadOnly: boolean;
  spentAmount: number;
  recurringAmount: number;
  plannedItems: PlannedItem[];
  showExtra?: boolean | "spent-only";
  isMobile: boolean;
  /** What the category usually costs — the line under Baza. */
  reference?: { yearly?: AverageStat; sameMonth?: AverageStat };
  /** Limit set too low for the month (EXPENSE only). */
  gap?: BudgetGap | null;
}

function LimitRow({
  cat, activeBudgetMonth, getLimitDoc,
  baseEdits, overrideEdits, setBase, setOverride,
  isReadOnly, spentAmount, recurringAmount, plannedItems,
  showExtra = true, isMobile, reference, gap,
}: LimitRowProps) {
  const referenceLine = (
    <ReferenceLine yearly={reference?.yearly} sameMonth={reference?.sameMonth} month={activeBudgetMonth} gap={gap} />
  );
  const gapBadge = (
    <GapBadge gap={gap} month={activeBudgetMonth} onFill={isReadOnly ? undefined : (v) => setOverride(cat.id, v)} />
  );
  const doc    = getLimitDoc(cat.id);
  const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;

  // Resolve base independently — stays visible even when an override is active.
  const activeLimits = (doc?.limits || []) as LimitEntry[];
  const activeBase   = activeLimits
    .filter(l => l.type === "base" && l.date <= activeBudgetMonth)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const baseHistory = activeLimits
    .filter(l => l.type === "base")
    .sort((a, b) => b.date.localeCompare(a.date));

  const hasOverride    = active?.type === "override";
  const effectiveLimit = active?.amount ?? null;
  const isOverBudget   = effectiveLimit !== null && spentAmount > effectiveLimit;

  const inputStyle: React.CSSProperties = {
    ...(s.input as React.CSSProperties),
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
  };

  if (isMobile) {
    const plannedTotal = plannedItems.reduce((sum, p) => sum + p.amount, 0);
    return (
      <div id={budgetRowId(cat.id)} style={{
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
        padding: "12px 14px", marginBottom: 8, opacity: cat._readOnly ? 0.5 : 1,
        ...gapRowStyle(gap),
      }}>
        {/* Category */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            <span style={{ fontWeight: 700, color: c.text, fontSize: 14 }}>{cat.name}</span>
            {cat._readOnly && (
              <span style={{ fontSize: 10, color: c.textMuted, fontWeight: 400 }}>(zarchiwizowana)</span>
            )}
          </div>
          {gapBadge}
        </div>

        {/* Editable: Baza + Nadpisanie */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 5 }}>
              Baza
            </label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, color: c.textSecondary, opacity: 0.6 }}>
                {activeBase ? fmt(activeBase.amount) : "—"}
              </div>
            ) : (
              <BudgetInput
                value={baseEdits[cat.id] ?? ""}
                onChange={(v) => setBase(cat.id, v)}
                style={inputStyle}
                placeholder={activeBase ? String(activeBase.amount) : "brak"}
              />
            )}
            {referenceLine}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: hasOverride ? c.warning : c.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 5 }}>
              Nadpisanie
            </label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, color: hasOverride ? c.warning : c.borderStrong, opacity: 0.6 }}>
                {hasOverride ? fmt(active!.amount) : "—"}
              </div>
            ) : (
              <BudgetInput
                value={overrideEdits[cat.id] ?? ""}
                onChange={(v) => setOverride(cat.id, v)}
                style={{ ...inputStyle, borderColor: hasOverride ? alpha(c.warning, "66") : c.border }}
                placeholder="—"
              />
            )}
          </div>
        </div>

        {/* Read-only stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
          <LimitStat
            label="Aktywny"
            value={effectiveLimit !== null ? fmt(effectiveLimit) : "—"}
            color={effectiveLimit !== null ? (hasOverride ? c.warning : c.success) : c.borderStrong}
          />
          {showExtra && (
            <LimitStat
              label="Wydano"
              value={spentAmount > 0 ? fmt(spentAmount) : "—"}
              color={spentAmount > 0 ? (isOverBudget ? c.danger : c.text) : c.borderStrong}
            />
          )}
          {showExtra === true && (
            <LimitStat
              label="Cykliczne"
              value={recurringAmount > 0 ? fmt(recurringAmount) : "—"}
              color={recurringAmount > 0 ? c.info : c.borderStrong}
            />
          )}
          {showExtra === true && (
            <LimitStat
              label="Planowane"
              value={plannedTotal > 0 ? fmt(plannedTotal) : "—"}
              color={plannedTotal > 0 ? c.voucher : c.borderStrong}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div id={budgetRowId(cat.id)} style={{
      display: "grid",
      gridTemplateColumns: GRID,
      gap: 8,
      alignItems: "start",
      padding: "10px 0",
      borderBottom: `1px solid ${c.border}`,
      opacity: cat._readOnly ? 0.5 : 1,
      ...gapRowStyle(gap),
    }}>
      {/* Category name — indented past the warning bar when there is one */}
      <div style={{ paddingTop: 2, paddingLeft: gap ? 10 : 0 }}>
        <div style={{ fontWeight: 700, color: c.text, fontSize: 13 }}>
          {cat.icon} {cat.name}
          {cat._readOnly && (
            <span style={{ fontSize: 10, color: c.textMuted, marginLeft: 6, fontWeight: 400 }}>
              (zarchiwizowana)
            </span>
          )}
        </div>
        {baseHistory.length > 1 && (
          <div style={{ fontSize: 10, color: c.borderStrong, marginTop: 2 }}>
            📝 {baseHistory.length} wersji bazy
          </div>
        )}
        {gapBadge}
      </div>

      {/* Base limit input — always shows underlying base even when override is active */}
      <div>
        {isReadOnly ? (
          <div style={{ ...inputStyle, color: c.textSecondary, cursor: "not-allowed", opacity: 0.6 }}>
            {activeBase ? fmt(activeBase.amount) : "—"}
          </div>
        ) : (
          <BudgetInput
            value={baseEdits[cat.id] ?? ""}
            onChange={(v) => setBase(cat.id, v)}
            style={inputStyle}
            placeholder={activeBase ? String(activeBase.amount) : "brak"}
          />
        )}
        {activeBase && (
          <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3 }}>
            od {activeBase.date}
          </div>
        )}
        {referenceLine}
      </div>

      {/* Override input — single-month override */}
      <div>
        {isReadOnly ? (
          <div style={{ ...inputStyle, color: hasOverride ? c.warning : c.borderStrong, cursor: "not-allowed", opacity: 0.6 }}>
            {hasOverride ? fmt(active!.amount) : "—"}
          </div>
        ) : (
          <BudgetInput
            value={overrideEdits[cat.id] ?? ""}
            onChange={(v) => setOverride(cat.id, v)}
            style={{ ...inputStyle, borderColor: hasOverride ? alpha(c.warning, "66") : c.border }}
            placeholder="—"
          />
        )}
        {hasOverride && (
          <div style={{ fontSize: 10, color: c.warning, marginTop: 3 }}>
            ⚡ nadpisanie {activeBudgetMonth}
          </div>
        )}
      </div>

      {/* Active limit (base or override) */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {effectiveLimit !== null ? (
          <span style={{ fontWeight: 700, fontSize: 13, color: hasOverride ? c.warning : c.success }}>
            {fmt(effectiveLimit)}
          </span>
        ) : (
          <span style={{ color: c.borderStrong, fontSize: 12 }}>—</span>
        )}
      </div>

      {/* Cykliczne — empty cell for SAVING preserves grid alignment */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {showExtra === true && (recurringAmount > 0 ? (
          <span style={{ fontSize: 13, color: c.info, fontWeight: 600 }}>
            {fmt(recurringAmount)}
          </span>
        ) : (
          <span style={{ color: c.borderStrong, fontSize: 12 }}>—</span>
        ))}
      </div>

      {/* Planowane — empty cell for SAVING preserves grid alignment */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {showExtra === true && <PlannedCell items={plannedItems} />}
      </div>

      {/* Faktycznie wydano — real transactions; rightmost column; separator from Estymata zone */}
      <div style={{ textAlign: "right", paddingTop: 2, ...SEPARATOR }}>
        {showExtra && (
          spentAmount > 0 ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: isOverBudget ? c.danger : c.text }}>
              {fmt(spentAmount)}
            </span>
          ) : (
            <span style={{ color: c.borderStrong, fontSize: 12 }}>—</span>
          )
        )}
      </div>
    </div>
  );
}

// ── Unlisted-spend note ───────────────────────────────────────
// Money that IS in the total above but has no row here, because its category
// is archived without a limit, deleted, or no longer of this type. Silence
// would mean the section quietly under-reports.

function UnlistedNote({ amount }: { amount: number }) {
  if (amount <= 0.005) return null;
  return (
    <div style={{
      margin: "-4px 0 12px", padding: "8px 14px",
      background: alpha(c.warning, "11"), border: `1px solid ${alpha(c.warning, "44")}`,
      borderRadius: 8, fontSize: 12, color: c.warning,
    }}>
      ⚠️ W sumie ujęto <strong>{fmt(amount)}</strong> z transakcji bez pasującego wiersza
      (kategoria zarchiwizowana, usunięta lub o zmienionym typie).
    </div>
  );
}

// ── TotalsRow ─────────────────────────────────────────────────

function TotalsRow({ activeLimit, spent, recurring, planned, showExtra = true, isMobile }: {
  activeLimit: number;
  spent:       number;
  recurring:   number;
  planned:     number;
  showExtra?:  boolean | "spent-only";
  isMobile:    boolean;
}) {
  const isOverBudget = activeLimit > 0 && spent > activeLimit;

  if (isMobile) {
    return (
      <div style={{
        background: c.bg, border: `1px solid ${c.borderStrong}`, borderRadius: 10,
        padding: "12px 14px", marginBottom: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Suma
          </span>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
            {activeLimit > 0 && (
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                Aktywny <strong style={{ fontSize: 15, color: c.success }}>{fmt(activeLimit)}</strong>
              </span>
            )}
            {showExtra && spent > 0 && (
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                Wydano <strong style={{ fontSize: 15, color: isOverBudget ? c.danger : c.text }}>{fmt(spent)}</strong>
              </span>
            )}
          </div>
        </div>
        {showExtra === true && (recurring > 0 || planned > 0) && (
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: c.textSecondary, flexWrap: "wrap" }}>
            {recurring > 0 && <span>Cykliczne <strong style={{ color: c.info }}>{fmt(recurring)}</strong></span>}
            {planned > 0 && <span>Planowane <strong style={{ color: c.voucher }}>{fmt(planned)}</strong></span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GRID,
      gap: 8,
      alignItems: "center",
      padding: "10px 0",
      borderTop: `2px solid ${c.borderStrong}`,
      background: c.bg,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Suma
      </div>
      <div />{/* base */}
      <div />{/* override */}
      <div style={{ textAlign: "right" }}>
        {activeLimit > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: c.success }}>{fmt(activeLimit)}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {showExtra === true && recurring > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: c.info }}>{fmt(recurring)}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {showExtra === true && planned > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: c.voucher }}>{fmt(planned)}</span>
        )}
      </div>
      <div style={{ textAlign: "right", ...SEPARATOR }}>
        {showExtra && spent > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: isOverBudget ? c.danger : c.text }}>
            {fmt(spent)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── ResultBox — Nadwyżka / Niedobór and ≈ Na koncie under Razem budżet ──

function ResultBox({ label, value, title, large }: {
  label:  string;
  value:  number;
  title?: string;
  /** Mobile: a full-width row instead of a compact box. */
  large?: boolean;
}) {
  const good = value >= 0;
  return (
    <div title={title} style={{
      ...(large
        ? { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8 }
        : { textAlign: "right", padding: "8px 12px", borderRadius: 6 }),
      background: alpha(good ? c.success : c.danger, "11"),
      border: `1px solid ${alpha(good ? c.success : c.danger, "33")}`,
    }}>
      <div style={large
        ? { fontSize: 12, color: c.textMuted, fontWeight: 700 }
        : { fontSize: 10, color: c.textMuted, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, fontSize: large ? 16 : 15, color: good ? c.success : c.danger }}>
        {good ? "+" : ""}{fmt(value)}
      </div>
    </div>
  );
}

const FORECAST_HINT =
  "Kwota dostępna − Estymata. Estymata liczy każdą kategorię wg bazy, a tam, gdzie już wydano lub zaplanowano więcej — " +
  "wg tego, co wydane i zaplanowane.";

const ACTUAL_HINT =
  "Kwota dostępna − faktycznie wydane i odłożone − opłacone koperty. To samo co Saldo w Podsumowaniu.";

const ON_ACCOUNT_HINT =
  "Nadwyżka − spłata karty w tym miesiącu + zakupy kartą z tego miesiąca (zejdą z konta dopiero przy następnej spłacie). " +
  "Ten sam rachunek co „≈ Na koncie” w Podsumowaniu.";

// ── SectionHeader ─────────────────────────────────────────────

function SectionHeader({ title, activeBudgetMonth, showExtra = true, isMobile }: {
  title:             string;
  activeBudgetMonth: string;
  showExtra?:        boolean | "spent-only";
  isMobile:          boolean;
}) {
  // Mobile: just the title — the desktop PLAN‖FAKT label rows are grid-only.
  if (isMobile) {
    return (
      <div style={{ marginTop: 24, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: c.textStrong, fontSize: 14 }}>{title}</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginTop: 28, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: c.textStrong, fontSize: 14 }}>{title}</div>
      </div>

      {/* ── Group label row: PLAN | Estymata | Faktycznie wydano ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 8,
        paddingBottom: 4,
      }}>
        <div />{/* category */}
        {/* PLAN spans: Baza + Nadpisanie + Aktywny = cols 2-4 */}
        <div style={{ gridColumn: "2 / 5", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Plan
          </span>
          <div style={{ flex: 1, height: 1, background: c.border }} />
        </div>
        {/* Estymata — cols 5-6, only for EXPENSE */}
        {showExtra === true ? (
          <div style={{ gridColumn: "5 / 7", display: "flex", alignItems: "center", gap: 6, borderLeft: `1px solid ${c.borderStrong}`, paddingLeft: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Estymata
            </span>
            <div style={{ flex: 1, height: 1, background: c.border }} />
          </div>
        ) : (
          <div style={{ gridColumn: "5 / 7" }} />
        )}
        {/* Faktycznie wydano — col 7, always shown when showExtra truthy */}
        <div style={{ gridColumn: "7 / 8", display: "flex", alignItems: "center", gap: 6, ...SEPARATOR }}>
          <div style={{ flex: 1, height: 1, background: c.border }} />
        </div>
      </div>

      {/* ── Column header row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 8,
        padding: "4px 0 10px",
        borderBottom: `2px solid ${c.border}`,
        marginBottom: 4,
      }}>
        <div style={s.label}>Kategoria</div>
        <div style={s.label}>
          Baza
          <div style={{ fontSize: 10, color: c.borderStrong, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            od daty wzwyż
          </div>
        </div>
        <div style={s.label}>
          Nadpisanie
          <div style={{ fontSize: 10, color: c.borderStrong, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            tylko {activeBudgetMonth}
          </div>
        </div>
        <div style={{ ...s.label, textAlign: "right" }}>Aktywny</div>

        {/* Cykliczne — Estymata zone, EXPENSE only */}
        <div style={{ ...s.label, textAlign: "right", color: c.info, borderLeft: `1px solid ${c.borderStrong}`, paddingLeft: 12 }}>
          {showExtra === true && (
            <>
              🔄 Cykliczne
              <div style={{ fontSize: 10, color: c.borderStrong, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ten miesiąc
              </div>
            </>
          )}
        </div>
        <div style={{ ...s.label, textAlign: "right", color: c.voucher }}>
          {showExtra === true && "📅 Planowane"}
        </div>

        {/* Faktycznie wydano — rightmost, separator from Estymata zone */}
        <div style={{ ...s.label, textAlign: "right", color: c.text, ...SEPARATOR }}>
          {showExtra && "Faktycznie wydano"}
        </div>
      </div>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export default function PanelBaseBudget() {
  const { categories, transactions } = useAppContext();
  const { activeBudgetMonth } = useMonthStatus();
  const { isPastMonth, isMonthClosed, isHistoricalLock } = usePanelLock(activeBudgetMonth);

  // Single source of truth for the responsive switch — threaded to subcomponents.
  const isMobile = useIsMobile();

  const {
    limits, isLoading, isSaving,
    loadLimits, saveLimitsBatch, getLimitDoc,
  } = useLimits();

  const { recurring, loadAll: loadRecurring } = useRecurring();
  const { planned, loadAll: loadPlanned } = usePlanned();

  const { loadTransactions } = useTransactions();

  // Credit cards — refreshed on entry, what is due has to be current here.
  const { data: cardData, reload: reloadCards } = useCreditCards();
  useEffect(() => { reloadCards(); }, [reloadCards]);
  const cardStatements = useMemo(
    () => cardsDueInMonth(cardData, activeBudgetMonth, todayYMD()),
    [cardData, activeBudgetMonth],
  );
  const cardRepayment = cardStatements.reduce((sum, st) => sum + st.toPay, 0);

  const [baseEdits,     setBaseEdits]     = useState<Record<string, number | "">>({});
  const [overrideEdits, setOverrideEdits] = useState<Record<string, number | "">>({});
  const [isDirty,       setIsDirty]       = useState(false);

  useEffect(() => {
    loadLimits();
    loadRecurring();
    loadPlanned();
    loadTransactions(activeBudgetMonth);
  }, [activeBudgetMonth]);

  // ── Category lists ────────────────────────────────────────

  const expenseCategories = useMemo<AppCategory[]>(() => {
    const active = (categories || []).filter(c => c.type === "EXPENSE" && !c.isArchived);
    const archivedWithLimits = (categories || []).filter(c =>
      c.type === "EXPENSE" && c.isArchived &&
      limits.some(l => l.categoryId === c.id && getActiveLimit(l, activeBudgetMonth))
    );
    return [...active, ...archivedWithLimits.map(c => ({ ...c, _readOnly: true }))];
  }, [categories, limits, activeBudgetMonth]);

  const savingCategories = useMemo<AppCategory[]>(() => {
    const active = (categories || []).filter(c => c.type === "SAVING" && !c.isArchived);
    const archivedWithLimits = (categories || []).filter(c =>
      c.type === "SAVING" && c.isArchived &&
      limits.some(l => l.categoryId === c.id && getActiveLimit(l, activeBudgetMonth))
    );
    return [...active, ...archivedWithLimits.map(c => ({ ...c, _readOnly: true }))];
  }, [categories, limits, activeBudgetMonth]);

  // ── Virtual envelopes for current month (info-only) ──────

  const envelopeBreakdown = useMemo<EnvelopeBreakdownItem[]>(() => {
    const items: EnvelopeBreakdownItem[] = [];
    for (const p of (planned as any[])) {
      if (p.isArchived || p.isPurchased || p.mode !== "envelope") continue;
      const entry = (p.virtualSavings || []).find(
        (v: any) => v.month === activeBudgetMonth && !v.dismissedByUser,
      );
      if (!entry) continue;
      items.push({
        categoryName: p.targetCategoryName,
        description:  p.description,
        amount:       entry.amountPLN || entry.amount || 0,
        isPaid:       !!entry.paidByUser,
      });
    }
    return items;
  }, [planned, activeBudgetMonth]);

  const envelopeTotal = useMemo(
    () => envelopeBreakdown.reduce((s, i) => s + i.amount, 0),
    [envelopeBreakdown],
  );

  // ── The month as Podsumowanie counts it ──────────────────
  // Available funds (income + transfers) and the actual result (Saldo) come
  // from utils/monthTotals, so they are the same figures Podsumowanie shows.

  const cashTotals    = useMemo(() => monthTotals(transactions, activeBudgetMonth), [transactions, activeBudgetMonth]);
  const monthlyIncome = cashTotals.types.INCOME + cashTotals.types.TRANSFER;
  const actualResult  = useMemo(
    () => monthBalance(cashTotals, envelopePaidInMonth(planned as PlannedDoc[], activeBudgetMonth)),
    [cashTotals, planned, activeBudgetMonth],
  );

  // ── Init edit state (EXPENSE + SAVING combined) ───────────

  useEffect(() => {
    const bases: Record<string, number | ""> = {};
    const overrides: Record<string, number | ""> = {};
    for (const cat of [...expenseCategories, ...savingCategories]) {
      const doc          = getLimitDoc(cat.id);
      const active       = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const limitsArr    = (doc?.limits || []) as LimitEntry[];
      const initBase     = limitsArr
        .filter(l => l.type === "base" && l.date <= activeBudgetMonth)
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      bases[cat.id]     = initBase ? initBase.amount : "";
      overrides[cat.id] = active?.type === "override" ? active.amount : "";
    }
    setBaseEdits(bases);
    setOverrideEdits(overrides);
    setIsDirty(false);
  }, [limits, expenseCategories, savingCategories, activeBudgetMonth]);

  const setBase = useCallback((catId: string, val: number | "") => {
    setBaseEdits(p => ({ ...p, [catId]: val }));
    setIsDirty(true);
  }, []);

  const setOverride = useCallback((catId: string, val: number | "") => {
    setOverrideEdits(p => ({ ...p, [catId]: val }));
    setIsDirty(true);
  }, []);

  // ── Save ─────────────────────────────────────────────────

  async function handleSave() {
    const changes: BatchLimitChange[] = [];

    for (const cat of [...expenseCategories, ...savingCategories]) {
      if (cat._readOnly) continue;

      const doc      = getLimitDoc(cat.id);
      const active   = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const baseVal  = typeof baseEdits[cat.id]     === "number" ? baseEdits[cat.id]     as number : NaN;
      const ovrVal   = typeof overrideEdits[cat.id] === "number" ? overrideEdits[cat.id] as number : NaN;

      const activeBase   = active?.type === "base" ? active : null;
      const baseChanged  = !isNaN(baseVal) && baseVal !== (activeBase?.amount ?? NaN);
      if (baseChanged) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: baseVal, type: "base", action: "upsert" });
      }

      const hasOverride = overrideEdits[cat.id] !== "" && !isNaN(ovrVal);
      const hadOverride = active?.type === "override";
      if (hasOverride && ovrVal !== active?.amount) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: ovrVal, type: "override", action: "upsert" });
      } else if (!hasOverride && hadOverride) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: 0, type: "override", action: "delete" });
      }
    }

    if (changes.length > 0) {
      await saveLimitsBatch(changes);
    }
    setIsDirty(false);
  }

  // ── Totals ───────────────────────────────────────────────

  // "Wydano" is summed over TRANSACTIONS BY TYPE, never over the category rows
  // above: a transaction whose category has since been archived without a
  // limit, deleted, or retyped belongs to no listed row, and summing per row
  // dropped its money from the total without a trace. `unlisted` is that gap,
  // surfaced under the section instead of hidden.
  const spentByType = useMemo(() => {
    let expense = 0, saving = 0;
    for (const t of transactions) {
      if (t.budgetMonth !== activeBudgetMonth || t.isArchived) continue;
      if      (t.type === "EXPENSE") expense += t.amount;
      else if (t.type === "SAVING")  saving  += t.amount;
    }
    return { expense, saving };
  }, [transactions, activeBudgetMonth]);

  // What an expense category has committed this month: spent so far, planned
  // and not bought yet, recurring and not confirmed yet. Read by both the
  // too-low warnings and Estymata.
  const commitmentsOf = (catId: string) => ({
    spent:         sumSpentForCategory(transactions, catId, activeBudgetMonth),
    plannedOpen:   plannedItemsForCategory(planned, catId, activeBudgetMonth).reduce((s, p) => s + p.amount, 0),
    recurringOpen: sumRecurringForCategory(recurring, catId, activeBudgetMonth, true),
  });

  // `projected` — what the section is expected to cost: per category its
  // limit, or what was already committed once that is more, plus spend with
  // no row. A limit can't make money already spent smaller.
  const expenseTotals = useMemo(() => {
    let activeLimit = 0, listedSpent = 0, recurringSum = 0, plannedSum = 0, projected = 0;
    for (const cat of expenseCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const commitments = commitmentsOf(cat.id);
      if (active) activeLimit += active.amount;
      listedSpent  += commitments.spent;
      recurringSum += sumRecurringForCategory(recurring, cat.id, activeBudgetMonth);
      plannedSum   += commitments.plannedOpen;
      projected    += projectedCost(active?.amount ?? null, commitments);
    }
    const unlisted = spentByType.expense - listedSpent;
    return {
      activeLimit, spent: spentByType.expense,
      recurring: recurringSum, planned: plannedSum,
      unlisted, projected: projected + Math.max(0, unlisted),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseCategories, limits, transactions, recurring, planned, activeBudgetMonth, spentByType]);

  const savingTotals = useMemo(() => {
    let activeLimit = 0, listedSpent = 0, projected = 0;
    for (const cat of savingCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const spent  = sumSpentForCategory(transactions, cat.id, activeBudgetMonth, "SAVING");
      if (active) activeLimit += active.amount;
      listedSpent += spent;
      projected   += projectedCost(active?.amount ?? null, { spent, plannedOpen: 0, recurringOpen: 0 });
    }
    const unlisted = spentByType.saving - listedSpent;
    return {
      activeLimit, spent: spentByType.saving, recurring: 0, planned: 0,
      unlisted, projected: projected + Math.max(0, unlisted),
    };
  }, [savingCategories, limits, transactions, activeBudgetMonth, spentByType]);

  // ── Reference averages and too-low limits ─────────────────

  // What each category usually costs (12 months + this month in earlier years).
  const references = useCategoryReferences(activeBudgetMonth);
  const referenceOf = (catId: string) => references
    ? { yearly: references.yearly.get(catId), sameMonth: references.sameMonth.get(catId) }
    : undefined;

  // Judged against the limit as it stands in the form, so a fix shows the
  // moment it is typed — before it is saved.
  const gaps = useMemo(() => {
    const out = new Map<string, BudgetGap>();
    if (isHistoricalLock) return out;   // a closed month has nothing left to fix
    for (const cat of expenseCategories) {
      if (cat._readOnly) continue;
      const ovr = overrideEdits[cat.id], base = baseEdits[cat.id];
      const gap = budgetGap({
        limit:   typeof ovr === "number" ? ovr : typeof base === "number" ? base : null,
        ...commitmentsOf(cat.id),
        average: references?.yearly.get(cat.id)?.mean,
      });
      if (gap) out.set(cat.id, gap);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseCategories, overrideEdits, baseEdits, transactions, planned, recurring, references, activeBudgetMonth, isHistoricalLock]);

  // ── Row renderers ─────────────────────────────────────────

  const renderExpenseRow = (cat: AppCategory) => (
    <LimitRow
      key={cat.id}
      cat={cat}
      activeBudgetMonth={activeBudgetMonth}
      getLimitDoc={getLimitDoc}
      baseEdits={baseEdits}
      overrideEdits={overrideEdits}
      setBase={setBase}
      setOverride={setOverride}
      isReadOnly={isHistoricalLock || !!cat._readOnly}
      spentAmount={sumSpentForCategory(transactions, cat.id, activeBudgetMonth)}
      recurringAmount={sumRecurringForCategory(recurring, cat.id, activeBudgetMonth)}
      plannedItems={plannedItemsForCategory(planned, cat.id, activeBudgetMonth)}
      isMobile={isMobile}
      reference={referenceOf(cat.id)}
      gap={gaps.get(cat.id)}
    />
  );

  const renderSavingRow = (cat: AppCategory) => (
    <LimitRow
      key={cat.id}
      cat={cat}
      activeBudgetMonth={activeBudgetMonth}
      getLimitDoc={getLimitDoc}
      baseEdits={baseEdits}
      overrideEdits={overrideEdits}
      setBase={setBase}
      setOverride={setOverride}
      isReadOnly={isHistoricalLock || !!cat._readOnly}
      spentAmount={sumSpentForCategory(transactions, cat.id, activeBudgetMonth, "SAVING")}
      recurringAmount={0}
      plannedItems={[]}
      showExtra="spent-only"
      isMobile={isMobile}
      reference={referenceOf(cat.id)}
    />
  );

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={s.sectionTitle}>🏦 Baza budżetu</div>
        <div style={{ fontSize: 13, color: c.textSecondary }}>
          {activeBudgetMonth} · planowanie wydatków i oszczędności
        </div>
      </div>

      <LockBanner isPastMonth={isPastMonth} isMonthClosed={isMonthClosed} selectedMonth={activeBudgetMonth} />

      {isLoading && (
        <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && (
        <>
          <CardDueStrip statements={cardStatements} month={activeBudgetMonth} />
          <GapBanner gaps={gaps} order={expenseCategories.map(cat => cat.id)} />

          {/* ── EXPENSE ── */}
          <SectionHeader title="💸 Wydatki" activeBudgetMonth={activeBudgetMonth} isMobile={isMobile} />
          {expenseCategories.map(renderExpenseRow)}
          <TotalsRow
            activeLimit={expenseTotals.activeLimit}
            spent={expenseTotals.spent}
            recurring={expenseTotals.recurring}
            planned={expenseTotals.planned}
            isMobile={isMobile}
          />
          <UnlistedNote amount={expenseTotals.unlisted} />

          {/* ── SAVING ── */}
          <SectionHeader title="🏦 Oszczędności" activeBudgetMonth={activeBudgetMonth} showExtra="spent-only" isMobile={isMobile} />
          {savingCategories.map(renderSavingRow)}
          <TotalsRow
            activeLimit={savingTotals.activeLimit}
            spent={savingTotals.spent}
            recurring={savingTotals.recurring}
            planned={savingTotals.planned}
            showExtra="spent-only"
            isMobile={isMobile}
          />
          <UnlistedNote amount={savingTotals.unlisted} />

          {/* ── GRAND TOTAL ── */}
          {(expenseTotals.activeLimit + savingTotals.activeLimit) > 0 && (() => {
            const baseOutflow  = expenseTotals.activeLimit + savingTotals.activeLimit + envelopeTotal;
            const totalOutflow = expenseTotals.projected + savingTotals.projected + envelopeTotal;
            const overBase     = totalOutflow - baseOutflow;
            const surplus      = monthlyIncome - totalOutflow;
            const hasSurplus   = monthlyIncome > 0;
            // Once anything is spent, what the month actually came to so far.
            const showActual   = expenseTotals.spent + savingTotals.spent > 0;
            // Where the bank account lands once the card is reckoned in —
            // only for a month that repays a statement and only when it differs.
            const onAccount    = accountAfterMonth(surplus, cardData, cardStatements, activeBudgetMonth);
            const showAccount  = cardStatements.length > 0 && Math.abs(onAccount - surplus) >= 0.005;

            const results = [
              { label: `${surplus >= 0 ? "Nadwyżka" : "Niedobór"} · prognoza`, value: surplus, title: FORECAST_HINT },
              ...(showActual  ? [{ label: "Wynik faktyczny", value: actualResult, title: ACTUAL_HINT }] : []),
              ...(showAccount ? [{ label: "≈ Na koncie", value: onAccount, title: ON_ACCOUNT_HINT }] : []),
            ];
            const outflowNotes = (
              <>
                {overBase > 0.005 && (
                  <span style={{ fontSize: 10, color: c.danger }}>w tym {fmt(overBase)} ponad bazę</span>
                )}
                {envelopeTotal > 0 && (
                  <span style={{ fontSize: 10, color: c.voucher }}>w tym 🪙 {fmt(envelopeTotal)} koperty</span>
                )}
              </>
            );

            // Mobile: compact card — estimate vs available, then the results stacked.
            if (isMobile) {
              const line: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline" };
              return (
                <div style={{
                  marginTop: 8, border: `1px solid ${alpha(c.success, "44")}`, borderRadius: 12,
                  background: c.surface, padding: "14px 16px",
                }}>
                  <div style={line}>
                    <span style={{ fontSize: 12, color: c.textTertiary }}>📤 Estymata wydatków</span>
                    <span style={{ fontWeight: 700, color: c.text, fontSize: 14 }}>{fmt(totalOutflow)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginBottom: 10 }}>
                    {outflowNotes}
                  </div>
                  <div style={{ ...line, marginBottom: showAccount ? 8 : 12 }}>
                    <span style={{ fontSize: 12, color: c.textTertiary }}>📥 Kwota dostępna</span>
                    <span style={{ fontWeight: 700, color: c.success, fontSize: 14 }}>{fmt(monthlyIncome)}</span>
                  </div>
                  {hasSurplus && showAccount && (
                    <div style={{ ...line, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: c.textTertiary }}>💳 Spłata karty</span>
                      <span style={{ fontWeight: 700, color: c.warning, fontSize: 14 }}>−{fmt(cardRepayment)}</span>
                    </div>
                  )}
                  {hasSurplus && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {results.map(r => <ResultBox key={r.label} large {...r} />)}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div style={{
                marginTop: 8,
                border: `1px solid ${alpha(c.success, "44")}`,
                borderRadius: 8,
                overflow: "hidden",
              }}>
                {/* Row 1 — limits / spent / recurring / planned totals */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 12px",
                  background: c.bg,
                  borderBottom: hasSurplus ? `1px solid ${c.border}` : "none",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: c.success, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    💰 Razem budżet
                  </div>
                  <div />{/* base */}
                  <div />{/* override */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: c.success }}>
                      {fmt(expenseTotals.activeLimit + savingTotals.activeLimit)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {(expenseTotals.recurring + savingTotals.recurring) > 0 && (
                      <span style={{ fontWeight: 800, fontSize: 13, color: c.info }}>
                        {fmt(expenseTotals.recurring + savingTotals.recurring)}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {(expenseTotals.planned + savingTotals.planned) > 0 && (
                      <span style={{ fontWeight: 800, fontSize: 13, color: c.voucher }}>
                        {fmt(expenseTotals.planned + savingTotals.planned)}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right", ...SEPARATOR }}>
                    {(expenseTotals.spent + savingTotals.spent) > 0 && (
                      <span style={{
                        fontWeight: 800, fontSize: 13,
                        color: (expenseTotals.spent + savingTotals.spent) > (expenseTotals.activeLimit + savingTotals.activeLimit) ? c.danger : c.text,
                      }}>
                        {fmt(expenseTotals.spent + savingTotals.spent)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2 — estimate vs available funds, then the results */}
                {hasSurplus && (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "10px 12px",
                    background: c.surface,
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: c.textTertiary }}>
                        <span>📤 Estymata wydatków:</span>
                        <span style={{ fontWeight: 700, color: c.text }}>
                          {fmt(totalOutflow)}
                        </span>
                        {outflowNotes}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: c.textTertiary }}>
                        <span>📥 Kwota dostępna w miesiącu:</span>
                        <span style={{ fontWeight: 700, color: c.success }}>
                          {fmt(monthlyIncome)}
                        </span>
                      </div>
                      {showAccount && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: c.textTertiary }}>
                          <span>💳 Spłata karty w tym miesiącu:</span>
                          <span style={{ fontWeight: 700, color: c.warning }}>−{fmt(cardRepayment)}</span>
                          <span style={{ fontSize: 10, color: c.textMuted }}>(koszty już policzone w poprzednim miesiącu)</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      {results.map(r => <ResultBox key={r.label} {...r} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Virtual envelopes — info-only ── */}
          <EnvelopeBreakdown
            items={envelopeBreakdown}
            total={envelopeTotal}
            activeBudgetMonth={activeBudgetMonth}
            style={{ marginTop: 24 }}
          />

          {/* Save bar */}
          {!isHistoricalLock && isDirty && (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { loadLimits(); setIsDirty(false); }}
                style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textTertiary, cursor: "pointer", fontWeight: 600 }}
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ ...s.btn(c.success), opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                {isSaving ? "Zapisuję…" : "💾 Zapisz limity"}
              </button>
            </div>
          )}

          {/* Legend */}
          <div style={{ marginTop: 32, fontSize: 11, color: c.borderStrong, lineHeight: 1.9 }}>
            <div style={{ color: c.textMuted, fontWeight: 700, marginBottom: 2 }}>Plan</div>
            <div>🟢 <strong style={{ color: c.textMuted }}>Baza</strong> — limit obowiązujący od podanego miesiąca wzwyż.</div>
            <div>🟡 <strong style={{ color: c.textMuted }}>Nadpisanie</strong> — jednorazowa korekta tylko dla {activeBudgetMonth}.</div>
            <div>📊 <strong style={{ color: c.textMuted }}>śr. / miesiąc</strong> pod bazą — średni koszt z ostatnich 12 mies. i z tego miesiąca w poprzednich latach (szczegóły po najechaniu).</div>
            <div>🔴 <strong style={{ color: c.textMuted }}>Za nisko</strong> — baza nie pokrywa tego, co już wydane, zaplanowane i cykliczne jeszcze niepotwierdzone. 🟠 wyraźnie poniżej średniej.</div>
            <div style={{ marginTop: 8, color: c.textMuted, fontWeight: 700, marginBottom: 2 }}>Faktycznie wydano</div>
            <div>⚪ <strong style={{ color: c.textMuted }}>Faktycznie wydano</strong> — rzeczywiste transakcje z tego miesiąca (czerwone = przekroczony limit).</div>
            <div style={{ marginTop: 8, color: c.textMuted, fontWeight: 700, marginBottom: 2 }}>Estymata</div>
            <div>🔵 <strong style={{ color: c.textMuted }}>Cykliczne</strong> — przewidywane koszty cykliczne; mogą, ale nie muszą wystąpić.</div>
            <div>🟣 <strong style={{ color: c.textMuted }}>Planowane</strong> — zaplanowany jednorazowy wydatek; może, ale nie musi wystąpić.</div>
          </div>
        </>
      )}
    </div>
  );
}
