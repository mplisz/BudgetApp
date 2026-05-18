// ============================================================
// File: src/components/panels/PanelTransactions.jsx
// Transaction display panel for the active budget month.
// Shows only EXPENSE and SAVING transactions (INCOME/TRANSFER → PanelIncomeTransactions).
// UI: Polish | Comments: English
// ============================================================

import { useState, useMemo, useEffect } from "react";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { useToast }        from "../../hooks/useToast";
import { AppDatePicker, toYMD } from "../ui/AppDatePicker";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { fmt }             from "../../utils/helpers";
import { calculateEffectiveAmount } from "../../utils/returnUtils";
import { TransactionRow, ReturnModal, s, PRIO_COLORS } from "./transactionComponents";
import { usePagination }   from "../../hooks/usePagination";
import { Pagination }      from "../ui/Pagination";

const PAGE_SIZE = 25;

export default function PanelTransactions() {
  const { transactions, setTransactions, tags } = useAppContext();
  const { deleteTransaction, loadTransactions }  = useTransactions();
  const { isActiveMonthClosed, activeBudgetMonth } = useMonthStatus();

  // ── Filter state ──────────────────────────────────────────
  const [filterCat,      setFilterCat]      = useState("");
  const [filterSub,      setFilterSub]      = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(null);
  const [filterDateTo,   setFilterDateTo]   = useState(null);
  const [filterPrio,     setFilterPrio]     = useState([]);
  const [filterTags,     setFilterTags]     = useState([]);

  const [collapsed,           setCollapsed]           = useState({});
  const [deleteModal,         setDeleteModal]         = useState({ isOpen: false, txId: null });
  const [confirmLinkedModal,  setConfirmLinkedModal]  = useState({ isOpen: false, txId: null });
  const [returnTarget,        setReturnTarget]        = useState(null);
  const [grouped,             setGrouped]             = useState(true);

  useEffect(() => {
    loadTransactions(activeBudgetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBudgetMonth]);

  // Enrich: resolve tag names + compute effective amount after same-month returns.
  // Filter: exclude INCOME and TRANSFER — those go to PanelIncomeTransactions.
  // effectiveAmount uses CASH returns only (voucher returns are separate assets).
  const enriched = useMemo(() =>
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
            .filter(Boolean),
          effectiveAmount:   calculateEffectiveAmount(tx, activeBudgetMonth),
          sameMonthReturned: cashReturnedThisMonth,
        };
      }),
    [transactions, tags, activeBudgetMonth]
  );

  const uniqueCats = useMemo(() => {
    const map = {};
    enriched.forEach(tx => { if (tx.categoryId) map[tx.categoryId] = tx.categoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enriched]);

  const uniqueSubs = useMemo(() => {
    if (!filterCat) return [];
    const map = {};
    enriched
      .filter(tx => tx.categoryId === filterCat)
      .forEach(tx => { if (tx.subcategoryId) map[tx.subcategoryId] = tx.subcategoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enriched, filterCat]);

  const monthTagIds = useMemo(() => {
    const ids = new Set(enriched.flatMap(tx => tx.tags || []));
    return tags.filter(t => ids.has(t.id));
  }, [enriched, tags]);

  // ── Filtering ─────────────────────────────────────────────
  const filtered = useMemo(() =>
    enriched.filter(tx => {
      if (filterCat      && tx.categoryId    !== filterCat)             return false;
      if (filterSub      && tx.subcategoryId !== filterSub)             return false;
      if (filterDateFrom && tx.date < toYMD(filterDateFrom))           return false;
      if (filterDateTo   && tx.date > toYMD(filterDateTo))             return false;
      if (filterPrio.length && !filterPrio.includes(tx.priority || 2)) return false;
      if (filterTags.length && !filterTags.some(t => (tx.tags || []).includes(t))) return false;
      return true;
    }),
    [enriched, filterCat, filterSub, filterDateFrom, filterDateTo, filterPrio, filterTags]
  );

  // ── Grouping by category ──────────────────────────────────
  const groups = useMemo(() => {
    const map = {};
    filtered.forEach(tx => {
      const key = tx.categoryId || "uncategorised";
      if (!map[key]) map[key] = { name: tx.categoryName || "Bez kategorii", items: [] };
      map[key].items.push(tx);
    });
    return Object.entries(map)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([key, val]) => ({
        key, ...val,
        sum:         val.items.reduce((acc, t) => acc + (t.netAmount ?? t.amount), 0),
        voucherSum:  val.items.reduce((acc, t) => acc + (t.voucherAmount || 0), 0),
        returnedSum: val.items.reduce((acc, t) => acc + (t.sameMonthReturned || 0), 0),
      }));
  }, [filtered]);

  const totalSum         = filtered.reduce((acc, t) => acc + t.effectiveAmount, 0);
  const totalVoucherSum  = filtered.reduce((acc, t) => acc + (t.voucherAmount || 0), 0);
  const totalReturnedSum = filtered.reduce((acc, t) => acc + (t.sameMonthReturned || 0), 0);

  // ── Pagination ────────────────────────────────────────────
  // Flat list: paginate individual transactions
  const {
    page: flatPage,
    totalPages: flatTotalPages,
    paginated: paginatedFlat,
    setPage: setFlatPage,
  } = usePagination(filtered, PAGE_SIZE);

  // Grouped: paginate the groups themselves (not individual rows)
  // Each group can have many rows — paging groups keeps the DOM manageable
  const {
    page: groupPage,
    totalPages: groupTotalPages,
    paginated: paginatedGroups,
    setPage: setGroupPage,
  } = usePagination(groups, PAGE_SIZE);

  // ── Handlers ──────────────────────────────────────────────
  function toggleGroup(key) { setCollapsed(p => ({ ...p, [key]: !p[key] })); }

  function togglePrio(p) {
    setFilterPrio(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  function clearFilters() {
    setFilterCat(""); setFilterSub("");
    setFilterDateFrom(null); setFilterDateTo(null);
    setFilterPrio([]); setFilterTags([]);
  }

  const hasActiveFilters = !!(filterCat || filterSub || filterDateFrom || filterDateTo
    || filterPrio.length || filterTags.length);

  const { showError: showToastError } = useToast();

  async function handleConfirmDelete() {
    if (!deleteModal.txId) return;
    const result = await deleteTransaction(deleteModal.txId);
    setDeleteModal({ isOpen: false, txId: null });

    if (result?._requiresConfirmation) {
      // Backend requires confirmation — show second modal
      setConfirmLinkedModal({ isOpen: true, txId: result.txId ?? deleteModal.txId });
    }
  }

  async function handleConfirmedDeleteWithLinked() {
    if (!confirmLinkedModal.txId) return;
    await deleteTransaction(confirmLinkedModal.txId, { forceArchiveLinked: true });
    setConfirmLinkedModal({ isOpen: false, txId: null });
  }

  function handleUpdated(updated) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  function handleReturnSaved(updated) {
    // Update the original transaction in local state
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  async function handleReturnSavedWithRefresh(updated, sideEffects) {
    handleReturnSaved(updated);
    // If a cross-month TRANSFER was created, reload transactions so
    // PanelIncomeTransactions shows the new TRANSFER immediately
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
          {activeBudgetMonth} · {filtered.length} transakcji · łącznie{" "}
          <strong style={{ color: "#e2e8f0" }}>{fmt(totalSum)} PLN</strong>
          {totalVoucherSum > 0 && (
            <span style={{ marginLeft: 8, color: "#a78bfa" }}>voucher: {fmt(totalVoucherSum)}</span>
          )}
          {totalReturnedSum > 0 && (
            <span style={{ marginLeft: 8, color: "#34d399" }}>zwroty: -{fmt(totalReturnedSum)}</span>
          )}
          {isActiveMonthClosed && (
            <span style={{ marginLeft: 10, ...s.badge("#ef4444") }}>🔒 zamknięty</span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#090e1b", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>Filtry</div>
          <button onClick={() => setGrouped(g => !g)} style={{ ...s.actionBtn("#475569"), fontSize: 11 }}>
            {grouped ? "📋 Lista płaska" : "🗂️ Grupuj"}
          </button>
        </div>

        <div style={s.filterRow}>
          <div style={s.filterBox}>
            <span style={s.filterLabel}>Kategoria</span>
            <select style={s.select} value={filterCat} onChange={e => { setFilterCat(e.target.value); setFilterSub(""); }}>
              <option value="">Wszystkie</option>
              {uniqueCats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>

          {filterCat && (
            <div style={s.filterBox}>
              <span style={s.filterLabel}>Subkategoria</span>
              <select style={s.select} value={filterSub} onChange={e => setFilterSub(e.target.value)}>
                <option value="">Wszystkie</option>
                {uniqueSubs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}

          <div style={s.filterBox}>
            <span style={s.filterLabel}>Data od</span>
            <AppDatePicker
              value={filterDateFrom}
              onChange={setFilterDateFrom}
              maxDate={filterDateTo || undefined}
              placeholder="od"
              style={{ fontSize: 13, padding: "7px 10px" }}
            />
          </div>

          <div style={s.filterBox}>
            <span style={s.filterLabel}>Data do</span>
            <AppDatePicker
              value={filterDateTo}
              onChange={setFilterDateTo}
              minDate={filterDateFrom || undefined}
              placeholder="do"
              style={{ fontSize: 13, padding: "7px 10px" }}
            />
          </div>
        </div>

        {/* Priority toggles */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ ...s.filterLabel, alignSelf: "center", marginBottom: 0, marginRight: 6 }}>Priorytet:</span>
          {[1, 2, 3, 4].map(p => {
            const col    = PRIO_COLORS[p];
            const active = filterPrio.includes(p);
            return (
              <button key={p} onClick={() => togglePrio(p)} style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border:     `1px solid ${active ? col : col + "44"}`,
                background: active ? col + "22" : "transparent",
                color:      active ? col        : col + "88",
              }}>P{p}</button>
            );
          })}
        </div>

        {/* Tag toggles */}
        {monthTagIds.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...s.filterLabel, marginBottom: 0, marginRight: 6 }}>Tagi:</span>
            {monthTagIds.map(t => {
              const active = filterTags.includes(t.id);
              return (
                <button key={t.id}
                  onClick={() => setFilterTags(prev => active ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                  style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    border:     `1px solid ${active ? "#3b82f6" : "#1e293b"}`,
                    background: active ? "#3b82f622" : "transparent",
                    color:      active ? "#3b82f6"   : "#475569",
                  }}
                >
                  {t.icon || ""} {t.name}
                </button>
              );
            })}
          </div>
        )}

        {hasActiveFilters && (
          <button onClick={clearFilters} style={{ marginTop: 10, ...s.actionBtn("#64748b"), fontSize: 11 }}>
            ✕ Wyczyść filtry
          </button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          Brak transakcji dla wybranych filtrów.
        </div>
      )}

      {/* Flat list */}
      {!grouped && filtered.length > 0 && (
        <>
          <div style={{ color: "#475569", fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {filtered.length} wyników · strona {flatPage} z {flatTotalPages}
          </div>
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
      {grouped && groups.length > 0 && (
        <>
          <div style={{ color: "#475569", fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {groups.length} grup · strona {groupPage} z {groupTotalPages}
          </div>
          {paginatedGroups.map(group => (
            <div key={group.key} style={s.card}>
              <div style={s.groupHeader} onClick={() => toggleGroup(group.key)}>
                <div style={s.groupTitle}>
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
                  <span style={s.groupSum}>{fmt(group.sum)} PLN</span>
                </div>
              </div>

              {!collapsed[group.key] && (
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
      {filtered.length > 0 && (
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
        message={
          "Ta transakcja ma zarejestrowane zwroty. Archiwizacja spowoduje zarchiwizowanie:\n" +
          "• wszystkich powiązanych transferów TRANSFER\n" +
          "• wszystkich voucherów utworzonych ze zwrotów tej transakcji\n\n" +
          "Czy chcesz kontynuować?"
        }
        onConfirm={handleConfirmedDeleteWithLinked}
        onCancel={() => setConfirmLinkedModal({ isOpen: false, txId: null })}
      />

      {returnTarget && (
        <ReturnModal
          tx={returnTarget}
          activeBudgetMonth={activeBudgetMonth}
          onClose={() => setReturnTarget(null)}
          onSaved={(updated, sideEffects) => {
            handleReturnSavedWithRefresh(updated, sideEffects);
            setReturnTarget(null);
          }}
        />
      )}
    </div>
  );
}