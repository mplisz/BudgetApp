// ============================================================
// File: src/components/panels/PanelPlanned.tsx
// Desktop panel — view and management of planned expenses.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { createPortal }   from "react-dom";
import { usePlanned, sumPaid, isReadyToPurchase } from "../../hooks/usePlanned";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { useTransactions } from "../../hooks/useTransactions";
import { useAppContext }  from "../../context/AppContext";
import { ConfirmModal }   from "../ui/ConfirmModal";
import { PlannedCard }    from "./plannedComponents/PlannedCard";
import { PlannedForm }    from "./plannedComponents/PlannedForm";
import { WishSection }    from "./plannedComponents/WishSection";
import { TransactionForm, emptyFormValues } from "./transactionComponents/TransactionForm";
import { fmt, monthLabel, plural } from "../../utils/helpers";
import { addMonthsToYM }   from "../../hooks/useMonthFromUrl";
import { theme as s }     from "../../styles/theme";
import { RangePicker, type DateRange } from "../ui/RangePicker";
import { CategoryMultiSelect } from "../ui/CategoryMultiSelect";
import { toYM }            from "../ui/AppDatePicker";
import type { PlannedDoc, PlannedPostPayload, PlannedPatchPayload, WishPostPayload } from "../../hooks/usePlanned";
import type { FormValues, TransactionPayload, Priority } from "../../types/transaction";

// ── Helpers ───────────────────────────────────────────────────

/** "2026-08" → "08.2026" — the tight second line on filter pills. */
function monthShort(ym: string): string {
  const [y, m] = ym.split("-");
  return `${m}.${y}`;
}

// Pre-fill the expense form from a planned expense, so realizing it opens an
// editable transaction (the real amount/date can differ from the plan).
function plannedToFormValues(doc: PlannedDoc): FormValues {
  return {
    ...emptyFormValues(),
    currency:        doc.originalCurrency || "PLN",
    amountOrig:      String(doc.totalAmount ?? doc.totalAmountPLN ?? ""),
    subcategoryId:   doc.targetSubcategoryId,
    subcategoryName: doc.targetSubcategoryName,
    categoryId:      doc.targetCategoryId,
    categoryName:    doc.targetCategoryName,
    priority:        (doc.priority ?? 2) as Priority,
    description:     doc.description,
    tags:            doc.tags || [],
  };
}

// ── Archive modal state ───────────────────────────────────────

interface ArchiveModalState {
  isOpen:     boolean;
  id:         string | null;
  name:       string;
  doc:        PlannedDoc | null;
  paidSoFar:  number;
}

interface PurchaseModalState {
  isOpen: boolean;
  doc:    PlannedDoc | null;
}

// ── Component ─────────────────────────────────────────────────

export default function PanelPlanned() {
  const {
    planned, isLoading, isSaving,
    loadAll, loadArchived, updatePlanned, archivePlanned, purchasePlanned,
    loadWishes, createWish, promoteWish,
  } = usePlanned();

  const { activeBudgetMonth } = useMonthStatus();
  const { transactions }      = useAppContext();
  const { loadTransactions }  = useTransactions();

  const [range,         setRange]         = useState<DateRange>({ months: 3, from: null, to: null });
  const [filterMode,    setFilterMode]    = useState<"all" | "envelope" | "oneoff">("all");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterSubs,       setFilterSubs]       = useState<string[]>([]);
  const [currentMonthOnly, setCurrentMonthOnly] = useState(false);
  // Month group headers start expanded — collapsing is opt-in, per month.
  const [collapsed,     setCollapsed]     = useState<Record<string, boolean>>({});
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState<PlannedDoc | null>(null);
  const [archiveModal,  setArchiveModal]  = useState<ArchiveModalState>({
    isOpen: false, id: null, name: "", doc: null, paidSoFar: 0,
  });
  const [archiveReason, setArchiveReason] = useState("");
  const [purchaseModal, setPurchaseModal] = useState<PurchaseModalState>({
    isOpen: false, doc: null,
  });

  // Archived docs live in LOCAL state (not AppContext) and load lazily on
  // the first toggle — the rest of the app only ever needs active plans.
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<PlannedDoc[] | null>(null);

  // Wishes live in the same container but are filtered out of the shared list
  // server-side, so they get their own local slice — same deal as archived.
  const [showWishes, setShowWishes] = useState(false);
  const [wishes, setWishes] = useState<PlannedDoc[] | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<PlannedDoc | null>(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (showArchived && archived === null) {
      loadArchived().then(setArchived);
    }
  }, [showArchived, archived, loadArchived]);

  useEffect(() => {
    if (showWishes && wishes === null) {
      loadWishes().then(setWishes);
    }
  }, [showWishes, wishes, loadWishes]);

  // "Bieżący miesiąc" everywhere in this panel means the active BUDGET month,
  // not the calendar one — closing a month has to move the rates with it.
  const cur = activeBudgetMonth;

  // Transactions carry the ACTUAL spent amount for realized plans (linked via
  // plannedExpenseId), which can differ from the plan.
  useEffect(() => { loadTransactions(cur); }, [cur, loadTransactions]);

  // planId → actual booked expense amount, from the real transactions.
  const actualSpentByPlan = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tx of (transactions || []) as Array<{ type?: string; amount?: number; plannedExpenseId?: string; isArchived?: boolean }>) {
      if (tx.type !== "EXPENSE" || tx.isArchived || !tx.plannedExpenseId) continue;
      m[tx.plannedExpenseId] = (m[tx.plannedExpenseId] || 0) + (tx.amount || 0);
    }
    return m;
  }, [transactions]);

  // ── Filter ────────────────────────────────────────────────

