// ============================================================
// File: src/components/panels/PanelRecurring.jsx
// Redesigned with:
//   - Calendar view (monthly grid with expenses on their day)
//   - List view with sort-by-day, sort-by-amount, sort-by-name
//   - Filter by: frequency, multi-category, confirmation status
//   - "Upcoming" highlight — expenses in the next 7 days
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal }          from "react-dom";
import { useMonthStatus }        from "../../hooks/useMonthStatus";
import { usePanelLock }          from "../../hooks/usePanelLock";
import { usePagination }         from "../../hooks/usePagination";
import { useRecurring, isActiveInMonth, getActiveCost } from "../../hooks/useRecurring";
import { FREQUENCY_OPTIONS }     from "../../data/constants";
import { ConfirmModal }          from "../ui/ConfirmModal";
import { LockBanner }            from "../ui/LockBanner";
import { Pagination }            from "../ui/Pagination";
import { ToggleBtn, VIEW_TOGGLE_STYLE } from "../ui/ToggleBtn";
import { CategoryMultiSelect }   from "../ui/CategoryMultiSelect";
import { RecurringForm }         from "./recurringComponents/RecurringForm";
import { RecurringRow }          from "./recurringComponents/RecurringRow";
import { fmt }                   from "../../utils/helpers";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { RecurringDoc } from "../../types/appContext";
import type { RecurringFormPayload } from "./recurringComponents/RecurringForm";
import type { CategoryOption } from "../ui/CategoryMultiSelect";

const PAGE_SIZE = 20;

// ── Constants ─────────────────────────────────────────────────

const DAY_NAMES    = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];
const WEEKEND_DAYS = new Set(["Sob", "Nie"]);

const CAT_COLORS = [
  c.success, c.info, c.warning, c.danger, "#8b5cf6",
  c.cyan, c.orange, c.pink, c.lime, c.indigo,
];

const SORT_OPTIONS = [
  { id: "day",      label: "📅 Dzień"  },
  { id: "amount",   label: "💸 Kwota"  },
  { id: "name",     label: "A–Z"       },
  { id: "category", label: "Kategoria" },
];

const STATUS_OPTIONS = [
  { id: "",          label: "Wszystkie"      },
  { id: "pending",   label: "⏳ Oczekujące"  },
  { id: "confirmed", label: "✅ Potwierdzone" },
];

const LEGEND_ITEMS = [
  { bg: alpha(c.success, "18"), border: alpha(c.success, "44"), label: "Potwierdzony" },
  { bg: alpha(c.info, "18"), border: alpha(c.info, "55"), label: "Oczekujący"  },
  { bg: alpha(c.success, "10"), border: alpha(c.success, "55"), label: "Dziś"        },
];

// ── Pure helpers ──────────────────────────────────────────────

/** PLN amount for a doc in a given month, regardless of foreign currency. */
function getAmountPLN(doc: RecurringDoc, month: string) {
  const cost = getActiveCost(doc, month);
  if (!cost) return 0;
  return cost.originalCurrency && cost.originalCurrency !== "PLN"
    ? (cost.amountPLN ?? cost.amount ?? 0)
    : (cost.amount ?? 0);
}

/** Sum getAmountPLN over an array of docs. */
function sumAmountPLN(docs: RecurringDoc[], month: string) {
  return docs.reduce((sum, doc) => sum + getAmountPLN(doc, month), 0);
}

