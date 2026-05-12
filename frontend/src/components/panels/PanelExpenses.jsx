// ============================================================
// File: src/components/panels/PanelExpenses.jsx
// Expense entry form + shopping cart (second column).
// Manual mode + OCR mode (UI stub — POINT 6).
// Requires: npm install react-datepicker date-fns
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { AppDatePicker, todayLocal, toYMD } from "../ui/AppDatePicker";

import { useAppContext }      from "../../context/AppContext";
import { useTransactions }    from "../../hooks/useTransactions";
import { useToast }           from "../../hooks/useToast";
import { theme as s }         from "../../styles/theme";
import { fmt, parseDecimal }  from "../../utils/helpers";
import { SubcategorySelect }  from "../ui/SubcategorySelect";
import { PriorityPicker }     from "../ui/PriorityPicker";
import { CurrencyRateField }  from "../ui/CurrencyRateField";
import { CartPanel }          from "./CartPanel";
import { useMonthStatus }     from "../../hooks/useMonthStatus";


// ── Helpers ─────────────────────────────────────────────────────

// Extracts YYYY-MM from a YYYY-MM-DD string
const budgetMonthOf = (ymd) => ymd.slice(0, 7);

// Generates a unique cart item ID
let cartIdCounter = 0;
const newCartId   = () => `cart_${Date.now()}_${++cartIdCounter}`;

function emptyForm() {
  return {
    date:            todayLocal(),   // local Date object for DatePicker
    currency:        "PLN",
    customCurrency:  "",
    amountOrig:      "",
    subcategoryId:   "",
    subcategoryName: "",
    categoryId:      "",
    categoryName:    "",
    priority:        2,
    description:     "",
    tags:            [],
    useVoucher:      false,
    voucherAmount:   "",
  };
}

// ── Styles ─────────────────────────────────────────────────────

const lbl     = { display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 };
const inp     = { width: "100%", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0", padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" };
const row     = { marginBottom: 16 };
const divider = { borderTop: "1px solid #1e293b", margin: "20px 0" };

// ── Component ──────────────────────────────────────────────────

