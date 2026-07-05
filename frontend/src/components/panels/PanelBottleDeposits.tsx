// ============================================================
// File: src/components/panels/PanelBottleDeposits.tsx
// Bottle/can deposit returns ("Zwroty butelek"). Enter one amount → the
// panel returns the oldest outstanding deposit expenses up to that amount
// (last one partial), reusing the existing /returns endpoint (which
// auto-creates transfers for past-month returns). Any surplus over logged
// deposits becomes a standalone transfer in the current month.
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

interface ReturnEntry { moneyReturnedInMonth: string; cashAmount?: number; voucherAmount?: number; }
interface DepTx {
  id: string; type: string; date: string; budgetMonth: string;
  categoryId: string; subcategoryId: string; subcategoryName: string;
  amount: number; description?: string;
  returns?: ReturnEntry[];
}
interface EnrichedTx extends DepTx { returned: number; outstanding: number; }
interface SimRow { tx: EnrichedTx; willReturn: number; }

// ── Helpers ───────────────────────────────────────────────────

function alreadyReturned(tx: DepTx) {
  return (tx.returns || []).reduce((s, r) => s + (r.cashAmount || 0) + (r.voucherAmount || 0), 0);
}
function fmtDate(iso: string) { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }
function monthsBack(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ── Styles ────────────────────────────────────────────────────

const st = {
  panel: { padding: "0 0 120px 0", maxWidth: 760, margin: "0 auto" } as React.CSSProperties,
  card:  { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8 } as React.CSSProperties,
  bar:   { position: "fixed" as const, bottom: 0, left: 0, right: 0, background: c.bg, borderTop: `1px solid ${c.border}`, padding: "10px 16px", zIndex: 100, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const },
};

// ── Component ─────────────────────────────────────────────────

export default function PanelBottleDeposits() {
  const { settings } = useAppContext();
  const api = useApi();
  const { showSuccess, showError } = useToast();
  const { transactions, isLoading, loadRange, invalidate } = useTransactionsRange();

  const depositSubcategoryId = settings?.depositSubcategoryId ?? null;
  const cur = currentCalendarMonth();
  // The /range endpoint caps at 24 months — deposits are recent, so a 24-month
  // window is plenty. Respect appStartMonth if it falls within that window.
  const windowStart = monthsBack(cur, 23);
  const appStart    = (settings?.appStartMonth as string) || null;
  const fromMonth   = appStart && appStart > windowStart ? appStart : windowStart;

  useEffect(() => { loadRange(fromMonth, cur); }, [fromMonth, cur, loadRange]);

  // Outstanding deposit expenses, oldest first.
  const depositTxs = useMemo<EnrichedTx[]>(() => {
    if (!depositSubcategoryId) return [];
    return (transactions as unknown as DepTx[])
      .filter(tx => tx.type === "EXPENSE" && tx.subcategoryId === depositSubcategoryId)
      .map(tx => {
        const returned = alreadyReturned(tx);
        return { ...tx, returned, outstanding: round2(Math.max(0, tx.amount - returned)) };
      })
      .filter(tx => tx.outstanding > 0.005)
      // Oldest first — by budget month primarily (deposits are often logged on
      // the same day but assigned to different months), then by date.
      .sort((a, b) => a.budgetMonth.localeCompare(b.budgetMonth) || a.date.localeCompare(b.date));
  }, [transactions, depositSubcategoryId]);

  const totalOutstanding = useMemo(() => round2(depositTxs.reduce((s, tx) => s + tx.outstanding, 0)), [depositTxs]);

  const [amountStr, setAmountStr] = useState("");
  const amount = round2(parseFloat(amountStr.replace(",", ".")) || 0);

  // Greedy simulation: distribute `amount` oldest-first.
  const sim = useMemo(() => {
    let remaining = amount;
    const rows: SimRow[] = [];
    for (const tx of depositTxs) {
      if (remaining <= 0) break;
      const willReturn = round2(Math.min(tx.outstanding, remaining));
      remaining = round2(Math.max(0, remaining - willReturn));
      if (willReturn > 0) rows.push({ tx, willReturn });
    }
    const totalReturn = round2(rows.reduce((s, r) => s + r.willReturn, 0));
    const surplus     = round2(Math.max(0, amount - totalReturn));
    const pastReturn  = round2(rows.filter(r => r.tx.budgetMonth < cur).reduce((s, r) => s + r.willReturn, 0));
    return { rows, totalReturn, surplus, pastReturn };
  }, [amount, depositTxs, cur]);

  const rowMap = useMemo(() => {
    const m = new Map<string, number>();
    sim.rows.forEach(r => m.set(r.tx.id, r.willReturn));
    return m;
  }, [sim.rows]);

  const [isSaving, setIsSaving]       = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleReturn() {
    setConfirmOpen(false);
    setIsSaving(true);
    let fail = 0;
    for (const r of sim.rows) {
      try {
        await api.post(`/api/transactions/${r.tx.id}/returns`, {
          amount: r.willReturn, cashAmount: r.willReturn, voucherAmount: 0,
          moneyReturnedInMonth: cur, returnedAt: todayYMD(), reason: "Zwrot butelek",
        });
      } catch { fail++; }
    }
    if (sim.surplus > 0 && fail === 0) {
      try {
        await api.post(`/api/transactions/surplus-transfer`, {
          amount: sim.surplus, budgetMonth: cur, date: todayYMD(), reason: "Zwrot butelek — nadwyżka",
        });
      } catch { fail++; }
    }
    invalidate(fromMonth, cur);
    await loadRange(fromMonth, cur);
    setAmountStr("");
    setIsSaving(false);
    if (fail === 0) showSuccess(`✅ Zwrócono ${fmt(sim.totalReturn)}${sim.surplus > 0 ? ` + nadwyżka ${fmt(sim.surplus)}` : ""}`);
    else showError(`Wystąpiły błędy (${fail}). Odśwież i sprawdź stan.`);
  }

  const canReturn = amount > 0 && !isSaving && !!depositSubcategoryId && (sim.rows.length > 0 || sim.surplus > 0);

  // ── No subcategory configured ─────────────────────────────
  if (!depositSubcategoryId) {
    return (
      <div style={st.panel}>
        <Header />
        <div style={{ padding: "16px 20px", background: "#1a1200", border: `1px solid ${alpha(c.warning, "44")}`, borderRadius: 12, color: c.warning, fontSize: 13, lineHeight: 1.6 }}>
          <strong>⚠️ Nie wybrano subkategorii kaucji</strong>
          <p style={{ marginTop: 8, color: c.textTertiary }}>
            Przejdź do <strong>Ustawienia → 🍾 Zwroty butelek</strong> i wskaż subkategorię, której wydatki to kaucja za opakowania.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={st.panel}>
      <Header />

      {/* Amount input */}
      <div style={{ ...st.card, display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 }}>
            Kwota zwrotu (PLN)
          </label>
          <input
            type="number" min={0} step={0.01}
            value={amountStr}
            onChange={e => setAmountStr(e.target.value)}
            placeholder="np. 13,00"
            style={{ width: "100%", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, padding: "10px 12px", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ fontSize: 12, color: c.textMuted }}>
          Do rozliczenia:{" "}
          <strong style={{ color: c.textSecondary }}>{fmt(totalOutstanding)} PLN</strong>
          <div>({depositTxs.length} transakcji)</div>
        </div>
      </div>

      {/* Simulation summary */}
      {amount > 0 && (
        <div style={{ ...st.card, background: alpha(c.cyan, "08"), border: `1px solid ${alpha(c.cyan, "33")}` }}>
          <div style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
            Zwrot transakcji: <strong style={{ color: c.cyan }}>{fmt(sim.totalReturn)} PLN</strong>
            {" "}({sim.rows.length} poz.)
            {sim.pastReturn > 0 && (
              <div style={{ fontSize: 12, color: c.textMuted }}>
                W tym z przeszłych miesięcy <strong style={{ color: c.text }}>{fmt(sim.pastReturn)} PLN</strong> → utworzą się transfery w {cur}.
              </div>
            )}
            {sim.surplus > 0 && (
              <div style={{ fontSize: 12, color: c.warning }}>
                Nadwyżka <strong>{fmt(sim.surplus)} PLN</strong> (więcej niż zalogowane kaucje) → dodatkowy transfer w {cur}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading / empty */}
      {isLoading && <div style={{ color: c.textMuted, padding: "40px 0", textAlign: "center" }}>⏳ Ładowanie…</div>}
      {!isLoading && depositTxs.length === 0 && (
        <div style={{ ...st.card, padding: "40px 24px", textAlign: "center", color: c.textMuted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🍾</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>Brak nierozliczonych kaucji</div>
        </div>
      )}

      {/* Outstanding deposit list (oldest first) */}
      {!isLoading && depositTxs.map(tx => {
        const willReturn = rowMap.get(tx.id) || 0;
        const isPast = tx.budgetMonth < cur;
        return (
          <div key={tx.id} style={{
            ...st.card,
            borderColor: willReturn > 0 ? c.cyan : c.border,
            borderLeft:  willReturn > 0 ? `4px solid ${c.cyan}` : `1px solid ${c.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: c.text }}>{tx.subcategoryName}</div>
                {tx.description && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{tx.description}</div>}
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                  {fmtDate(tx.date)} · {tx.budgetMonth}
                  {isPast && <span style={{ marginLeft: 6, color: c.warning }}>przeszły</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: c.text }}>{fmt(tx.amount)}</div>
                <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>
                  {tx.returned > 0 ? <>zwrócono {fmt(tx.returned)} · </> : null}
                  pozostało {fmt(tx.outstanding)}
                </div>
                {willReturn > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.cyan, marginTop: 4 }}>
                    🍾 zwrot {fmt(willReturn)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Confirm */}
      <ConfirmModal
        isOpen={confirmOpen}
        title="🍾 Potwierdź zwrot butelek"
        message={
          `Zwrócić ${fmt(sim.totalReturn)} PLN z ${sim.rows.length} transakcji?` +
          (sim.pastReturn > 0 ? `\n\nZ przeszłych miesięcy: ${fmt(sim.pastReturn)} PLN — system utworzy transfery w ${cur}.` : "") +
          (sim.surplus > 0 ? `\n\nNadwyżka: ${fmt(sim.surplus)} PLN — dodatkowy transfer w ${cur}.` : "")
        }
        onConfirm={handleReturn}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Sticky action bar */}
      <div style={st.bar}>
        <div style={{ flex: 1, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Stat label="Kwota" value={fmt(amount)} color={c.textTertiary} />
          <Stat label="Zwrot tx" value={fmt(sim.totalReturn)} color={c.cyan} bold />
          {sim.surplus > 0 && <Stat label="Nadwyżka" value={fmt(sim.surplus)} color={c.warning} />}
        </div>
        <button onClick={() => setConfirmOpen(true)} disabled={!canReturn} style={{
          padding: "10px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
          cursor: canReturn ? "pointer" : "not-allowed",
          background: canReturn ? c.cyan : c.border,
          color: canReturn ? c.white : c.borderStrong,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {isSaving ? "⏳ Przetwarzanie…" : canReturn ? `🔙 Zwróć — ${fmt(round2(sim.totalReturn + sim.surplus))}` : "Podaj kwotę"}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function Header() {
  return (
    <div style={{ marginBottom: 20, marginTop: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 4 }}>🍾 Zwroty butelek</div>
      <div style={{ fontSize: 13, color: c.textSecondary }}>
        Podaj jedną kwotę — zwrócę najstarsze nierozliczone kaucje do tej kwoty (ostatnia częściowo), z transferami za przeszłe miesiące.
      </div>
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
