// ============================================================
// File: frontend/src/components/panels/CartPanel.jsx
// Shopping cart — appears dynamically when cart.length > 0.
// Desktop: second column next to the form.
// Mobile: sticky bar at the bottom, expandable on tap.
// ============================================================

import { useState, useCallback } from "react";
import { useAppContext }   from "../../context/AppContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useToast }        from "../../hooks/useToast";
import { fmt }             from "../../utils/helpers";
import { PRIORITY_COLORS } from "../ui/PriorityPicker";

const STATUS = { PENDING: "pending", SAVING: "saving", DONE: "done", ERROR: "error" };

// ── Cart aggregation ──────────────────────────────────────────
// Two items are mergeable when they share: subcategoryId, priority,
// tags (sorted), originalCurrency, fxRate, useVoucher, voucherId.
// Amounts are summed; descriptions are concatenated.

function aggregationKey(item) {
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

export function aggregateCart(items) {
  const groups = new Map();
  for (const item of items) {
    const key = aggregationKey(item);
    if (groups.has(key)) {
      const existing = groups.get(key);
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
    } else {
      groups.set(key, { ...item, _mergedCount: 1, _allCartIds: [item._cartId] });
    }
  }
  return Array.from(groups.values());
}

// ── Component ─────────────────────────────────────────────────

/**
 * Props:
 *   onLoadToForm    – fn(item) — loads a cart item back into the form
 *   onSaveComplete  – fn()    — called after all items saved successfully;
 *                               used by PanelExpenses to re-fetch voucher dropdown
 */
export function CartPanel({ onLoadToForm, onSaveComplete }) {
  const { cart, setCart }                    = useAppContext();
  const { addTransaction }                   = useTransactions();
  const { showSuccess, showError, showInfo } = useToast();
  const [statuses,   setStatuses]   = useState({});
  const [saving,     setSaving]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Derived totals ─────────────────────────────────────────
  const totalGross = cart.reduce((s, i) => s + (i.amount || 0), 0);
  const totalNet   = cart.reduce((s, i) =>
    s + (i.useVoucher && i.voucherAmount > 0
      ? Math.max(0, (i.amount || 0) - i.voucherAmount)
      : (i.amount || 0)),
    0);
  const totalVoucher = cart.reduce((s, i) => s + (i.useVoucher ? (i.voucherAmount || 0) : 0), 0);
  const hasVouchers  = totalVoucher > 0;
  const doneCount    = Object.values(statuses).filter(s => s === STATUS.DONE).length;
  const errorCount   = Object.values(statuses).filter(s => s === STATUS.ERROR).length;

  function setStatus(id, status) {
    setStatuses(prev => ({ ...prev, [id]: status }));
  }

  function removeFromCart(id) {
    setCart(prev => prev.filter(i => i._cartId !== id));
    setStatuses(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function handleLoadToForm(item) {
    if (onLoadToForm) onLoadToForm(item);
    removeFromCart(item._cartId);
  }

  // ── Save all ─────────────────────────────────────────────────

  const saveAll = useCallback(async () => {
    const pending = aggregateCart(cart.filter(i => statuses[i._cartId] !== STATUS.DONE));
    if (!pending.length) return;

    setSaving(true);

    const savedIds  = [];
    const failedIds = [];

    // Sequential — not parallel — to avoid race conditions on voucher documents
    // (concurrent writes to usedInTransactions would cause last-write-wins data loss)
    for (const item of pending) {
      setStatus(item._cartId, STATUS.SAVING);
      try {
        const { _cartId, _allCartIds, _mergedCount, ...payload } = item;
        const result = await addTransaction(payload);
        if (result) {
          const ids = item._allCartIds || [item._cartId];
          ids.forEach(id => setStatus(id, STATUS.DONE));
          savedIds.push(...ids);
        } else {
          const ids = item._allCartIds || [item._cartId];
          ids.forEach(id => setStatus(id, STATUS.ERROR));
          failedIds.push(...ids);
        }
      } catch {
        setStatus(item._cartId, STATUS.ERROR);
        failedIds.push(item._cartId);
      }
    }

    setSaving(false);

    const savedCount = savedIds.length;
    const failCount  = failedIds.length;

    if (failCount === 0) {
      showSuccess(`Zapisano ${savedCount} ${savedCount === 1 ? "pozycję" : savedCount < 5 ? "pozycje" : "pozycji"}! ✅`);
    } else if (savedCount === 0) {
      showError("Nie udało się zapisać żadnej pozycji. Sprawdź połączenie.");
    } else {
      showInfo(`Zapisano ${savedCount} z ${pending.length} pozycji. ${failCount} nie udało się.`);
    }

    // Remove saved items after short delay so user sees ✅
    setTimeout(() => {
      setCart(prev => prev.filter(i => !savedIds.includes(i._cartId)));
      setStatuses(prev => {
        const n = { ...prev };
        savedIds.forEach(id => delete n[id]);
        return n;
      });

      // Notify parent to refresh voucher dropdown
      if (savedCount > 0 && typeof onSaveComplete === "function") {
        onSaveComplete();
      }
    }, 1200);

  }, [cart, statuses, addTransaction, setCart, showSuccess, showError, showInfo, onSaveComplete]);

  if (cart.length === 0) return null;

  const displayItems = aggregateCart(cart.filter(i => statuses[i._cartId] !== STATUS.DONE));
  const doneItems    = cart.filter(i => statuses[i._cartId] === STATUS.DONE);
  const allDisplay   = [...displayItems, ...doneItems];

  // ── Shared cart content ───────────────────────────────────

  const cartContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

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

      {/* Item list */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
        {allDisplay.map((item) => {
          const status  = statuses[item._cartId] || STATUS.PENDING;
          const pColor  = PRIORITY_COLORS[item.priority] || "#64748b";
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
              border:       status === STATUS.ERROR ? "1px solid #ef444444" : "1px solid transparent",
            }}>
              {/* Row 1: name + amount + status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.categoryName} › {item.subcategoryName}
                  </div>
                  {item.description && (
                    <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{item.description}</div>
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

              {/* Row 2: meta + actions */}
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
                  {item._mergedCount > 1 && (
                    <span style={{ fontSize: 10, color: "#475569" }}>×{item._mergedCount}</span>
                  )}
                </div>
                {status !== STATUS.DONE && status !== STATUS.SAVING && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleLoadToForm(item)} title="Edytuj"
                      style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>
                      ✏️
                    </button>
                    <button onClick={() => removeFromCart(item._cartId)} title="Usuń z koszyka"
                      style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
          style={{ display: "block", width: "100%", padding: "12px", borderRadius: 10, border: "none", background: saving ? "#064e3b" : "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", marginBottom: 8 }}>
          {saving
            ? `⏳ Zapisuję… (${doneCount}/${cart.length})`
            : `💾 Zapisz wszystko (${cart.length})`}
        </button>
        <button
          onClick={() => { setCart([]); setStatuses({}); }}
          disabled={saving}
          style={{ display: "block", width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#475569", cursor: "pointer", fontSize: 12 }}>
          🗑️ Wyczyść koszyk
        </button>
      </div>
    </div>
  );

  // ── Mobile sticky bar ─────────────────────────────────────

  const mobileBar = (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: "#0d1424", borderTop: "1px solid #1e293b" }}>
      {!mobileOpen && (
        <div onClick={() => setMobileOpen(true)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🛒</span>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>
              {cart.length} pozycj{cart.length === 1 ? "a" : cart.length < 5 ? "e" : "i"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              {hasVouchers ? (
                <>
                  <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>{fmt(totalNet)}</span>
                  <span style={{ color: "#a855f7", fontSize: 11, marginLeft: 4 }}>🎫</span>
                </>
              ) : (
                <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>{fmt(totalGross)}</span>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); saveAll(); }} disabled={saving}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "⏳" : "💾 Zapisz"}
            </button>
          </div>
        </div>
      )}

      {mobileOpen && (
        <div style={{ padding: "16px", maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Koszyk</span>
            <button onClick={() => setMobileOpen(false)}
              style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 20 }}>✕</button>
          </div>
          {cartContent}
        </div>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <div className="cart-desktop" style={{ minWidth: 280, maxWidth: 320 }}>
        {cartContent}
      </div>
      <div className="cart-mobile">
        {mobileBar}
      </div>
      <style>{`
        .cart-desktop { display: block; }
        .cart-mobile  { display: none;  }
        @media (max-width: 700px) {
          .cart-desktop { display: none;  }
          .cart-mobile  { display: block; }
        }
      `}</style>
    </>
  );
}