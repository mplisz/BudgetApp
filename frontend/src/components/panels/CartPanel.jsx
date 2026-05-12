// ============================================================
// File: src/components/panels/CartPanel.jsx
// Shopping cart — appears dynamically when cart.length > 0.
// Desktop: 2nd column next to the form 
// Mobile: sticky bar at the bottom, expandable on tap.
// ============================================================

import { useState, useCallback } from "react";
import { useAppContext }    from "../../context/AppContext";
import { useTransactions }  from "../../hooks/useTransactions";
import { fmt }              from "../../utils/helpers";
import { PRIORITY_COLORS }  from "../ui/PriorityPicker";

// Per-item save status
const STATUS = { PENDING: "pending", SAVING: "saving", DONE: "done", ERROR: "error" };

/**
 * Props:
 *   onLoadToForm – fn(item) — loads a cart item back into the form for editing
 */
export function CartPanel({ onLoadToForm }) {
  const { cart, setCart }       = useAppContext();
  const { addTransaction }      = useTransactions();
  const [statuses, setStatuses] = useState({});   // { cartItemId: STATUS }
  const [saving,   setSaving]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const totalPLN   = cart.reduce((s, i) => s + (i.amount || 0), 0);
  const doneCount  = Object.values(statuses).filter(s => s === STATUS.DONE).length;
  const errorCount = Object.values(statuses).filter(s => s === STATUS.ERROR).length;

  // ── Helpers ──────────────────────────────────────────────────

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
    const pending = cart.filter(i => statuses[i._cartId] !== STATUS.DONE);
    if (!pending.length) return;

    setSaving(true);

    await Promise.all(pending.map(async (item) => {
      setStatus(item._cartId, STATUS.SAVING);
      try {
        const { _cartId, ...payload } = item;
        const result = await addTransaction(payload);
        setStatus(item._cartId, result ? STATUS.DONE : STATUS.ERROR);
      } catch {
        setStatus(item._cartId, STATUS.ERROR);
      }
    }));

    setSaving(false);

    // After a short delay, remove successfully saved items from cart
    setTimeout(() => {
      setCart(prev => prev.filter(i => statuses[i._cartId] !== STATUS.DONE));
      setStatuses(prev => {
        const n = { ...prev };
        Object.keys(n).forEach(k => { if (n[k] === STATUS.DONE) delete n[k]; });
        return n;
      });
    }, 1200);
  }, [cart, statuses, addTransaction, setCart]);

  if (cart.length === 0) return null;

  // ── Shared content ───────────────────────────────────────────

  const cartContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15 }}>
            🛒 Koszyk
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            {cart.length} {cart.length === 1 ? "pozycja" : cart.length < 5 ? "pozycje" : "pozycji"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{fmt(totalPLN)}</div>
          {errorCount > 0 && (
            <div style={{ fontSize: 11, color: "#ef4444" }}>{errorCount} błąd{errorCount > 1 ? "y" : ""}</div>
          )}
        </div>
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
        {cart.map((item, idx) => {
          const status = statuses[item._cartId] || STATUS.PENDING;
          const pColor = PRIORITY_COLORS[item.priority] || "#64748b";

          return (
            <div key={item._cartId} style={{
              background:   status === STATUS.DONE  ? "#10b98111" :
                            status === STATUS.ERROR ? "#ef444411" : "#0d1424",
              border:       `1px solid ${
                            status === STATUS.DONE  ? "#10b981" :
                            status === STATUS.ERROR ? "#ef4444" : "#1e293b"}`,
              borderRadius: 8,
              padding:      "10px 12px",
              marginBottom: 8,
              transition:   "all 0.2s",
            }}>
              {/* Row 1*/}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>
                    {item.categoryName} › {item.subcategoryName}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.description}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <span style={{ fontWeight: 700, color: "#10b981", fontSize: 14 }}>{fmt(item.amount)}</span>
                  <span style={{ fontSize: 16 }}>
                    {status === STATUS.SAVING ? "⏳" :
                     status === STATUS.DONE   ? "✅" :
                     status === STATUS.ERROR  ? "❌" : ""}
                  </span>
                </div>
              </div>

              {/* Row 2 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: pColor, fontWeight: 700, border: `1px solid ${pColor}`, borderRadius: 4, padding: "1px 5px" }}>
                    P{item.priority}
                  </span>
                  <span style={{ fontSize: 10, color: "#334155" }}>{item.date}</span>
                  {item.originalCurrency !== (item.baseCurrencyCode || "PLN") && (
                    <span style={{ fontSize: 10, color: "#475569" }}>
                      {item.originalAmount} {item.originalCurrency}
                    </span>
                  )}
                </div>

                {status !== STATUS.DONE && status !== STATUS.SAVING && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => handleLoadToForm(item)}
                      title="Load into form for editing"
                      style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>
                      ✏️
                    </button>
                    <button
                      onClick={() => removeFromCart(item._cartId)}
                      title="Remove from cart"
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
        <button
          onClick={saveAll}
          disabled={saving || cart.every(i => statuses[i._cartId] === STATUS.DONE)}
          style={{
            display:      "block",
            width:        "100%",
            padding:      "12px",
            borderRadius: 10,
            border:       "none",
            background:   saving ? "#064e3b" : "#10b981",
            color:        "#fff",
            fontWeight:   700,
            fontSize:     14,
            cursor:       saving ? "not-allowed" : "pointer",
            marginBottom: 8,
          }}>
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

  // ── Mobile sticky bar ────────────────────────────────────────

  const mobileBar = (
    <div style={{
      position:   "fixed",
      bottom:     0,
      left:       0,
      right:      0,
      zIndex:     200,
      background: "#0d1424",
      borderTop:  "1px solid #1e293b",
    }}>
      {/* Collapsed bar */}
      {!mobileOpen && (
        <div
          onClick={() => setMobileOpen(true)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🛒</span>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{cart.length} pozycj{cart.length === 1 ? "a" : cart.length < 5 ? "e" : "i"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>{fmt(totalPLN)}</span>
            <button
              onClick={e => { e.stopPropagation(); saveAll(); }}
              disabled={saving}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "⏳" : "💾 Zapisz"}
            </button>
          </div>
        </div>
      )}

      {/* Expanded drawer */}
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

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* Desktop — plain div, positioned by parent */}
      <div className="cart-desktop" style={{ minWidth: 280, maxWidth: 320 }}>
        {cartContent}
      </div>

      {/* Mobile — sticky bar */}
      <div className="cart-mobile">
        {mobileBar}
      </div>

      {/* Responsive CSS */}
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