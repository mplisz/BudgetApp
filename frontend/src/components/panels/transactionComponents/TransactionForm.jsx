// ============================================================
// File: frontend/src/components/panels/transactionComponents/TransactionForm.jsx
// Shared transaction form used in:
//   - PanelExpenses (mode="add",  POST via onSubmit)
//   - EditTransactionModal (mode="edit", PATCH via onSubmit)
//
// Vouchers: fresh fetch on mount — not relying on bootstrap context.
// cart: passed as prop (default []) — used for voucher reservation calc.
// ============================================================

import { useState, useMemo, useCallback, useEffect } from "react";
import { useAppContext }     from "../../../context/AppContext";
import { useAuth }           from "../../../context/AuthContext";
import { useToast }          from "../../../hooks/useToast";
import { AppDatePicker, todayLocal, toYMD } from "../../ui/AppDatePicker";
import { SubcategorySelect } from "../../ui/SubcategorySelect";
import { PriorityPicker }    from "../../ui/PriorityPicker";
import { CurrencyRateField } from "../../ui/CurrencyRateField";
import { fmt, parseDecimal } from "../../../utils/helpers";
import { s }                 from "./txStyles.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Default empty form values ─────────────────────────────────

export function emptyFormValues() {
  return {
    date:            todayLocal(),
    currency:        "PLN",
    customCurrency:  "",
    amountOrig:      "",
    subcategoryId:   "",
    subcategoryName: "",
    categoryId:      "",
    categoryName:    "",
    categoryType:    null,
    priority:        2,
    description:     "",
    tags:            [],
    useVoucher:      false,
    voucherId:       "",
    voucherAmount:   "",
  };
}

// ── Convert an existing transaction back into form values ─────

export function txToFormValues(tx) {
  return {
    date:            tx.date ? (() => { const [y,m,d] = tx.date.split("-").map(Number); return new Date(y, m-1, d); })() : todayLocal(),
    currency:        tx.originalCurrency || "PLN",
    customCurrency:  "",
    amountOrig:      String(tx.originalAmount ?? tx.amount ?? ""),
    subcategoryId:   tx.subcategoryId   || "",
    subcategoryName: tx.subcategoryName || "",
    categoryId:      tx.categoryId      || "",
    categoryName:    tx.categoryName    || "",
    categoryType:    null,
    priority:        tx.priority        || 2,
    description:     tx.description     || "",
    tags:            tx.tags            || [],
    useVoucher:      tx.useVoucher      || false,
    voucherId:       tx.voucherId       || "",
    voucherAmount:   tx.voucherAmount   ? String(tx.voucherAmount) : "",
  };
}

// ── Helpers ───────────────────────────────────────────────────

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function computeRemaining(v) {
  const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
  return Math.max(0, v.initialValue - used);
}

// ── Styles ────────────────────────────────────────────────────

const lbl     = { display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 };
const inp     = { width: "100%", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0", padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" };
const frow    = { marginBottom: 16 };
const divider = { borderTop: "1px solid #1e293b", margin: "20px 0" };

// ── Component ─────────────────────────────────────────────────

