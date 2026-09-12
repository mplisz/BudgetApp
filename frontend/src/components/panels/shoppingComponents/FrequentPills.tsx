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
// ============================================================

import { c } from "../../../styles/tokens";
import { QuickPills } from "../../ui/QuickPills";
import type { CatalogEntry } from "../../../hooks/useShoppingList";

interface FrequentPillsProps {
  catalog:  CatalogEntry[];
  openKeys: Set<string>;
  onAdd:    (entry: CatalogEntry) => void;
}

// Roughly one phone screen of pills. Beyond that the ranking stops being
// a shortlist and the field below is the faster way in.
const MAX_PILLS = 15;

// Bigger than the default pill: this row is tapped one-handed, walking.
const THUMB_TARGET = { padding: "9px 14px", fontSize: 13, borderRadius: 20, minHeight: 38 };

export function FrequentPills({ catalog, openKeys, onAdd }: FrequentPillsProps) {
  const shown = catalog.slice(0, MAX_PILLS);
  if (shown.length === 0) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: c.textMuted, textTransform: "uppercase",
        letterSpacing: "0.7px", fontWeight: 700, marginBottom: 8,
      }}>
        Najczęstsze
      </div>
      <QuickPills
        style={{ marginTop: 0 }}
        pills={shown.map(entry => {
          const onList = openKeys.has(entry.key);
          return {
            label:   `${onList ? "✓" : "+"} ${entry.name}`,
            active:  onList,
            title:   onList ? "Już na liście — dodaj kolejną sztukę" : `Dodaj: ${entry.name}`,
            style:   THUMB_TARGET,
            onClick: () => onAdd(entry),
          };
        })}
      />
    </div>
  );
}
