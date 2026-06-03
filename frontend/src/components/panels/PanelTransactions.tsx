// ============================================================
// File: src/components/panels/PanelTransactions.tsx
// Transaction display panel — EXPENSE and SAVING only.
// INCOME/TRANSFER → PanelIncomeTransactions.
// UI: Polish | Comments: English
// ============================================================

import { useState, useMemo, useEffect } from "react";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { AppDatePicker, toYMD } from "../ui/AppDatePicker";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { fmt }             from "../../utils/helpers";
import { calculateEffectiveAmount } from "../../utils/returnUtils";
import { TransactionRow, ReturnModal, s, PRIO_COLORS } from "./transactionComponents";
import { usePagination }   from "../../hooks/usePagination";
import { Pagination }      from "../ui/Pagination";
import { SkeletonListRow } from "../ui/Skeleton";
import { CategoryMultiSelect }      from "../ui/CategoryMultiSelect";
import { useFilters }               from "../../hooks/useFilters";
import { ToggleBtn, VIEW_TOGGLE_STYLE } from "../ui/ToggleBtn";

const PAGE_SIZE = 25;

// ── Types ─────────────────────────────────────────────────────

interface Return {
  moneyReturnedInMonth: string;
  cashAmount?:          number;
  voucherAmount?:       number;
}

interface Transaction {
  id:              string;
  type:            string;
  date:            string;
  budgetMonth:     string;
  categoryId:      string;
  categoryName:    string;
  subcategoryId:   string;
  subcategoryName: string;
  amount:          number;
  netAmount?:      number;
  voucherAmount?:  number;
  priority?:       number;
  description?:    string;
  tags?:           string[];
  isRecurring?:    boolean;
  returns?:        Return[];
  // Enriched fields added in useMemo
  tagNames?:        string[];
  effectiveAmount?: number;
  sameMonthReturned?: number;
}

interface Tag {
  id:   string;
  name: string;
}

interface DeleteModal { isOpen: boolean; txId: string | null; }
interface LinkedModal { isOpen: boolean; txId: string | null; }

// ── Component ─────────────────────────────────────────────────

