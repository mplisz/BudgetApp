// ============================================================
// File: src/components/panels/shoppingComponents/FrequentPills.tsx
// The "Najczęstsze" row — one tap puts a product on the list.
//
// This is the primary way items get added, not a convenience: a family's
// shopping list is the same twenty products in a loop, so the common
// case must cost one tap and no typing. The ranking (frequency weighted
// by recency) is computed server-side in utils/shoppingCatalog.
//
// Products already on the list are shown as already-added rather than
// hidden — a pill that disappears under your thumb makes the row jump
// while you are tapping through it.
//
// COLLAPSING: the row is what you want while BUILDING a list and pure
// noise while WALKING one. Rather than making that a setting, the
// default follows whichever of the two you are evidently doing — see
// startsCollapsed below. Wrapped in the shared CollapsibleSection, the
// same one Settings uses.
//
// The edit mode is where typos get pruned. It lives here rather than in
// Settings because the junk worth removing is exactly the junk you can
// see: "mlekoo" sits in this row, so this row is where you delete it.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import { CollapsibleSection } from "../../ui";
import { QuickPills } from "../../ui/QuickPills";
import type { CatalogEntry } from "../../../hooks/useShoppingList";

interface FrequentPillsProps {
  catalog:   CatalogEntry[];
  openKeys:  Set<string>;
  onAdd:     (entry: CatalogEntry) => void;
  onForget:  (key: string) => void;
  /** How many items are already waiting to be bought — the signal for
   *  whether this is a list being written or a list being walked. */
  openCount: number;
}

// Roughly one phone screen of pills. Beyond that the ranking stops being
// a shortlist and the field below is the faster way in.
const MAX_PILLS = 15;

// Above this many items on the list, arriving at the panel almost always
// means shopping rather than planning, so the pills start folded away.
const SHOPPING_MODE_ITEMS = 4;

// Bigger than the default pill: this row is tapped one-handed, walking.
const THUMB_TARGET = { padding: "9px 14px", fontSize: 13, borderRadius: 20, minHeight: 38 };

export function FrequentPills({ catalog, openKeys, onAdd, onForget, openCount }: FrequentPillsProps) {
  const [editing, setEditing] = useState(false);

  // Editing shows the WHOLE catalog, not just the top 15: a typo that
  // was used once sits far down the ranking, which is precisely why it
  // needs pruning by hand.
  const shown = editing ? catalog : catalog.slice(0, MAX_PILLS);
  if (catalog.length === 0) return null;

  const startsCollapsed = openCount >= SHOPPING_MODE_ITEMS;

  const title = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {editing ? `Podpowiedzi (${catalog.length})` : "Najczęstsze"}
      <button
        type="button"
        // The header toggles the section, so the button has to keep its
        // click to itself.
        onClick={e => { e.stopPropagation(); setEditing(v => !v); }}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: editing ? c.successLight : c.textFaint,
          fontSize: 11, fontWeight: 700, padding: "2px 4px",
          textTransform: "none", letterSpacing: 0,
        }}
      >
        {editing ? "Gotowe" : "✎ edytuj"}
      </button>
    </span>
  );

  return (
    <CollapsibleSection
      title={title}
      defaultOpen={!startsCollapsed}
      style={{ padding: 12, marginTop: 0, marginBottom: 14 }}
    >
      <QuickPills
        style={{ marginTop: 0 }}
        pills={shown.map(entry => {
          const onList = openKeys.has(entry.key);
          return editing
            ? {
                label:   `✕ ${entry.name}`,
                active:  false,
                title:   `Usuń „${entry.name}" z podpowiedzi (nie rusza listy)`,
                style:   { ...THUMB_TARGET, borderColor: alpha(c.danger, "66"), color: c.dangerLight },
                onClick: () => onForget(entry.key),
              }
            : {
                label:   `${onList ? "✓" : "+"} ${entry.name}`,
                active:  onList,
                title:   onList ? "Już na liście — dodaj kolejną sztukę" : `Dodaj: ${entry.name}`,
                style:   THUMB_TARGET,
                onClick: () => onAdd(entry),
              };
        })}
      />

      {editing && (
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>
          Usunięcie kasuje tylko podpowiedź razem z jej sekcją — pozycje na liście zostają.
        </div>
      )}
    </CollapsibleSection>
  );
}
