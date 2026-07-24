// ============================================================
// File: src/components/panels/PanelTransactions.tsx
// Transaction display panel — EXPENSE and SAVING only.
// INCOME/TRANSFER → PanelIncomeTransactions.
// UI: Polish | Comments: English
// ============================================================

import { c } from "../../styles/tokens";
import { useState, useMemo } from "react";
import { useAppContext }   from "../../context/AppContext";
import type { Transaction } from "../../types/appContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { toYMD } from "../ui/AppDatePicker";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { fmt }             from "../../utils/helpers";
import { calculateNetAmount } from "../../utils/returnUtils";
import { TransactionRow, ReturnModal, s, PRIO_COLORS, TransactionCard  } from "./transactionComponents";
import { useIsMobile } from "../../hooks/useIsMobile";

import { usePagination }   from "../../hooks/usePagination";
import { Pagination }      from "../ui/Pagination";
import { SkeletonListRow } from "../ui/Skeleton";
import { CategoryMultiSelect }      from "../ui/CategoryMultiSelect";
import { useFilters }               from "../../hooks/useFilters";
import { ToggleBtn, VIEW_TOGGLE_STYLE } from "../ui/ToggleBtn";

import { useMonthLoad } from "../../hooks/useMonthLoad";
import { DateRangeFilter } from "./transactionComponents/DateRangeFilter";
import { dateBoundsOf } from "./transactionComponents/dateBounds";
import { TriFilterButton, matchTri, type Tri } from "../ui/TriFilterButton";
import { trackedProductNames } from "../../utils/productPricing";
import { detailedKindOf, type DetailedReturnBucket } from "../../utils/returnAnalytics";


const PAGE_SIZE = 25;

// Options for the return-kind sub-filter (shown only while filtering FOR
// returns); the list rendered is scoped to kinds present in the month.
const RETURN_KIND_OPTIONS: Array<{ id: DetailedReturnBucket; label: string }> = [
  { id: "store",   label: "🏪 Do sklepu" },
  { id: "person",  label: "👥 Koszty od osoby" },
  { id: "company", label: "🏢 Koszty od firmy" },
  { id: "deposit", label: "🍾 Kaucja" },
  { id: "unknown", label: "❔ Nieoznaczone" },
];

// ── Types ─────────────────────────────────────────────────────

interface DeleteModal { isOpen: boolean; txId: string | null; }
interface LinkedModal { isOpen: boolean; txId: string | null; }

// ── Component ─────────────────────────────────────────────────

