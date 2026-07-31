// ============================================================
// File: src/components/panels/PanelIncomeTransactions.jsx
// "Wpływy" panel — section: Analiza
// Shows only transactions with type INCOME or TRANSFER.
// No priority column, no return mechanics.
// UI: Polish | Comments: English
// ============================================================

import { c } from "../../styles/tokens";
import { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { toYMD } from "../ui/AppDatePicker";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { fmt }             from "../../utils/helpers";
import { typeColor, typeLabel, typeIcon } from "../../data/constants/categoryTypes";
import { s }               from "./transactionComponents/txStyles";
import { EditIncomeModal }  from "./transactionComponents/EditIncomeModal";
import { usePagination }   from "../../hooks/usePagination";
import { Pagination }      from "../ui/Pagination";
import { SkeletonListRow } from "../ui/Skeleton";
import { CategoryMultiSelect } from "../ui/CategoryMultiSelect";
import { useFilters }      from "../../hooks/useFilters";
import { useMonthLoad } from "../../hooks/useMonthLoad";
import { DateRangeFilter } from "./transactionComponents/DateRangeFilter";
import { dateBoundsOf } from "./transactionComponents/dateBounds";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Transaction } from "../../types/appContext";

const PAGE_SIZE = 25;

interface IncomeRowProps {
  tx:            Transaction;
  isMonthClosed: boolean;
  onDelete:      () => void;
  onUpdated:     (tx: Transaction) => void;
}

// ── Income transaction row ────────────────────────────────────

