// ============================================================
// File: src/components/panels/PanelLuxmed.tsx
// RWD-first: cards mobile, table on desktops
//
// Returns are ALWAYS booked in the current calendar month (like
// PanelBottleDeposits) — this panel has no month navigator. The default
// view is the last COMPLETED quarter (the one you claim now); older
// quarters are reachable via archive-only pills for viewing.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useMemo, useEffect } from "react";
import { useAppContext }        from "../../context/AppContext";
import { useTransactionsRange } from "../../hooks/useTransactionsRange";
import { useApi }               from "../../hooks/useApi";
import { useToast }             from "../../hooks/useToast";
import { ConfirmModal }         from "../ui/ConfirmModal";
import { fmt, round2, currentCalendarMonth, todayYMD } from "../../utils/helpers";

// ── Types ─────────────────────────────────────────────────────

interface ReturnEntry {
  moneyReturnedInMonth: string;
  cashAmount?:          number;
  voucherAmount?:       number;
}

interface LuxmedTx {
  id:              string;
  type:            string;
  date:            string;
  budgetMonth:     string;
  subcategoryId:   string;
  subcategoryName: string;
  amount:          number;
  description?:    string;
  returns?:        ReturnEntry[];
}

interface SimRow {
  txId:            string;
  txAmount:        number;
  alreadyReturned: number;
  remaining:       number;
  maxThisTx:       number;
  willReturn:      number;
}

interface Quarter { q: number; year: number }

// ── Helpers ───────────────────────────────────────────────────

function currentQuarter(): Quarter {
  const now = new Date();
  return { q: Math.floor(now.getMonth() / 3) + 1, year: now.getFullYear() };
}

// The quarter immediately before the given one (wraps Q1 → Q4 of prev year).
function prevQuarter({ q, year }: Quarter): Quarter {
  return q === 1 ? { q: 4, year: year - 1 } : { q: q - 1, year };
}

