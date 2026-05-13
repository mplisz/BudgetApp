// ============================================================
// File: frontend/src/components/panels/PanelExpenses.jsx
// ============================================================

import { useState, useRef } from "react";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { theme as s }      from "../../styles/theme";
import { fmt }             from "../../utils/helpers";
import { CartPanel }       from "./CartPanel";
import { TransactionForm, emptyFormValues } from "./transactionComponents/TransactionForm";

let cartIdCounter = 0;
const newCartId = () => `cart_${Date.now()}_${++cartIdCounter}`;

export default function PanelExpenses() {
  const { cart, setCart, ocrLines, setOcrLines, ocrLoading, setOcrLoading, month, year } = useAppContext();
  const { addTransaction, isSaving, errorMsg, successMsg } = useTransactions();
  const { isActiveMonthClosed, activeBudgetMonth, isFutureMonth } = useMonthStatus();

  const budgetMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const fileRef = useRef();

  const [ocrMode,         setOcrMode]         = useState(false);
  const [formKey,         setFormKey]         = useState(0);
  const [editingCartItem, setEditingCartItem] = useState(null);

  const hasCart = cart.length > 0;

  function resetForm() {
    setFormKey(k => k + 1);
    setEditingCartItem(null);
  }

  // Refresh voucher dropdown after cart save completes
  function handleCartSaveComplete() {
    setFormKey(k => k + 1);
  }

  // ── Cart actions ──────────────────────────────────────────

  function handleAddToCart(payload) {
    setCart(prev => [...prev, { ...payload, _cartId: newCartId() }]);
    resetForm();
  }

  async function handleSubmitDirect(payload) {
    const result = await addTransaction(payload);
    if (result) resetForm();
  }

  function handleLoadFromCart(item) {
    setEditingCartItem(item);
    setFormKey(k => k + 1);
    setOcrMode(false);
  }

  async function handleCartItemSave(payload) {
    setCart(prev => prev.map(i =>
      i._cartId === editingCartItem._cartId
        ? { ...payload, _cartId: editingCartItem._cartId }
        : i
    ));
    resetForm();
  }

  // ── OCR ───────────────────────────────────────────────────

  async function handleAddOcrLines() {
    const selected = ocrLines.filter(l => l.selected);
    if (!selected.length) return;
    for (const line of selected) {
      await addTransaction({
        date:             new Date().toISOString().slice(0, 10),
        budgetMonth,
        subcategoryId:    line.subcategoryId   || "",
        subcategoryName:  line.sub             || line.subcategoryName || "",
        categoryId:       line.categoryId      || "",
        categoryName:     line.category        || line.categoryName    || "",
        amount:           line.amount,
        originalAmount:   line.amount,
        originalCurrency: "PLN",
        fxRate:           1,
        description:      line.desc || "",
        tags:             [],
        priority:         line.priority || 2,
        useVoucher:       false,
        voucherAmount:    0,
        isRecurring:      false,
        recurringId:      null,
      });
    }
    setOcrLines([]);
    setOcrMode(false);
  }

  // ── Form initial values ───────────────────────────────────

  const formInitialValues = editingCartItem
    ? (() => {
        const [y, m, d] = editingCartItem.date.split("-").map(Number);
        return {
          date:            new Date(y, m - 1, d),
          currency:        editingCartItem.originalCurrency,
          customCurrency:  "",
          amountOrig:      String(editingCartItem.originalAmount),
          subcategoryId:   editingCartItem.subcategoryId,
          subcategoryName: editingCartItem.subcategoryName,
          categoryId:      editingCartItem.categoryId,
          categoryName:    editingCartItem.categoryName,
          priority:        editingCartItem.priority,
          description:     editingCartItem.description,
          tags:            editingCartItem.tags || [],
          useVoucher:      editingCartItem.useVoucher || false,
          voucherId:       editingCartItem.voucherId  || "",
          voucherAmount:   editingCartItem.voucherAmount ? String(editingCartItem.voucherAmount) : "",
        };
      })()
    : emptyFormValues();

  // ── Closed month guard ────────────────────────────────────

  if (isActiveMonthClosed) {
    return (
      <div style={{ ...s.panel, textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ color: "#64748b", fontSize: 15 }}>
          Miesiąc {activeBudgetMonth} jest zamknięty.
        </div>
      </div>
    );
  }

  if (isFutureMonth) {
    return (
      <div style={{ ...s.panel, textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ color: "#64748b", fontSize: 15, marginBottom: 8 }}>
          Ten miesiąc jest zbyt daleko w przyszłości.
        </div>
        <div style={{ color: "#475569", fontSize: 13 }}>
          Użyj planowanych wydatków do zaplanowania przyszłych miesięcy.
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <div className="expenses-layout">

        {/* ════ FORM COLUMN ════ */}
        <div className="expenses-form-col">

          <div style={{ marginBottom: 20, marginTop: 8 }}>
            <div style={s.sectionTitle}>
              {editingCartItem ? "✏️ Edytuj pozycję z koszyka" : "➕ Dodaj wydatek"}
            </div>
          </div>

          {errorMsg   && <div style={{ padding: "10px 14px", background: "#ef444422", border: "1px solid #ef4444",  color: "#f87171", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{errorMsg}</div>}
          {successMsg && <div style={{ padding: "10px 14px", background: "#10b98122", border: "1px solid #10b981", color: "#34d399", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{successMsg}</div>}

          {/* Toggle ręcznie / OCR — hidden when editing a cart item */}
          {!editingCartItem && (
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
          )}

          {/* ════ OCR MODE ════ */}
          {ocrMode && !editingCartItem && (
            <>
              {ocrLines.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>📷</div>
                  <div style={{ color: "#64748b", marginBottom: 20, fontSize: 14 }}>
                    Zrób zdjęcie paragonu lub wybierz z galerii
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment"
                    style={{ display: "none" }} onChange={() => {}} />
                  <button onClick={() => fileRef.current?.click()}
                    style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
                    📷 Zrób zdjęcie
                  </button>
                  <button onClick={() => fileRef.current?.click()}
                    style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    🖼️ Wybierz z galerii
                  </button>
                  {ocrLoading && (
                    <div style={{ marginTop: 24, color: "#10b981", fontWeight: 700 }}>
                      🤖 AI analizuje paragon…
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ color: "#10b981", fontWeight: 700, marginBottom: 12 }}>✅ Znalezione pozycje:</div>
                  {ocrLines.map((line, i) => (
                    <div key={i} style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input type="checkbox" checked={line.selected}
                          onChange={e => {
                            const next = [...ocrLines];
                            next[i] = { ...next[i], selected: e.target.checked };
                            setOcrLines(next);
                          }}
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
                    {isSaving ? "Zapisuję…" : `✅ Dodaj zaznaczone (${ocrLines.filter(l => l.selected).length})`}
                  </button>
                  <button onClick={() => setOcrLines([])}
                    style={{ display: "block", width: "100%", padding: 10, borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    🔄 Skanuj ponownie
                  </button>
                </>
              )}
            </>
          )}

          {/* ════ MANUAL MODE ════ */}
          {(!ocrMode || editingCartItem) && (
            <>
              <TransactionForm
                key={formKey}
                initialValues={formInitialValues}
                budgetMonth={budgetMonth}
                onSubmit={editingCartItem ? handleCartItemSave : handleSubmitDirect}
                onAddToCart={editingCartItem ? null : handleAddToCart}
                isSaving={isSaving}
                mode="add"
              />
              {editingCartItem && (
                <button onClick={resetForm}
                  style={{ marginTop: 8, background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12 }}>
                  ✕ Anuluj edycję koszyka
                </button>
              )}
            </>
          )}
        </div>

        {/* ════ CART COLUMN ════ */}
        {hasCart && (
          <div className="expenses-cart-col">
            <CartPanel
              onLoadToForm={handleLoadFromCart}
              onSaveComplete={handleCartSaveComplete}
            />
          </div>
        )}
      </div>

      <style>{`
        .expenses-layout { display: flex; gap: 24px; align-items: flex-start; }
        .expenses-form-col { flex: 0 0 520px; min-width: 0; }
        .expenses-cart-col { width: 340px; flex-shrink: 0; }
        @media (max-width: 700px) {
          .expenses-layout { flex-direction: column; gap: 0; }
          .expenses-form-col { flex: 1 1 auto; width: 100%; }
          .expenses-cart-col { display: none; }
        }
      `}</style>
    </>
  );
}