// ============================================================
// File: src/components/panels/transactionComponents/TransactionForm.tsx
// Shared transaction form — used in PanelExpenses and EditTransactionModal.
// ============================================================

import { useState, useMemo, useCallback, useEffect } from "react";
import { useAppContext }     from "../../../context/AppContext";
import { useToast }          from "../../../hooks/useToast";
import { useVouchers }       from "../../../hooks/useVouchers";
import { useDiscount }       from "../../../hooks/useDiscount";
import { AppDatePicker, todayLocal, toYMD } from "../../ui/AppDatePicker";
import { SubcategorySelect } from "../../ui/SubcategorySelect";
import { PriorityPicker }    from "../../ui/PriorityPicker";
import { CurrencyRateField } from "../../ui/CurrencyRateField";
import { VoucherSection }    from "./VoucherSection";
import { fmt, fmtAmount, parseDecimal, round2 } from "../../../utils/helpers";
import { translateError } from "../../../data/constants/errorMessages";
import { TagMultiSelect } from "../../ui/TagMultiSelect";
import { MerchantInput } from "../../ui/MerchantInput";

import type {
  FormValues, FormLineItem, TransactionPayload, TransactionFormProps, RateInfo,
} from "../../../types/transaction";

// ── Styles ────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.6px",
  fontWeight: 700, marginBottom: 6,
};
const inp: React.CSSProperties = {
  width: "100%", background: "#0a0f1e", border: "1px solid #1e293b",
  borderRadius: 8, color: "#e2e8f0", padding: "9px 12px",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
const frow: React.CSSProperties  = { marginBottom: 16 };
const divider: React.CSSProperties = { borderTop: "1px solid #1e293b", margin: "20px 0" };

// ── Default form values ───────────────────────────────────────

export function emptyFormValues(): FormValues {
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
    amountGross:     "",
    discountAmount:  "",
    qty:             1,
    merchant:        "",
    lineItems:       [],
  };
}

// ── Convert existing transaction → form values ────────────────

export function txToFormValues(tx: Record<string, unknown>): FormValues {
  const date = tx.date as string | undefined;
  return {
    date:            date ? (() => { const [y,m,d] = date.split("-").map(Number); return new Date(y,m-1,d); })() : todayLocal(),
    currency:        (tx.originalCurrency as string) || "PLN",
    customCurrency:  "",
    amountOrig:      String(tx.originalAmount ?? tx.amount ?? ""),
    subcategoryId:   (tx.subcategoryId   as string) || "",
    subcategoryName: (tx.subcategoryName as string) || "",
    categoryId:      (tx.categoryId      as string) || "",
    categoryName:    (tx.categoryName    as string) || "",
    categoryType:    null,
    priority:        ((tx.priority as number) || 2) as 1 | 2 | 3 | 4,
    description:     (tx.description    as string) || "",
    tags:            (tx.tags           as string[]) || [],
    useVoucher:      (tx.useVoucher     as boolean) || false,
    voucherId:       (tx.voucherId      as string) || "",
    voucherAmount:   tx.voucherAmount   ? String(tx.voucherAmount) : "",
    amountGross:     "",
    discountAmount:  "",
    qty:             1,
    merchant:        (tx.merchant as string) || "",
    // Load receipt breakdown so editing a multi-item transaction shows the editor.
    // We edit originalAmount (in the receipt currency); amount/PLN is derived.
    lineItems: Array.isArray(tx.lineItems)
      ? (tx.lineItems as Array<{ description?: string; amount: number; originalAmount?: number }>).map(li => ({
          description:    li.description || "",
          originalAmount: String(li.originalAmount ?? li.amount),
        }))
      : [],
  };
}

// ── Component ─────────────────────────────────────────────────