function quarterBounds(q: number, year: number) {
  const start = (q - 1) * 3 + 1;
  return {
    from: `${year}-${String(start).padStart(2, "0")}`,
    to:   `${year}-${String(start + 2).padStart(2, "0")}`,
  };
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function alreadyReturnedTotal(tx: LuxmedTx) {
  return (tx.returns || []).reduce((s, r) => s + (r.cashAmount || 0) + (r.voucherAmount || 0), 0);
}

function computeSimulation(
  selectedIds: Set<string>,
  txs: LuxmedTx[],
  maxPercent: number,
  budgetLeft: number,
): SimRow[] {
  let remaining = budgetLeft;
  return txs
    .filter(tx => selectedIds.has(tx.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(tx => {
      const alreadyReturned = alreadyReturnedTotal(tx);
      const txRemaining     = Math.max(0, tx.amount - alreadyReturned);
      const maxThisTx       = round2(Math.min(txRemaining, tx.amount * maxPercent / 100));
      const willReturn      = round2(Math.min(maxThisTx, remaining));
      remaining             = round2(Math.max(0, remaining - willReturn));
      return { txId: tx.id, txAmount: tx.amount, alreadyReturned, remaining: txRemaining, maxThisTx, willReturn };
    });
}

// ── Styles ────────────────────────────────────────────────────

const s = {
  panel:    { padding: "0 0 40px 0", maxWidth: 860, margin: "0 auto" } as React.CSSProperties,
  card:     { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" } as React.CSSProperties,
  th:       { padding: "10px 12px", textAlign: "left"  as const, color: c.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px", borderBottom: `1px solid ${c.border}`, background: c.bg, whiteSpace: "nowrap" as const } as React.CSSProperties,
  thR:      { padding: "10px 12px", textAlign: "right" as const, color: c.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px", borderBottom: `1px solid ${c.border}`, background: c.bg, whiteSpace: "nowrap" as const } as React.CSSProperties,
  td:       { padding: "10px 12px", borderBottom: `1px solid ${c.surfaceAlt}`, color: c.text, verticalAlign: "middle" as const } as React.CSSProperties,
  tdR:      { padding: "10px 12px", borderBottom: `1px solid ${c.surfaceAlt}`, color: c.text, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, verticalAlign: "middle" as const } as React.CSSProperties,
  bar:      { marginTop: 16, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const } as React.CSSProperties,
  pillLabel:{ fontSize: 11, color: c.textMuted, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px" } as React.CSSProperties,
};

function pillStyle(active: boolean, activeBg: string): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
    background: active ? activeBg  : c.border,
    color:      active ? c.white   : c.textSecondary,
    transition: "all 0.15s",
  };
}

// ── Component ─────────────────────────────────────────────────

export default function PanelLuxmed() {
  const { categories, settings } = useAppContext();
  const api                      = useApi();
  const { showSuccess, showError } = useToast();
  const { transactions, isLoading, loadRange, invalidate } = useTransactionsRange();

  // ── Quarter ───────────────────────────────────────────────
  // Default = last COMPLETED quarter (what you claim now). Older quarters
  // are archive-only (view). Returns always book in the current month.
  const returnMonth = currentCalendarMonth();
  const defQ  = useMemo(() => prevQuarter(currentQuarter()), []);
  const [activeQ,    setActiveQ]    = useState(defQ.q);
  const [activeYear, setActiveYear] = useState(defQ.year);
  const isArchive = !(activeQ === defQ.q && activeYear === defQ.year);
  const bounds = useMemo(() => quarterBounds(activeQ, activeYear), [activeQ, activeYear]);

  // Archive quarters: the 4 quarters preceding the default (view-only).
  const archiveQuarters = useMemo(() => {
    const arr: Quarter[] = [];
    let cursor = defQ;
    for (let i = 0; i < 4; i++) { cursor = prevQuarter(cursor); arr.push(cursor); }
    return arr;
  }, [defQ]);

  useEffect(() => { loadRange(bounds.from, bounds.to); }, [bounds.from, bounds.to, loadRange]);
  useEffect(() => { setSelected(new Set()); }, [activeQ, activeYear]);

  // ── LuxMed sub IDs ───────────────────────────────────────
  const luxmedSubIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cat of (categories || [])) {
      if (cat.isArchived) continue;
      for (const sub of (cat.sub || [])) {
        if (sub.canBeLuxmed && !sub.isArchived) ids.add(sub.id);
      }
    }
    return ids;
  }, [categories]);

  // ── Filtered txs ─────────────────────────────────────────
  const luxmedTxs = useMemo<LuxmedTx[]>(() =>
    (transactions as any[]).filter(tx =>
      tx.type === "EXPENSE" && luxmedSubIds.has(tx.subcategoryId)
    ).sort((a: any, b: any) => b.date.localeCompare(a.date)),
    [transactions, luxmedSubIds]
  );

  // ── Settings ─────────────────────────────────────────────
  const maxPercent = settings?.luxmed?.maxPercent ?? 90;
  const maxTotal   = settings?.luxmed?.maxTotal   ?? 500;

  // ── Already returned from this quarter's visits ──────────
  // The quarterly limit tracks reimbursements against the quarter's
  // transactions, regardless of the month the return was booked in.
  const alreadyUsed = useMemo(() =>
    luxmedTxs.reduce((sum, tx) =>
      sum + (tx.returns || []).reduce((s, r) => s + (r.cashAmount || 0), 0),
    0),
    [luxmedTxs]
  );
  const effectiveLimit = Math.max(0, maxTotal - alreadyUsed);

  // ── Selection — tylko transakcje z pozostałą kwotą ───────
  // Transakcja jest w pełni zwrócona gdy: remaining <= 0 lub przekroczono % limitu.
  // W trybie archiwum nic nie jest selectowalne (podgląd).
  const selectableTxs = useMemo(() =>
    isArchive ? [] : luxmedTxs.filter(tx => {
      const returned = alreadyReturnedTotal(tx);
      const remaining = tx.amount - returned;
      const maxAllowed = tx.amount * maxPercent / 100;
      return remaining > 0 && returned < maxAllowed;
    }),
    [luxmedTxs, maxPercent, isArchive]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = selectableTxs.length > 0 && selectableTxs.every(tx => selected.has(tx.id));

  function toggleAll() {
    if (isArchive) return;
    setSelected(allSelected ? new Set() : new Set(selectableTxs.map(tx => tx.id)));
  }
  function toggleTx(id: string, selectable: boolean) {
    if (!selectable) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Simulation ───────────────────────────────────────────
  const simRows = useMemo(() =>
    computeSimulation(selected, luxmedTxs, maxPercent, effectiveLimit),
    [selected, luxmedTxs, maxPercent, effectiveLimit]
  );
  const simMap = useMemo(() => {
    const m = new Map<string, SimRow>();
    simRows.forEach(r => m.set(r.txId, r));
    return m;
  }, [simRows]);
  const totalWillReturn = simRows.reduce((s, r) => s + r.willReturn, 0);

  // ── Bulk return ──────────────────────────────────────────
  const [isSaving,    setIsSaving]    = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleBulkReturn() {
    setConfirmOpen(false);
    setIsSaving(true);
    try {
      // One batch call → returns recorded on every parent tx + ONE
      // consolidated transfer for past-month refunds (same endpoint as
      // bottle deposits), instead of a transfer per transaction.
      const result = await api.post<{ updated: unknown[]; transfer: unknown | null; failed: number }>(
        "/api/transactions/deposit-return",
        {
          returns: simRows
            .filter(r => r.willReturn > 0)
            .map(r => ({ txId: r.txId, amount: r.willReturn })),
          surplus:     0,
          budgetMonth: returnMonth,
          date:        todayYMD(),
          reason:      "Zwrot LuxMed",
          kind:        "reimbursement",   // insurer pays back — not a shop return
          source:      "company",
        },
        { fallback: "Nie udało się wykonać zwrotów LuxMed." },
      );
      const ok = result.updated.length;
      if (result.failed === 0) {
        showSuccess(
          `✅ Wykonano ${ok} zwrot${ok === 1 ? "" : "ów"} — ${fmt(totalWillReturn)}` +
          (result.transfer ? " (1 zbiorczy transfer)" : ""),
        );
      } else {
        showError(`${ok} OK, ${result.failed} błędów`);
      }
    } catch (err) {
      showError((err as Error).message);
    } finally {
      invalidate(bounds.from, bounds.to);
      await loadRange(bounds.from, bounds.to);
      setSelected(new Set());
      setIsSaving(false);
    }
  }

  // ── No sub banner ────────────────────────────────────────
  if (!isLoading && luxmedSubIds.size === 0) {
    return (
      <div style={s.panel}>
        <PanelHeader />
        <div style={{ padding: "16px 20px", background: "#1a1200", border: `1px solid ${alpha(c.warning, "44")}`, borderRadius: 12, color: c.warning, fontSize: 13, lineHeight: 1.6 }}>
          <strong>⚠️ Brak subkategorii LuxMed</strong>
          <p style={{ marginTop: 8, color: c.textTertiary }}>
            Przejdź do <strong>Ustawienia → Kategorie</strong> i zaznacz flagą 🏥 subkategorie kwalifikujące się do zwrotu.
          </p>
        </div>
      </div>
    );
  }

  const limitExhausted = effectiveLimit <= 0 && alreadyUsed > 0;

  return (
    <div style={s.panel}>
      <PanelHeader />

      {/* Bieżący kwartał do rozliczenia */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...s.pillLabel, marginBottom: 8 }}>Kwartał do rozliczenia</div>
        <button
          onClick={() => { setActiveQ(defQ.q); setActiveYear(defQ.year); }}
          style={pillStyle(!isArchive, c.cyan)}
        >
          Q{defQ.q} {defQ.year}
        </button>
      </div>

      {/* Archiwum — tylko podgląd */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...s.pillLabel, marginBottom: 8 }}>📁 Archiwum (tylko podgląd)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {archiveQuarters.map(aq => {
            const active = activeQ === aq.q && activeYear === aq.year;
            return (
              <button
                key={`${aq.year}-${aq.q}`}
                onClick={() => { setActiveQ(aq.q); setActiveYear(aq.year); }}
                style={pillStyle(active, c.warning)}
              >
                Q{aq.q} {aq.year}
              </button>
            );
          })}
        </div>
      </div>

      {/* Archive-mode banner */}
      {isArchive && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: alpha(c.warning, "11"), border: `1px solid ${alpha(c.warning, "44")}`, borderRadius: 8, fontSize: 13, color: c.warning, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📁</span>
          <span>Tryb archiwum — podgląd kwartału <strong>Q{activeQ} {activeYear}</strong>. Zwroty wykonujesz tylko dla bieżącego kwartału.</span>
        </div>
      )}

      {/* Limit exhausted */}
      {!isArchive && limitExhausted && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "#1a0a0a", border: `1px solid ${alpha(c.danger, "44")}`, borderRadius: 8, fontSize: 13, color: c.dangerLight }}>
          🚫 Limit kwartalny wyczerpany — wykorzystano <strong>{fmt(alreadyUsed)}</strong> z <strong>{fmt(maxTotal)}</strong>.
        </div>
      )}

      {/* Loading */}
      {isLoading && <div style={{ color: c.textMuted, padding: "40px 0", textAlign: "center" }}>⏳ Ładowanie…</div>}

      {/* Empty */}
      {!isLoading && luxmedTxs.length === 0 && (
        <div style={{ ...s.card, padding: "40px 24px", textAlign: "center", color: c.textMuted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏥</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>Brak transakcji LuxMed w Q{activeQ} {activeYear}</div>
        </div>
      )}

      {/* Transaction list */}
      {!isLoading && luxmedTxs.length > 0 && (
        <>
          {/* ── DESKTOP: tabela (ukryta na mobile) ── */}
          <div className="luxmed-desktop" style={s.card}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: 36 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={isArchive || selectableTxs.length === 0} style={{ cursor: isArchive ? "not-allowed" : "pointer" }} />
                    </th>
                    <th style={s.th}>Data</th>
                    <th style={s.th}>Subkategoria / Opis</th>
                    <th style={s.thR}>Kwota</th>
                    <th style={s.thR}>Zwrócono</th>
                    <th style={s.thR}>Pozostało</th>
                    <th style={{ ...s.thR, color: c.cyan }}>🏥 Symulacja</th>
                  </tr>
                </thead>
                <tbody>
                  {luxmedTxs.map((tx, idx) => {
                    const returned      = alreadyReturnedTotal(tx);
                    const remaining     = Math.max(0, tx.amount - returned);
                    const maxAllowed    = tx.amount * maxPercent / 100;
                    const fullyReturned = remaining <= 0 || returned >= maxAllowed;
                    const selectable    = !fullyReturned && !isArchive;
                    const isSelected    = selected.has(tx.id);
                    const sim           = simMap.get(tx.id);

                    return (
                      <tr key={tx.id}
                        onClick={() => toggleTx(tx.id, selectable)}
                        style={{
                          background:  isSelected ? alpha(c.cyan, "08") : idx % 2 === 0 ? "transparent" : alpha(c.white, "04"),
                          cursor:      selectable ? "pointer" : "default",
                          opacity:     fullyReturned ? 0.45 : 1,
                          borderLeft:  isSelected ? `3px solid ${c.cyan}` : "3px solid transparent",
                          transition:  "background 0.1s",
                        }}>
                        <td style={{ ...s.td, paddingRight: 4 }}>
                          <input type="checkbox" checked={isSelected} disabled={!selectable}
                            onChange={() => toggleTx(tx.id, selectable)}
                            onClick={e => e.stopPropagation()}
                            style={{ cursor: selectable ? "pointer" : "not-allowed" }}
                          />
                        </td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: c.textTertiary, fontSize: 12 }}>
                          {fmtDate(tx.date)}
                          <div style={{ fontSize: 10, color: c.borderStrong, marginTop: 2 }}>{tx.budgetMonth}</div>
                        </td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 600 }}>{tx.subcategoryName}</div>
                          {tx.description && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{tx.description}</div>}
                        </td>
                        <td style={{ ...s.tdR, fontWeight: 700 }}>{fmt(tx.amount)}</td>
                        <td style={{ ...s.tdR, color: returned > 0 ? c.successLight : c.borderStrong, fontSize: 12 }}>
                          {returned > 0 ? fmt(returned) : "—"}
                        </td>
                        <td style={{ ...s.tdR, fontSize: 12 }}>
                          {fullyReturned
                            ? <span style={{ fontSize: 10, color: c.borderStrong }}>Wyczerpana</span>
                            : fmt(remaining)}
                        </td>
                        <td style={{ ...s.tdR, color: sim?.willReturn ? c.cyan : c.borderStrong, fontWeight: sim?.willReturn ? 700 : 400 }}>
                          {sim?.willReturn ? fmt(sim.willReturn)
                            : isSelected ? <span style={{ fontSize: 10, color: c.warning }}>limit!</span>
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${c.surfaceAlt}`, fontSize: 11, color: c.borderStrong, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>Łącznie: <strong style={{ color: c.textSecondary }}>{luxmedTxs.length}</strong> tx{!isArchive && <> · <strong style={{ color: c.textSecondary }}>{selectableTxs.length}</strong> do zwrotu</>}</span>
              <span>Limit {maxPercent}% / tx · {fmt(maxTotal)} / kwartał</span>
            </div>
          </div>

          {/* ── MOBILE: karty (ukryte na desktop) ── */}
          <div className="luxmed-mobile">
            {/* Zaznacz wszystkie */}
            {!isArchive && selectableTxs.length > 0 && (
              <button onClick={toggleAll} style={{
                width: "100%", marginBottom: 10, padding: "10px 14px", borderRadius: 10,
                border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary,
                fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
              }}>
                {allSelected ? "☑ Odznacz wszystkie" : `☐ Zaznacz wszystkie (${selectableTxs.length})`}
              </button>
            )}

            {luxmedTxs.map(tx => {
              const returned      = alreadyReturnedTotal(tx);
              const remaining     = Math.max(0, tx.amount - returned);
              const maxAllowed    = tx.amount * maxPercent / 100;
              const fullyReturned = remaining <= 0 || returned >= maxAllowed;
              const selectable    = !fullyReturned && !isArchive;
              const isSelected    = selected.has(tx.id);
              const sim           = simMap.get(tx.id);

              return (
                <div key={tx.id}
                  onClick={() => toggleTx(tx.id, selectable)}
                  style={{
                    ...s.card,
                    marginBottom: 8,
                    padding: "14px 16px",
                    opacity:    fullyReturned ? 0.5 : 1,
                    borderColor: isSelected ? c.cyan : c.border,
                    borderLeft:  isSelected ? `4px solid ${c.cyan}` : `1px solid ${c.border}`,
                    cursor:      selectable ? "pointer" : "default",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: c.text }}>{tx.subcategoryName}</div>
                      {tx.description && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{tx.description}</div>}
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{fmtDate(tx.date)} · {tx.budgetMonth}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: c.text }}>{fmt(tx.amount)}</div>
                      {fullyReturned
                        ? <div style={{ fontSize: 10, color: c.borderStrong, marginTop: 2 }}>Wyczerpana</div>
                        : <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>Pozostało: {fmt(remaining)}</div>}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {returned > 0 && (
                        <span style={{ fontSize: 11, color: c.successLight }}>✓ zwrócono {fmt(returned)}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {sim?.willReturn ? (
                        <span style={{ fontSize: 13, fontWeight: 700, color: c.cyan }}>🏥 {fmt(sim.willReturn)}</span>
                      ) : isSelected ? (
                        <span style={{ fontSize: 11, color: c.warning }}>limit!</span>
                      ) : null}
                      {selectable && (
                        <input type="checkbox" checked={isSelected}
                          onChange={() => toggleTx(tx.id, true)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                      )}
                      {fullyReturned && (
                        <span style={{ fontSize: 18 }}>✅</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Confirm */}
      <ConfirmModal
        isOpen={confirmOpen}
        title="🏥 Potwierdź zwroty LuxMed"
        message={`Wykonać ${simRows.filter(r => r.willReturn > 0).length} zwrot${simRows.filter(r => r.willReturn > 0).length === 1 ? "" : "ów"} na łączną kwotę ${fmt(totalWillReturn)}?\n\nZaksięgowane w bieżącym miesiącu (${returnMonth}). Zwroty z wcześniejszych miesięcy trafią do JEDNEGO zbiorczego transferu.`}
        onConfirm={handleBulkReturn}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Summary bar — tylko dla bieżącego kwartału */}
      {!isLoading && !isArchive && luxmedTxs.length > 0 && (
        <SummaryBar
          maxTotal={maxTotal}
          alreadyUsed={alreadyUsed}
          effectiveLimit={effectiveLimit}
          totalWillReturn={totalWillReturn}
          selectedCount={selected.size}
          isSaving={isSaving}
          onConfirm={() => setConfirmOpen(true)}
        />
      )}

      {/* RWD styles */}
      <style>{`
        .luxmed-desktop { display: block; }
        .luxmed-mobile  { display: none;  }
        @media (max-width: 700px) {
          .luxmed-desktop { display: none;  }
          .luxmed-mobile  { display: block; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PanelHeader() {
  return (
    <div style={{ marginBottom: 20, marginTop: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 4 }}>🏥 Zwroty LuxMed</div>
      <div style={{ fontSize: 13, color: c.textSecondary }}>Zaznacz transakcje i kliknij „Zwróć” — symulacja pokaże co odzyskasz przed zapisem.</div>
    </div>
  );
}

interface SummaryBarProps {
  maxTotal:        number;
  alreadyUsed:     number;
  effectiveLimit:  number;
  totalWillReturn: number;
  selectedCount:   number;
  isSaving:        boolean;
  onConfirm:       () => void;
}

function SummaryBar({ maxTotal, alreadyUsed, effectiveLimit, totalWillReturn, selectedCount, isSaving, onConfirm }: SummaryBarProps) {
  const pct = maxTotal > 0 ? Math.min(100, (alreadyUsed / maxTotal) * 100) : 0;
  const canReturn = totalWillReturn > 0 && !isSaving;

  return (
    <div style={s.bar}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}>
        <Stat label="Limit Q"    value={fmt(maxTotal)}       color={c.textTertiary} />
        {alreadyUsed > 0 && <Stat label="Zużyto" value={fmt(alreadyUsed)} color={c.warning} />}
        <Stat label="Dostępne"   value={fmt(effectiveLimit)} color={effectiveLimit > 0 ? c.success : c.danger} />
        {selectedCount > 0 && <Stat label={`Symulacja (${selectedCount})`} value={fmt(totalWillReturn)} color={c.cyan} bold />}
      </div>

      {/* Progress */}
      {maxTotal > 0 && (
        <div style={{ width: 80, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 3, textAlign: "right" }}>{pct.toFixed(0)}%</div>
          <div style={{ height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, transition: "width 0.3s",
              background: pct >= 100 ? c.danger : pct >= 80 ? c.warning : c.success }} />
          </div>
        </div>
      )}

      {/* CTA */}
      <button onClick={onConfirm} disabled={!canReturn} style={{
        padding: "10px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
        cursor:     canReturn ? "pointer" : "not-allowed",
        background: canReturn ? c.cyan : c.border,
        color:      canReturn ? c.white    : c.borderStrong,
        whiteSpace: "nowrap", transition: "all 0.15s", flexShrink: 0,
      }}>
        {isSaving ? "⏳ Przetwarzanie…" : canReturn ? `🔙 Zwróć — ${fmt(totalWillReturn)}` : "Zaznacz transakcje"}
      </button>
    </div>
  );
}

function Stat({ label, value, color, bold = false }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color, fontWeight: bold ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
