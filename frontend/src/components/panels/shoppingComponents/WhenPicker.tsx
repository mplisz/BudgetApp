// ============================================================
// File: src/components/panels/shoppingComponents/WhenPicker.tsx
// The ⏱ kiedy editor under a row — moves the item to another tab.
//
// "Na już" and "Rozglądam się" save on the tap: there is nothing more to
// say. "Na termin" first asks for the day, with the same chips as the
// add field, and saves on the day's tap.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState } from "react";
import { SegmentedTabs } from "../../ui/SegmentedTabs";
import { SHOPPING_HORIZONS, HORIZON_IDS, type HorizonId } from "../../../data/constants/shoppingHorizons";
import { itemHorizon } from "../../../utils/shoppingDue";
import type { ShoppingItem, WhenPatch } from "../../../hooks/useShoppingList";
import { DueDayChips } from "./DueDayChips";

interface WhenPickerProps {
  item:    ShoppingItem;
  today:   string;
  onPick:  (w: WhenPatch) => void;
  onClose: () => void;
}

export function WhenPicker({ item, today, onPick, onClose }: WhenPickerProps) {
  const current = itemHorizon(item);
  const [choice, setChoice] = useState<HorizonId>(current);

  function choose(id: HorizonId) {
    setChoice(id);
    if (id !== "date") onPick({ when: id, needBy: null });
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.textTertiary }}>⏱ Kiedy kupić</span>
        <button type="button" onClick={onClose} aria-label="Zamknij"
          style={{ background: "transparent", border: "none", color: c.textMuted, fontSize: 14, cursor: "pointer", padding: 4 }}>
          ✕
        </button>
      </div>
      <SegmentedTabs
        ariaLabel="Kiedy kupić"
        options={HORIZON_IDS.map(id => ({ id, label: SHOPPING_HORIZONS[id].label }))}
        value={choice}
        onChange={choose}
      />
      {choice === "date" && (
        <DueDayChips
          today={today}
          value={current === "date" ? item.needBy ?? null : null}
          onChange={ymd => onPick({ when: "date", needBy: ymd })}
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