export default function PanelExpenses() {
  const { tags, cart, setCart, ocrMode, setOcrMode, ocrLines, setOcrLines, ocrLoading, fileRef, month, year } = useAppContext();
  const { addTransaction, isSaving, errorMsg, successMsg } = useTransactions();
  const { showError } = useToast();
  const { isActiveMonthClosed, isFutureMonth, activeBudgetMonth, openMonth } = useMonthStatus();

  const [form,     setForm]     = useState(emptyForm());
  const [rateInfo, setRateInfo] = useState({ activeRate: 1, resolvedCurrency: "PLN" });

  // Derive YYYY-MM-DD from the Date object in form.date (actual transaction date)
  const dateYMD = toYMD(form.date);

  // budgetMonth comes from MonthNavigator (month/year from AppContext),
  // NOT from the date picker — a transaction on Apr 29 can belong to May budget
  const budgetMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  const activeTags = useMemo(() => tags.filter(t => !t.isArchived), [tags]);

  // Amount in base currency (PLN)
  const amountPLN = useMemo(() => {
    const raw = parseDecimal(form.amountOrig);
    if (!raw || raw <= 0 || !rateInfo.activeRate) return 0;
    return Math.round(raw * rateInfo.activeRate * 100) / 100;
  }, [form.amountOrig, rateInfo.activeRate]);

  // Net cash after voucher deduction
  const netCash = useMemo(() => {
    if (!form.useVoucher) return amountPLN;
    return Math.max(0, amountPLN - (parseDecimal(form.voucherAmount) || 0));
  }, [amountPLN, form.useVoucher, form.voucherAmount]);

  // ── Handlers ────────────────────────────────────────────────

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm());
    setRateInfo({ activeRate: 1, resolvedCurrency: "PLN" });
  }

  const handleRateReady = useCallback(({ activeRate, resolvedCurrency }) => {
    setRateInfo({ activeRate, resolvedCurrency });
  }, []);

  const handleSubcategoryChange = useCallback(({ subcategoryId, subcategoryName, categoryId, categoryName }) => {
    setForm(prev => ({ ...prev, subcategoryId, subcategoryName, categoryId, categoryName }));
  }, []);

  function toggleTag(id) {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(id) ? prev.tags.filter(t => t !== id) : [...prev.tags, id],
    }));
  }

  function toggleVoucher() {
    setForm(prev => ({
      ...prev,
      useVoucher:    !prev.useVoucher,
      voucherAmount: !prev.useVoucher ? prev.voucherAmount : "",
    }));
  }

  // ── Build transaction payload from form ─────────────────────

  function buildPayload() {
    if (!form.subcategoryId)                              { showError("Wybierz subkategorię."); return null; }
    const rawAmount = parseDecimal(form.amountOrig);
    if (!rawAmount || rawAmount <= 0)                     { showError("Podaj kwotę większą od zera."); return null; }
    if (!rateInfo.activeRate || rateInfo.activeRate <= 0) { showError("Brak kursu walutowego. Wpisz kurs ręcznie."); return null; }
    if (rateInfo.resolvedCurrency.length !== 3)           { showError("Wybierz walutę (kod 3-literowy)."); return null; }

    // budgetMonth derived from the SELECTED date, not today
    return {
      date:             dateYMD,
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
      voucherAmount:    form.useVoucher ? (parseDecimal(form.voucherAmount) || 0) : 0,
      isRecurring:      false,
      recurringId:      null,
    };
  }

  // ── Add to cart ─────────────────────────────────────────────

  function handleAddToCart() {
    const payload = buildPayload();
    if (!payload) return;
    setCart(prev => [...prev, { ...payload, _cartId: newCartId() }]);
    resetForm();
  }

  // ── Save directly (bypass cart) ─────────────────────────────

  async function handleSubmitDirect() {
    const payload = buildPayload();
    if (!payload) return;
    const result = await addTransaction(payload);
    if (result) resetForm();
  }

  // ── Load cart item back into form ────────────────────────────

  function handleLoadFromCart(item) {
    // Restore Date object from YMD string
    const [y, m, d] = item.date.split("-").map(Number);
    setForm({
      date:            new Date(y, m - 1, d),
      currency:        item.originalCurrency,
      customCurrency:  "",
      amountOrig:      String(item.originalAmount),
      subcategoryId:   item.subcategoryId,
      subcategoryName: item.subcategoryName,
      categoryId:      item.categoryId,
      categoryName:    item.categoryName,
      priority:        item.priority,
      description:     item.description,
      tags:            item.tags || [],
      useVoucher:      item.useVoucher || false,
      voucherAmount:   item.voucherAmount ? String(item.voucherAmount) : "",
    });
  }

  // ── OCR submit ───────────────────────────────────────────────

  async function handleAddOcrLines() {
    const selected = ocrLines.filter(l => l.selected);
    if (!selected.length) { showError("Zaznacz przynajmniej jedną pozycję."); return; }

    for (const line of selected) {
      await addTransaction({
        date: dateYMD, budgetMonth,
        subcategoryId: line.subcategoryId || "", subcategoryName: line.sub || "",
        categoryId: line.categoryId || "", categoryName: line.category || "",
        amount: line.amount, originalAmount: line.amount,
        originalCurrency: "PLN", fxRate: 1,
        description: line.desc || "", tags: [], priority: 2,
        useVoucher: false, voucherAmount: 0,
        isRecurring: false, recurringId: null,
      });
    }
    setOcrLines([]);
    setOcrMode(false);
  }

  // ── Render ───────────────────────────────────────────────────

  const hasCart = cart.length > 0;

  // ── Month block banners ──────────────────────────────────
  if (isActiveMonthClosed) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 20, marginTop: 8 }}>
          <div style={s.sectionTitle}>➕ Dodaj wydatek</div>
        </div>
        <div style={{ padding: "20px 24px", background: "#ef444411", border: "1px solid #ef444444", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            Miesiąc {activeBudgetMonth} jest zamknięty
          </div>
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
            Nie można dodawać ani edytować transakcji w zamkniętym miesiącu.
          </div>
          <button
            onClick={() => openMonth(activeBudgetMonth)}
            style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #f87171", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🔓 Otwórz miesiąc ponownie
          </button>
        </div>
      </div>
    );
  }

  if (isFutureMonth) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 20, marginTop: 8 }}>
          <div style={s.sectionTitle}>➕ Dodaj wydatek</div>
        </div>
        <div style={{ padding: "20px 24px", background: "#3b82f611", border: "1px solid #3b82f644", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
          <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            {activeBudgetMonth} to zbyt odległa przyszłość
          </div>
          <div style={{ color: "#64748b", fontSize: 13 }}>
            Możesz dodawać transakcje do bieżącego i następnego miesiąca.<br />
            Dla planowanych wydatków użyj panelu <strong style={{ color: "#93c5fd" }}>Planowane wydatki</strong>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display:    "flex",
      gap:        24,
      alignItems: "flex-start",
      maxWidth:   hasCart ? 960 : 560,
      transition: "max-width 0.3s ease",
    }}>

      {/* ════ FORM ════ */}
      <div style={{ flex: "0 0 520px", minWidth: 0 }}>

        <div style={{ marginBottom: 20, marginTop: 8 }}>
          <div style={s.sectionTitle}>➕ Dodaj wydatek</div>
        </div>

        {/* API feedback */}
        {errorMsg   && <div style={{ padding: "10px 14px", background: "#ef444422", border: "1px solid #ef4444", color: "#f87171", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{errorMsg}</div>}
        {successMsg && <div style={{ padding: "10px 14px", background: "#10b98122", border: "1px solid #10b981", color: "#34d399", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{successMsg}</div>}

        {/* Toggle manual / OCR */}
        <div style={{ display: "flex", gap: 8, padding: 6, background: "#0d1424", border: "1px solid #1e293b", borderRadius: 10, marginBottom: 24 }}>
          <button onClick={() => setOcrMode(false)}
            style={{ flex: 1, padding: "9px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: !ocrMode ? "#10b981" : "transparent", color: !ocrMode ? "#fff" : "#64748b" }}>
            ✏️ Ręcznie
          </button>
          <button onClick={() => { setOcrMode(true); setOcrLines([]); }}
            style={{ flex: 1, padding: "9px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: ocrMode ? "#10b981" : "transparent", color: ocrMode ? "#fff" : "#64748b" }}>
            📷 Skan paragonu
          </button>
        </div>

        {/* ════ OCR MODE ════ */}
        {ocrMode && (
          <>
            {ocrLines.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>📷</div>
                <div style={{ color: "#64748b", marginBottom: 20, fontSize: 14 }}>Zrób zdjęcie paragonu lub wybierz z galerii</div>
                {/* POINT 6: wire up real OCR API here */}
                <input ref={fileRef} type="file" accept="image/*" capture="environment"
                  style={{ display: "none" }} onChange={() => { /* POINT 6 */ }} />
                <button onClick={() => fileRef.current?.click()}
                  style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
                  📷 Zrób zdjęcie
                </button>
                <button onClick={() => fileRef.current?.click()}
                  style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  🖼️ Wybierz z galerii
                </button>
                {ocrLoading && <div style={{ marginTop: 24, color: "#10b981", fontWeight: 700 }}>🤖 AI analizuje paragon…</div>}
              </div>
            ) : (
              <>
                <div style={{ color: "#10b981", fontWeight: 700, marginBottom: 12 }}>✅ Znalezione pozycje:</div>
                {ocrLines.map((line, i) => (
                  <div key={i} style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" checked={line.selected}
                        onChange={e => { const next = [...ocrLines]; next[i] = { ...next[i], selected: e.target.checked }; setOcrLines(next); }}
                        style={{ width: 18, height: 18, accentColor: "#10b981" }} />
                      <div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{line.desc}</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>{line.category} › {line.sub}</div>
                      </div>
                    </div>
                    <div style={{ color: "#10b981", fontWeight: 700 }}>{fmt(line.amount)}</div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #1e293b", marginBottom: 12 }}>
                  <span style={{ color: "#64748b" }}>Suma:</span>
                  <span style={{ color: "#10b981", fontWeight: 800, fontSize: 18 }}>
                    {fmt(ocrLines.filter(l => l.selected).reduce((sum, l) => sum + l.amount, 0))}
                  </span>
                </div>
                <button onClick={handleAddOcrLines} disabled={isSaving}
                  style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
                  {isSaving ? "⏳ Zapisywanie…" : "✅ Dodaj zaznaczone"}
                </button>
                <button onClick={() => setOcrLines([])}
                  style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#334155", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  🔄 Skanuj ponownie
                </button>
              </>
            )}
          </>
        )}

        {/* ════ MANUAL MODE ════ */}
        {!ocrMode && (
          <>
            {/* Date */}
            <div style={row}>
              <label style={lbl}>Data</label>
              <AppDatePicker
                value={form.date}
                onChange={date => set("date", date)}
              />
              {/* Show active budget month from navigator so user can verify */}
              <div style={{ fontSize: 11, color: "#10b98199", marginTop: 4 }}>
                Miesiąc budżetowy: <strong>{budgetMonth}</strong> (z nawigacji)
              </div>
            </div>

            {/* Currency + rate */}
            <div style={row}>
              <CurrencyRateField
                currency={form.currency} customCurrency={form.customCurrency}
                date={dateYMD}
                onCurrencyChange={v => set("currency", v)}
                onCustomChange={v => set("customCurrency", v)}
                onRateReady={handleRateReady}
              />
            </div>

            {/* Amount */}
            <div style={row}>
              <label style={lbl}>Kwota ({rateInfo.resolvedCurrency || "PLN"})</label>
              <input type="number" step="0.01" min="0"
                value={form.amountOrig}
                onChange={e => set("amountOrig", e.target.value)}
                placeholder="0,00" style={inp}
              />
              {amountPLN > 0 && rateInfo.resolvedCurrency !== "PLN" && (
                <div style={{ fontSize: 12, color: "#10b981", marginTop: 5 }}>= <strong>{fmt(amountPLN)}</strong></div>
              )}
            </div>

            {/* Voucher */}
            <div style={row}>
              <button onClick={toggleVoucher}
                style={{ padding: "5px 14px", borderRadius: 20, border: "1px solid #1e293b", background: form.useVoucher ? "#a855f722" : "transparent", color: form.useVoucher ? "#a855f7" : "#475569", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                🎫 {form.useVoucher ? "Voucher aktywny" : "Użyj vouchera / bonu"}
              </button>
              {form.useVoucher && (
                <div style={{ marginTop: 10 }}>
                  <label style={lbl}>Kwota bonu (PLN)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.voucherAmount} onChange={e => set("voucherAmount", e.target.value)}
                    placeholder="0,00" style={{ ...inp, maxWidth: 180 }} />
                  {amountPLN > 0 && (
                    <div style={{ fontSize: 12, color: "#a855f7", marginTop: 5 }}>
                      Realna gotówka: <strong>{fmt(netCash)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={divider} />

            {/* Subcategory */}
            <div style={row}>
              <label style={lbl}>Subkategoria</label>
              <SubcategorySelect value={form.subcategoryId} onChange={handleSubcategoryChange} />
              {form.categoryName && <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>{form.categoryName}</div>}
            </div>

            {/* Priority */}
            <div style={row}>
              <PriorityPicker
                value={form.priority}
                onChange={v => set("priority", v)}
                subcategoryId={form.subcategoryId}
              />
            </div>

            <div style={divider} />

            {/* Description */}
            <div style={row}>
              <label style={lbl}>Opis (opcjonalny)</label>
              <input value={form.description} onChange={e => set("description", e.target.value)}
                placeholder="np. Żabka – zakupy weekendowe" maxLength={500} style={inp} />
            </div>

            {/* Tags */}
            {activeTags.length > 0 && (
              <div style={row}>
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

            <div style={divider} />

            {/* ── Action buttons ── */}
            <div style={{ display: "flex", gap: 8 }}>
              {/* Add to cart — primary action */}
              <button onClick={handleAddToCart}
                style={{ flex: 1, padding: "13px 16px", borderRadius: 10, border: "none", background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                🛒 Do koszyka
              </button>

              {/* Save directly — quick action */}
              <button onClick={handleSubmitDirect} disabled={isSaving}
                style={{ flex: 1, padding: "13px 16px", borderRadius: 10, border: "none", background: isSaving ? "#064e3b" : "#10b981", color: "#fff", fontSize: 14, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer" }}>
                {isSaving ? "⏳" : "➕ Dodaj teraz"}
              </button>

              {/* Clear form */}
              <button onClick={resetForm}
                style={{ padding: "13px 14px", borderRadius: 10, border: "1px solid #1e293b", background: "transparent", color: "#475569", cursor: "pointer", fontSize: 13 }}>
                ✕
              </button>
            </div>
          </>
        )}
      </div>

      {/* ════ CART — appears when cart.length > 0 ════ */}
      {hasCart && (
        <div style={{ flex: 1, minWidth: 0, position: "sticky", top: 20 }}>
          <CartPanel onLoadToForm={handleLoadFromCart} />
        </div>
      )}


    </div>
  );
}