// ============================================================
// File: src/components/panels/CartPanel.tsx
// Shopping cart — appears dynamically when cart.length > 0.
// Desktop: second column next to the form.
// Mobile: sticky bar at the bottom, expandable on tap.
//
// Changes vs .jsx:
//   - Full TypeScript types
//   - Fix: handleLoadToForm no longer removes item from cart
//     (was causing merged items to disappear on edit)
// ============================================================

import { useState, useCallback, useMemo, useEffect } from "react";
import { useAppContext }    from "../../../context/AppContext";
import { useTransactions }  from "../../../hooks/useTransactions";
import { useVouchers }      from "../../../hooks/useVouchers";
import { useToast }         from "../../../hooks/useToast";
import { fmt, round2 }      from "../../../utils/helpers";
import { PRIORITY_COLORS }  from "../../ui/PriorityPicker";
import { VoucherSection }   from "./VoucherSection";
import type { TransactionPayload, VoucherAllocation } from "../../../types/transaction";

// ── Types ─────────────────────────────────────────────────────

export interface CartItem extends TransactionPayload {
  _cartId:       string;
  _allCartIds?:  string[];
  _mergedCount?: number;
  // ── OCR-only fields (informational, stripped before save) ──
  _ocrGross?:       number;  // price before receipt discounts
  _ocrDiscount?:    number;  // merged discount amount
  _ocrMergeNote?:   string;  // e.g. "2x 6,99 + rabat -6,99"
  _ocrReceiptPath?: string;  // blob path of the archived receipt photo
  _ocrReceiptId?:   string;  // Receipt entity id (links tx → receipt)
  _ocrMerchant?:    string;  // shop name (for per-merchant filtering)
  _ocrWarranty?:    boolean; // receipt flagged as warranty → longer retention
  _ocrNeedsReview?: boolean; // AI was unsure — keep flagged in cart until edited
  _lineItems?:      Array<{ description: string; amount: number; originalAmount?: number; originalCurrency?: string }>;
}

interface CartPanelProps {
  onLoadToForm:   (item: CartItem) => void;
  onSaveComplete?: () => void;
}

type ItemStatus = "pending" | "saving" | "done" | "error";

const STATUS: Record<string, ItemStatus> = {
  PENDING: "pending",
  SAVING:  "saving",
  DONE:    "done",
  ERROR:   "error",
};

// ── Cart aggregation ──────────────────────────────────────────
// Two items are mergeable when they share: subcategoryId, priority,
// tags (sorted), originalCurrency, fxRate, useVoucher, voucherId.

function aggregationKey(item: CartItem): string {
  const tags = [...(item.tags || [])].sort().join(",");
  return [
    item.subcategoryId,
    item.priority,
    tags,
    item.originalCurrency,
    String(item.fxRate),
    String(item.useVoucher),
    item.voucherId || "",
  ].join("|");
}

export function aggregateCart(items: CartItem[]): CartItem[] {
  const groups = new Map<string, CartItem>();
  for (const item of items) {
    const key = aggregationKey(item);
    const line = {
      description:      item.description || "",
      amount:          item.amount,                       // PLN
      originalAmount:  item.originalAmount ?? item.amount,
      originalCurrency: item.originalCurrency || "PLN",
    };
    if (groups.has(key)) {
      const existing = groups.get(key)!;
      existing.amount         = Math.round((existing.amount + item.amount) * 100) / 100;
      existing.originalAmount = Math.round((existing.originalAmount + item.originalAmount) * 100) / 100;
      const existingNet = existing.netAmount ?? (existing.useVoucher ? Math.max(0, existing.amount - (existing.voucherAmount || 0)) : existing.amount);
      const itemNet     = item.netAmount     ?? (item.useVoucher     ? Math.max(0, item.amount     - (item.voucherAmount     || 0)) : item.amount);
      existing.netAmount = Math.round((existingNet + itemNet) * 100) / 100;
      if (item.useVoucher) {
        existing.voucherAmount = Math.round(((existing.voucherAmount || 0) + (item.voucherAmount || 0)) * 100) / 100;
      }
      if (item.description && item.description !== existing.description) {
        existing.description = existing.description
          ? `${existing.description}, ${item.description}`
          : item.description;
      }
      if (item.date < existing.date) existing.date = item.date;
      existing._allCartIds  = [...(existing._allCartIds || [existing._cartId]), item._cartId];
      existing._mergedCount = (existing._mergedCount || 1) + 1;
      existing._lineItems   = [...(existing._lineItems || []), line];
    } else {
      // Seed _lineItems with this first contribution — finalized below
      // (singletons get it stripped, merges keep it).
      groups.set(key, { ...item, _mergedCount: 1, _allCartIds: [item._cartId], _lineItems: [line] });
    }
  }
  // Singletons don't need lineItems (description+amount of the tx itself
  // already say everything). Keep the array only for true merges.
  return Array.from(groups.values()).map(g =>
    (g._mergedCount || 1) > 1 ? g : (() => { const { _lineItems, ...rest } = g; return rest as CartItem; })()
  );
}

