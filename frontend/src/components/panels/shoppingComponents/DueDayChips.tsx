// ============================================================
// File: src/components/panels/shoppingComponents/DueDayChips.tsx
// The days a "na termin" item can be put on — the same chips over the
// add field and in a row's ⏱ picker.
// ============================================================

import type { CSSProperties } from "react";
import { QuickPills } from "../../ui/QuickPills";
import { dayLabel, dueChoices, dueLabel } from "../../../utils/shoppingDue";
import { THUMB_PILL } from "./layout";

interface DueDayChipsProps {
  today:    string;
  value:    string | null;
  onChange: (ymd: string) => void;
  style?:   CSSProperties;
}

export function DueDayChips({ today, value, onChange, style }: DueDayChipsProps) {
  return (
    <QuickPills
      style={{ marginTop: 0, ...style }}
      pills={dueChoices(today).map(ymd => ({
        label:   dayLabel(ymd),
        title:   dueLabel(ymd, today),
        active:  ymd === value,
        style:   THUMB_PILL,
        onClick: () => onChange(ymd),
      }))}
    />
  );
}
