// ============================================================
// File: src/components/panels/shoppingComponents/ShoppingRow.tsx
// One line of the shopping list.
//
// The leading control is a REAL checkbox: empty while the item is still
// to buy, filled once it is bought. It used to render a ✓ inside the box
// in both states, which reads as "this is already done" rather than "tap
// to mark done" — the first thing anyone misread about this panel.
// Ticking and un-ticking are the same control, so undo needs no separate
// button.
//
// The other two outcomes are deliberately distinct from each other:
//   🚫 nie było — stays on the list, flagged: the shop was out, we
//                 still want it
//   🗑️ usuń     — we changed our mind; gone for good
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import type { ShoppingItem } from "../../../hooks/useShoppingList";

interface ShoppingRowProps {
  item:      ShoppingItem;
  onBought:  (id: string) => void;
  onMissed:  (id: string) => void;
  onReopen:  (id: string) => void;
  onRemove:  (id: string) => void;
  onQty:     (id: string, qty: number) => void;
}

const iconBtn = (color: string): React.CSSProperties => ({
  background: "transparent",
  border: `1px solid ${alpha(color, "55")}`,
  color,
  borderRadius: 8,
  // 40px keeps every control a comfortable thumb target — this list is
  // worked one-handed while pushing a trolley.
  minWidth: 40, height: 40,
  fontSize: 15, cursor: "pointer", flexShrink: 0,
});

export function ShoppingRow({ item, onBought, onMissed, onReopen, onRemove, onQty }: ShoppingRowProps) {
  const resolved = item.status !== "open";
  const missed   = !resolved && !!item.missedAt;
  // Ticked means BOUGHT specifically. A skipped item is settled too, but
  // showing it with a tick would claim we bought something we gave up on.
  const checked  = item.status === "bought";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: c.surface,
      border: `1px solid ${missed ? alpha(c.warning, "55") : c.border}`,
      borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => (resolved ? onReopen(item.id) : onBought(item.id))}
        title={resolved ? "Cofnij — wróć na listę" : "Odhacz jako kupione"}
        style={{
          ...iconBtn(checked ? c.success : c.borderStrong),
          // Filled only once it IS bought; an empty box is what makes
          // "still to buy" readable at a glance.
          background: checked ? c.success : "transparent",
          color:      checked ? c.white : "transparent",
          borderWidth: 2,
          fontSize: 18, lineHeight: 1,
        }}
      >
        ✓
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          color: resolved ? c.textMuted : c.text,
          textDecoration: item.status === "bought" ? "line-through" : "none",
        }}>
          {item.name}
          {item.qty > 1 && (
            <span style={{ color: c.textTertiary, fontWeight: 700 }}>
              {" "}×{item.qty}{item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
        </div>

        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {item.merchant && <span>🏪 {item.merchant}</span>}
          {item.note && <span>📝 {item.note}</span>}
          {missed && (
            <span style={{ color: c.warningLight }}>
              🚫 nie było{item.missedCount > 1 ? ` (${item.missedCount}×)` : ""}
            </span>
          )}
          {item.status === "bought" && item.resolvedBy && <span>kupił(a): {item.resolvedBy}</span>}
          {item.status === "skipped" && <span>odpuszczone</span>}
        </div>
      </div>

      {/* A resolved row keeps only its checkbox — un-ticking is the undo,
          and quantity/"nie było" mean nothing for something already
          settled. */}
      {!resolved && (
        <>
          {/* Quantity lives here rather than in an edit modal: "weź dwa"
              is the most common correction made while shopping. */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              type="button"
              onClick={() => onQty(item.id, Math.max(1, item.qty - 1))}
              disabled={item.qty <= 1}
              title="Mniej"
              style={{ ...iconBtn(c.textSecondary), minWidth: 32, opacity: item.qty <= 1 ? 0.35 : 1 }}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onQty(item.id, Math.min(999, item.qty + 1))}
              title="Więcej"
              style={{ ...iconBtn(c.textSecondary), minWidth: 32 }}
            >
              +
            </button>
          </div>
          <button type="button" onClick={() => onMissed(item.id)} title="Nie było w sklepie" style={iconBtn(c.warning)}>
            🚫
          </button>
          <button type="button" onClick={() => onRemove(item.id)} title="Usuń z listy" style={iconBtn(c.danger)}>
            🗑️
          </button>
        </>
      )}
    </div>
  );
}
