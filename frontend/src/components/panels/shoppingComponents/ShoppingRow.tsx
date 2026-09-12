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
//
// The note/section editor opens from the row's own section chip (and
// from the name, for anyone who tries that first). The chip is what
// makes the feature findable at all: the editor used to hide behind an
// unmarked click on the name, which nobody has any reason to try.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import { theme as s } from "../../../styles/theme";
import { SHOPPING_SECTIONS, SECTION_IDS, sectionMeta } from "../../../data/constants/shoppingSections";
import { PriceHint } from "./PriceHint";
import type { ShoppingItem, CatalogEntry } from "../../../hooks/useShoppingList";

interface ShoppingRowProps {
  item:      ShoppingItem;
  onBought:  (id: string) => void;
  onMissed:  (id: string) => void;
  onReopen:  (id: string) => void;
  onRemove:  (id: string) => void;
  onQty:     (id: string, qty: number) => void;
  onDetails: (id: string, details: { note: string; section: string }) => void;
  /** What this product usually costs — absent until a scanned receipt
   *  has been matched to it. */
  catalogEntry?: CatalogEntry;
  onForgetPrice: (key: string, observationId: string) => void;
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

export function ShoppingRow({
  item, onBought, onMissed, onReopen, onRemove, onQty, onDetails,
  catalogEntry, onForgetPrice,
}: ShoppingRowProps) {
  const resolved = item.status !== "open";
  const missed   = !resolved && !!item.missedAt;
  // Ticked means BOUGHT specifically. A skipped item is settled too, but
  // showing it with a tick would claim we bought something we gave up on.
  const checked  = item.status === "bought";

  const [editing,     setEditing]     = useState(false);
  const [draftNote,   setDraftNote]   = useState(item.note ?? "");
  const [draftSection, setDraftSection] = useState(item.section ?? "inne");

  function openEditor() {
    if (resolved) return;            // nothing to adjust on a settled item
    setDraftNote(item.note ?? "");
    setDraftSection(item.section ?? "inne");
    setEditing(true);
  }

  function save() {
    onDetails(item.id, { note: draftNote.trim(), section: draftSection });
    setEditing(false);
  }

  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${missed ? alpha(c.warning, "55") : c.border}`,
      borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

        <div
          style={{ flex: 1, minWidth: 0, cursor: resolved ? "default" : "pointer" }}
          onClick={openEditor}
          title={resolved ? undefined : "Komentarz i sekcja"}
        >
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

          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!resolved && (
              <span
                title="Zmień sekcję lub dopisz komentarz"
                style={{
                  color: c.textTertiary, background: c.raised,
                  border: `1px dashed ${c.borderStrong}`, borderRadius: 20,
                  padding: "2px 9px", fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                {sectionMeta(item.section).icon} {sectionMeta(item.section).label} ✎
              </span>
            )}
            {/* The note is the loudest thing here on purpose: "bez soli,
                to dla córki" is the whole reason the item was written
                down that way, and it has to survive a glance in a shop. */}
            {item.note && <span style={{ color: c.infoLight, fontWeight: 600 }}>📝 {item.note}</span>}
            <PriceHint
              price={catalogEntry?.price}
              observations={catalogEntry?.prices ?? []}
              onForget={id => catalogEntry && onForgetPrice(catalogEntry.key, id)}
            />
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

      {editing && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
          <input
            autoFocus
            value={draftNote}
            onChange={e => setDraftNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            placeholder="Komentarz, np. bez soli — dla córki"
            maxLength={300}
            style={{ ...s.input, flex: "2 1 220px", fontSize: 13, padding: "8px 10px" }}
          />
          <select
            value={draftSection}
            onChange={e => setDraftSection(e.target.value)}
            title="Sekcja sklepu"
            style={{ ...s.input, flex: "1 1 150px", fontSize: 13, padding: "8px 10px", cursor: "pointer" }}
          >
            {SECTION_IDS.map(id => (
              <option key={id} value={id}>
                {SHOPPING_SECTIONS[id].icon} {SHOPPING_SECTIONS[id].label}
              </option>
            ))}
          </select>
          <button type="button" onClick={save} style={{ ...s.btnSm(c.success), height: 38 }}>
            Zapisz
          </button>
          <button type="button" onClick={() => setEditing(false)} style={{ ...s.btnSm(c.textSecondary), height: 38 }}>
            Anuluj
          </button>
        </div>
      )}

    </div>
  );
}