export default function PanelTransactions() {
  const { transactions, setTransactions, tags } = useAppContext();
  const { deleteTransaction, loadTransactions } = useTransactions();
  const { isActiveMonthClosed, activeBudgetMonth } = useMonthStatus();

  // ── Filter state ──────────────────────────────────────────

  const { filters, set, clear: clearFilters, hasActive: hasActiveFilters } = useFilters({
    categories: [] as string[],
    subs:       [] as string[],
    dateFrom:   null as Date | null,
    dateTo:     null as Date | null,
    prio:       [] as number[],
    tags:       [] as string[],
    merchant:    "",
    hasReturn:  "off" as Tri,
    returnKinds: [] as DetailedReturnBucket[],
    hasReceipt: "off" as Tri,
    warranty:   "off" as Tri,
    hasProduct: "off" as Tri,
  });

  const [collapsed,          setCollapsed]          = useState<Record<string, boolean>>({});
  const [deleteModal,        setDeleteModal]        = useState<DeleteModal>({ isOpen: false, txId: null });
  const [confirmLinkedModal, setConfirmLinkedModal] = useState<LinkedModal>({ isOpen: false, txId: null });
  const [returnTarget,       setReturnTarget]       = useState<Transaction | null>(null);
  const [grouped,            setGrouped]            = useState(false);
  const isFirstLoad                                 = useMonthLoad(activeBudgetMonth, loadTransactions, () => {
                                                        set("dateFrom", null);
                                                        set("dateTo", null);
                                                      });
  const isMobile = useIsMobile();


  // ── Enrich transactions ───────────────────────────────────
  // - Resolve tag names
  // - Compute effectiveAmount (deducts same-month cash returns)
  // - Filter out INCOME and TRANSFER

  const enriched = useMemo<Transaction[]>(() =>
    transactions
      .filter(tx => tx.type !== "INCOME" && tx.type !== "TRANSFER")
      .map(tx => {
        // Net of ALL cash returns (incl. cross-month) so the header total
        // matches the category sums in PanelSummary. `sameMonthReturned` now
        // carries total cash returned (any month) — drives the "zwroty" line
        // and the has-return filter.
        const totalCashReturned = (tx.returns || [])
          .reduce((sum, r) => sum + (r.cashAmount || 0), 0);
        return {
          ...tx,
          tagNames: (tx.tags || [])
            .map(id => tags.find(t => t.id === id)?.name)
            .filter(Boolean) as string[],
          effectiveAmount:   calculateNetAmount(tx),
          sameMonthReturned: totalCashReturned,
        };
      }),
    [transactions, tags, activeBudgetMonth]
  );

  const dateBounds  = useMemo(() => dateBoundsOf(enriched), [enriched]);
  const noDateRange = enriched.length === 0;

  // Everything EXCEPT the category/subcategory filter — both the final list
  // and the category/subcategory OPTION lists derive from this, so the
  // dropdowns only offer categories that actually occur under the other
  // active filters (dates, priority, tags, merchant, returns, …).
  const otherFiltered = useMemo<Transaction[]>(() =>
    enriched.filter(tx => {
      if (filters.dateFrom && tx.date < toYMD(filters.dateFrom))                           return false;
      if (filters.dateTo   && tx.date > toYMD(filters.dateTo))                             return false;
      if (filters.prio.length && !filters.prio.includes(tx.priority || 2))                 return false;
      if (filters.tags.length && !filters.tags.some(t => (tx.tags || []).includes(t)))     return false;
      // voucherAmount is how the purchase was PAID (a voucher used as a
      // payment method) — unrelated to whether it was ever returned. Only
      // actual cash-back (sameMonthReturned, which despite the name now
      // carries the total across any month) counts here.
      const returned = (tx.sameMonthReturned ?? 0) > 0;
      if (!matchTri(filters.hasReturn,  returned))            return false;
      // Kind sub-filter (only reachable while hasReturn === "yes"): the tx
      // passes when ANY of its returns is of a selected kind.
      if (filters.returnKinds.length > 0 &&
          !(tx.returns ?? []).some(r => filters.returnKinds.includes(detailedKindOf(r)))) return false;
      if (!matchTri(filters.hasReceipt, !!tx.receiptBlobPath)) return false;
      if (!matchTri(filters.warranty,   !!tx.isWarranty))      return false;
      if (!matchTri(filters.hasProduct, trackedProductNames(tx.lineItems).length > 0)) return false;
      if (filters.merchant && tx.merchant !== filters.merchant) return false;
      return true;
    }),
    [enriched, filters]
  );

  const uniqueCats = useMemo(() => {
    const map: Record<string, string> = {};
    otherFiltered.forEach(tx => { if (tx.categoryId) map[tx.categoryId] = tx.categoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [otherFiltered]);

  // Merchant/tag OPTIONS are scoped to the active date range only (not the
  // other filters — category/tags/merchant filtering their own option list
  // would hide the currently-selected value the moment it's picked). Narrows
  // to "shops/tags that actually occurred in these dates", per user request.
  const dateScoped = useMemo(() =>
    enriched.filter(tx =>
      (!filters.dateFrom || tx.date >= toYMD(filters.dateFrom)) &&
      (!filters.dateTo   || tx.date <= toYMD(filters.dateTo))),
    [enriched, filters.dateFrom, filters.dateTo]
  );

  const uniqueMerchants = useMemo(() => {
    const set = new Set<string>();
    dateScoped.forEach(tx => { if (tx.merchant) set.add(tx.merchant); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dateScoped]);

  const uniqueSubs = useMemo(() => {
    if (filters.categories.length === 0) return [];
    const map: Record<string, string> = {};
    otherFiltered
      .filter(tx => filters.categories.includes(tx.categoryName))
      .forEach(tx => { if (tx.subcategoryId) map[tx.subcategoryId] = tx.subcategoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [otherFiltered, filters.categories]);

  const monthTagIds = useMemo(() => {
    const ids = new Set(dateScoped.flatMap(tx => tx.tags || []));
    return tags.filter(t => ids.has(t.id));
  }, [dateScoped, tags]);

  // Return-kind options scoped to kinds that actually occur in the month —
  // no point offering "🍾 Kaucja" when nothing here is a deposit refund.
  const monthReturnKinds = useMemo(() => {
    const present = new Set<DetailedReturnBucket>();
    for (const tx of dateScoped) {
      for (const r of tx.returns ?? []) present.add(detailedKindOf(r));
    }
    return RETURN_KIND_OPTIONS.filter(o => present.has(o.id));
  }, [dateScoped]);

  // ── Filtering ─────────────────────────────────────────────

  const filtered = useMemo<Transaction[]>(() =>
    otherFiltered.filter(tx => {
      if (filters.categories.length > 0 && !filters.categories.includes(tx.categoryName)) return false;
      if (filters.subs.length       > 0 && !filters.subs.includes(tx.subcategoryName))    return false;
      return true;
    }),
    [otherFiltered, filters.categories, filters.subs]
  );

  // ── Grouping by category ──────────────────────────────────

  const groups = useMemo(() => {
    const map: Record<string, { name: string; items: Transaction[] }> = {};
    filtered.forEach(tx => {
      const key = tx.categoryId || "uncategorised";
      if (!map[key]) map[key] = { name: tx.categoryName || "Bez kategorii", items: [] };
      map[key].items.push(tx);
    });
    return Object.entries(map)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([key, val]) => ({
        key, ...val,
        sum:         val.items.reduce((acc, t) => acc + (t.effectiveAmount ?? t.netAmount ?? t.amount), 0),
        voucherSum:  val.items.reduce((acc, t) => acc + (t.voucherAmount || 0), 0),
        returnedSum: val.items.reduce((acc, t) => acc + (t.sameMonthReturned || 0), 0),
      }));
  }, [filtered]);

  const totalSum         = filtered.reduce((acc, t) => acc + (t.effectiveAmount ?? t.amount), 0);
  const totalVoucherSum  = filtered.reduce((acc, t) => acc + (t.voucherAmount || 0), 0);
  const totalReturnedSum = filtered.reduce((acc, t) => acc + (t.sameMonthReturned || 0), 0);

  // ── Pagination ────────────────────────────────────────────

  const { page: flatPage, totalPages: flatTotalPages, paginated: paginatedFlat, setPage: setFlatPage }
    = usePagination(filtered, PAGE_SIZE) as { page: number; totalPages: number; paginated: Transaction[]; setPage: (p: number) => void };

  const { page: groupPage, totalPages: groupTotalPages, paginated: paginatedGroups, setPage: setGroupPage }
    = usePagination(groups, PAGE_SIZE) as { page: number; totalPages: number; paginated: typeof groups; setPage: (p: number) => void };

  // ── Handlers ─────────────────────────────────────────────

  function toggleGroup(key: string) { setCollapsed(p => ({ ...p, [key]: !p[key] })); }

  function togglePrio(p: number) {
    set("prio", filters.prio.includes(p)
      ? filters.prio.filter(x => x !== p)
      : [...filters.prio, p]);
  }

  async function handleConfirmDelete() {
    if (!deleteModal.txId) return;
    const result = await deleteTransaction(deleteModal.txId) as { _requiresConfirmation?: boolean; txId?: string } | null;
    setDeleteModal({ isOpen: false, txId: null });
    if (result?._requiresConfirmation) {
      setConfirmLinkedModal({ isOpen: true, txId: result.txId ?? deleteModal.txId });
    }
  }

  async function handleConfirmedDeleteWithLinked() {
    if (!confirmLinkedModal.txId) return;
    await deleteTransaction(confirmLinkedModal.txId, { forceArchiveLinked: true });
    setConfirmLinkedModal({ isOpen: false, txId: null });
  }

  function handleUpdated(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  function handleReturnSaved(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  async function handleReturnSavedWithRefresh(updated: Transaction, sideEffects?: { transferCreated?: boolean; transferBudgetMonth?: string }) {
    handleReturnSaved(updated);
    if (sideEffects?.transferCreated) {
      await loadTransactions(sideEffects.transferBudgetMonth ?? activeBudgetMonth);
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 4 }}>🧾 Wydatki</div>
        <div style={{ fontSize: 13, color: c.textSecondary }}>
          {activeBudgetMonth} ·{" "}
          {isFirstLoad ? (
            <span style={{ color: c.textMuted }}>ładowanie…</span>
          ) : (
            <>
              {filtered.length} transakcji · łącznie{" "}
              <strong style={{ color: c.text }}>{fmt(totalSum)} PLN</strong>
              {totalVoucherSum > 0 && (
                <span style={{ marginLeft: 8, color: c.voucherLight }}>voucher: {fmt(totalVoucherSum)}</span>
              )}
              {totalReturnedSum > 0 && (
                <span style={{ marginLeft: 8, color: c.successLight }}>zwroty: -{fmt(totalReturnedSum)}</span>
              )}
              {isActiveMonthClosed && (
                <span style={{ marginLeft: 10, ...s.badge(c.danger) }}>🔒 zamknięty</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      {!isFirstLoad && (
        <div style={{ background: c.bgDeepest, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>Filtry</div>
            <div style={{ display: "flex", gap: 6 }}>
              <ToggleBtn {...VIEW_TOGGLE_STYLE} active={!grouped} onClick={() => setGrouped(false)}>
                📋 Lista
              </ToggleBtn>
              <ToggleBtn {...VIEW_TOGGLE_STYLE} active={grouped} onClick={() => setGrouped(true)}>
                📁 Grupy
              </ToggleBtn>
            </div>
          </div>
          <div style={s.filterRow}>

            {/* Category */}
            <div style={s.filterBox}>
              <div style={s.filterLabel}>Kategoria</div>
              <CategoryMultiSelect
                value={filters.categories}
                onChange={v => { set("categories", v); set("subs", []); }}
                categories={uniqueCats.map(([, name]) => ({ name }))}
                placeholder="Wszystkie kategorie"
              />
            </div>

            {/* Subcategory — visible only when ≥1 category selected */}
            {filters.categories.length > 0 && uniqueSubs.length > 0 && (
              <div style={s.filterBox}>
                <div style={s.filterLabel}>Subkategoria</div>
                <CategoryMultiSelect
                  value={filters.subs}
                  onChange={v => set("subs", v)}
                  categories={uniqueSubs.map(([, name]) => ({ name }))}
                  placeholder="Wszystkie subkategorie"
                />
              </div>
            )}
            {/* Custom date Filters (in the chosen month) */}
            <DateRangeFilter
              showToday
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              // Merchant/tag OPTIONS are scoped to this range (see dateScoped
              // above) — clear both selections too, so a shop/tag that falls
              // out of the new range doesn't keep silently filtering.
              onFrom={d => { set("dateFrom", d); set("merchant", ""); set("tags", []); }}
              onTo={d => { set("dateTo", d); set("merchant", ""); set("tags", []); }}
              bounds={dateBounds}
              disabled={noDateRange}
              emptyMessage="Brak wydatków w tym miesiącu — filtr dat niedostępny."
              labels={{ from: "Data od", to: "Data do" }}
              
            />

            {/* Priority */}
            <div style={s.filterBox}>
              <div style={s.filterLabel}>Priorytet</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4].map(p => (
                  <button
                    key={p}
                    onClick={() => togglePrio(p)}
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: "none",
                      cursor: "pointer", fontWeight: 700, fontSize: 11,
                      background: filters.prio.includes(p) ? (PRIO_COLORS as Record<number, string>)[p] : c.border,
                      color:      filters.prio.includes(p) ? c.white : c.textSecondary,
                    }}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            {monthTagIds.length > 0 && (
              <div style={s.filterBox}>
                <div style={s.filterLabel}>Tagi</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {monthTagIds.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => set("tags", filters.tags.includes(tag.id)
                        ? filters.tags.filter(x => x !== tag.id)
                        : [...filters.tags, tag.id]
                      )}
                      style={{
                        padding: "3px 9px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11,
                        background: filters.tags.includes(tag.id) ? c.info : c.border,
                        color:      filters.tags.includes(tag.id) ? c.white    : c.textSecondary,
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Returns */}
            <div style={s.filterBox}>
              <div style={s.filterLabel}>Zwroty</div>
              <TriFilterButton
                state={filters.hasReturn}
                // The kind sub-filter only makes sense while filtering FOR
                // returns — clear it when leaving that state, so it doesn't
                // keep silently filtering.
                onChange={v => { set("hasReturn", v); if (v !== "yes") set("returnKinds", []); }}
                label="🔙 Zwroty"
                color={c.successLight}
              />
            </div>

            {/* Return kind — visible only when filtering FOR returns (like
                the subcategory filter under categories) */}
            {filters.hasReturn === "yes" && monthReturnKinds.length > 0 && (
              <div style={s.filterBox}>
                <div style={s.filterLabel}>Rodzaj zwrotu</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {monthReturnKinds.map(o => (
                    <button
                      key={o.id}
                      onClick={() => set("returnKinds", filters.returnKinds.includes(o.id)
                        ? filters.returnKinds.filter(x => x !== o.id)
                        : [...filters.returnKinds, o.id]
                      )}
                      style={{
                        padding: "3px 9px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11,
                        background: filters.returnKinds.includes(o.id) ? c.successLight : c.border,
                        color:      filters.returnKinds.includes(o.id) ? "#000" : c.textSecondary,
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
              {/* Receipts */}
            <div style={s.filterBox}>
              <div style={s.filterLabel}>Paragony</div>
              <TriFilterButton state={filters.hasReceipt} onChange={v => set("hasReceipt", v)} label="📎 Z paragonem" color={c.warning} />
            </div>
            {/* Tracked products */}
            <div style={s.filterBox}>
              <div style={s.filterLabel}>Produkty</div>
              <TriFilterButton state={filters.hasProduct} onChange={v => set("hasProduct", v)} label="🏷️ Śledzone" color={c.cyanLight} />
            </div>
            {/* Merchant */}
            {uniqueMerchants.length > 0 && (
              <div style={s.filterBox}>
                <div style={s.filterLabel}>Sklep</div>
                <select
                  value={filters.merchant}
                  onChange={e => set("merchant", e.target.value)}
                  style={{ height: 28, background: c.border, color: c.textTertiary, border: "none", borderRadius: 6, padding: "0 8px", fontSize: 11, cursor: "pointer" }}
                >
                  <option value="">Wszystkie sklepy</option>
                  {uniqueMerchants.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {/* Warranty */}
            <div style={s.filterBox}>
              <div style={s.filterLabel}>Gwarancja</div>
              <TriFilterButton state={filters.warranty}   onChange={v => set("warranty", v)}   label="🛡️ Gwarancyjne" color={c.warning} />
            </div>
            {/* Clear */}
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ ...s.actionBtn(c.danger), alignSelf: "flex-end", marginBottom: 4 }}>
                ✕ Wyczyść
              </button>
            )}
          </div>
        </div>
      )}

      {isFirstLoad && (
        <div style={s.card}>
          <SkeletonListRow columns={6} count={8} height={48} />
        </div>
      )}

      {!isFirstLoad && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
          Brak transakcji{hasActiveFilters ? " dla wybranych filtrów." : " w tym miesiącu."}
        </div>
      )}

      {/* Flat list */}
      {!isFirstLoad && !grouped && filtered.length > 0 && (
        <>
          <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {filtered.length} wyników · strona {flatPage} z {flatTotalPages}
          </div>
          {isMobile ? (
                      <div>
                        {paginatedFlat.map(tx => (
                          <TransactionCard
                            key={tx.id}
                            tx={tx}
                            onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                            onReturn={() => setReturnTarget(tx)}
                            onUpdated={handleUpdated}
                          />
                        ))}
                      </div>
                    ) : (
                    <div style={s.card}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={s.th}>Data</th>
                            <th style={s.th}>Kategoria</th>
                            <th style={s.th}>Opis</th>
                            <th style={s.th}>Tagi</th>
                            <th style={s.th}>Prio</th>
                            <th style={{ ...s.th, textAlign: "right" }}>Kwota</th>
                            <th style={s.th}>Autor</th>
                            <th style={s.th}>Akcje</th>
                          </tr>
                        </thead>
                          <tbody>
                            {paginatedFlat.map(tx => (
                              <TransactionRow
                                key={tx.id}
                                tx={tx}
                                onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                                onReturn={() => setReturnTarget(tx)}
                                onUpdated={handleUpdated}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                      <Pagination page={flatPage} totalPages={flatTotalPages} onPageChange={setFlatPage} />
                    </>
        )}

      {/* Grouped view */}
      {!isFirstLoad && grouped && groups.length > 0 && (
        <>
          <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {groups.length} grup · strona {groupPage} z {groupTotalPages}
          </div>
          {paginatedGroups.map(group => (
            <div key={group.key} style={s.card}>
              <div style={s.groupHeader} onClick={() => toggleGroup(group.key)}>
                <div style={s.groupTitle}>
                  <span style={{ color: c.textSecondary }}>{collapsed[group.key] ? "▶" : "▼"}</span>
                  {group.name}
                  <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400 }}>
                    ({group.items.length})
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {group.returnedSum > 0 && (
                    <span style={{ fontSize: 12, color: c.successLight }}>-{fmt(group.returnedSum)}</span>
                  )}
                  {group.voucherSum > 0 && (
                    <span style={{ fontSize: 12, color: c.voucherLight }}>voucher: {fmt(group.voucherSum)}</span>
                  )}
                  <span style={s.groupSum}>{fmt(group.sum)} PLN</span>
                </div>
              </div>
              {!collapsed[group.key] && (isMobile ? (
                            <div style={{ padding: "0 8px 8px" }}>
                              {group.items.map(tx => (
                                <TransactionCard
                                  key={tx.id}
                                  tx={tx}
                                  onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                                  onReturn={() => setReturnTarget(tx)}
                                  onUpdated={handleUpdated}
                                />
                              ))}
                            </div>
                          ) : (
                            <table style={s.table}>
                              <thead>
                                <tr>
                                  <th style={s.th}>Data</th>
                                  <th style={s.th}>Kategoria</th>
                                  <th style={s.th}>Opis</th>
                                  <th style={s.th}>Tagi</th>
                                  <th style={s.th}>Prio</th>
                                  <th style={{ ...s.th, textAlign: "right" }}>Kwota</th>
                                  <th style={s.th}>Autor</th>
                                  <th style={s.th}>Akcje</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map(tx => (
                                  <TransactionRow
                                    key={tx.id}
                                    tx={tx}
                                    onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                                    onReturn={() => setReturnTarget(tx)}
                                    onUpdated={handleUpdated}
                                  />
                                ))}
                              </tbody>
                            </table>
                          ))}
                </div>
          ))}
          <Pagination page={groupPage} totalPages={groupTotalPages} onPageChange={setGroupPage} />
        </>
      )}

      {/* Totals row */}
      {!isFirstLoad && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 4px", gap: 24 }}>
          {totalReturnedSum > 0 && (
            <span style={{ fontSize: 12, color: c.successLight }}>
              Zwroty: <strong>-{fmt(totalReturnedSum)} PLN</strong>
            </span>
          )}
          {totalVoucherSum > 0 && (
            <span style={{ fontSize: 12, color: c.voucherLight }}>
              Vouchery: <strong>{fmt(totalVoucherSum)} PLN</strong>
            </span>
          )}
          <span style={{ fontSize: 14, color: c.text }}>
            Razem: <strong>{fmt(totalSum)} PLN</strong>
          </span>
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Archiwizuj transakcję"
        message="Czy na pewno chcesz zarchiwizować tę transakcję? Operacja jest nieodwracalna."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, txId: null })}
      />
      <ConfirmModal
        isOpen={confirmLinkedModal.isOpen}
        title="⚠️ Transakcja ma powiązane zwroty"
        message="Ta transakcja ma powiązane transfery lub vouchery ze zwrotów. Archiwizacja usunie je wszystkie. Kontynuować?"
        onConfirm={handleConfirmedDeleteWithLinked}
        onCancel={() => setConfirmLinkedModal({ isOpen: false, txId: null })}
      />
      {returnTarget && (
        <ReturnModal
          tx={returnTarget}
          onClose={() => setReturnTarget(null)}
          onSaved={handleReturnSavedWithRefresh}
        />
      )}
    </div>
  );
}