function IncomeRow({ tx, isMonthClosed, onDelete, onUpdated }: IncomeRowProps) {
  const [editOpen, setEditOpen] = useState(false);

  const tColor = typeColor(tx.type);
  const tLabel = typeLabel(tx.type);

  return (
    <>
      <tr
        onMouseEnter={e => e.currentTarget.style.background = c.bg}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        style={{ transition: "background 0.1s" }}
      >
        <td style={s.td}>
          <span style={{ color: c.textTertiary, fontSize: 12 }}>{tx.date}</span>
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
          <div style={{ fontWeight: 600, color: c.text, fontSize: 13 }}>{tx.categoryName}</div>
          <div style={{ color: c.textSecondary, fontSize: 11 }}>› {tx.subcategoryName}</div>
        </td>

        <td style={{ ...s.td, maxWidth: 200, wordBreak: "break-word", whiteSpace: "normal" }}>
          <span style={{ color: c.textTertiary }}>
            {tx.description || <span style={{ color: c.borderStrong }}>—</span>}
          </span>
        </td>

        <td style={s.td}>
          {(tx.tagNames || []).length > 0
            ? (tx.tagNames ?? []).map((name, i) => <span key={i} style={s.badge(c.info)}>{name}</span>)
            : <span style={{ color: c.borderStrong }}>—</span>}
        </td>

        <td style={{ ...s.td, textAlign: "right" }}>
          {tx.originalCurrency !== "PLN" && (
            <div style={{ fontSize: 11, color: c.textSecondary }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
          <div style={{ fontWeight: 700, color: c.success, fontSize: 14 }}>
            {fmt(tx.amount)} PLN
          </div>
        </td>

        <td style={s.td}>
          <span style={{ color: c.textMuted, fontSize: 12 }}>{tx.author || "—"}</span>
        </td>

        <td style={s.td}>
          <div style={{ display: "flex", gap: 6 }}>
            {!isMonthClosed && (
              <button style={s.actionBtn(c.info)} onClick={() => setEditOpen(true)}>✏️</button>
            )}
            {!isMonthClosed && (
              <button style={s.actionBtn(c.danger)} onClick={onDelete}>🗑</button>
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
// ── Income transaction card (mobile) ──────────────────────────
// Mobile counterpart of IncomeRow: same data, laid out as a
// tap-friendly card instead of a table row. Rendered by the panel
// when useIsMobile() is true. Reuses s.badge / s.actionBtn / fmt /
// typeColor / typeLabel — all already imported in this file.
//

function IncomeCard({ tx, isMonthClosed, onDelete, onUpdated }: IncomeRowProps) {
  const [editOpen, setEditOpen] = useState(false);

  const tColor    = typeColor(tx.type);
  const tLabel    = typeLabel(tx.type);
  const isForeign = tx.originalCurrency && tx.originalCurrency !== "PLN";

  return (
    <div style={{
      background:   c.surface,
      border:       `1px solid ${c.border}`,
      borderRadius: 12,
      padding:      "12px 14px",
      marginBottom: 8,
    }}>
      {/* Top row: category + amount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontWeight: 600, color: c.text, fontSize: 14,
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {tx.categoryName}
          </div>
          {tx.subcategoryName && (
            <div style={{ color: c.textSecondary, fontSize: 12 }}>› {tx.subcategoryName}</div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: c.success, fontSize: 15, whiteSpace: "nowrap" }}>
            {fmt(tx.amount)} PLN
          </div>
          {isForeign && (
            <div style={{ fontSize: 11, color: c.textSecondary, whiteSpace: "nowrap" }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
        </div>
      </div>

      {/* Meta row: date + type + tags + author */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
        <span style={{ color: c.textTertiary, fontSize: 12 }}>{tx.date}</span>
        <span style={{
          background: tColor + "22", color: tColor,
          border: `1px solid ${tColor}44`,
          borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700,
        }}>
          {tLabel}
        </span>
        {(tx.tagNames || []).map((name, i) => (
          <span key={i} style={s.badge(c.info)}>{name}</span>
        ))}
        {tx.author && (
          <span style={{ color: c.textMuted, fontSize: 11, marginLeft: "auto" }}>{tx.author}</span>
        )}
      </div>

      {/* Description */}
      {tx.description && (
        <div style={{ color: c.textTertiary, fontSize: 13, marginTop: 8, wordBreak: "break-word" }}>
          {tx.description}
        </div>
      )}

      {/* Actions */}
      {!isMonthClosed && (
        <div style={{
          display: "flex", gap: 8, justifyContent: "flex-end",
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.surfaceAlt}`,
        }}>
          <button style={{ ...s.actionBtn(c.info), padding: "6px 14px" }} onClick={() => setEditOpen(true)}>
            ✏️ Edytuj
          </button>
          <button style={{ ...s.actionBtn(c.danger), padding: "6px 14px" }} onClick={onDelete}>
            🗑 Usuń
          </button>
        </div>
      )}

      {editOpen && createPortal(
        <EditIncomeModal
          tx={tx}
          onClose={() => setEditOpen(false)}
          onUpdated={updated => { onUpdated(updated); setEditOpen(false); }}
        />,
        document.body
      )}
    </div>
  );
}
// ── Main panel ────────────────────────────────────────────────

export default function PanelIncomeTransactions() {
  const { transactions, setTransactions, tags } = useAppContext();
  const { deleteTransaction, loadTransactions }  = useTransactions();
  const { isActiveMonthClosed, activeBudgetMonth } = useMonthStatus();
  const isMobile = useIsMobile();

  const { filters, set, clear: clearFilters, hasActive: hasActiveFilters } = useFilters<{
    type:       string;
    categories: string[];
    dateFrom:   Date | null;
    dateTo:     Date | null;
  }>({
    type:       "",
    categories: [],
    dateFrom:   null,
    dateTo:     null,
  });

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; txId: string | null }>({ isOpen: false, txId: null });

  // Per-month load; reset month-specific date filters on change.
  const isLoadingMonth = useMonthLoad(activeBudgetMonth, loadTransactions, () => {
    set("dateFrom", null);
    set("dateTo", null);
  });

  // Re-entering the panel you are already on remounts it and refetches the
  // same month. Everything below is filtered to activeBudgetMonth by value, so
  // whatever is already in memory for it is safe to show while that refresh
  // runs — blanking the screen would buy nothing. Only a month we genuinely
  // hold nothing for gets the skeleton. (Before the list was month-scoped this
  // shortcut would have re-opened the "June rows under August" bug.)
  const hasMonthData = useMemo(
    () => transactions.some(tx => tx.budgetMonth === activeBudgetMonth),
    [transactions, activeBudgetMonth],
  );
  const showSkeleton = isLoadingMonth && !hasMonthData;

  // Scoped to the active month by VALUE, not by trusting that the shared
  // `transactions` array happens to hold the right one. It is replaced
  // wholesale per month, so anything else in it (a month you were just
  // viewing, a transfer loaded for another month by the returns flow) would
  // otherwise render straight under this month's header.
  const enriched = useMemo(() =>
    transactions
      .filter(tx => tx.budgetMonth === activeBudgetMonth)
      .filter(tx => tx.type === "INCOME" || tx.type === "TRANSFER")
      .map(tx => ({
        ...tx,
        tagNames: (tx.tags || [])
          .map(id => tags.find(t => t.id === id)?.name)
          .filter((n): n is string => Boolean(n)),
      })),
    [transactions, tags, activeBudgetMonth]
  );

  const uniqueCats = useMemo(() => {
    const map: Record<string, string> = {};
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

  const handleUpdated = useCallback((updated: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
  }, [setTransactions]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{ fontSize: 13, color: c.textSecondary }}>
        {activeBudgetMonth} ·{" "}
        {showSkeleton ? (
          <span style={{ color: c.textMuted }}>ładowanie…</span>
        ) : (
          <>
            {filtered.length} wpisów · łącznie{" "}
            <strong style={{ color: c.success }}>{fmt(totalSum)}</strong>
            {isActiveMonthClosed && (
              <span style={{ marginLeft: 10, ...s.badge(c.danger) }}>🔒 zamknięty</span>
            )}
          </>
        )}
      </div>

      {/* Filters — hidden while the month's data is still loading */}
      {!showSkeleton && (
        <div style={{ background: c.bgDeepest, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
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
              <button onClick={clearFilters} style={{ ...s.actionBtn(c.textSecondary), fontSize: 11, alignSelf: "flex-end" }}>
                ✕ Wyczyść
              </button>
            )}
          </div>
        </div>
      )}
      {/* Table — withheld until THIS month's data has arrived. `transactions`
          is shared state, so rendering mid-load puts the PREVIOUS month's rows
          under the new month's header (same guard the Wydatki panel already
          had; this one only gated the header and the filters). */}
      {showSkeleton ? (
        <div style={s.card}>
          <SkeletonListRow columns={6} count={6} height={48} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
          Brak wpływów{hasActiveFilters ? " dla wybranych filtrów." : " w tym miesiącu."}
        </div>
      ) : (
        <>
          <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {filtered.length} wyników · strona {page} z {totalPages}
          </div>
        {isMobile ? (
                    <div>
                      {paginated.map(tx => (
                        <IncomeCard
                          key={tx.id}
                          tx={tx}
                          isMonthClosed={isActiveMonthClosed}
                          onDelete={() => setDeleteModal({ isOpen: true, txId: tx.id })}
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
          )}
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