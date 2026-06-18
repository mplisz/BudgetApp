// ============================================================
// File: frontend/src/components/panels/PanelVouchers.jsx
// Voucher management panel.
// List with filters, usage history, CRUD (add/edit/archive).
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext }      from "../../context/AppContext";
import { useVoucherManager }  from "../../hooks/useVoucherManager";
import { useToast }           from "../../hooks/useToast";
import { AppDatePicker, toYMD, fromYMD, todayLocal } from "../ui/AppDatePicker";
import { BudgetInput }        from "../ui/BudgetInput";
import { ConfirmModal }              from "../ui/ConfirmModal";

import { MerchantInput }      from "../ui/MerchantInput";
import { fmt }                from "../../utils/helpers";
import { QuickPills } from "../ui/QuickPills";
// ── Styles ────────────────────────────────────────────────────
const s = {
  panel:      { padding: "0 0 40px 0", maxWidth: 1280, margin: "0 auto", width: "100%" },
  title:      { fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 },
  sub:        { fontSize: 13, color: "#64748b", marginBottom: 20 },
  card:       { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", marginBottom: 10 },
  badge:      (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44`, marginRight: 4 }),
  btn:        (v = "primary") => ({ padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: v === "primary" ? "none" : "1px solid #1e293b", background: v === "primary" ? "#10b981" : "transparent", color: v === "primary" ? "#fff" : "#94a3b8" }),
  inp:        { width: "100%", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0", padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" },
  lbl:        { display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 5 },
  formRow:    { marginBottom: 14 },
  modal:      { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" },
  modalBox:   { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 14, padding: "24px 28px", maxWidth: 480, width: "90vw", maxHeight: "85vh", overflowY: "auto" },
};

// ── Helpers ───────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  return diff;
}

function emptyForm() {
  return {
    description: "", code: "", valueType: "amount",
    initialValue: "", percentValue: "", currency: "PLN",
    expiresAt: null, store: "", notes: "",
  };
}
// ── VoucherForm (add / edit) ──────────────────────────────────
function VoucherForm({ initial, onSubmit, onCancel, isSaving, mode = "add" }) {
  const [form, setForm] = useState(initial ?? emptyForm());
  const { showError }   = useToast();

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  const isPercent = form.valueType === "percent";

  function handleSubmit() {
    if (!form.description?.trim()) { showError("Podaj opis vouchera.");        return; }
    if (!form.code.trim())        { showError("Podaj kod vouchera.");          return; }
    if (!form.store?.trim())      { showError("Podaj sklep / wystawcę.");      return; }

    const base = {
      ...form,
      store:     form.store.trim(),
      expiresAt: form.expiresAt ? toYMD(form.expiresAt) : null,
    };

    if (isPercent) {
      const pct = parseInt(form.percentValue, 10);
      if (!pct || pct < 1 || pct > 100) { showError("Podaj procent 1–100."); return; }
      onSubmit({ ...base, valueType: "percent", percentValue: pct, initialValue: undefined });
    } else {
      const val = parseFloat(form.initialValue);
      if (!val || val <= 0) { showError("Podaj wartość > 0."); return; }
      onSubmit({ ...base, valueType: "amount", initialValue: val, percentValue: undefined });
    }
  }

  return (
    <div>
      <div style={s.formRow}>
        <label style={s.lbl}>Opis *</label>
        <input style={s.inp} value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="np. Karta Medicover Sport, bon Allegro..." />
      </div>

      {/* Value type toggle — locked after creation */}
      <div style={s.formRow}>
        <label style={s.lbl}>Typ wartości</label>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "amount",  label: "Kwota (PLN)" },
            { key: "percent", label: "Procent (%)" },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              disabled={mode === "edit"}
              onClick={() => set("valueType", t.key)}
              style={{
                flex: 1, padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: mode === "edit" ? "not-allowed" : "pointer",
                opacity: mode === "edit" && form.valueType !== t.key ? 0.4 : 1,
                border:     `1px solid ${form.valueType === t.key ? "#10b981" : "#1e293b"}`,
                background: form.valueType === t.key ? "#10b98122" : "transparent",
                color:      form.valueType === t.key ? "#10b981"   : "#475569",
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} data-vform-cols>
        <div style={s.formRow}>
          {mode === "edit" ? (
            isPercent ? (
              <>
                <label style={s.lbl}>Rabat</label>
                <input readOnly value={`−${form.percentValue}%`} style={{ ...s.inp, opacity: 0.6, cursor: "default" }} />
              </>
            ) : (
              <>
                <label style={s.lbl}>Pozostało (PLN)</label>
                <input
                  readOnly
                  value={typeof form.remainingValue === "number" ? form.remainingValue : form.initialValue}
                  style={{ ...s.inp, opacity: 0.6, cursor: "default" }}
                />
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                  Wartość początkowa: <strong style={{ color: "#94a3b8" }}>{form.initialValue} PLN</strong>
                  {" · "}Użyto: <strong style={{ color: "#f97316" }}>
                    {Math.max(0, form.initialValue - (typeof form.remainingValue === "number" ? form.remainingValue : form.initialValue))} PLN
                  </strong>
                </div>
              </>
            )
          ) : isPercent ? (
            <>
              <label style={s.lbl}>Procent (%) *</label>
              <input
                type="number" min={1} max={100} step={1}
                style={s.inp}
                value={form.percentValue}
                onChange={e => set("percentValue", e.target.value)}
                placeholder="np. 20"
              />
            </>
          ) : (
            <>
              <label style={s.lbl}>Wartość (PLN) *</label>
              <BudgetInput
                value={form.initialValue}
                onChange={v => set("initialValue", v)}
                style={s.inp}
              />
            </>
          )}
        </div>
        <div style={s.formRow}>
          <label style={s.lbl}>Kod / numer *</label>
          <input style={s.inp} value={form.code} onChange={e => set("code", e.target.value)} placeholder="np. MED2026ABC" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} data-vform-cols>
        <div style={s.formRow}>
          <label style={s.lbl}>Sklep / wystawca *</label>
          <MerchantInput
            value={form.store}
            onChange={v => set("store", v)}
            placeholder="np. Medicover"
            style={s.inp}
          />
        </div>
        <div style={s.formRow}>
          <label style={s.lbl}>Data ważności <span style={{color:'#475569',fontWeight:400,textTransform:'none'}}>(opcjonalna)</span></label>
          <AppDatePicker
            value={form.expiresAt}
            onChange={d => set("expiresAt", d)}
            minDate={todayLocal()}
            maxDate={null}
            placeholder="bezterminowy"
          />
          {(() => {
            const base = todayLocal();
            const inMonths = (n) => new Date(base.getFullYear(), base.getMonth() + n, base.getDate());
            const curYMD = form.expiresAt ? toYMD(form.expiresAt) : "";
            const opts = [
              { n: 1, label: "1 mies." }, { n: 3, label: "3 mies." },
              { n: 6, label: "6 mies." }, { n: 12, label: "12 mies." },
            ];
            return (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <QuickPills
                    pills={opts.map(o => ({
                      label:   `+${o.label}`,
                      active:  curYMD !== "" && curYMD === toYMD(inMonths(o.n)),
                      onClick: () => set("expiresAt", inMonths(o.n)),
                    }))}
                  />
                {form.expiresAt && (
                  <button
                    type="button"
                    onClick={() => set("expiresAt", null)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                      border: "1px solid #1e293b", background: "transparent", color: "#64748b",
                    }}
                  >bezterminowy</button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      <div style={s.formRow}>
        <label style={s.lbl}>Notatki</label>
        <input style={s.inp} value={form.notes} onChange={e => set("notes", e.target.value)} maxLength={500} placeholder="np. benefit pracowniczy Q2" />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        {onCancel && <button style={s.btn("secondary")} onClick={onCancel}>Anuluj</button>}
        <button style={s.btn("primary")} onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Zapisuję…" : mode === "edit" ? "💾 Zapisz" : "🎫 Dodaj voucher"}
        </button>
      </div>
       <style>{`
        @media (max-width: 700px) {
          [data-vform-cols] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── UsageHistory ─────────────────────────────────────────────
function UsageHistory({ entries }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e293b" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
        <span style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 }}>
          Historia użycia ({entries.length})
        </span>
        <span style={{ color: "#475569", fontSize: 12, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {entries.map((u, i) => (
            <div key={i} style={{ fontSize: 12, color: "#64748b", padding: "4px 0", borderBottom: "1px solid #0f172a" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{u.usedAt}</span>
                <span style={{ color: "#a78bfa", fontWeight: 600 }}>−{fmt(u.amount)} PLN</span>
              </div>
              {u.description && (
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{u.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VoucherCard ───────────────────────────────────────────────
function VoucherCard({ v, onEdit, onArchive, warnDays = 14 }) {
  const isPercent = v.valueType === "percent";
  const days   = daysUntil(v.expiresAt);
  // Percent vouchers are one-shot: "used" once they appear in any tx.
  const isUsed = isPercent ? (v.usedInTransactions || []).length > 0 : v.remainingValue <= 0;
  const pct    = isPercent ? (isUsed ? 0 : 100)
               : v.initialValue > 0 ? Math.round((v.remainingValue / v.initialValue) * 100) : 0;

  const statusColor = isUsed ? "#6b7280"
    : days !== null && days <= 0          ? "#ef4444"
    : days !== null && days <= warnDays   ? "#f97316"
    : "#10b981";

  function copyCode() {
    if (!v.code) return;
    navigator.clipboard.writeText(v.code).then(() => {});
  }

  return (
    <div style={{ ...s.card, opacity: isUsed || v.isArchived ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        {/* Left */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14 }}>
              {v.description || v.code}
              {v.sourceTransactionId && (
                <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 8, fontWeight: 400 }}>
                  🔙 Zwrot z {v.createdAt?.slice(0, 10)}
                </span>
              )}
            </div>
            {v.store && <span style={{ fontSize: 11, color: "#64748b" }}>{v.store}</span>}
            {isUsed              && <span style={s.badge("#6b7280")}>✅ wykorzystany</span>}
            {v.isArchived        && <span style={s.badge("#475569")}>📦 zarchiwizowany</span>}
            {!isUsed && days !== null && days <= 0  && <span style={s.badge("#ef4444")}>❌ wygasł</span>}
            {!isUsed && days !== null && days > 0 && <span style={s.badge(days <= warnDays ? "#f97316" : "#64748b")}>⏳ wygasa za {days} dni</span>}
          </div>

          {/* Progress bar */}
          {!isUsed && (
            <div style={{ height: 6, borderRadius: 99, background: "#1e293b", overflow: "hidden", marginBottom: 8, maxWidth: 300 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: statusColor, transition: "width 0.3s" }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
            {isPercent ? (
              <span style={{ color: "#94a3b8" }}>
                Rabat: <strong style={{ color: statusColor, fontSize: 14 }}>−{v.percentValue}%</strong>
                {isUsed && <span style={{ color: "#475569", marginLeft: 6 }}>(wykorzystany)</span>}
              </span>
            ) : (
              <>
                <span style={{ color: "#94a3b8" }}>
                  Pozostało: <strong style={{ color: statusColor, fontSize: 14 }}>{fmt(v.remainingValue)} {v.currency}</strong>
                </span>
                <span style={{ color: "#475569" }}>
                  z {fmt(v.initialValue)} {v.currency}
                </span>
              </>
            )}
            {v.expiresAt && (
              <span style={{ color: "#475569" }}>
                Ważny do: <strong style={{ color: days !== null && days <= warnDays ? "#f97316" : "#64748b" }}>{v.expiresAt}</strong>
              </span>
            )}
          </div>

          {v.code && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>Kod:</span>
              <code style={{ fontSize: 12, color: "#a78bfa", background: "#1e293b", padding: "2px 8px", borderRadius: 6 }}>
                {v.code}
              </code>
              <button onClick={copyCode} title="Kopiuj kod"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 14, padding: "2px 4px" }}>
                📋
              </button>
            </div>
          )}

          {v.notes && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#475569", fontStyle: "italic" }}>{v.notes}</div>
          )}
        </div>

        {/* Actions */}
        {!v.isArchived && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <button onClick={() => onEdit(v)}
              style={{ background: "transparent", border: "1px solid #3b82f644", color: "#3b82f6", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
              ✏️ Edytuj
            </button>
            <button onClick={() => onArchive(v)}
              style={{ background: "transparent", border: "1px solid #ef444444", color: "#ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
              🗑️ Archiwizuj
            </button>
          </div>
        )}
      </div>

      {/* Usage history — collapsible, collapsed by default */}
      {(v.usedInTransactions || []).length > 0 && (
        <UsageHistory entries={v.usedInTransactions} />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function PanelVouchers() {
  const { settings } = useAppContext();
  const {
    vouchers, activeVouchers,
    isLoading, isSaving,
    loadVouchers, addVoucher, updateVoucher, archiveVoucher,
  } = useVoucherManager();

  // Re-compute localExpiringVouchers using configured warning window
  const warnDays = settings?.voucherExpiryWarningDays ?? 14;
  const today    = new Date().toISOString().slice(0, 10);
  const soonDate = (() => {
    const d = new Date(); d.setDate(d.getDate() + warnDays);
    return d.toISOString().slice(0, 10);
  })();
  const localExpiringVouchers = activeVouchers.filter(v =>
    v.expiresAt && v.expiresAt >= today && v.expiresAt <= soonDate
  );

  const [filter,     setFilter]     = useState("active");  // active | all | archived
  const [showAdd,    setShowAdd]     = useState(false);
  const [editTarget, setEditTarget]  = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  useEffect(() => { loadVouchers(true); }, []);

  const displayed = vouchers.filter(v => {
    const usable = v.valueType === "percent"
      ? (v.usedInTransactions || []).length === 0
      : v.remainingValue > 0;
    if (filter === "active")   return !v.isArchived && usable;
    if (filter === "archived") return v.isArchived;
    return true;  // all
  });

  async function handleAdd(payload)  {
    const result = await addVoucher(payload);
    if (result) setShowAdd(false);
  }

  async function handleEdit(patch) {
    const result = await updateVoucher(editTarget.id, patch);
    if (result) setEditTarget(null);
  }

  async function handleArchive() {
    await archiveVoucher(archiveTarget.id);
    setArchiveTarget(null);
  }

  return (
    <div style={s.panel}>
      {/* Expiring vouchers banner */}
      {localExpiringVouchers.length > 0 && (
        <div style={{ background: "#f9731611", border: "1px solid #f9731633", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#f97316", fontWeight: 700, marginBottom: 6 }}>
            ⚠️ {localExpiringVouchers.length} {localExpiringVouchers.length === 1 ? "voucher wygasa" : "vouchery wygasają"} wkrótce
          </div>
          {localExpiringVouchers.map(v => {
            const days = Math.ceil((new Date(v.expiresAt) - new Date()) / 86400000);
            return (
              <div key={v.id} style={{ fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span>🎫 <strong style={{ color: "#e2e8f0" }}>{v.description || v.code}</strong> — za {days} {days === 1 ? "dzień" : "dni"} ({v.expiresAt})</span>
                <span style={{ color: "#a78bfa" }}>{fmt(v.remainingValue)} PLN</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={s.title}>🎫 Vouchery i bony</div>
          <div style={s.sub}>
            {activeVouchers.length} aktywnych
            {localExpiringVouchers.length > 0 && (
              <span style={{ color: "#f97316", marginLeft: 10 }}>
                ⚠️ {localExpiringVouchers.length} wygasa wkrótce
              </span>
            )}
          </div>
        </div>
        <button style={s.btn("primary")} onClick={() => { setShowAdd(s => !s); setEditTarget(null); }}>
          {showAdd ? "✕ Anuluj" : "＋ Dodaj voucher"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...s.card, borderColor: "#10b98133" }}>
          <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14, marginBottom: 16 }}>Nowy voucher</div>
          <VoucherForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} isSaving={isSaving} mode="add" />
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          { key: "active",   label: "Aktywne" },
          { key: "all",      label: "Wszystkie" },
          { key: "archived", label: "Archiwum" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border:     `1px solid ${filter === f.key ? "#10b981" : "#1e293b"}`,
            background: filter === f.key ? "#10b98122" : "transparent",
            color:      filter === f.key ? "#10b981"   : "#475569",
          }}>{f.label}</button>
        ))}
      </div>

      {/* List */}
      {isLoading && <div style={{ color: "#64748b", padding: "20px 0" }}>Ładowanie voucherów…</div>}

      {!isLoading && displayed.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          {filter === "active" ? "Brak aktywnych voucherów." : "Brak voucherów."}
        </div>
      )}
      <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 12,
          alignItems: "start",
        }}>
          {displayed.map(v => (
            <VoucherCard
              key={v.id}
              v={v}
              warnDays={warnDays}
              onEdit={setEditTarget}
              onArchive={setArchiveTarget}
            />
          ))}
        </div>

      {/* Edit modal */}
      {editTarget && (
        <div style={s.modal} onClick={() => setEditTarget(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 16, marginBottom: 16 }}>✏️ Edytuj voucher</div>
            <VoucherForm
              initial={{
                ...editTarget,
                expiresAt: editTarget.expiresAt ? fromYMD(editTarget.expiresAt) : null,
              }}
              onSubmit={handleEdit}
              onCancel={() => setEditTarget(null)}
              isSaving={isSaving}
              mode="edit"
            />
          </div>
        </div>
      )}

      {/* Archive confirm */}
      <ConfirmModal
        isOpen={!!archiveTarget}
        title="Zarchiwizować voucher?"
        message={
                  archiveTarget
                    ? `Voucher "${archiveTarget.code}"${
                        archiveTarget.sourceTransactionId
                          ? ` (Zwrot z ${archiveTarget.createdAt?.slice(0, 10) ?? "—"})`
                          : archiveTarget.description ? ` — ${archiveTarget.description}` : ""
                      } zostanie przeniesiony do archiwum.`
                    : "Voucher zostanie przeniesiony do archiwum."
                }
        onConfirm={handleArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}