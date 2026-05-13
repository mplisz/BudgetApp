// ============================================================
// File: src/components/panels/CartPanel.jsx
// Shopping cart — appears dynamically when cart.length > 0.
// Desktop: second column next to the form.
// Mobile: sticky bar at the bottom, expandable on tap.
// ============================================================

import { useState, useCallback } from "react";
import { useAppContext }    from "../../context/AppContext";
import { useTransactions }  from "../../hooks/useTransactions";
import { useToast }         from "../../hooks/useToast";
import { fmt }              from "../../utils/helpers";
import { PRIORITY_COLORS }  from "../ui/PriorityPicker";

// Per-item save status
const STATUS = { PENDING: "pending", SAVING: "saving", DONE: "done", ERROR: "error" };

// ── Cart aggregation ──────────────────────────────────────────
// Two items are mergeable when they share: subcategoryId, priority,
// tags (sorted), originalCurrency, fxRate, useVoucher.
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
  ].join("|");
}

export function aggregateCart(items) {
  const groups = new Map();

  for (const item of items) {
    const key = aggregationKey(item);
    if (groups.has(key)) {
      const existing = groups.get(key);
      // Sum amounts
      existing.amount         = Math.round((existing.amount + item.amount) * 100) / 100;
      existing.originalAmount = Math.round((existing.originalAmount + item.originalAmount) * 100) / 100;
      existing.netAmount      = Math.round(((existing.netAmount || existing.amount) + (item.netAmount || item.amount)) * 100) / 100;
      // Voucher amounts
      if (item.useVoucher) {
        existing.voucherAmount = Math.round(((existing.voucherAmount || 0) + (item.voucherAmount || 0)) * 100) / 100;
      }
      // Concatenate descriptions (skip empty/duplicate)
      if (item.description && item.description !== existing.description) {
        existing.description = existing.description
          ? `${existing.description}, ${item.description}`
          : item.description;
      }
      // Keep earliest date
      if (item.date < existing.date) existing.date = item.date;
      // Track ALL original cart IDs that were merged into this item
      existing._allCartIds = [...(existing._allCartIds || [existing._cartId]), item._cartId];
      existing._mergedCount = (existing._mergedCount || 1) + 1;
    } else {
      groups.set(key, { ...item, _mergedCount: 1, _allCartIds: [item._cartId] });
    }
  }

  return Array.from(groups.values());
}

/**
 * Props:
 *   onLoadToForm – fn(item) — loads a cart item back into the form for editing
 */