// Everything EXCEPT the category/subcategory filter — the option lists for
// those dropdowns derive from this set, so they only offer categories that
// actually occur in the current view (mode/range/month already applied).
const baseFiltered = useMemo<PlannedDoc[]>(() => {
  const maxMonth  = range.months > 0 && !range.from && !range.to
    ? addMonthsToYM(cur,range.months)
    : null;
  const fromMonth = range.from ? toYM(range.from) : null;
  const toMonth   = range.to   ? toYM(range.to)   : null;

  return planned.filter(doc => {
    if (doc.isArchived) return false;
    if (filterMode !== "all" && doc.mode !== filterMode) return false;

    // ── "Bieżący miesiąc" view — everything actionable / done this month.
    // This is where confirming happens and confirmed items stay as read-only.
    if (currentMonthOnly) {
      if (doc.mode === "oneoff") {
        // Due now or overdue (unrealized), plus anything realized this month.
        return (!doc.isPurchased && doc.plannedMonth <= cur) || doc.purchasedMonth === cur;
      }
      const hasCurRate = (doc.virtualSavings || []).some(v => v.month === cur && !v.dismissedByUser);
      return hasCurRate || isReadyToPurchase(doc) || doc.purchasedMonth === cur;
    }

    // Historical review: a custom range whose upper bound (Do) is at or before
    // the active month may include realized (purchased) plans. Forward-looking
    // presets stay purchase-free.
    const historicalView = toMonth != null && toMonth <= cur;

    if (doc.isPurchased && !historicalView) return false;

    // In forward-looking views, always surface envelopes with an outstanding
    // contribution for the current month (pay the rate now even when the
    // purchase is months away). Skipped in historical views to avoid noise.
    if (!historicalView) {
      const hasDueRateThisMonth = doc.mode === "envelope" &&
        (doc.virtualSavings || []).some(v => v.month === cur && !v.paidByUser && !v.dismissedByUser);
      if (hasDueRateThisMonth) return true;
    }

    if (fromMonth && doc.plannedMonth < fromMonth) return false;
    if (toMonth   && doc.plannedMonth > toMonth)   return false;
    // Preset ranges are a forward window: current month … current + N months.
    if (maxMonth  && doc.plannedMonth < cur)       return false;
    if (maxMonth  && doc.plannedMonth > maxMonth)  return false;
    return true;
  });
}, [planned, range, filterMode, currentMonthOnly, cur]);

  // Category/subcategory OPTIONS come from the base-filtered view, so only
  // categories actually present under the other filters are offered;
  // subcategories additionally narrow to the selected categories.
  const uniqueCats = useMemo(() => {
    const set = new Set<string>();
    baseFiltered.forEach(doc => { if (doc.targetCategoryName) set.add(doc.targetCategoryName); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [baseFiltered]);

  const uniqueSubs = useMemo(() => {
    if (filterCategories.length === 0) return [];
    const set = new Set<string>();
    baseFiltered
      .filter(doc => filterCategories.includes(doc.targetCategoryName))
      .forEach(doc => { if (doc.targetSubcategoryName) set.add(doc.targetSubcategoryName); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [baseFiltered, filterCategories]);

  const filtered = useMemo<PlannedDoc[]>(() =>
    baseFiltered
      .filter(doc =>
        (filterCategories.length === 0 || filterCategories.includes(doc.targetCategoryName)) &&
        (filterSubs.length       === 0 || filterSubs.includes(doc.targetSubcategoryName)))
      .sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth)),
  [baseFiltered, filterCategories, filterSubs]);

  // ── Grouping by planned month ─────────────────────────────
  // One collapsible card per month, oldest first — same pattern as the
  // "📁 Grupy" view in Wydatki. A past month still holding an unrealized
  // plan is flagged overdue (a realized one there is just history).

  const groups = useMemo(() => {
    const map = new Map<string, PlannedDoc[]>();
    for (const doc of filtered) {
      const list = map.get(doc.plannedMonth);
      if (list) list.push(doc); else map.set(doc.plannedMonth, [doc]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, items]) => ({
        month,
        items,
        total:   items.reduce((sum, d) => sum + d.totalAmountPLN, 0),
        overdue: month < cur && items.some(d => !d.isPurchased),
      }));
  }, [filtered, cur]);

  function toggleGroup(month: string) {
    setCollapsed(prev => ({ ...prev, [month]: !prev[month] }));
  }

  // ── Totals ────────────────────────────────────────────────

  // Header summary over the CURRENT FILTERED view (archived already excluded):
  //   one-offs  → total planned vs. actually realized (purchased)
  //   envelopes → this month's rate total vs. actually paid (shown only in the
  //               "Bieżący miesiąc" view, since rates are month-specific)
  const summary = useMemo(() => {
    let oneoffTotal = 0, oneoffSpent = 0, envRateTotal = 0, envRateCollected = 0;
    for (const p of filtered) {
      if (p.mode === "oneoff") {
        oneoffTotal += p.totalAmountPLN;
        // Actual booked amount (from the transaction), not the planned one;
        // fall back to the plan if its transaction isn't loaded.
        if (p.isPurchased) oneoffSpent += actualSpentByPlan[p.id] ?? p.totalAmountPLN;
      } else {
        const entry = (p.virtualSavings || []).find(v => v.month === cur && !v.dismissedByUser);
        if (!entry) continue;
        const rate = entry.amountPLN || entry.amount || 0;
        envRateTotal += rate;
        if (entry.paidByUser) envRateCollected += rate;
      }
    }
    return { oneoffTotal, oneoffSpent, envRateTotal, envRateCollected };
  }, [filtered, cur, actualSpentByPlan]);

  // Overdue = unrealized plans whose planned month is already in the past.
  // They surface in the "Bieżący miesiąc" view; flag which months they're from.
  const overdueMonths = useMemo(() => {
    if (!currentMonthOnly) return [];
    const set = new Set<string>();
    for (const d of filtered) {
      if (!d.isPurchased && d.plannedMonth < cur) set.add(d.plannedMonth);
    }
    return [...set].sort();
  }, [filtered, currentMonthOnly, cur]);

  // ── Handlers ─────────────────────────────────────────────

  function openEdit(doc: PlannedDoc) {
    setEditTarget(doc);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
  }

  async function handleFormSubmit(payload: PlannedPostPayload | PlannedPatchPayload) {
    if (editTarget) {
      await updatePlanned(editTarget.id, payload as PlannedPatchPayload);
    }
    closeModal();
  }

  // ── Wish handlers ─────────────────────────────────────────
  // Each keeps the local wish slice in sync by hand: wishes are absent from
  // AppContext on purpose, so nothing else will do it for us.

  async function handleCreateWish(payload: WishPostPayload) {
    const created = await createWish(payload);
    if (created) setWishes(prev => [created, ...(prev ?? [])]);
  }

  async function handlePromote(payload: PlannedPostPayload | PlannedPatchPayload) {
    if (!promoteTarget) return;
    const done = await promoteWish(promoteTarget.id, payload as PlannedPostPayload);
    if (done) setWishes(prev => (prev ?? []).filter(w => w.id !== promoteTarget.id));
    setPromoteTarget(null);
  }

  async function handleArchiveWish(wish: PlannedDoc) {
    const ok = await archivePlanned(wish.id);
    if (ok) setWishes(prev => (prev ?? []).filter(w => w.id !== wish.id));
  }

  async function handleArchive() {
    if (!archiveModal.id) return;
    await archivePlanned(archiveModal.id, archiveReason);
    setArchiveModal({ isOpen: false, id: null, name: "", doc: null, paidSoFar: 0 });
    setArchiveReason("");
    setArchived(null);   // invalidate — refetches on next toggle/render
  }

  async function handleRealize(payload: TransactionPayload) {
    if (!purchaseModal.doc) return;
    await purchasePlanned(purchaseModal.doc.id, payload.date, payload.budgetMonth, {
      amount:           payload.amount,
      originalAmount:   payload.originalAmount,
      originalCurrency: payload.originalCurrency,
      fxRate:           payload.fxRate,
      categoryId:       payload.categoryId,
      categoryName:     payload.categoryName,
      subcategoryId:    payload.subcategoryId,
      subcategoryName:  payload.subcategoryName,
      description:      payload.description,
      tags:             payload.tags,
      priority:         payload.priority,
      merchant:         payload.merchant ?? null,
    });
    setPurchaseModal({ isOpen: false, doc: null });
  }

  // ── Edit modal portal ─────────────────────────────────────

  const modalEl = showModal && editTarget ? createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={closeModal}
    >
      <div
        style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "24px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: c.text, marginBottom: 20 }}>
          ✏️ Edytuj planowany wydatek
        </div>
        <PlannedForm
          initialValues={editTarget}
          startMonth={cur}
          onSubmit={handleFormSubmit}
          onCancel={closeModal}
          isSaving={isSaving}
          mode="edit"
        />
      </div>
    </div>,
    document.body
  ) : null;

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={s.sectionTitle}>📅 Planowane wydatki</div>
          <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 4 }}>
            {filtered.length} planowanych w widoku
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            <span>
              💳 Jednorazowe — Suma:{" "}
              <strong style={{ color: c.text }}>{fmt(summary.oneoffTotal)}</strong>
              {" / "}Faktycznie wydano:{" "}
              <strong style={{ color: c.success }}>{fmt(summary.oneoffSpent)}</strong>
            </span>
            {currentMonthOnly && (
              <span>
                🪙 Koperty ({monthLabel(cur)}) — Suma rat:{" "}
                <strong style={{ color: c.text }}>{fmt(summary.envRateTotal)}</strong>
                {" / "}Faktycznie zebrano:{" "}
                <strong style={{ color: c.success }}>{fmt(summary.envRateCollected)}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters — every month-scoped pill spells out the months it covers.
          Presets look FORWARD from the active budget month. */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => setCurrentMonthOnly(true)}
          title={`Plany i raty na ${monthLabel(cur)}`}
          style={{
            padding: "4px 14px", borderRadius: 20, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 12, lineHeight: 1.3,
            background: currentMonthOnly ? c.success : c.border,
            color:      currentMonthOnly ? c.white     : c.textSecondary,
          }}
        >
          <span style={{ display: "block" }}>📅 Bieżący miesiąc</span>
          <span style={{ display: "block", fontSize: 9, fontWeight: 600, opacity: 0.75 }}>
            {monthShort(cur)}
          </span>
        </button>
        <RangePicker
          value={currentMonthOnly ? { months: -1, from: null, to: null } : range}
          onChange={r => { setRange(r); setCurrentMonthOnly(false); }}
          describeMonths={months => months > 0
            ? `${monthShort(cur)} – ${monthShort(addMonthsToYM(cur,months))}`
            : "bez limitu"}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {/* Mode filter */}
        {(["all", "envelope", "oneoff"] as const).map(m => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            style={{
              padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              background: filterMode === m ? c.info : c.border,
              color:      filterMode === m ? c.white    : c.textSecondary,
            }}
          >
            {m === "all" ? "Wszystkie tryby" : m === "envelope" ? "🪙 Koperty" : "💳 Jednorazowe"}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: c.border }} />

        {/* Wishes toggle — hidden by default, loads lazily */}
        <button
          onClick={() => setShowWishes(v => !v)}
          style={{
            padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 12,
            background: showWishes ? c.info : c.border,
            color:      showWishes ? c.white : c.textSecondary,
          }}
        >
          💭 Zachcianki{wishes !== null ? ` (${wishes.length})` : ""}
        </button>

        {/* Archived toggle — hidden by default, loads lazily */}
        <button
          onClick={() => setShowArchived(v => !v)}
          style={{
            padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 12,
            background: showArchived ? c.info : c.border,
            color:      showArchived ? c.white : c.textSecondary,
          }}
        >
          🗄️ Zarchiwizowane{archived !== null ? ` (${archived.length})` : ""}
        </button>
      </div>

      {/* Category / subcategory filter — own row; options reflect the current
          view (only categories/subcategories present under the other filters) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Kategoria:
        </span>
        <CategoryMultiSelect
          value={filterCategories}
          onChange={v => { setFilterCategories(v); setFilterSubs([]); }}
          categories={uniqueCats.map(name => ({ name }))}
          placeholder="Wszystkie kategorie"
        />
        {filterCategories.length > 0 && uniqueSubs.length > 0 && (
          <CategoryMultiSelect
            value={filterSubs}
            onChange={setFilterSubs}
            categories={uniqueSubs.map(name => ({ name }))}
            placeholder="Wszystkie subkategorie"
          />
        )}
      </div>

      {/* Overdue warning — unrealized plans from past months */}
      {overdueMonths.length > 0 && (
        <div style={{
          marginBottom: 16, padding: "10px 14px",
          background: alpha(c.danger, "11"), border: `1px solid ${alpha(c.danger, "55")}`,
          borderRadius: 10, fontSize: 13, color: c.danger, fontWeight: 600,
        }}>
          ⚠️ Zaległe (niezrealizowane) z: {overdueMonths.join(", ")}
        </div>
      )}

      {/* List */}
      {isLoading && <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
          Brak planowanych wydatków w tym okresie.
        </div>
      )}

      {/* Grouped by planned month — click a header to collapse that month */}
      {!isLoading && groups.map(group => {
        const isCollapsed = !!collapsed[group.month];
        return (
          <div key={group.month} style={{ marginBottom: 14 }}>
            <button
              onClick={() => toggleGroup(group.month)}
              aria-expanded={!isCollapsed}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                background: c.bgDeepest, border: `1px solid ${group.month === cur ? alpha(c.success, "55") : c.border}`,
                borderRadius: 10, padding: "10px 14px", marginBottom: isCollapsed ? 0 : 8,
                cursor: "pointer", textAlign: "left", font: "inherit",
              }}
            >
              <span style={{ color: c.textMuted, fontSize: 11 }}>{isCollapsed ? "▶" : "▼"}</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: group.month === cur ? c.success : c.text }}>
                {monthLabel(group.month)}
              </span>
              {group.month === cur && (
                <span style={{ ...s.chip(c.success), fontSize: 10 }}>bieżący</span>
              )}
              {group.overdue && (
                <span style={{ ...s.chip(c.danger), fontSize: 10 }}>zaległe</span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap" }}>
                {group.items.length} {plural(group.items.length, "pozycja", "pozycje", "pozycji")} ·{" "}
                <strong style={{ color: c.text }}>{fmt(group.total)} PLN</strong>
              </span>
            </button>

            {!isCollapsed && group.items.map(doc => (
              <PlannedCard
                key={doc.id}
                doc={doc}
                actualSpent={actualSpentByPlan[doc.id]}
                onEdit={openEdit}
                onArchive={d => setArchiveModal({
                  isOpen: true, id: d.id, name: d.description,
                  doc: d, paidSoFar: sumPaid(d.virtualSavings),
                })}
                onPurchase={d => setPurchaseModal({ isOpen: true, doc: d })}
              />
            ))}
          </div>
        );
      })}

      {/* Wishes — ideas without a month or a price; never part of any total */}
      {showWishes && (
        <WishSection
          wishes={wishes}
          isSaving={isSaving}
          onCreate={handleCreateWish}
          onPromote={setPromoteTarget}
          onArchive={handleArchiveWish}
        />
      )}

      {/* Archived list — dimmed, read-only, with the "why we dropped it" note */}
      {showArchived && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.textMuted, marginBottom: 10 }}>
            🗄️ Zarchiwizowane plany {archived !== null && `(${archived.length})`}
          </div>
          {archived === null && (
            <div style={{ color: c.textMuted, fontSize: 13, padding: "12px 0" }}>Ładowanie…</div>
          )}
          {archived !== null && archived.length === 0 && (
            <div style={{ color: c.borderStrong, fontSize: 13, padding: "12px 0" }}>
              Brak zarchiwizowanych planów.
            </div>
          )}
          {(archived ?? []).map(doc => (
            <div key={doc.id} style={{
              background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
              padding: "12px 16px", marginBottom: 8, opacity: 0.75,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.textSecondary }}>
                  {doc.mode === "envelope" ? "🪙" : "💳"} {doc.description}
                </span>
                <span style={{ fontSize: 13, color: c.textTertiary, whiteSpace: "nowrap" }}>
                  {fmt(doc.totalAmountPLN)} · plan na {doc.plannedMonth}
                </span>
              </div>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>
                Zarchiwizowano {doc.archivedAt?.slice(0, 10)}{doc.archivedBy ? ` przez ${doc.archivedBy}` : ""}
              </div>
              {doc.archivedReason && (
                <div style={{ fontSize: 12, color: c.textTertiary, marginTop: 6, fontStyle: "italic" }}>
                  💬 {doc.archivedReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {modalEl}

      {/* Promote a wish — the SAME form used to create a plan, pre-filled from
          the wish. mode="add" on purpose: this is where the full plan rules
          (month, positive amount, oneoff/envelope) finally have to hold. */}
      {promoteTarget && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setPromoteTarget(null)}
        >
          <div
            style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "24px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: c.text, marginBottom: 6 }}>
              📅 Zaplanuj zachciankę
            </div>
            <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 16 }}>
              💭 {promoteTarget.description}
              {promoteTarget.estimatedAmount != null && <> · szacowano {fmt(promoteTarget.estimatedAmount)}</>}
            </div>
            <PlannedForm
              key={promoteTarget.id}
              initialValues={{
                ...promoteTarget,
                // The ballpark becomes the starting amount; the user confirms
                // or corrects it before this turns into a real commitment.
                totalAmount: promoteTarget.estimatedAmount ?? undefined,
              }}
              startMonth={cur}
              onSubmit={handlePromote}
              onCancel={() => setPromoteTarget(null)}
              isSaving={isSaving}
              mode="add"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Archive confirm — with an optional "why" note stored on the doc */}
      <ConfirmModal
        isOpen={archiveModal.isOpen}
        title="Archiwizuj planowany wydatek"
        message={
          archiveModal.paidSoFar > 0
            ? `"${archiveModal.name}" ma już odłożone ${fmt(archiveModal.paidSoFar)} PLN.\n\nArchiwizacja usunie plan — fizycznie odłożone środki pozostają na Twoim koncie.`
            : `"${archiveModal.name}" zostanie zarchiwizowany.`
        }
        onConfirm={handleArchive}
        onCancel={() => {
          setArchiveModal({ isOpen: false, id: null, name: "", doc: null, paidSoFar: 0 });
          setArchiveReason("");
        }}
      >
        <textarea
          value={archiveReason}
          onChange={e => setArchiveReason(e.target.value)}
          placeholder="Dlaczego rezygnujesz? (opcjonalnie — zapisze się przy planie)"
          maxLength={300}
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            background: c.bg, border: `1px solid ${c.borderStrong}`, borderRadius: 8,
            color: c.text, padding: "8px 12px", fontSize: 13, outline: "none",
            fontFamily: "inherit",
          }}
        />
      </ConfirmModal>

      {/* Purchase / realize — editable expense form pre-filled from the plan */}
      {purchaseModal.doc && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setPurchaseModal({ isOpen: false, doc: null })}
        >
          <div
            style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "24px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: c.text, marginBottom: 6 }}>
              🛍️ Zrealizuj zakup
            </div>
            <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 16 }}>
              {purchaseModal.doc.description} · plan {fmt(purchaseModal.doc.totalAmountPLN)} PLN
              {purchaseModal.doc.mode === "envelope" && (
                <> · zebrano {fmt(sumPaid(purchaseModal.doc.virtualSavings))} PLN (zostanie odblokowane)</>
              )}
            </div>
            <TransactionForm
              key={purchaseModal.doc.id}
              initialValues={plannedToFormValues(purchaseModal.doc)}
              budgetMonth={activeBudgetMonth}
              showVouchers={false}
              isSaving={isSaving}
              onSubmit={handleRealize}
              onCancel={() => setPurchaseModal({ isOpen: false, doc: null })}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