export default function PanelTransactions() {
  const { transactions, setTransactions, tags } = useAppContext() as {
    transactions:    Transaction[];
    setTransactions: (v: Transaction[] | ((p: Transaction[]) => Transaction[])) => void;
    tags:            Tag[];
  };
  const { deleteTransaction, loadTransactions } = useTransactions() as {
    deleteTransaction: (id: string, opts?: Record<string, unknown>) => Promise<unknown>;
    loadTransactions:  (month: string) => Promise<void>;
  };
  const { isActiveMonthClosed, activeBudgetMonth } = useMonthStatus() as {
    isActiveMonthClosed: boolean;
    activeBudgetMonth:   string;
  };

  // ── Filter state ──────────────────────────────────────────

  const { filters, set, clear: clearFilters, hasActive: hasActiveFilters } = useFilters({
    categories: [] as string[],
    subs:       [] as string[],
    dateFrom:   null as Date | null,
    dateTo:     null as Date | null,
    prio:       [] as number[],
    tags:       [] as string[],
  });

  const [collapsed,          setCollapsed]          = useState<Record<string, boolean>>({});
  const [deleteModal,        setDeleteModal]        = useState<DeleteModal>({ isOpen: false, txId: null });
  const [confirmLinkedModal, setConfirmLinkedModal] = useState<LinkedModal>({ isOpen: false, txId: null });
  const [returnTarget,       setReturnTarget]       = useState<Transaction | null>(null);
  const [grouped,            setGrouped]            = useState(false);
  const [loadedMonth,        setLoadedMonth]        = useState<string | null>(null);

  useEffect(() => {
    setLoadedMonth(null);
    loadTransactions(activeBudgetMonth).then(() => {
      setLoadedMonth(activeBudgetMonth);
    });
  }, [activeBudgetMonth]);

  const isFirstLoad = loadedMonth !== activeBudgetMonth;

  // ── Enrich transactions ───────────────────────────────────
  // - Resolve tag names
  // - Compute effectiveAmount (deducts same-month cash returns)
  // - Filter out INCOME and TRANSFER

  const enriched = useMemo<Transaction[]>(() =>
    transactions
      .filter(tx => tx.type !== "INCOME" && tx.type !== "TRANSFER")
      .map(tx => {
        const cashReturnedThisMonth = (tx.returns || [])
          .filter(r => r.moneyReturnedInMonth === activeBudgetMonth)
          .reduce((sum, r) => sum + (r.cashAmount || 0), 0);
        return {
          ...tx,
          tagNames: (tx.tags || [])
            .map(id => tags.find(t => t.id === id)?.name)
            .filter(Boolean) as string[],
          effectiveAmount:   calculateEffectiveAmount(tx, activeBudgetMonth),
          sameMonthReturned: cashReturnedThisMonth,
        };
      }),
    [transactions, tags, activeBudgetMonth]
  );

  const uniqueCats = useMemo(() => {
    const map: Record<string, string> = {};
    enriched.forEach(tx => { if (tx.categoryId) map[tx.categoryId] = tx.categoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enriched]);

  const uniqueSubs = useMemo(() => {
    if (filters.categories.length === 0) return [];
    const map: Record<string, string> = {};
    enriched
      .filter(tx => filters.categories.includes(tx.categoryName))
      .forEach(tx => { if (tx.subcategoryId) map[tx.subcategoryId] = tx.subcategoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enriched, filters.categories]);

  const monthTagIds = useMemo(() => {
    const ids = new Set(enriched.flatMap(tx => tx.tags || []));
    return tags.filter(t => ids.has(t.id));
  }, [enriched, tags]);

  // ── Filtering ─────────────────────────────────────────────

  const filtered = useMemo<Transaction[]>(() =>
    enriched.filter(tx => {
      if (filters.categories.length > 0 && !filters.categories.includes(tx.categoryName)) return false;
      if (filters.subs.length       > 0 && !filters.subs.includes(tx.subcategoryName))    return false;
      if (filters.dateFrom && tx.date < toYMD(filters.dateFrom))                           return false;
      if (filters.dateTo   && tx.date > toYMD(filters.dateTo))                             return false;
      if (filters.prio.length && !filters.prio.includes(tx.priority || 2))                 return false;
      if (filters.tags.length && !filters.tags.some(t => (tx.tags || []).includes(t)))     return false;
      return true;
    }),
    [enriched, filters]
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
        <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>🧾 Wydatki</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {activeBudgetMonth} ·{" "}
          {isFirstLoad ? (
            <span style={{ color: "#475569" }}>ładowanie…</span>
          ) : (
            <>
              {filtered.length} transakcji · łącznie{" "}
              <strong style={{ color: "#e2e8f0" }}>{fmt(totalSum)} PLN</strong>
              {totalVoucherSum > 0 && (
                <span style={{ marginLeft: 8, color: "#a78bfa" }}>voucher: {fmt(totalVoucherSum)}</span>
              )}
              {totalReturnedSum > 0 && (
                <span style={{ marginLeft: 8, color: "#34d399" }}>zwroty: -{fmt(totalReturnedSum)}</span>
              )}
              {isActiveMonthClosed && (
                <span style={{ marginLeft: 10, ...(s as any).badge("#ef4444") }}>🔒 zamknięty</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#090e1b", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>Filtry</div>
          <div style={{ display: "flex", gap: 6 }}>
            <ToggleBtn {...VIEW_TOGGLE_STYLE} active={!grouped} onClick={() => setGrouped(false)}>
              📋 Lista
            </ToggleBtn>
            <ToggleBtn {...VIEW_TOGGLE_STYLE} active={grouped} onClick={() => setGrouped(true)}>
              📁 Grupy
            </ToggleBtn>
          </div>
        </div>
        <div style={(s as any).filterRow}>

          {/* Category */}
          <div style={(s as any).filterBox}>
            <div style={(s as any).filterLabel}>Kategoria</div>
            <CategoryMultiSelect
              value={filters.categories}
              onChange={v => { set("categories", v); set("subs", []); }}
              categories={uniqueCats.map(([, name]) => ({ name }))}
              placeholder="Wszystkie kategorie"
            />
          </div>

          {/* Subcategory — visible only when ≥1 category selected */}
          {filters.categories.length > 0 && uniqueSubs.length > 0 && (
            <div style={(s as any).filterBox}>
              <div style={(s as any).filterLabel}>Subkategoria</div>
              <CategoryMultiSelect
                value={filters.subs}
                onChange={v => set("subs", v)}
                categories={uniqueSubs.map(([, name]) => ({ name }))}
                placeholder="Wszystkie subkategorie"
              />
            </div>
          )}

          {/* Date from */}
          <div style={(s as any).filterBox}>
            <div style={(s as any).filterLabel}>Data od</div>
            <AppDatePicker
              value={filters.dateFrom}
              onChange={(d: Date) => set("dateFrom", d)}
              maxDate={filters.dateTo ?? null}
            />
          </div>

          {/* Date to */}
          <div style={(s as any).filterBox}>
            <div style={(s as any).filterLabel}>Data do</div>
            <AppDatePicker
              value={filters.dateTo}
              onChange={(d: Date) => set("dateTo", d)}
              minDate={filters.dateFrom ?? undefined}
            />
          </div>

          {/* Priority */}
          <div style={(s as any).filterBox}>
            <div style={(s as any).filterLabel}>Priorytet</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4].map(p => (
                <button
                  key={p}
                  onClick={() => togglePrio(p)}
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: "none",
                    cursor: "pointer", fontWeight: 700, fontSize: 11,
                    background: filters.prio.includes(p) ? (PRIO_COLORS as Record<number, string>)[p] : "#1e293b",
                    color:      filters.prio.includes(p) ? "#fff" : "#64748b",
                  }}
                >
                  P{p}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {monthTagIds.length > 0 && (
            <div style={(s as any).filterBox}>
              <div style={(s as any).filterLabel}>Tagi</div>
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
                      background: filters.tags.includes(tag.id) ? "#3b82f6" : "#1e293b",
                      color:      filters.tags.includes(tag.id) ? "#fff"    : "#64748b",
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear */}
          {hasActiveFilters && (
            <button onClick={clearFilters} style={{ ...(s as any).actionBtn("#ef4444"), alignSelf: "flex-end", marginBottom: 4 }}>
              ✕ Wyczyść
            </button>
          )}
        </div>
      </div>

      {isFirstLoad && (
        <div style={(s as any).card}>
          <SkeletonListRow columns={6} count={8} height={48} />
        </div>
      )}

      {!isFirstLoad && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          Brak transakcji{hasActiveFilters ? " dla wybranych filtrów." : " w tym miesiącu."}
        </div>
      )}

      {/* Flat list */}
      {!isFirstLoad && !grouped && filtered.length > 0 && (
        <>
          <div style={{ color: "#475569", fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {filtered.length} wyników · strona {flatPage} z {flatTotalPages}
          </div>
          <div style={(s as any).card}>
            <table style={(s as any).table}>
              <thead>
                <tr>
                  <th style={(s as any).th}>Data</th>
                  <th style={(s as any).th}>Kategoria</th>
                  <th style={(s as any).th}>Opis</th>
                  <th style={(s as any).th}>Tagi</th>
                  <th style={(s as any).th}>Prio</th>
                  <th style={{ ...(s as any).th, textAlign: "right" }}>Kwota</th>
                  <th style={(s as any).th}>Autor</th>
                  <th style={(s as any).th}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFlat.map(tx => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    isMonthClosed={isActiveMonthClosed}
                    onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                    onReturn={() => setReturnTarget(tx)}
                    onUpdated={handleUpdated}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={flatPage} totalPages={flatTotalPages} onPageChange={setFlatPage} />
        </>
      )}

      {/* Grouped view */}
      {!isFirstLoad && grouped && groups.length > 0 && (
        <>
          <div style={{ color: "#475569", fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {groups.length} grup · strona {groupPage} z {groupTotalPages}
          </div>
          {paginatedGroups.map(group => (
            <div key={group.key} style={(s as any).card}>
              <div style={(s as any).groupHeader} onClick={() => toggleGroup(group.key)}>
                <div style={(s as any).groupTitle}>
                  <span style={{ color: "#64748b" }}>{collapsed[group.key] ? "▶" : "▼"}</span>
                  {group.name}
                  <span style={{ color: "#475569", fontSize: 12, fontWeight: 400 }}>
                    ({group.items.length})
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {group.returnedSum > 0 && (
                    <span style={{ fontSize: 12, color: "#34d399" }}>-{fmt(group.returnedSum)}</span>
                  )}
                  {group.voucherSum > 0 && (
                    <span style={{ fontSize: 12, color: "#a78bfa" }}>voucher: {fmt(group.voucherSum)}</span>
                  )}
                  <span style={(s as any).groupSum}>{fmt(group.sum)} PLN</span>
                </div>
              </div>
              {!collapsed[group.key] && (
                <table style={(s as any).table}>
                  <thead>
                    <tr>
                      <th style={(s as any).th}>Data</th>
                      <th style={(s as any).th}>Kategoria</th>
                      <th style={(s as any).th}>Opis</th>
                      <th style={(s as any).th}>Tagi</th>
                      <th style={(s as any).th}>Prio</th>
                      <th style={{ ...(s as any).th, textAlign: "right" }}>Kwota</th>
                      <th style={(s as any).th}>Autor</th>
                      <th style={(s as any).th}>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(tx => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        isMonthClosed={isActiveMonthClosed}
                        onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                        onReturn={() => setReturnTarget(tx)}
                        onUpdated={handleUpdated}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          <Pagination page={groupPage} totalPages={groupTotalPages} onPageChange={setGroupPage} />
        </>
      )}

      {/* Totals row */}
      {!isFirstLoad && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 4px", gap: 24 }}>
          {totalReturnedSum > 0 && (
            <span style={{ fontSize: 12, color: "#34d399" }}>
              Zwroty: <strong>-{fmt(totalReturnedSum)} PLN</strong>
            </span>
          )}
          {totalVoucherSum > 0 && (
            <span style={{ fontSize: 12, color: "#a78bfa" }}>
              Vouchery: <strong>{fmt(totalVoucherSum)} PLN</strong>
            </span>
          )}
          <span style={{ fontSize: 14, color: "#e2e8f0" }}>
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
          activeBudgetMonth={activeBudgetMonth}
          onClose={() => setReturnTarget(null)}
          onSaved={handleReturnSavedWithRefresh}
        />
      )}
    </div>
  );
}