function getDaysInMonth(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function getFirstDayOfWeek(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday = 0
}

function getTodayDay() { return new Date().getDate(); }

function getCurrentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isCurrentMonth(yearMonth: string) { return yearMonth === getCurrentYM(); }

/** Clamp doc's plannedDay to actual days in month. */
function clampDay(doc: RecurringDoc, daysInMonth: number) {
  return Math.min(doc.plannedDay || 1, daysInMonth);
}

function isConfirmed(doc: RecurringDoc, month: string) {
  return doc.lastConfirmedMonth === month;
}

/** Deterministic color from category name — stable across renders. */
function getCatColor(catName?: string) {
  if (!catName) return CAT_COLORS[0];
  let hash = 0;
  for (let i = 0; i < catName.length; i++) {
    hash = (hash * 31 + catName.charCodeAt(i)) >>> 0;
  }
  return CAT_COLORS[hash % CAT_COLORS.length];
}

// ── Calendar sub-components ───────────────────────────────────

interface PillProps {
  doc:      RecurringDoc;
  month:    string;
  isLocked: boolean;
  onEdit:   (doc: RecurringDoc) => void;
}

type CalCell =
  | { type: "empty"; key: string }
  | { type: "day";   key: string; day: number };

function CalPill({ doc, month, isLocked, onEdit }: PillProps) {
  const amountPLN = getAmountPLN(doc, month);
  const confirmed = isConfirmed(doc, month);
  const color     = getCatColor(doc.categoryName);

  return (
    <div
      title={`${doc.description} — ${fmt(amountPLN)} PLN`}
      onClick={() => !isLocked && onEdit(doc)}
      style={{
        background:   confirmed ? alpha(c.success, "18") : `${color}18`,
        border:       `1px solid ${confirmed ? alpha(c.success, "44") : color + "55"}`,
        borderRadius: 6,
        padding:      "3px 6px",
        marginBottom: 3,
        display:      "flex",
        alignItems:   "center",
        gap:          5,
        cursor:       isLocked ? "default" : "pointer",
        transition:   "background 0.15s",
      }}
    >
      {confirmed && <span style={{ color: c.success, fontSize: 9 }}>✓</span>}
      <span style={{
        fontSize: 10, fontWeight: 600,
        color:        confirmed ? c.success : color,
        whiteSpace:   "nowrap",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        maxWidth:     90,
      }}>
        {doc.description}
      </span>
      <span style={{ fontSize: 9, color: c.textSecondary, marginLeft: "auto", whiteSpace: "nowrap" }}>
        {fmt(amountPLN)}
      </span>
    </div>
  );
}

function CalendarLegend() {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
      {LEGEND_ITEMS.map(({ bg, border, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: c.textMuted }}>
          <div style={{ width: 10, height: 10, background: bg, border: `1px solid ${border}`, borderRadius: 3 }} />
          {label}
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 11, color: c.textMuted }}>
        Kliknij kafelek, żeby edytować
      </div>
    </div>
  );
}
// ── Mobile calendar: vertical agenda ──────────────────────────
// On phones the 7-column grid is unreadable (~48px columns). Instead
// we render an agenda: only days that have recurring items, in date
// order, each as a section (day + weekday + day total) with its
// items below. Reuses the same module-level helpers as the grid
// (getAmountPLN, isConfirmed, getCatColor, sumAmountPLN, DAY_NAMES,
// WEEKEND_DAYS, CalendarLegend, fmt).
 
function AgendaItem({ doc, month, isLocked, onEdit }: PillProps) {
  const amountPLN = getAmountPLN(doc, month);
  const confirmed = isConfirmed(doc, month);
  const color     = getCatColor(doc.categoryName);
 
  return (
    <div
      title={`${doc.description} — ${fmt(amountPLN)} PLN`}
      onClick={() => !isLocked && onEdit(doc)}
      style={{
        background:   confirmed ? alpha(c.success, "18") : `${color}18`,
        border:       `1px solid ${confirmed ? alpha(c.success, "44") : color + "55"}`,
        borderRadius: 8,
        padding:      "8px 10px",
        marginBottom: 6,
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        cursor:       isLocked ? "default" : "pointer",
      }}
    >
      {confirmed && <span style={{ color: c.success, fontSize: 11 }}>✓</span>}
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 13, fontWeight: 600,
        color:        confirmed ? c.success : c.text,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
      }}>
        {doc.description}
      </span>
      <span style={{ fontSize: 12, color: c.textTertiary, fontWeight: 700, whiteSpace: "nowrap" }}>
        {fmt(amountPLN)} PLN
      </span>
    </div>
  );
}
 
interface CalendarAgendaProps {
  byDay:     Record<number, RecurringDoc[]>;
  daysCount: number;
  month:     string;
  todayDay:  number | null;
  isLocked:  boolean;
  onEdit:    (doc: RecurringDoc) => void;
}

