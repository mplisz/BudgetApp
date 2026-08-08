// ============================================================
// File: src/components/panels/PanelAddWish.tsx
// Panel "Dodaj do listy zakupowej" — the quick-add counterpart of
// PanelAddPlanned, for things you want before you have decided what they
// cost or when you will buy them.
//
// No month selector on purpose: an item on the shopping list has no month,
// which is exactly what separates it from a planned expense.
// ============================================================

import { useState }   from "react";
import { usePlanned } from "../../hooks/usePlanned";
import { WishForm }   from "./plannedComponents/WishForm";
import { theme as s } from "../../styles/theme";
import { c }          from "../../styles/tokens";
import type { WishPostPayload } from "../../hooks/usePlanned";

export default function PanelAddWish() {
  const { createWish, isSaving } = usePlanned();
  const [formKey, setFormKey]    = useState(0);

  async function handleSubmit(payload: WishPostPayload) {
    const result = await createWish(payload);
    if (result) setFormKey(k => k + 1);   // fresh form, ready for the next idea
  }

  return (
    <div style={{ padding: "0 0 80px 0" }}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>🛒 Dodaj do listy zakupowej</div>
        <div style={s.sectionSub}>
          Rzeczy, które chcesz kupić — bez ceny i bez terminu. Nie wliczają się
          do żadnego budżetu ani prognozy, dopóki ich nie zaplanujesz.
        </div>
      </div>

      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 16 }}>
        <WishForm key={formKey} onSubmit={handleSubmit} isSaving={isSaving} />
      </div>
    </div>
  );
}
