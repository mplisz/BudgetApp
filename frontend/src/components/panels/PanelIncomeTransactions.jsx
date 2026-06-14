// ============================================================
// File: src/components/panels/PanelIncomeTransactions.jsx
// "Wpływy" panel — section: Analiza
// Shows only transactions with type INCOME or TRANSFER.
// No priority column, no return mechanics.
// UI: Polish | Comments: English
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { toYMD } from "../ui/AppDatePicker";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { fmt }             from "../../utils/helpers";
import { typeColor, typeLabel, typeIcon } from "../../data/constants/categoryTypes";
import { s }               from "./transactionComponents/txStyles.jsx";
import { EditIncomeModal }  from "./transactionComponents/EditIncomeModal";
import { usePagination }   from "../../hooks/usePagination";
import { Pagination }      from "../ui/Pagination";
import { CategoryMultiSelect } from "../ui/CategoryMultiSelect";
import { useFilters }      from "../../hooks/useFilters";
import { useMonthLoad } from "../../hooks/useMonthLoad";
import { DateRangeFilter } from "./transactionComponents/DateRangeFilter";
import { dateBoundsOf } from "./transactionComponents/dateBounds";

const PAGE_SIZE = 25;

// ── Income transaction row ────────────────────────────────────

function IncomeRow({ tx, isMonthClosed, onDelete, onUpdated }) {
  const [editOpen, setEditOpen] = useState(false);

  const tColor = typeColor(tx.type);
  const tLabel = typeLabel(tx.type);

  return (
    <>
      <tr
        onMouseEnter={e => e.currentTarget.style.background = "#0a0f1e"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        style={{ transition: "background 0.1s" }}
      >
        <td style={s.td}>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{tx.date}</span>
        </td>

        <td style={s.td}>
          <span style={{
            background: tColor + "22", color: tColor,
            border: `1px solid ${tColor}44`,
            borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700,
          }}>
            {tLabel}
          </span>
        </td>

        <td style={s.td}>
          <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{tx.categoryName}</div>
          <div style={{ color: "#64748b", fontSize: 11 }}>› {tx.subcategoryName}</div>
        </td>

        <td style={{ ...s.td, maxWidth: 200, wordBreak: "break-word", whiteSpace: "normal" }}>
          <span style={{ color: "#94a3b8" }}>
            {tx.description || <span style={{ color: "#334155" }}>—</span>}
          </span>
        </td>

        <td style={s.td}>
          {(tx.tagNames || []).length > 0
            ? tx.tagNames.map((name, i) => <span key={i} style={s.badge("#3b82f6")}>{name}</span>)
            : <span style={{ color: "#334155" }}>—</span>}
        </td>

        <td style={{ ...s.td, textAlign: "right" }}>
          {tx.originalCurrency !== "PLN" && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
          <div style={{ fontWeight: 700, color: "#10b981", fontSize: 14 }}>
            {fmt(tx.amount)} PLN
          </div>
        </td>

        <td style={s.td}>
          <span style={{ color: "#475569", fontSize: 12 }}>{tx.author || "—"}</span>
        </td>

        <td style={s.td}>
          <div style={{ display: "flex", gap: 6 }}>
            {!isMonthClosed && (
              <button style={s.actionBtn("#3b82f6")} onClick={() => setEditOpen(true)}>✏️</button>
            )}
            {!isMonthClosed && (
              <button style={s.actionBtn("#ef4444")} onClick={onDelete}>🗑</button>
            )}
          </div>
        </td>
      </tr>

      {editOpen && createPortal(
        <EditIncomeModal
          tx={tx}
          onClose={() => setEditOpen(false)}
          onUpdated={updated => { onUpdated(updated); setEditOpen(false); }}
        />,
        document.body
      )}
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────

export default function PanelIncomeTransactions() {
  const { transactions, setTransactions, tags } = useAppContext();
  const { deleteTransaction, loadTransactions }  = useTransactions();
  const { isActiveMonthClosed, activeBudgetMonth } = useMonthStatus();

  const { filters, set, clear: clearFilters, hasActive: hasActiveFilters } = useFilters({
    type:       "",
    categories: [],
    dateFrom:   null,
    dateTo:     null,
  });

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, txId: null });

  // Per-month load + isFirstLoad; reset month-specific date filters on change.
  const isFirstLoad = useMonthLoad(activeBudgetMonth, loadTransactions, () => {
    set("dateFrom", null);
    set("dateTo", null);
  });

  const enriched = useMemo(() =>
    transactions
      .filter(tx => tx.type === "INCOME" || tx.type === "TRANSFER")
      .map(tx => ({
        ...tx,
        tagNames: (tx.tags || [])
          .map(id => tags.find(t => t.id === id)?.name)
          .filter(Boolean),
      })),
    [transactions, tags]
  );

  const uniqueCats = useMemo(() => {
    const map = {};
    enriched.forEach(tx => { if (tx.categoryId) map[tx.categoryId] = tx.categoryName; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enriched]);

  const filtered = useMemo(() =>
    enriched.filter(tx => {
      if (filters.type                && tx.type !== filters.type)                        return false;
      if (filters.categories.length > 0 && !filters.categories.includes(tx.categoryName)) return false;
      if (filters.dateFrom            && tx.date < toYMD(filters.dateFrom))               return false;
      if (filters.dateTo              && tx.date > toYMD(filters.dateTo))                 return false;
      return true;
    }),
    [enriched, filters]
  );

  const totalSum = filtered.reduce((acc, tx) => acc + tx.amount, 0);

  const { page, totalPages, paginated, setPage } = usePagination(filtered, PAGE_SIZE);

  const dateBounds  = useMemo(() => dateBoundsOf(enriched), [enriched]);
  const noDateRange = enriched.length === 0;

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteModal.txId) return;
    await deleteTransaction(deleteModal.txId);
    setDeleteModal({ isOpen: false, txId: null });
  }, [deleteModal.txId, deleteTransaction]);

  const handleUpdated = useCallback((updated) => {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }, [setTransactions]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{ fontSize: 13, color: "#64748b" }}>
        {activeBudgetMonth} ·{" "}
        {isFirstLoad ? (
          <span style={{ color: "#475569" }}>ładowanie…</span>
        ) : (
          <>
            {filtered.length} wpisów · łącznie{" "}
            <strong style={{ color: "#10b981" }}>{fmt(totalSum)}</strong>
            {isActiveMonthClosed && (
              <span style={{ marginLeft: 10, ...s.badge("#ef4444") }}>🔒 zamknięty</span>
            )}
          </>
        )}
      </div>

      {/* Filters — hidden while the month's data is still loading */}
      {!isFirstLoad && (
        <div style={{ background: "#090e1b", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={s.filterRow}>

            {/* Type */}
            <div style={s.filterBox}>
              <label style={s.filterLabel}>Typ</label>
              <select value={filters.type} onChange={e => set("type", e.target.value)} style={s.select}>
                <option value="">Wszystkie</option>
                <option value="INCOME">{typeIcon("INCOME")} {typeLabel("INCOME")}</option>
                <option value="TRANSFER">{typeIcon("TRANSFER")} {typeLabel("TRANSFER")}</option>
              </select>
            </div>

            {/* Category */}
            <div style={s.filterBox}>
              <label style={s.filterLabel}>Kategoria</label>
              <CategoryMultiSelect
                value={filters.categories}
                onChange={v => set("categories", v)}
                categories={uniqueCats.map(([, name]) => ({ name }))}
                placeholder="Wszystkie kategorie"
              />
            </div>

            <DateRangeFilter
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onFrom={d => set("dateFrom", d)}
              onTo={d => set("dateTo", d)}
              bounds={dateBounds}
              disabled={noDateRange}
              emptyMessage="Brak wpływów w tym miesiącu — filtr dat niedostępny."
            />

            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ ...s.actionBtn("#64748b"), fontSize: 11, alignSelf: "flex-end" }}>
                ✕ Wyczyść
              </button>
            )}
          </div>
        </div>
      )}
      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          Brak wpływów{hasActiveFilters ? " dla wybranych filtrów." : " w tym miesiącu."}
        </div>
      ) : (
        <>
          <div style={{ color: "#475569", fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {filtered.length} wyników · strona {page} z {totalPages}
          </div>
          <div style={s.card}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Data</th>
                  <th style={s.th}>Typ</th>
                  <th style={s.th}>Kategoria</th>
                  <th style={s.th}>Opis</th>
                  <th style={s.th}>Tagi</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Kwota</th>
                  <th style={s.th}>Autor</th>
                  <th style={s.th}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(tx => (
                  <IncomeRow
                    key={tx.id}
                    tx={tx}
                    isMonthClosed={isActiveMonthClosed}
                    onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
                    onUpdated={handleUpdated}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Archiwizuj wpływ"
        message="Czy na pewno chcesz zarchiwizować ten wpływ? Operacja jest nieodwracalna."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, txId: null })}
      />
    </div>
  );
}