export function CartPanel({ onLoadToForm }) {
  const { cart, setCart }       = useAppContext();
  const { addTransaction }      = useTransactions();
  const { showSuccess, showError, showInfo } = useToast();
  const [statuses, setStatuses] = useState({});
  const [saving,   setSaving]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Derived totals ─────────────────────────────────────────
  // Total PLN (gross — full transaction amount)
  const totalGross = cart.reduce((s, i) => s + (i.amount || 0), 0);

  // Net cash (after voucher deductions)
  const totalNet = cart.reduce((s, i) => {
    if (i.useVoucher && i.voucherAmount > 0) {
      return s + Math.max(0, (i.amount || 0) - i.voucherAmount);
    }
    return s + (i.amount || 0);
  }, 0);

  // Total voucher value across all items
  const totalVoucher = cart.reduce((s, i) => {
    return s + (i.useVoucher ? (i.voucherAmount || 0) : 0);
  }, 0);

  const hasVouchers  = totalVoucher > 0;
  const doneCount    = Object.values(statuses).filter(s => s === STATUS.DONE).length;
  const errorCount   = Object.values(statuses).filter(s => s === STATUS.ERROR).length;

  // ── Helpers ───────────────────────────────────────────────────

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
    // Save aggregated items — merged rows are saved as single transactions
    const pending = aggregateCart(cart.filter(i => statuses[i._cartId] !== STATUS.DONE));
    if (!pending.length) return;

    setSaving(true);

    // Collect saved cart IDs directly — avoids stale closure on statuses state
    const savedIds  = [];
    const failedIds = [];

    await Promise.all(pending.map(async (item) => {
      setStatus(item._cartId, STATUS.SAVING);
      try {
        const { _cartId, ...payload } = item;
        const result = await addTransaction(payload);
        if (result) {
          // Mark all original cart IDs that were merged into this item
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
    }));

    setSaving(false);

    const savedCount = savedIds.length;
    const failCount  = failedIds.length;

    // Toast feedback
    if (failCount === 0) {
      showSuccess(`Zapisano ${savedCount} ${savedCount === 1 ? "pozycję" : savedCount < 5 ? "pozycje" : "pozycji"}! ✅`);
    } else if (savedCount === 0) {
      showError("Nie udało się zapisać żadnej pozycji. Sprawdź połączenie.");
    } else {
      showInfo(`Zapisano ${savedCount} z ${pending.length} pozycji. ${failCount} nie udało się.`);
    }

    // Remove successfully saved items using the collected IDs (no stale closure)
    setTimeout(() => {
      setCart(prev => prev.filter(i => !savedIds.includes(i._cartId)));
      setStatuses(prev => {
        const n = { ...prev };
        savedIds.forEach(id => delete n[id]);
        return n;
      });
    }, 1200);

  }, [cart, statuses, addTransaction, setCart, showSuccess, showError, showInfo]);

  if (cart.length === 0) return null;

  // ── Aggregated display list ─────────────────────────────────
  // Items are aggregated for display and saving — user sees merged rows
  const displayItems = aggregateCart(cart.filter(i => statuses[i._cartId] !== STATUS.DONE));
  const doneItems    = cart.filter(i => statuses[i._cartId] === STATUS.DONE);
  const allDisplay   = [...displayItems, ...doneItems];

  // ── Shared content ───────────────────────────────────────────

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
          const status = statuses[item._cartId] || STATUS.PENDING;
          const pColor = PRIORITY_COLORS[item.priority] || "#64748b";
          const itemNet = item.useVoucher && item.voucherAmount > 0
            ? Math.max(0, item.amount - item.voucherAmount)
            : item.amount;

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
              {/* Row 1: category + amount + status icon */}
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
                  <div style={{ textAlign: "right" }}>
                    {item._mergedCount > 1 && (
                      <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700, marginBottom: 2 }}>
                        ×{item._mergedCount} zsumowane
                      </div>
                    )}
                    {item.useVoucher && item.voucherAmount > 0 ? (
                      <>
                        <div style={{ fontSize: 11, color: "#64748b", textDecoration: "line-through" }}>{fmt(item.amount)}</div>
                        <div style={{ fontWeight: 700, color: "#10b981", fontSize: 14 }}>{fmt(itemNet)}</div>
                        <div style={{ fontSize: 10, color: "#a855f7" }}>🎫 {fmt(item.voucherAmount)}</div>
                      </>
                    ) : (
                      <div style={{ fontWeight: 700, color: "#10b981", fontSize: 14 }}>{fmt(item.amount)}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 16 }}>
                    {status === STATUS.SAVING ? "⏳" :
                     status === STATUS.DONE   ? "✅" :
                     status === STATUS.ERROR  ? "❌" : ""}
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
                </div>

                {status !== STATUS.DONE && status !== STATUS.SAVING && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleLoadToForm(item)} title="Load into form for editing"
                      style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>
                      ✏️
                    </button>
                    <button onClick={() => removeFromCart(item._cartId)} title="Remove from cart"
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

      {/* Action buttons */}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12 }}>
        {/* Voucher summary line — only when applicable */}
        {hasVouchers && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "#a855f711", borderRadius: 6 }}>
            <span style={{ color: "#64748b" }}>Koszyk: {fmt(totalGross)} · Gotówka: {fmt(totalNet)} · Bon: {fmt(totalVoucher)}</span>
            <span style={{ color: "#a855f7" }}>🎫</span>
          </div>
        )}

        <button
          onClick={saveAll}
          disabled={saving || cart.every(i => statuses[i._cartId] === STATUS.DONE)}
          style={{
            display: "block", width: "100%", padding: "12px",
            borderRadius: 10, border: "none",
            background: saving ? "#064e3b" : "#10b981",
            color: "#fff", fontWeight: 700, fontSize: 14,
            cursor: saving ? "not-allowed" : "pointer",
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