function CalendarAgenda({ byDay, daysCount, month, todayDay, isLocked, onEdit }: CalendarAgendaProps) {
  const [y, m] = month.split("-").map(Number);

  const days: number[] = [];
  for (let d = 1; d <= daysCount; d++) {
    if ((byDay[d] || []).length > 0) days.push(d);
  }
 
  if (days.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "30px 0", color: c.borderStrong }}>
        Brak pozycji w tym miesiącu.
      </div>
    );
  }
 
  return (
    <div>
      {days.map(day => {
        const docs      = byDay[day];
        const isToday   = todayDay === day;
        const dow       = DAY_NAMES[(new Date(y, m - 1, day).getDay() + 6) % 7];
        const isWeekend = WEEKEND_DAYS.has(dow);
        const totalAmt  = sumAmountPLN(docs, month);
 
        return (
          <div key={day} style={{ marginBottom: 12 }}>
            {/* Day header */}
            <div style={{
              display: "flex", alignItems: "baseline", gap: 8,
              marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${c.border}`,
            }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: isToday ? c.success : c.text }}>
                {day}
              </span>
              <span style={{ fontSize: 12, color: isWeekend ? c.textMuted : c.textSecondary }}>{dow}</span>
              {isToday && (
                <span style={{
                  fontSize: 9, fontWeight: 800, color: c.success,
                  background: alpha(c.success, "18"), border: `1px solid ${alpha(c.success, "44")}`,
                  borderRadius: 20, padding: "1px 7px",
                }}>
                  dziś
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: c.textTertiary, fontWeight: 700 }}>
                {fmt(totalAmt)} PLN
              </span>
            </div>
 
            {/* Items */}
            {docs.map(doc => (
              <AgendaItem key={doc.id} doc={doc} month={month} isLocked={isLocked} onEdit={onEdit} />
            ))}
          </div>
        );
      })}
 
      <CalendarLegend />
    </div>
  );
}
interface CalendarViewProps {
  items:     RecurringDoc[];
  month:     string;
  isLocked:  boolean;
  onEdit:    (doc: RecurringDoc) => void;
  onArchive?: (doc: RecurringDoc) => void;
}

function CalendarView({ items, month, isLocked, onEdit }: CalendarViewProps) {
  const daysCount   = useMemo(() => getDaysInMonth(month),    [month]);
  const firstOffset = useMemo(() => getFirstDayOfWeek(month), [month]);
  const todayDay    = isCurrentMonth(month) ? getTodayDay() : null;

  const byDay = useMemo(() => {
    const map: Record<number, RecurringDoc[]> = {};
    items.forEach(doc => {
      const day = clampDay(doc, daysCount);
      if (!map[day]) map[day] = [];
      map[day].push(doc);
    });
    return map;
  }, [items, daysCount]);

  const cells = useMemo(() => {
    const result: CalCell[] = [];
    for (let i = 0; i < firstOffset; i++) result.push({ type: "empty", key: `e${i}` });
    for (let d = 1; d <= daysCount; d++)   result.push({ type: "day",   key: `d${d}`, day: d });
    const rem = result.length % 7;
    if (rem !== 0) for (let i = 0; i < 7 - rem; i++) result.push({ type: "empty", key: `t${i}` });
      return result;
    }, [daysCount, firstOffset]);

    const isMobile = useIsMobile();
    if (isMobile) {
      return (
        <CalendarAgenda
          byDay={byDay}
          daysCount={daysCount}
          month={month}
          todayDay={todayDay}
          isLocked={isLocked}
          onEdit={onEdit}
        />
      );
    }

  return (
    <div>
      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{
            textAlign: "center", fontSize: 11, fontWeight: 700,
            color: WEEKEND_DAYS.has(d) ? c.textMuted : c.textSecondary,
            padding: "6px 0", textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map(cell => {
          if (cell.type === "empty") return <div key={cell.key} style={{ minHeight: 80 }} />;

          const { day } = cell;
          const docs     = byDay[day] || [];
          const isToday  = todayDay === day;
          const isPast   = todayDay !== null && day < todayDay;
          const totalAmt = sumAmountPLN(docs, month);

          return (
            <div key={cell.key} style={{
              minHeight:    80,
              background:   isToday ? alpha(c.success, "10") : docs.length > 0 ? c.surface : c.bgDeepest,
              border:       `1px solid ${isToday ? alpha(c.success, "55") : docs.length > 0 ? c.border : c.surfaceAlt}`,
              borderRadius: 8,
              padding:      "6px 6px 4px",
              opacity:      isPast && docs.length === 0 ? 0.35 : 1,
            }}>
              <div style={{
                fontSize: 11, fontWeight: isToday ? 800 : 600,
                color:          isToday ? c.success : isPast ? c.borderStrong : c.textMuted,
                marginBottom:   docs.length > 0 ? 5 : 0,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
              }}>
                <span>{day}</span>
                {docs.length > 0 && totalAmt > 0 && (
                  <span style={{ fontSize: 9, color: c.textSecondary, fontWeight: 500 }}>{fmt(totalAmt)}</span>
                )}
              </div>
              {docs.map(doc => (
                <CalPill key={doc.id} doc={doc} month={month} isLocked={isLocked} onEdit={onEdit} />
              ))}
            </div>
          );
        })}
      </div>

      <CalendarLegend />
    </div>
  );
}

// ── Upcoming strip ────────────────────────────────────────────

interface ItemsMonthProps {
  items: RecurringDoc[];
  month: string;
}

function UpcomingStrip({ items, month }: ItemsMonthProps) {
  if (!isCurrentMonth(month)) return null;

  const todayDay    = getTodayDay();
  const daysInMonth = getDaysInMonth(month);

  const upcoming = useMemo(() =>
    items
      .filter(doc => {
        const day = clampDay(doc, daysInMonth);
        return day >= todayDay && day <= todayDay + 7;
      })
      .sort((a, b) => (a.plannedDay || 1) - (b.plannedDay || 1)),
    [items, daysInMonth, todayDay]
  );

  if (upcoming.length === 0) return null;

  const totalAmt = sumAmountPLN(upcoming, month);

  return (
    <div style={{
      background: c.bg, border: `1px solid ${alpha(c.warning, "44")}`,
      borderRadius: 10, padding: "12px 14px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.warning }}>⚡ Najbliższe 7 dni</div>
        <div style={{ fontSize: 12, color: c.textSecondary }}>
          łącznie <strong style={{ color: c.warning }}>{fmt(totalAmt)} PLN</strong>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {upcoming.map(doc => {
          const amountPLN = getAmountPLN(doc, month);
          const confirmed = isConfirmed(doc, month);
          const day       = clampDay(doc, daysInMonth);
          const daysLeft  = day - todayDay;
          const color     = getCatColor(doc.categoryName);

          return (
            <div key={doc.id} style={{
              background:   confirmed ? alpha(c.success, "12") : `${color}12`,
              border:       `1px solid ${confirmed ? alpha(c.success, "44") : color + "44"}`,
              borderRadius: 8, padding: "8px 12px", minWidth: 140, flex: "0 0 auto",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: confirmed ? c.success : color, marginBottom: 2 }}>
                {confirmed ? "✓ " : ""}{doc.description}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: c.text }}>{fmt(amountPLN)} PLN</div>
              <div style={{ fontSize: 10, color: c.textSecondary, marginTop: 2 }}>
                {daysLeft === 0 ? "🔴 Dziś" : `📅 Za ${daysLeft} ${daysLeft === 1 ? "dzień" : "dni"} (${day}.)`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI bar ───────────────────────────────────────────────────

function KpiBar({ items, month }: ItemsMonthProps) {
  const { confirmedCount, totalPLN, confirmedPLN } = useMemo(() => {
    let cCount = 0, total = 0, cTotal = 0;
    items.forEach(doc => {
      const amt = getAmountPLN(doc, month);
      total += amt;
      if (isConfirmed(doc, month)) { cCount++; cTotal += amt; }
    });
    return { confirmedCount: cCount, totalPLN: total, confirmedPLN: cTotal };
  }, [items, month]);

  const pct = totalPLN > 0 ? Math.round((confirmedPLN / totalPLN) * 100) : 0;

  const kpis = [
    { icon: "🔄", label: "Aktywne",      value: items.length,   unit: "pozycji",           color: c.info },
    { icon: "✅", label: "Potwierdzone", value: confirmedCount, unit: `z ${items.length}`,  color: c.success },
    { icon: "💸", label: "Łącznie",      value: fmt(totalPLN),  unit: "PLN/mies.",          color: c.text },
    { icon: "📊", label: "Realizacja",   value: `${pct}%`,      unit: fmt(confirmedPLN),
      color: pct === 100 ? c.success : pct > 50 ? c.warning : c.danger },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: 10, marginBottom: 16,
    }}>
      {kpis.map(kpi => (
        <div key={kpi.label} style={{
          background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: 10, padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>{kpi.icon}</span>
          <div>
            <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 2 }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: c.borderStrong }}>{kpi.unit}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────

interface EditModalProps {
  editTarget: RecurringDoc;
  month:      string;
  isSaving:   boolean;
  onSubmit:   (payload: RecurringFormPayload) => void | Promise<void>;
  onClose:    () => void;
}

function EditModal({ editTarget, month, isSaving, onSubmit, onClose }: EditModalProps) {
  return createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "#000a",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: c.bg, border: `1px solid ${c.border}`,
        borderRadius: 16, padding: 24,
        width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: c.text, marginBottom: 16 }}>
          ✏️ Edytuj wydatek cykliczny
        </div>
        <RecurringForm
          key={editTarget.id}
          initialValues={editTarget}
          validFrom={month}
          activeBudgetMonth={month}
          onSubmit={onSubmit}
          onCancel={onClose}
          isSaving={isSaving}
          mode="edit"
        />
      </div>
    </div>,
    document.body
  );
}

// ── Toolbar ───────────────────────────────────────────────────

interface ToolbarProps {
  filterFreq:      string;
  setFilterFreq:   (v: string) => void;
  filterCats:      string[];
  setFilterCats:   (v: string[]) => void;
  categoryOptions: CategoryOption[];
  filterStatus:    string;
  setFilterStatus: (v: string) => void;
  sortBy:          string;
  setSortBy:       (v: string) => void;
  viewMode:        string;
  hasFilters:      boolean;
  onClear:         () => void;
  onPageReset:     () => void;
}

function Toolbar({
  filterFreq,    setFilterFreq,
  filterCats,    setFilterCats,   categoryOptions,
  filterStatus,  setFilterStatus,
  sortBy,        setSortBy,
  viewMode,
  hasFilters,    onClear,
  onPageReset,
}: ToolbarProps) {
  const handleFreq   = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => { setFilterFreq(e.target.value); onPageReset(); }, [setFilterFreq,   onPageReset]);
  const handleStatus = useCallback((id: string) => { setFilterStatus(id);           onPageReset(); }, [setFilterStatus, onPageReset]);
  const handleCats   = useCallback((v: string[]) => { setFilterCats(v);              onPageReset(); }, [setFilterCats,   onPageReset]);

  return (
    <div style={{
      background: c.bgDeepest, border: `1px solid ${c.border}`,
      borderRadius: 10, padding: "12px 14px", marginBottom: 16,
      display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
    }}>

      {/* Frequency */}
      <select
        value={filterFreq}
        onChange={handleFreq}
        style={{
          background:   filterFreq ? alpha(c.success, "20") : c.bg,
          border:       `1px solid ${filterFreq ? alpha(c.success, "44") : c.border}`,
          borderRadius: 8,
          color:        filterFreq ? c.success : c.textTertiary,
          padding:      "6px 10px",
          fontSize:     12,
          cursor:       "pointer",
        }}
      >
        <option value="">Wszystkie częstotliwości</option>
        {FREQUENCY_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Multi-category */}
      <CategoryMultiSelect
        value={filterCats}
        onChange={handleCats}
        categories={categoryOptions}
        placeholder="Wszystkie kategorie"
      />

      {/* Status toggle group */}
      <div style={{ display: "flex", gap: 4 }}>
        {STATUS_OPTIONS.map(opt => (
          <ToggleBtn
            key={opt.id}
            active={filterStatus === opt.id}
            onClick={() => handleStatus(opt.id)}
          >
            {opt.label}
          </ToggleBtn>
        ))}
      </div>

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={onClear}
          style={{
            background: "transparent", border: `1px solid ${c.borderStrong}`,
            borderRadius: 8, color: c.textSecondary,
            padding: "5px 10px", cursor: "pointer", fontSize: 12,
          }}
        >
          ✕ Wyczyść
        </button>
      )}

      {/* Sort (list view only) */}
      {viewMode === "list" && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: c.borderStrong, marginRight: 4 }}>Sortuj:</span>
          {SORT_OPTIONS.map(opt => (
            <ToggleBtn
              key={opt.id}
              active={sortBy === opt.id}
              onClick={() => setSortBy(opt.id)}
            >
              {opt.label}
            </ToggleBtn>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────

export default function PanelRecurring() {
  const { activeBudgetMonth: month } = useMonthStatus();
  const { isPastMonth, isMonthClosed, isHistoricalLock } = usePanelLock(month);
  const isLocked = isHistoricalLock || isPastMonth;

  const { recurring, isLoading, isSaving, loadAll, updateRecurring, archiveRecurring } = useRecurring();

  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<RecurringDoc | null>(null);
  const [archiveModal, setArchiveModal] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: "" });
  const [viewMode,     setViewMode]     = useState("calendar");
  const [filterFreq,   setFilterFreq]   = useState("");
  const [filterCats,   setFilterCats]   = useState<string[]>([]);  // string[] — category names
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy,       setSortBy]       = useState("day");

  useEffect(() => { loadAll(); }, []);

  // ── Derived data ──────────────────────────────────────────

  const activeThisMonth = useMemo(
    () => recurring.filter(r => isActiveInMonth(r, month)),
    [recurring, month]
  );

  // Category options for the multi-select — derived from active docs
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: CategoryOption[] = [];
    activeThisMonth.forEach(r => {
      if (r.categoryName && !seen.has(r.categoryName)) {
        seen.add(r.categoryName);
        result.push({ name: r.categoryName, icon: (r.categoryIcon as string) || "" });
      }
    });
    return result.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [activeThisMonth]);

  const filtered = useMemo(() => {
    let list = activeThisMonth;
    if (filterFreq)               list = list.filter(r => r.frequency === filterFreq);
    if (filterCats.length > 0)    list = list.filter(r => filterCats.includes(r.categoryName));
    if (filterStatus === "confirmed") list = list.filter(r =>  isConfirmed(r, month));
    if (filterStatus === "pending")   list = list.filter(r => !isConfirmed(r, month));
    return list;
  }, [activeThisMonth, filterFreq, filterCats, filterStatus, month]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortBy) {
      case "day":      return copy.sort((a, b) => (a.plannedDay || 1) - (b.plannedDay || 1));
      case "amount":   return copy.sort((a, b) => getAmountPLN(b, month) - getAmountPLN(a, month));
      case "name":     return copy.sort((a, b) => (a.description || "").localeCompare(b.description || "", "pl"));
      case "category": return copy.sort((a, b) => (a.categoryName || "").localeCompare(b.categoryName || "", "pl"));
      default:         return copy;
    }
  }, [filtered, sortBy, month]);

  const { page, totalPages, paginated, setPage } = usePagination(sorted, PAGE_SIZE);

  const totalPLN   = useMemo(() => sumAmountPLN(activeThisMonth, month), [activeThisMonth, month]);
  const hasFilters = Boolean(filterFreq || filterCats.length > 0 || filterStatus);

  // ── Handlers ─────────────────────────────────────────────

  const openEdit   = useCallback((doc: RecurringDoc) => { setEditTarget(doc); setShowModal(true); },  []);
  const closeModal = useCallback(()  => { setShowModal(false); setEditTarget(null); }, []);

  const handleSubmit = useCallback(async (payload: RecurringFormPayload) => {
    if (!editTarget) return;
    // payload is form/wire-shaped (newCostEntry, validTo…), not a stored doc —
    // the backend transforms it, so cast through unknown.
    await updateRecurring(editTarget.id, payload as unknown as Partial<RecurringDoc>);
    closeModal();
    loadAll();
  }, [editTarget, updateRecurring, closeModal, loadAll]);

  const handleArchive = useCallback(async () => {
    if (!archiveModal.id) return;
    await archiveRecurring(archiveModal.id, month);
    setArchiveModal({ isOpen: false, id: null, name: "" });
    loadAll();
  }, [archiveModal.id, month, archiveRecurring, loadAll]);

  const openArchive = useCallback((doc: RecurringDoc) =>
    setArchiveModal({ isOpen: true, id: doc.id, name: doc.description }),
  []);

  const clearFilters = useCallback(() => {
    setFilterFreq(""); setFilterCats([]); setFilterStatus(""); setPage(1);
  }, [setPage]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{
        marginBottom: 16, display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 4 }}>
            🔄 Wydatki cykliczne
          </div>
          <div style={{ fontSize: 13, color: c.textSecondary }}>
            {month} · {activeThisMonth.length} aktywnych ·{" "}
            <strong style={{ color: c.text }}>~{fmt(totalPLN)} PLN</strong>/miesiąc
            <span style={{ color: c.borderStrong, marginLeft: 4 }}>(orientacyjnie)</span>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "list",     icon: "☰",  label: "Lista"     },
            { id: "calendar", icon: "📅", label: "Kalendarz" },
          ].map(v => (
            <ToggleBtn
              key={v.id}
              {...VIEW_TOGGLE_STYLE}
              active={viewMode === v.id}
              onClick={() => setViewMode(v.id)}
            >
              {v.icon} {v.label}
            </ToggleBtn>
          ))}
        </div>
      </div>

      <LockBanner isPastMonth={isPastMonth} isMonthClosed={isMonthClosed} selectedMonth={month} />

      {isPastMonth && (
        <div style={{
          background: c.border, border: `1px solid ${c.borderStrong}`,
          borderRadius: 10, padding: "10px 14px", marginBottom: 16,
          fontSize: 12, color: c.textSecondary,
        }}>
          📅 Miesiąc {month} jest w przeszłości — dane są tylko do odczytu.
        </div>
      )}

      {!isLoading && (
        <>
          <KpiBar items={activeThisMonth} month={month} />
          <UpcomingStrip items={activeThisMonth} month={month} />
        </>
      )}

      <Toolbar
        filterFreq={filterFreq}       setFilterFreq={setFilterFreq}
        filterCats={filterCats}       setFilterCats={setFilterCats}   categoryOptions={categoryOptions}
        filterStatus={filterStatus}   setFilterStatus={setFilterStatus}
        sortBy={sortBy}               setSortBy={setSortBy}
        viewMode={viewMode}
        hasFilters={hasFilters}       onClear={clearFilters}
        onPageReset={() => setPage(1)}
      />

      {!isLoading && hasFilters && (
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
          Wyniki: <strong style={{ color: c.textTertiary }}>{filtered.length}</strong> z {activeThisMonth.length}
        </div>
      )}

      {isLoading && (
        <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
          {hasFilters
            ? "Brak wyników dla wybranych filtrów."
            : `Brak aktywnych wydatków cyklicznych w ${month}.`}
        </div>
      )}

      {!isLoading && filtered.length > 0 && viewMode === "calendar" && (
        <CalendarView
          items={filtered}
          month={month}
          isLocked={isLocked}
          onEdit={openEdit}
          onArchive={openArchive}
        />
      )}

      {!isLoading && sorted.length > 0 && viewMode === "list" && (
        <>
          <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {sorted.length} pozycji · strona {page} z {totalPages}
          </div>
          {paginated.map(r => (
            <RecurringRow
              key={r.id}
              doc={r}
              activeBudgetMonth={month}
              isLocked={isLocked}
              onEdit={openEdit}
              onArchive={openArchive}
            />
          ))}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {showModal && editTarget && (
        <EditModal
          editTarget={editTarget}
          month={month}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onClose={closeModal}
        />
      )}

      <ConfirmModal
        isOpen={archiveModal.isOpen}
        title="Archiwizuj wydatek cykliczny"
        message={`"${archiveModal.name}" nie będzie pokazywany od ${month} wzwyż.\n\nPoprzednie miesiące pozostają bez zmian.`}
        onConfirm={handleArchive}
        onCancel={() => setArchiveModal({ isOpen: false, id: null, name: "" })}
      />
    </div>
  );
}