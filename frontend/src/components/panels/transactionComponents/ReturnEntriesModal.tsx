// ============================================================
// File: src/components/panels/transactionComponents/ReturnEntriesModal.tsx
// Lists a transaction's return entries and lets the user (re)classify
// each one after the fact:
//   - kind:   🏪 store / 💼 reimbursement / 🍾 deposit
//   - source: 👥 person / 🏢 company (reimbursements only)
// Legacy entries (no kind stored) are pre-filled with what the analytics
// heuristic resolves them to (kindOf/sourceOf) — saving makes it explicit.
// Saved via PATCH /api/transactions/:id { returns } (amounts untouched).
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import { useApi }   from "../../../hooks/useApi";
import { useToast } from "../../../hooks/useToast";
import { fmt }      from "../../../utils/helpers";
import { kindOf, sourceOf } from "../../../utils/returnAnalytics";
import { s } from "./txStyles";
import type { Transaction } from "../../../types/appContext";

interface ReturnEntriesModalProps {
  tx:      Transaction;
  onClose: () => void;
  onSaved: (transaction: Transaction) => void;
}

interface Draft {
  kind:   "" | "store" | "reimbursement" | "deposit";
  source: "person" | "company";
}

export function ReturnEntriesModal({ tx, onClose, onSaved }: ReturnEntriesModalProps) {
  const api = useApi();
  const { showError, showSuccess } = useToast();
  const returns = tx.returns ?? [];

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    returns.map(r => {
      const bucket = kindOf(r);
      return {
        // Legacy entries resolve through the same heuristic analytics uses,
        // so what's pre-selected here matches what the charts assume.
        kind:   bucket === "unknown" ? "" : bucket,
        source: sourceOf(r),
      };
    }));
  const [saving, setSaving] = useState(false);

  function setDraft(i: number, patch: Partial<Draft>) {
    setDrafts(prev => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    const nextReturns = returns.map((r, i) => {
      const d = drafts[i];
      const { kind: _kind, source: _source, ...rest } = r;
      return {
        ...rest,
        ...(d.kind ? { kind: d.kind } : {}),
        ...(d.kind === "reimbursement" ? { source: d.source } : {}),
      };
    });
    setSaving(true);
    try {
      const updated = await api.patch<Transaction>(
        `/api/transactions/${tx.id}`,
        { returns: nextReturns },
        { fallback: "Nie udało się zapisać rodzajów zwrotów." },
      );
      showSuccess("Rodzaje zwrotów zapisane! ✅");
      onSaved(updated);
      onClose();
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalBox, maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
           onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>🔙 Zwroty tej transakcji</div>

        <div style={{ background: c.bg, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: c.textTertiary }}>
          <strong style={{ color: c.text }}>{tx.categoryName} › {tx.subcategoryName}</strong>
          {tx.description && <span style={{ color: c.textSecondary }}> — {tx.description}</span>}
          <span style={{ marginLeft: 8 }}>{fmt(tx.amount)} PLN</span>
        </div>

        {returns.map((r, i) => (
          <div key={i} style={{
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10,
            padding: "10px 12px", marginBottom: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: c.textTertiary }}>
                {r.returnedAt || r.moneyReturnedInMonth}
                {r.reason && <span style={{ color: c.textSecondary }}> — {r.reason}</span>}
              </span>
              <span style={{ color: c.orange, fontWeight: 700, whiteSpace: "nowrap" }}>
                {fmt(r.amount)} PLN
                {(r.voucherAmount ?? 0) > 0 && (
                  <span style={{ color: c.voucherLight, fontWeight: 400 }}> (🎫 {fmt(r.voucherAmount ?? 0)})</span>
                )}
              </span>
            </div>

            <select
              value={drafts[i].kind}
              onChange={e => setDraft(i, { kind: e.target.value as Draft["kind"] })}
              style={{ ...s.inp, width: "100%", cursor: "pointer" }}
            >
              <option value="" disabled>❔ Nieoznaczony — wybierz rodzaj…</option>
              <option value="store">🏪 Zwrot do sklepu</option>
              <option value="reimbursement">💼 Zwrot kosztów (ktoś oddaje kasę)</option>
              <option value="deposit">🍾 Kaucja</option>
            </select>

            {drafts[i].kind === "reimbursement" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {([
                  { value: "person"  as const, label: "👥 od osoby" },
                  { value: "company" as const, label: "🏢 od firmy / instytucji" },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDraft(i, { source: opt.value })}
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: 8, fontSize: 12,
                      cursor: "pointer", fontWeight: drafts[i].source === opt.value ? 700 : 400,
                      background: drafts[i].source === opt.value ? alpha(c.info, "22") : "transparent",
                      border: `1px solid ${drafts[i].source === opt.value ? alpha(c.info, "88") : c.border}`,
                      color: drafts[i].source === opt.value ? c.infoSky : c.textSecondary,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ fontSize: 11, color: c.textTertiary, marginBottom: 12 }}>
          Rodzaj wpływa na Analizę zwrotów i Historię cen (kwoty zostają bez zmian).
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={s.btn("secondary")} onClick={onClose} disabled={saving}>Anuluj</button>
          <button style={s.btn("primary")} onClick={handleSave} disabled={saving}>
            {saving ? "Zapisuję…" : "💾 Zapisz rodzaje"}
          </button>
        </div>
      </div>
    </div>
  );
}
