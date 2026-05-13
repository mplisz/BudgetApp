// ============================================================
// File: frontend/src/components/panels/PanelTransactions.jsx
// Transaction display panel for the active budget month.
// Handles: data loading, filters, grouping, delete confirmation.
// Sub-components live in ./transactionComponents/
// ============================================================

import { useState, useMemo, useEffect } from "react";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { AppDatePicker, toYMD } from "../ui/AppDatePicker";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { fmt }             from "../../utils/helpers";
import { TransactionRow, ReturnModal, s, PRIO_COLORS } from "./transactionComponents";

export default function PanelTransactions() {
  const { transactions, setTransactions, tags } = useAppContext();
  const { deleteTransaction, loadTransactions }  = useTransactions();
  const { isActiveMonthClosed, activeBudgetMonth } = useMonthStatus();

  // ── Filter state ──────────────────────────────────────────
  const [filterCat,      setFilterCat]      = useState("");
  const [filterSub,      setFilterSub]      = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(null);  // Date | null
  const [filterDateTo,   setFilterDateTo]   = useState(null);  // Date | null
  const [filterPrio,     setFilterPrio]     = useState([]);    // number[]
  const [filterTags,     setFilterTags]     = useState([]);    // tag id[]

  // ── Group collapse state ──────────────────────────────────
  const [collapsed, setCollapsed] = useState({});

  // ── Delete modal state ────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, txId: null });

  // ── Return modal target ───────────────────────────────────
  const [returnTarget, setReturnTarget] = useState(null);

  // ── Grouping toggle ───────────────────────────────────────
  const [grouped, setGrouped] = useState(true);

  // Reload transactions whenever the active budget month changes
  useEffect(() => {
    loadTransactions(activeBudgetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBudgetMonth]);

  // Enrich transactions: resolve tag names + compute effective amount
  // effectiveAmount = amount minus returns whose moneyReturnedInMonth === activeBudgetMonth
  const enriched = useMemo(() =>
    transactions.map(tx => {
      const sameMonthReturned = (tx.returns || [])
        .filter(r => r.moneyReturnedInMonth === activeBudgetMonth)
        .reduce((s, r) => s + r.amount, 0);
      return {
        ...tx,
        tagNames: (tx.tags || [])
          .map(id => tags.find(t => t.id === id)?.name)
          .filter(Boolean),
        effectiveAmount: Math.max(0, (tx.netAmount ?? tx.amount) - sameMonthReturned),
        sameMonthReturned,
      };
    }),
    [transactions, tags, activeBudgetMonth]
  );

  // Unique categories/subcategories derived from current month's data
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

  // Only tags that actually appear in this month's transactions
  const monthTagIds = useMemo(() => {
    const ids = new Set(enriched.flatMap(tx => tx.tags || []));
    return tags.filter(t => ids.has(t.id));
  }, [enriched, tags]);

  // ── Filtering ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return enriched.filter(tx => {
      if (filterCat      && tx.categoryId    !== filterCat)              return false;
      if (filterSub      && tx.subcategoryId !== filterSub)              return false;
      if (filterDateFrom && tx.date < toYMD(filterDateFrom))            return false;
      if (filterDateTo   && tx.date > toYMD(filterDateTo))              return false;
      if (filterPrio.length && !filterPrio.includes(tx.priority || 2))  return false;
      if (filterTags.length && !filterTags.some(t => (tx.tags || []).includes(t))) return false;
      return true;
    });
  }, [enriched, filterCat, filterSub, filterDateFrom, filterDateTo, filterPrio, filterTags]);

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
      .map(([key, val]) => ({ key, ...val,
        sum:        val.items.reduce((acc, t) => acc + (t.netAmount ?? t.amount), 0),
        voucherSum: val.items.reduce((acc, t) => acc + (t.voucherAmount || 0), 0),
        returnedSum: val.items.reduce((acc, t) => acc + (t.sameMonthReturned || 0), 0),
      }));
  }, [filtered]);

  // effectiveAmount already accounts for same-month returns and vouchers
  const totalSum        = filtered.reduce((acc, t) => acc + t.effectiveAmount, 0);
  const totalVoucherSum = filtered.reduce((acc, t) => acc + (t.voucherAmount || 0), 0);
  const totalReturnedSum = filtered.reduce((acc, t) => acc + (t.sameMonthReturned || 0), 0);

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

  const hasActiveFilters = filterCat || filterSub || filterDateFrom || filterDateTo || filterPrio.length || filterTags.length;

  async function handleConfirmDelete() {
    if (!deleteModal.txId) return;
    await deleteTransaction(deleteModal.txId);
    setDeleteModal({ isOpen: false, txId: null });
  }

  function handleUpdated(updated) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  function handleReturnSaved(updated) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>📋 Transakcje</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {activeBudgetMonth} · {filtered.length} transakcji · łącznie {fmt(totalSum)} PLN
          {isActiveMonthClosed && <span style={{ marginLeft: 10, ...s.badge("#ef4444") }}>🔒 zamknięty</span>}
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────── */}
      <div style={{ background: "#090e1b", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>Filtry</div>
          <button
            onClick={() => setGrouped(g => !g)}
            style={{ ...s.actionBtn("#475569"), fontSize: 11 }}>
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

        {/* Priority toggle buttons */}
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

        {/* Tag filter — toggle badges, limited to tags present in this month.
            We skip TagMultiSelect here because we want only the subset of tags
            that appear in this month's transactions, not all tags from context. */}
        {monthTagIds.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...s.filterLabel, marginBottom: 0, marginRight: 6 }}>Tagi:</span>
            {monthTagIds.map(t => {
              const active = filterTags.includes(t.id);
              return (
                <button key={t.id} onClick={() => setFilterTags(prev => active ? prev.filter(x => x !== t.id) : [...prev, t.id])} style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border:     `1px solid ${active ? "#3b82f6" : "#1e293b"}`,
                  background: active ? "#3b82f622" : "transparent",
                  color:      active ? "#3b82f6"   : "#475569",
                }}>{t.icon} {t.name}</button>
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

      {/* ── Transaction groups ────────────────────────────── */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          Brak transakcji dla wybranych filtrów.
        </div>
      )}

      {/* ── Flat list mode ──────────────────────────────────── */}
      {!grouped && filtered.length > 0 && (
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
              {filtered.map(tx => (
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
      )}

      {/* ── Grouped mode ────────────────────────────────────── */}
      {grouped && groups.map(group => (
        <div key={group.key} style={s.card}>
          <div style={s.groupHeader} onClick={() => toggleGroup(group.key)}>
            <div style={s.groupTitle}>
              <span style={{ color: "#64748b" }}>{collapsed[group.key] ? "▶" : "▼"}</span>
              {group.name}
              <span style={{ ...s.badge("#475569"), fontSize: 11 }}>{group.items.length}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={s.groupSum}>{fmt(group.sum)} PLN</div>
              {group.voucherSum > 0 && (
                <div style={{ fontSize: 10, color: "#a78bfa" }}>🎫 voucher: {fmt(group.voucherSum)} PLN</div>
              )}
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

      {/* Total summary bar */}
      {filtered.length > 0 && (
        <div style={{ ...s.totalRow, background: "#090e1b", borderRadius: 10, border: "1px solid #1e293b" }}>
          <div>
            <div style={s.totalLabel}>Filtrowane (po zwrotach)</div>
            <div style={s.totalVal}>{fmt(totalSum)} PLN</div>
            {totalVoucherSum > 0 && (
              <div style={{ fontSize: 11, color: "#a78bfa" }}>🎫 voucher: {fmt(totalVoucherSum)} PLN</div>
            )}
            {totalReturnedSum > 0 && (
              <div style={{ fontSize: 11, color: "#10b981" }}>🔙 zwroty w tym miesiącu: {fmt(totalReturnedSum)} PLN</div>
            )}
          </div>
          <div>
            <div style={s.totalLabel}>Transakcji</div>
            <div style={{ ...s.totalVal, color: "#64748b" }}>{filtered.length}</div>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────── */}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Usunąć transakcję?"
        message="Transakcja zostanie oznaczona jako usunięta. Tej operacji nie można cofnąć."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, txId: null })}
      />

      {returnTarget && (
        <ReturnModal
          tx={returnTarget}
          activeBudgetMonth={activeBudgetMonth}
          onClose={() => setReturnTarget(null)}
          onSaved={handleReturnSaved}
        />
      )}
    </div>
  );
}