export function TransactionForm({
  initialValues,
  budgetMonth,
  onSubmit,
  onCancel,
  onAddToCart,
  isSaving = false,
  mode = "add",
  cart = [],
}: TransactionFormProps) {
  const { tags, transactions, limits, settings } = useAppContext() as {
    tags:         Array<{ id: string; name: string; icon: string; isArchived: boolean }>;
    transactions: Array<{ budgetMonth: string; categoryId: string; type: string; isArchived: boolean; amount: number }>;
    limits:       Array<{ categoryId: string; limits: Array<{ type: string; date: string; amount: number }> }>;
    settings:     { thresholds?: { warningPercent: number; criticalPercent: number } } | null;
  };

  const { showError, showWarning } = useToast() as {
    showError:   (msg: string) => void;
    showWarning: (msg: string) => void;
  };

  // ── State / hooks (declare before any derived value that reads them) ──
  const [form,     setForm]     = useState<FormValues>(initialValues ?? emptyFormValues());
  const [rateInfo, setRateInfo] = useState<RateInfo>({ activeRate: 1, resolvedCurrency: "PLN" });
  const [voucherOpen, setVoucherOpen] = useState(false);

  const { vouchers, isLoading: vouchersLoading } = useVouchers(cart);
  const discount = useDiscount();

  const dateYMD = toYMD(form.date);

  function set<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // ── Line items (receipt breakdown) ────────────────────────
  const hasLineItems = form.lineItems.length >= 2;

  const lineItemsSumOrig = useMemo(
    () => form.lineItems.reduce((s, li) => s + (parseDecimal(li.originalAmount) || 0), 0),
    [form.lineItems]
  );
  // Σ of per-line round2(orig × rate) — matches buildPayload so the invariant
  // Σ lineItems.amount = transaction.amount holds exactly.
  const lineItemsSumPLN = useMemo(
    () => round2(form.lineItems.reduce(
      (s, li) => s + round2((parseDecimal(li.originalAmount) || 0) * rateInfo.activeRate), 0)),
    [form.lineItems, rateInfo.activeRate]
  );

  function updateLineItem(idx: number, field: keyof FormLineItem, value: string) {
    setForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((li, i) => i === idx ? { ...li, [field]: value } : li),
    }));
  }

  function removeLineItem(idx: number) {
    setForm(prev => {
      const next = prev.lineItems.filter((_, i) => i !== idx);
      // Collapse to 1 → transaction becomes a regular linear one: the single
      // remaining item's amount becomes the transaction amount, breakdown drops.
      if (next.length === 1) {
        return { ...prev, lineItems: [], amountOrig: next[0].originalAmount };
      }
      return { ...prev, lineItems: next };
    });
  }

  // ── Single-amount (linear) derived values ─────────────────
  //local state string on blur + synchronize it with discount changes
  const [qtyStr, setQtyStr] = useState(String(discount.qty));
  useEffect(() => { setQtyStr(String(discount.qty)); }, [discount.qty]);

  // Effective amount — net after discount, or raw if no discount
  const effectiveAmountOrig = discount.effectiveAmount(form.amountOrig);

  const amountPLN = useMemo<number>(() => {
    const raw = parseDecimal(effectiveAmountOrig);
    if (!raw || raw <= 0 || !rateInfo.activeRate) return 0;
    return round2(raw * rateInfo.activeRate);
  }, [effectiveAmountOrig, rateInfo.activeRate]);

  // Auto-cap voucherAmount when amountPLN drops
  useEffect(() => {
    if (!form.useVoucher || !form.voucherAmount) return;
    const vAmt = parseDecimal(form.voucherAmount) || 0;
    if (amountPLN > 0 && vAmt > amountPLN) set("voucherAmount", String(amountPLN));
  }, [amountPLN]);

  // Voucher section visible only for EXPENSE + when active vouchers exist + not a line-item tx
  const showVoucherSection = form.categoryType === "EXPENSE" && vouchers.length > 0 && !hasLineItems;

  const handleRateReady = useCallback(({ activeRate, resolvedCurrency }: RateInfo) => {
    setRateInfo({ activeRate, resolvedCurrency });
  }, []);

  const handleSubcategoryChange = useCallback(({
    subcategoryId, subcategoryName, categoryId, categoryName, categoryType,
  }: {
    subcategoryId:   string;
    subcategoryName: string;
    categoryId:      string;
    categoryName:    string;
    categoryType:    string | null;
  }) => {
    setForm(prev => ({
      ...prev,
      subcategoryId, subcategoryName, categoryId, categoryName,
      categoryType: categoryType ?? null,
      ...(categoryType !== "EXPENSE" && {
        useVoucher: false, voucherId: "", voucherAmount: "",
      }),
    }));

    // Budget warning toast on subcategory select
    if (categoryType !== "EXPENSE" || !categoryId || !budgetMonth) return;
    const limitDoc = (limits || []).find(l => l.categoryId === categoryId);
    if (!limitDoc) return;
    const override = limitDoc.limits.find(l => l.type === "override" && l.date === budgetMonth);
    const activeLimit = override
      ? override.amount
      : limitDoc.limits
          .filter(l => l.type === "base" && l.date <= budgetMonth)
          .sort((a, b) => b.date.localeCompare(a.date))[0]?.amount ?? null;
    if (!activeLimit) return;
    const spent = (transactions || [])
      .filter(tx => tx.budgetMonth === budgetMonth && tx.categoryId === categoryId && tx.type === "EXPENSE" && !tx.isArchived)
      .reduce((s, tx) => s + tx.amount, 0);
    const pct             = (spent / activeLimit) * 100;
    const warningPercent  = settings?.thresholds?.warningPercent  ?? 80;
    const criticalPercent = settings?.thresholds?.criticalPercent ?? 95;
    if (pct >= 100) {
      showError(`🔴 ${categoryName}: limit wyczerpany! (${fmt(spent)} / ${fmt(activeLimit)})`);
    } else if (pct >= criticalPercent) {
      showError(`🔴 ${categoryName}: ${pct.toFixed(1)}% limitu — prawie wyczerpany (${fmt(spent)} / ${fmt(activeLimit)})`);
    } else if (pct >= warningPercent) {
      showWarning(`⚠️ ${categoryName}: ${pct.toFixed(1)}% limitu (${fmt(spent)} / ${fmt(activeLimit)})`);
    }
  }, [budgetMonth, transactions, limits, settings, showError, showWarning]);

  function handleVoucherSelect(id: string) {
    if (!id) {
      set("useVoucher", false); set("voucherId", ""); set("voucherAmount", "");
      return;
    }
    const v = vouchers.find(v => v.id === id);
    if (!v) return;
    set("useVoucher", true);
    set("voucherId", id);
    set("voucherAmount", String(amountPLN > 0 ? Math.min(v.remainingValue, amountPLN) : v.remainingValue));
  }

  // ── Build payload ─────────────────────────────────────────

  function buildPayload(): TransactionPayload | null {
    if (!form.subcategoryId)                              { showError(translateError("Select a subcategory.")); return null; }
    if (!rateInfo.activeRate || rateInfo.activeRate <= 0) { showError(translateError("Missing exchange rate.")); return null; }
    if (rateInfo.resolvedCurrency.length !== 3)           { showError(translateError("Select a currency.")); return null; }

    // ── Line-items branch ──
    // Edit originalAmount per line (receipt currency); one fxRate per transaction.
    // amount (PLN) per line = round2(orig × fx); sums keep the invariant exact.
    if (hasLineItems) {
      const cur = rateInfo.resolvedCurrency;
      const fx  = rateInfo.activeRate;
      const lines = form.lineItems.map(li => {
        const orig = parseDecimal(li.originalAmount) || 0;
        return {
          description:      li.description.trim(),
          originalAmount:   orig,
          originalCurrency: cur,
          amount:           round2(orig * fx),
        };
      });
      const sumOrig = round2(lines.reduce((s, l) => s + l.originalAmount, 0));
      const sumPLN  = round2(lines.reduce((s, l) => s + l.amount, 0));
      if (sumOrig <= 0) { showError("Suma pozycji musi być większa od 0."); return null; }

      return {
        date:             dateYMD,
        type:             form.categoryType ?? "EXPENSE",
        budgetMonth,
        subcategoryId:    form.subcategoryId,
        subcategoryName:  form.subcategoryName,
        categoryId:       form.categoryId,
        categoryName:     form.categoryName,
        amount:           sumPLN,
        originalAmount:   sumOrig,
        originalCurrency: cur,
        fxRate:           fx,
        description:      form.description.trim(),
        tags:             form.tags,
        priority:         form.priority,
        useVoucher:       false,
        voucherId:        null,
        voucherAmount:    0,
        netAmount:        sumPLN,
        isRecurring:      false,
        recurringId:      null,
        lineItems:        lines,
        ...(form.merchant?.trim() ? { merchant: form.merchant.trim() } : {}),
      };
    }

    // ── Linear branch ──
    const rawAmount = parseDecimal(effectiveAmountOrig);
    if (!rawAmount || rawAmount <= 0) { showError(translateError("Enter an amount greater than 0.")); return null; }
    if (discount.isOpen) {
      const gross = parseDecimal(discount.amountGross) || 0;
      const disc  = parseDecimal(discount.discountAmount) || 0;
      // per_unit: discount caps at per-unit gross
      // per_order: discount caps at total (gross × qty)
      const msgKey = discount.discountMode === "per_unit" ? "Discount cannot be equal to or greater than the gross amount." : "Discount cannot be equal to or greater than the order total.";
      const cap = discount.discountMode === "per_unit" ? gross : gross * discount.qty;
      if (cap > 0 && disc >= cap) {
        showError(translateError(msgKey));
        return null;
      }
    }

    const cappedVoucher = form.useVoucher
      ? Math.min(parseDecimal(form.voucherAmount) || 0, amountPLN)
      : 0;

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
      voucherAmount:    cappedVoucher,
      netAmount:        form.useVoucher ? Math.max(0, amountPLN - cappedVoucher) : amountPLN,
      isRecurring:      false,
      recurringId:      null,
      // On edit, send lineItems:[] so collapsing a breakdown clears it on the
      // backend; a no-op for transactions that never had a breakdown.
      ...(mode === "edit" ? { lineItems: [] } : {}),
      // Merchant is optional on manual entries — only included when set.
      ...(form.merchant?.trim() ? { merchant: form.merchant.trim() } : {}),
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
        <label style={lbl}>Date</label>
        <AppDatePicker value={form.date} onChange={(date: Date) => set("date", date)} maxDate={null} />
        <div style={{ fontSize: 11, color: "#10b98199", marginTop: 4 }}>
          Budget month: <strong>{budgetMonth}</strong>
          {mode === "edit" && <span style={{ color: "#475569" }}> (not editable)</span>}
          {mode === "add"  && <span style={{ color: "#475569" }}> (from navigator)</span>}
        </div>
      </div>

      {/* Currency + exchange rate */}
      <div style={frow}>
        <CurrencyRateField
          currency={form.currency}
          customCurrency={form.customCurrency}
          date={dateYMD}
          onCurrencyChange={(v: string) => set("currency", v)}
          onCustomChange={(v: string)   => set("customCurrency", v)}
          onRateReady={handleRateReady}
        />
      </div>

      {hasLineItems ? (
        /* ── Receipt line-items editor ── */
        <div style={frow}>
          <label style={lbl}>Pozycje z paragonu ({form.lineItems.length})</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {form.lineItems.map((li, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={li.description}
                  onChange={e => updateLineItem(idx, "description", e.target.value)}
                  placeholder="Opis pozycji"
                  style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 13 }}
                />
                <input
                  type="number" step="0.01" min="0"
                  value={li.originalAmount}
                  onChange={e => updateLineItem(idx, "originalAmount", e.target.value)}
                  style={{ ...inp, width: 110, padding: "7px 10px", fontSize: 13, textAlign: "right" }}
                />
                <span style={{ fontSize: 12, color: "#64748b", width: 38 }}>{rateInfo.resolvedCurrency}</span>
                <button onClick={() => removeLineItem(idx)} title="Usuń pozycję"
                  style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
              </div>
            ))}
          </div>

          {/* Suma = kwota transakcji (read-only, na żywo) */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e293b" }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>Suma pozycji:</span>
            <span style={{ textAlign: "right" }}>
              {rateInfo.resolvedCurrency !== "PLN" ? (
                <>
                  <span style={{ color: "#e2e8f0", fontWeight: 700 }}>
                    {fmtAmount(lineItemsSumOrig, rateInfo.resolvedCurrency)} {rateInfo.resolvedCurrency}
                  </span>
                  <div style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>= {fmt(lineItemsSumPLN)}</div>
                </>
              ) : (
                <span style={{ color: "#10b981", fontWeight: 700 }}>{fmt(lineItemsSumPLN)}</span>
              )}
            </span>
          </div>

          {form.lineItems.length === 2 && (
            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8 }}>
              Usunięcie pozostawi 1 pozycję → transakcja stanie się zwykła (bez rozbicia).
            </div>
          )}
        </div>
      ) : (
        /* ── Single amount + qty + inline discount ── */
        <div style={frow}>
          {/* Row: label (left) + qty spinner (right) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>
              {discount.isOpen ? "Gross unit price" : "Amount"} ({rateInfo.resolvedCurrency || "PLN"})
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Qty
              {/* Changed to text numeric input mode to mitigate issues on mobile phone with changing the quantity */}
              <input
                type="text"
                inputMode="numeric"
                value={qtyStr}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setQtyStr(raw);
                  const n = parseInt(raw);
                  if (n >= 1) discount.setQty(n);
                }}
                onBlur={() => {
                  const n = parseInt(qtyStr);
                  const valid = n >= 1 ? n : 1;
                  discount.setQty(valid);
                  setQtyStr(String(valid));
                }}
                onFocus={e => e.target.select()} // zaznacza całość — user może od razu nadpisać
                style={{ ...inp, width: 64, padding: "6px 10px", fontSize: 13, textAlign: "center" }}
              />
            </label>
          </div>

          {/* Amount input row */}
          {discount.isOpen ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* Unit price (editable) */}
              <input
                type="number" step="0.01" min="0"
                value={discount.amountGross}
                onChange={e => discount.setGross(e.target.value)}
                placeholder="0,00"
                style={{ ...inp, flex: 1, minWidth: 80 }}
              />
              {/* Gross total (unit × qty) — shown only when qty > 1 */}
              {discount.qty > 1 && discount.summary && (
                <span style={{ color: "#334155", fontSize: 12, flexShrink: 0 }}>
                  ×{discount.qty} = <strong style={{ color: "#94a3b8" }}>{fmt(discount.summary.grossTotal)}</strong>
                </span>
              )}
              {/* Arrow + net total */}
              <span style={{ color: "#334155", fontSize: 13, flexShrink: 0 }}>→</span>
              <input
                type="text" readOnly
                value={discount.summary && discount.summary.grossTotal > 0 ? String(round2(discount.summary.net)) : ""}
                placeholder="net total"
                title="Net total = (unit × qty) − discount"
                style={{ ...inp, flex: 1, minWidth: 80, color: "#10b981", cursor: "not-allowed", opacity: 0.8, borderColor: "#10b98133" }}
              />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number" step="0.01" min="0"
                value={form.amountOrig}
                onChange={e => set("amountOrig", e.target.value)}
                placeholder="0,00"
                style={{ ...inp, flex: 1 }}
              />
              {/* Total preview when qty > 1 */}
              {discount.qty > 1 && (parseDecimal(form.amountOrig) || 0) > 0 && (
                <>
                  <span style={{ color: "#334155", fontSize: 13, flexShrink: 0 }}>×{discount.qty} =</span>
                  <input
                    type="text" readOnly
                    value={String(round2((parseDecimal(form.amountOrig) || 0) * discount.qty))}
                    style={{ ...inp, flex: 1, color: "#10b981", cursor: "not-allowed", opacity: 0.8, borderColor: "#10b98133" }}
                  />
                </>
              )}
            </div>
          )}

          {amountPLN > 0 && rateInfo.resolvedCurrency !== "PLN" && (
            <div style={{ fontSize: 12, color: "#10b981", marginTop: 5 }}>
              = <strong>{fmt(amountPLN)}</strong> PLN
            </div>
          )}

          {/* Discount row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            {/* Discount toggle checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={discount.isOpen}
                onChange={() => {
                  // On disable: restore amountOrig from gross
                  if (discount.isOpen && discount.amountGross) {
                    set("amountOrig", discount.amountGross);
                  }
                  discount.toggle(form.amountOrig, discount.amountGross);
                }}
                style={{ width: 14, height: 14, accentColor: "#f59e0b", cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: discount.isOpen ? "#f59e0b" : "#475569", fontWeight: 600 }}>
                🏷️ Discount
              </span>
            </label>

            {discount.isOpen && (
              <>
                {/* Discount amount */}
                <input
                  type="number" step="0.01" min="0"
                  value={discount.discountAmount}
                  onChange={e => discount.setDiscount(e.target.value)}
                  placeholder="0,00"
                  style={{ ...inp, width: 100, borderColor: "#f59e0b44", padding: "6px 10px", fontSize: 13 }}
                />

                {/* Mode toggle: per order / per unit — only relevant when qty > 1 */}
                {discount.qty > 1 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["per_order", "per_unit"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => discount.setDiscountMode(m)}
                        style={{
                          padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600,
                          background: discount.discountMode === m ? "#f59e0b22" : "transparent",
                          border:     `1px solid ${discount.discountMode === m ? "#f59e0b" : "#334155"}`,
                          color:      discount.discountMode === m ? "#f59e0b"   : "#475569",
                        }}
                      >
                        {m === "per_order" ? "Per order" : "Per unit"}
                      </button>
                    ))}
                  </div>
                )}

                {/* Summary */}
                {discount.summary && discount.summary.discount > 0 && (
                  <span style={{ fontSize: 12, color: "#f59e0b" }}>
                    −{fmt(discount.discountMode === "per_unit"
                      ? discount.summary.discount * discount.summary.qty
                      : discount.summary.discount
                    )} ({discount.summary.pct.toFixed(1)}%)
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div style={divider} />

      {/* Subcategory */}
      <div style={frow}>
        <label style={lbl}>Subcategory</label>
        <SubcategorySelect value={form.subcategoryId} onChange={handleSubcategoryChange} />
        {form.categoryName && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>{form.categoryName}</div>
        )}
      </div>

      {/* Priority */}
      <div style={frow}>
        <PriorityPicker
          value={form.priority}
          onChange={(v: 1 | 2 | 3 | 4) => set("priority", v)}
          subcategoryId={form.subcategoryId}
        />
      </div>

      {/* Description */}
      <div style={frow}>
        <label style={lbl}>Description (optional)</label>
        <input
          value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="e.g. Grocery run – weekend"
          maxLength={500}
          style={inp}
        />
      </div>

      {/* Merchant (optional) */}
      <div style={frow}>
        <label style={lbl}>Sklep (opcjonalnie)</label>
        <MerchantInput
          value={form.merchant}
          onChange={(v: string) => set("merchant", v)}
          placeholder="np. Biedronka"
          style={inp}
        />
      </div>

      {/* Tags */}
      <div style={frow}>
        <label style={lbl}>Tagi</label>
        <TagMultiSelect
          value={form.tags}
          onChange={(v: string[]) => set("tags", v)}
        />
      </div>

      {/* Voucher — collapsible, only when EXPENSE + active vouchers + not a line-item tx */}
      {showVoucherSection && (
        <VoucherSection
          vouchers={vouchers}
          isLoading={vouchersLoading}
          isOpen={voucherOpen}
          onToggle={() => {
            setVoucherOpen(v => !v);
            if (voucherOpen) {
              set("useVoucher", false); set("voucherId", ""); set("voucherAmount", "");
            }
          }}
          voucherId={form.voucherId}
          voucherAmount={form.voucherAmount}
          amountPLN={amountPLN}
          onSelect={handleVoucherSelect}
          onAmountChange={v => set("voucherAmount", v)}
        />
      )}

      <div style={divider} />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {onCancel && (
          <button onClick={onCancel}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}>
            Cancel
          </button>
        )}
        {onAddToCart && (
          <button
            onClick={() => { const p = buildPayload(); if (p) onAddToCart(p); }}
            disabled={isSaving}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #3b82f644", background: "#3b82f611", color: "#3b82f6", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            🛒 Add to cart
          </button>
        )}
        <button onClick={handleSubmit} disabled={isSaving}
          style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: isSaving ? "#1e293b" : "#10b981", color: "#fff", cursor: isSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14 }}>
          {isSaving ? "Saving…" : mode === "add" ? "💾 Save" : "💾 Update"}
        </button>
      </div>
    </div>
  );
}