// Strip cart-only / _ocr* fields → API payload. Receipt link + merchant +
// warranty + merge breakdown survive as real (optional) payload fields.
function toPayload(item: CartItem): TransactionPayload {
  const {
    _cartId, _allCartIds, _mergedCount, _ocrGross, _ocrDiscount, _ocrMergeNote,
    _ocrReceiptPath, _ocrReceiptId, _ocrMerchant, _ocrWarranty, _ocrNeedsReview,
    _lineItems, ...payload
  } = item;
  if (_ocrReceiptPath) payload.receiptBlobPath = _ocrReceiptPath;
  if (_ocrReceiptId)   payload.receiptId       = _ocrReceiptId;
  if (_ocrMerchant)    payload.merchant         = _ocrMerchant;
  if (_ocrWarranty)    payload.isWarranty       = true;
  if (_lineItems && _lineItems.length > 1) payload.lineItems = _lineItems;
  return payload as TransactionPayload;
}

// ── Component ─────────────────────────────────────────────────

export function CartPanel({ onLoadToForm, onSaveComplete }: CartPanelProps) {
  const { cart, setCart } = useAppContext() as {
    cart:    CartItem[];
    setCart: (v: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  };
  const { addTransaction, addTransactionBatch } = useTransactions() as {
    addTransaction:      (p: TransactionPayload) => Promise<unknown>;
    addTransactionBatch: (b: { transactions: TransactionPayload[]; voucherIds: string[] }) => Promise<unknown[] | null>;
  };
  const { showSuccess, showError, showInfo } = useToast() as {
    showSuccess: (m: string) => void;
    showError:   (m: string) => void;
    showInfo:    (m: string) => void;
  };

  const [statuses,   setStatuses]   = useState<Record<string, ItemStatus>>({});
  const [saving,     setSaving]     = useState(false);

  // ── Cart-level vouchers ────────────────────────────────────
  // Vouchers apply to the WHOLE cart (per decyzja 2); the backend /batch
  // endpoint splits them proportionally across the resulting transactions.
  const { vouchers: cartVouchers } = useVouchers(cart);
  const [cartAllocations, setCartAllocations] = useState<VoucherAllocation[]>([]);
  const [voucherOpen, setVoucherOpen] = useState(false);

  // A cart voucher needs EVERY line to be from its shop. So we only offer a
  // shop to the voucher selector when all lines share one non-empty shop;
  // any no-shop line or a different shop disqualifies shop-tied vouchers
  // (a transaction without a shop is fine — it just means no voucher here).
  const cartMerchant = useMemo(() => {
    const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
    const shops = cart.map(i => norm(i.merchant || i._ocrMerchant));
    const first = shops[0] ?? "";
    if (first === "" || shops.some(s => s !== first)) return "";
    return (cart[0].merchant || cart[0]._ocrMerchant || "") as string;
  }, [cart]);

  // Vouchers actually usable here = those whose store matches the (consistent)
  // cart shop. Empty/mixed shop → none → the section is hidden entirely.
  const eligibleCartVouchers = useMemo(() => {
    const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
    const m = norm(cartMerchant);
    return m === "" ? [] : cartVouchers.filter(v => norm(v.store) === m);
  }, [cartVouchers, cartMerchant]);

  // ── Derived totals ─────────────────────────────────────────

  const totalGross   = cart.reduce((s, i) => s + (i.amount || 0), 0);
  const totalVoucher = round2(cartAllocations.reduce((s, a) => s + (a.amount || 0), 0));
  const totalNet     = Math.max(0, round2(totalGross - totalVoucher));
  const hasVouchers  = totalVoucher > 0;
  const errorCount   = Object.values(statuses).filter(s => s === STATUS.ERROR).length;

  // Re-derive/clamp cart vouchers when the cart total changes: percent
  // vouchers recompute from the new gross, fixed ones stay within budget.
  useEffect(() => {
    if (!cartAllocations.length) return;
    let budget = totalGross;
    const next = cartAllocations.map(a => {
      const v = cartVouchers.find(x => x.id === a.voucherId);
      let val = a.amount;
      if (v && v.valueType === "percent") val = round2(totalGross * (v.percentValue || 0) / 100);
      val = round2(Math.min(val, budget));
      budget = Math.max(0, round2(budget - val));
      return { ...a, amount: val };
    });
    if (JSON.stringify(next) !== JSON.stringify(cartAllocations)) setCartAllocations(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalGross]);

  function setStatus(id: string, status: ItemStatus) {
    setStatuses(prev => ({ ...prev, [id]: status }));
  }

  function removeFromCart(id: string) {
    setCart(prev => prev.filter(i => i._cartId !== id));
    setStatuses(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  // Fix: do NOT remove from cart here — PanelExpenses handles
  // replacement after save/cancel. Removing here caused merged
  // items (_allCartIds) to disappear before the edit was applied.
  function handleLoadToForm(item: CartItem) {
    onLoadToForm(item);
  }

  // ── Save all ──────────────────────────────────────────────

  const saveAll = useCallback(async () => {
    const pending = aggregateCart(cart.filter(i => statuses[i._cartId] !== STATUS.DONE));
    if (!pending.length) return;

    // Local pre-check: every line needs a category (backend would 400 anyway).
    const invalid = pending.find(i => !i.subcategoryId || !i.categoryId);
    if (invalid) {
      (invalid._allCartIds || [invalid._cartId]).forEach(id => setStatus(id, STATUS.ERROR));
      showError(`"${invalid.description || "Pozycja"}" nie ma kategorii — edytuj ją (✏️) przed zapisem.`);
      return;
    }

    const noun = (n: number) => (n === 1 ? "pozycję" : n < 5 ? "pozycje" : "pozycji");
    const voucherIds = cartAllocations.map(a => a.voucherId);
    setSaving(true);

    // ── Batch path: cart-level vouchers → atomic /batch with split ──
    if (voucherIds.length > 0) {
      pending.forEach(item => (item._allCartIds || [item._cartId]).forEach(id => setStatus(id, STATUS.SAVING)));
      const result = await addTransactionBatch({ transactions: pending.map(toPayload), voucherIds });
      setSaving(false);

      const allIds = pending.flatMap(i => i._allCartIds || [i._cartId]);
      if (result) {
        allIds.forEach(id => setStatus(id, STATUS.DONE));
        showSuccess(`Zapisano ${pending.length} ${noun(pending.length)}! ✅`);
        setCartAllocations([]);
        setVoucherOpen(false);
        setTimeout(() => {
          setCart(prev => prev.filter(i => !allIds.includes(i._cartId)));
          setStatuses(prev => { const n = { ...prev }; allIds.forEach(id => delete n[id]); return n; });
          onSaveComplete?.();
        }, 1200);
      } else {
        allIds.forEach(id => setStatus(id, STATUS.ERROR));   // hook already toasted
      }
      return;
    }

    // ── No vouchers: per-item sequential save (preserves partial success) ──
    const savedIds: string[] = [];
    for (const item of pending) {
      setStatus(item._cartId, STATUS.SAVING);
      try {
        const result = await addTransaction(toPayload(item));
        const ids = item._allCartIds || [item._cartId];
        if (result) { ids.forEach(id => setStatus(id, STATUS.DONE));  savedIds.push(...ids); }
        else        { ids.forEach(id => setStatus(id, STATUS.ERROR)); }
      } catch {
        setStatus(item._cartId, STATUS.ERROR);
      }
    }
    setSaving(false);

    const savedTxCount = pending.filter(item =>
      (item._allCartIds || [item._cartId]).some(id => savedIds.includes(id))
    ).length;
    const failTxCount = pending.length - savedTxCount;

    if (failTxCount === 0)       showSuccess(`Zapisano ${savedTxCount} ${noun(savedTxCount)}! ✅`);
    else if (savedTxCount === 0) showError("Nie udało się zapisać żadnej pozycji. Sprawdź połączenie.");
    else                         showInfo(`Zapisano ${savedTxCount} z ${pending.length} pozycji. ${failTxCount} nie udało się.`);

    setTimeout(() => {
      setCart(prev => prev.filter(i => !savedIds.includes(i._cartId)));
      setStatuses(prev => { const n = { ...prev }; savedIds.forEach(id => delete n[id]); return n; });
      if (savedTxCount > 0) onSaveComplete?.();
    }, 1200);
  }, [cart, statuses, cartAllocations, addTransaction, addTransactionBatch, setCart, showSuccess, showError, showInfo, onSaveComplete]);

  if (cart.length === 0) return null;

  //const displayItems = aggregateCart(cart.filter(i => statuses[i._cartId] !== STATUS.DONE));
  // Aggregate done items too — merged items should show as one ✅ row, not N rows
  //const doneItems    = aggregateCart(cart.filter(i => statuses[i._cartId] === STATUS.DONE));
  const displayItems = cart.filter(i => statuses[i._cartId] !== STATUS.DONE);
  const doneItems    = cart.filter(i => statuses[i._cartId] === STATUS.DONE);
  const allDisplay   = [...displayItems, ...doneItems];

  // ── Cart content (shared between desktop and mobile) ──────

  const cartContent = (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15 }}>🛒 Koszyk</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            {cart.length} {cart.length === 1 ? "pozycja" : cart.length < 5 ? "pozycje" : "pozycji"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {hasVouchers ? (
            <>
              <div style={{ fontSize: 11, color: "#64748b", textDecoration: "line-through" }}>{fmt(totalGross)}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{fmt(totalNet)}</div>
              <div style={{ fontSize: 11, color: "#a855f7" }}>🎫 bon: {fmt(totalVoucher)}</div>
            </>
          ) : (
            <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{fmt(totalGross)}</div>
          )}
          {errorCount > 0 && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>
              {errorCount} błąd{errorCount > 1 ? "y" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Item list — capped height with scroll on desktop (OCR can add
          15+ items at once); mobile scrolls the page naturally */}
      <div className="cart-item-list" style={{ marginBottom: 12 }}>
        {allDisplay.map(item => {
          const status = statuses[item._cartId] || STATUS.PENDING;
          const pColor = (PRIORITY_COLORS as Record<number, string>)[item.priority] || "#64748b";
          const itemNet = item.useVoucher && item.voucherAmount > 0
            ? Math.max(0, item.amount - item.voucherAmount)
            : item.amount;

          return (
            <div key={item._cartId} style={{
              background:   "#1e293b",
              borderRadius: 8,
              padding:      "10px 12px",
              marginBottom: 8,
              opacity:      status === STATUS.DONE ? 0.5 : 1,
              border:       status === STATUS.ERROR ? "1px solid #ef444444"
                            : (item._ocrNeedsReview && status !== STATUS.DONE) ? "1px solid #f59e0b66"
                            : "1px solid transparent",
            }}>
              {/* Row 1: name + amount + status icon */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: item.subcategoryId ? "#e2e8f0" : "#ef4444", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.subcategoryId
                      ? `${item.categoryName} › ${item.subcategoryName}`
                      : "❓ Wybierz kategorię (✏️)"}
                  </div>
                  {item.description && (
                    <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{item.description}</div>
                  )}
                  {item._ocrDiscount != null && item._ocrDiscount > 0 && (
                    <div style={{ color: "#f59e0b", fontSize: 10, marginTop: 2 }}>
                      🏷️ rabat −{fmt(item._ocrDiscount)}
                      {item._ocrGross != null && <span style={{ color: "#92710a" }}> (z {fmt(item._ocrGross)})</span>}
                    </div>
                  )}
                  {item._ocrNeedsReview && status !== STATUS.DONE && (
                    <div style={{ color: "#f59e0b", fontSize: 10, marginTop: 2, fontWeight: 600 }}>
                      ⚠️ AI niepewne — sprawdź kategorię (✏️)
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  {item.useVoucher && item.voucherAmount > 0 ? (
                    <>
                      <div style={{ fontSize: 11, color: "#64748b", textDecoration: "line-through" }}>{fmt(item.amount)}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{fmt(itemNet)} zł</div>
                      <div style={{ fontSize: 10, color: "#a855f7" }}>🎫 {fmt(item.voucherAmount)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{fmt(item.amount)} zł</div>
                  )}
                  <span style={{ fontSize: 12 }}>
                    {status === STATUS.SAVING ? "⏳" : status === STATUS.DONE ? "✅" : status === STATUS.ERROR ? "❌" : ""}
                  </span>
                </div>
              </div>

              {/* Row 2: meta + action buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: pColor, fontWeight: 700, border: `1px solid ${pColor}`, borderRadius: 4, padding: "1px 5px" }}>
                    P{item.priority}
                  </span>
                  <span style={{ fontSize: 10, color: "#334155" }}>{item.date}</span>
                  {item.originalCurrency !== "PLN" && (
                    <span style={{ fontSize: 10, color: "#475569" }}>
                      {item.originalAmount} {item.originalCurrency}
                    </span>
                  )}
                  {/*{(item._mergedCount ?? 1) > 1 && (
                    <span style={{ fontSize: 10, color: "#475569" }}>×{item._mergedCount}</span>
                  )}*/}
                </div>
                {status !== STATUS.DONE && status !== STATUS.SAVING && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => handleLoadToForm(item)}
                      title="Edit"
                      style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => removeFromCart(item._cartId)}
                      title="Remove from cart"
                      style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart-level vouchers — applied to the whole cart, split on save */}
      {eligibleCartVouchers.length > 0 && (
        <VoucherSection
          vouchers={cartVouchers}
          merchant={cartMerchant}
          isLoading={false}
          isOpen={voucherOpen}
          onToggle={() => { setVoucherOpen(o => !o); if (voucherOpen) setCartAllocations([]); }}
          allocations={cartAllocations}
          amountPLN={totalGross}
          onChange={setCartAllocations}
        />
      )}

      {/* Actions */}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12 }}>
        {hasVouchers && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "#a855f711", borderRadius: 6 }}>
            <span style={{ color: "#64748b" }}>Koszyk: {fmt(totalGross)} · Gotówka: {fmt(totalNet)} · Bon: {fmt(totalVoucher)}</span>
            <span style={{ color: "#a855f7" }}>🎫</span>
          </div>
        )}
        <button
          onClick={saveAll}
          disabled={saving || cart.every(i => statuses[i._cartId] === STATUS.DONE)}
          style={{ display: "block", width: "100%", padding: "12px", borderRadius: 10, border: "none", background: saving ? "#064e3b" : "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", marginBottom: 8 }}
        >
          {saving ? "⏳ Zapisuję…" : "💾 Zapisz wszystko"}
        </button>
        <button
          onClick={() => setCart([])}
          disabled={saving}
          style={{ display: "block", width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 12, cursor: saving ? "not-allowed" : "pointer" }}
        >
          Wyczyść koszyk
        </button>
      </div>
    </div>
  );
  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{
      background: "#0d1424",
      border: "1px solid #1e293b",
      borderRadius: 14,
      padding: 16,
    }}>
      {cartContent}
      <style>{`
        @media (min-width: 701px) {
          .cart-item-list { max-height: 420px; overflow-y: auto; overflow-x: hidden; }
        }
      `}</style>
    </div>
  );
}