export function TransactionForm({
  initialValues,
  budgetMonth,
  onSubmit,
  onCancel,
  onAddToCart,
  isSaving = false,
  mode = "add",
  cart = [],          // passed from PanelExpenses — used for voucher reservation calc
}) {
  const { tags } = useAppContext();
  const { fetchWithAuth } = useAuth();
  const { showError }   = useToast();

  const [form,     setForm]     = useState(initialValues ?? emptyFormValues());
  const [rateInfo, setRateInfo] = useState({ activeRate: 1, resolvedCurrency: "PLN" });

  // Fresh voucher list — fetched on mount, not from bootstrap context
  const [activeVouchers,   setActiveVouchers]   = useState([]);
  const [vouchersLoading,  setVouchersLoading]  = useState(false);

  useEffect(() => {
    async function fetchVouchers() {
      setVouchersLoading(true);
      try {
        const res  = await fetchWithAuth(`${API_URL}/api/vouchers`);
        const data = await res.json();
        if (!res.ok) return;
        const today = todayYMD();
        const active = data
          .map(v => ({ ...v, remainingValue: computeRemaining(v) }))
          .filter(v => !v.isArchived && v.remainingValue > 0 && (!v.expiresAt || v.expiresAt >= today));
        setActiveVouchers(active);
      } catch {
        // silently fail — voucher dropdown just stays empty
      } finally {
        setVouchersLoading(false);
      }
    }
    fetchVouchers();
  }, [fetchWithAuth]);

  // Sum voucherAmount already reserved in cart per voucherId
  const cartReserved = useMemo(() => {
    const reserved = {};
    for (const item of cart) {
      if (!item.useVoucher || !item.voucherId) continue;
      reserved[item.voucherId] = (reserved[item.voucherId] || 0) + (item.voucherAmount || 0);
    }
    return reserved;
  }, [cart]);

  // Vouchers with remainingValue adjusted for cart reservations
  const adjustedVouchers = useMemo(() =>
    activeVouchers
      .map(v => ({
        ...v,
        remainingValue: Math.max(0, v.remainingValue - (cartReserved[v.id] || 0)),
      }))
      .filter(v => v.remainingValue > 0),
    [activeVouchers, cartReserved]
  );

  const dateYMD    = toYMD(form.date);
  const activeTags = useMemo(() => tags.filter(t => !t.isArchived), [tags]);

  // Amount in PLN
  const amountPLN = useMemo(() => {
    const raw = parseDecimal(form.amountOrig);
    if (!raw || raw <= 0 || !rateInfo.activeRate) return 0;
    return Math.round(raw * rateInfo.activeRate * 100) / 100;
  }, [form.amountOrig, rateInfo.activeRate]);

  // Auto-cap voucherAmount when amountPLN drops below current voucherAmount
  useEffect(() => {
    if (!form.useVoucher || !form.voucherAmount) return;
    const vAmt = parseDecimal(form.voucherAmount) || 0;
    if (amountPLN > 0 && vAmt > amountPLN) {
      set("voucherAmount", String(amountPLN));
    }
  }, [amountPLN]);

  // Selected voucher object
  const selectedVoucher = useMemo(
    () => adjustedVouchers.find(v => v.id === form.voucherId) ?? null,
    [adjustedVouchers, form.voucherId]
  );

  // Net cash after voucher
  const voucherAmt = parseDecimal(form.voucherAmount) || 0;
  const netCash    = form.useVoucher ? Math.max(0, amountPLN - voucherAmt) : amountPLN;

  // Show voucher only for EXPENSE categories
  const showVoucher = form.categoryType === "EXPENSE";

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  const handleRateReady = useCallback(({ activeRate, resolvedCurrency }) => {
    setRateInfo({ activeRate, resolvedCurrency });
  }, []);

  const handleSubcategoryChange = useCallback(({ subcategoryId, subcategoryName, categoryId, categoryName, categoryType }) => {
    setForm(prev => ({
      ...prev,
      subcategoryId,
      subcategoryName,
      categoryId,
      categoryName,
      categoryType: categoryType ?? null,
      // Reset voucher if switching away from EXPENSE
      ...(categoryType !== "EXPENSE" && {
        useVoucher:    false,
        voucherId:     "",
        voucherAmount: "",
      }),
    }));
  }, []);

  function toggleTag(id) {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(id) ? prev.tags.filter(t => t !== id) : [...prev.tags, id],
    }));
  }

  function handleVoucherSelect(id) {
    if (!id) {
      set("useVoucher", false);
      set("voucherId", "");
      set("voucherAmount", "");
      return;
    }
    const v = adjustedVouchers.find(v => v.id === id);
    if (!v) return;
    set("useVoucher", true);
    set("voucherId", id);
    const autoAmt = amountPLN > 0
      ? Math.min(v.remainingValue, amountPLN)
      : v.remainingValue;
    set("voucherAmount", String(autoAmt));
  }

  // ── Build payload ─────────────────────────────────────────

  function buildPayload() {
    if (!form.subcategoryId)                              { showError("Wybierz subkategorię.");         return null; }
    const rawAmount = parseDecimal(form.amountOrig);
    if (!rawAmount || rawAmount <= 0)                     { showError("Podaj kwotę większą od zera."); return null; }
    if (!rateInfo.activeRate || rateInfo.activeRate <= 0) { showError("Brak kursu walutowego.");       return null; }
    if (rateInfo.resolvedCurrency.length !== 3)           { showError("Wybierz walutę.");              return null; }

    return {
      date:             dateYMD,
      type:             form.categoryType ?? "EXPENSE",
      budgetMonth,
      subcategoryId:    form.subcategoryId,
      subcategoryName:  form.subcategoryName,
      categoryId:       form.categoryId,
      categoryName:     form.categoryName,
      amount:           amountPLN,
      originalAmount:   rawAmount,
      originalCurrency: rateInfo.resolvedCurrency,
      fxRate:           rateInfo.activeRate,
      description:      form.description.trim(),
      tags:             form.tags,
      priority:         form.priority,
      useVoucher:       form.useVoucher,
      voucherId:        form.useVoucher ? form.voucherId : null,
      voucherAmount:    form.useVoucher
        ? Math.min(parseDecimal(form.voucherAmount) || 0, amountPLN)
        : 0,
      netAmount:        form.useVoucher
        ? Math.max(0, amountPLN - Math.min(parseDecimal(form.voucherAmount) || 0, amountPLN))
        : amountPLN,
      isRecurring:      false,
      recurringId:      null,
    };
  }

  async function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    await onSubmit(payload);
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div>
      {/* Date */}
      <div style={frow}>
        <label style={lbl}>Data</label>
        <AppDatePicker
          value={form.date}
          onChange={date => set("date", date)}
          maxDate={null}
        />
        <div style={{ fontSize: 11, color: "#10b98199", marginTop: 4 }}>
          Miesiąc budżetowy: <strong>{budgetMonth}</strong>
          {mode === "edit" && <span style={{ color: "#475569" }}> (z transakcji — nieedytowalny)</span>}
          {mode === "add"  && <span style={{ color: "#475569" }}> (z nawigacji)</span>}
        </div>
      </div>

      {/* Currency + rate */}
      <div style={frow}>
        <CurrencyRateField
          currency={form.currency}
          customCurrency={form.customCurrency}
          date={dateYMD}
          onCurrencyChange={v => set("currency", v)}
          onCustomChange={v => set("customCurrency", v)}
          onRateReady={handleRateReady}
        />
      </div>

      {/* Amount */}
      <div style={frow}>
        <label style={lbl}>Kwota ({rateInfo.resolvedCurrency || "PLN"})</label>
        <input
          type="number" step="0.01" min="0"
          value={form.amountOrig}
          onChange={e => set("amountOrig", e.target.value)}
          placeholder="0,00"
          style={inp}
        />
        {amountPLN > 0 && rateInfo.resolvedCurrency !== "PLN" && (
          <div style={{ fontSize: 12, color: "#10b981", marginTop: 5 }}>
            = <strong>{fmt(amountPLN)}</strong> PLN
          </div>
        )}
      </div>

      <div style={divider} />

      {/* Subcategory */}
      <div style={frow}>
        <label style={lbl}>Subkategoria</label>
        <SubcategorySelect value={form.subcategoryId} onChange={handleSubcategoryChange} />
        {form.categoryName && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>{form.categoryName}</div>
        )}
      </div>

      {/* Priority */}
      <div style={frow}>
        <PriorityPicker
          value={form.priority}
          onChange={v => set("priority", v)}
          subcategoryId={form.subcategoryId}
        />
      </div>

      {/* Voucher — tylko dla EXPENSE */}
      {showVoucher && (
        <>
          <div style={divider} />

          <div style={frow}>
            <label style={lbl}>
              🎫 Voucher / bon
              {vouchersLoading && <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", marginLeft: 6 }}>ładowanie…</span>}
            </label>

            <select
              style={{ ...inp, color: form.voucherId ? "#e2e8f0" : "#475569" }}
              value={form.voucherId}
              onChange={e => handleVoucherSelect(e.target.value)}
              disabled={vouchersLoading}
            >
              <option value="">— bez vouchera —</option>
              {adjustedVouchers.map(v => (
                <option key={v.id} value={v.id}>
                  {v.code}  ({fmt(v.remainingValue)} PLN pozostało)
                  {v.expiresAt ? `  · ważny do ${v.expiresAt}` : ""}
                </option>
              ))}
              {!vouchersLoading && adjustedVouchers.length === 0 && (
                <option disabled value="">Brak aktywnych voucherów</option>
              )}
            </select>

            {/* Voucher amount + feedback */}
            {form.useVoucher && selectedVoucher && (
              <div style={{ marginTop: 10 }}>
                <label style={lbl}>Kwota vouchera (PLN)</label>
                <input
                  type="number" step="0.01" min="0"
                  max={selectedVoucher.remainingValue}
                  value={form.voucherAmount}
                  onChange={e => {
                    const val = parseDecimal(e.target.value) || 0;
                    const max = Math.min(selectedVoucher?.remainingValue ?? Infinity, amountPLN || Infinity);
                    set("voucherAmount", String(Math.min(val, max)));
                  }}
                  style={{ ...inp, maxWidth: 180, borderColor: "#a855f744" }}
                />
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  <span style={{ color: "#64748b" }}>
                    Gotówka: <strong style={{ color: "#10b981" }}>{fmt(netCash)} PLN</strong>
                    {" · "}Voucher: <strong style={{ color: "#a855f7" }}>{fmt(voucherAmt)} PLN</strong>
                    {" · "}Na voucherze zostanie: <strong style={{ color: "#94a3b8" }}>{fmt(selectedVoucher.remainingValue - voucherAmt)} PLN</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div style={divider} />

      {/* Description */}
      <div style={frow}>
        <label style={lbl}>Opis (opcjonalny)</label>
        <input
          value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="np. Żabka – zakupy weekendowe"
          maxLength={500}
          style={inp}
        />
      </div>

      {/* Tags */}
      {activeTags.length > 0 && (
        <div style={frow}>
          <label style={lbl}>Tagi</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activeTags.map(tag => {
              const selected = form.tags.includes(tag.id);
              return (
                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12,
                    border:     `1px solid ${selected ? "#10b981" : "#1e293b"}`,
                    background: selected ? "#10b98122" : "transparent",
                    color:      selected ? "#10b981"   : "#64748b",
                    fontWeight: selected ? 700 : 400, transition: "all 0.15s" }}>
                  {tag.icon} {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        {onCancel && (
          <button style={s.btn("secondary")} onClick={onCancel}>Anuluj</button>
        )}
        {onAddToCart && (
          <button
            style={{ ...s.btn("secondary"), borderColor: "#3b82f644", color: "#3b82f6" }}
            onClick={async () => { const p = buildPayload(); if (p) onAddToCart(p); }}
            disabled={isSaving}>
            🛒 Dodaj do koszyka
          </button>
        )}
        <button style={s.btn("primary")} onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Zapisuję…" : mode === "edit" ? "💾 Zapisz zmiany" : "💾 Zapisz"}
        </button>
      </div>
    </div>
  );
}