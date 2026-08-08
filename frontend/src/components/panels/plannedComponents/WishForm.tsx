// ============================================================
// File: src/components/panels/plannedComponents/WishForm.tsx
// Form for adding an item to the shopping list ("lista zakupowa").
//
// The whole point of the list is capturing an idea BEFORE it has a price or
// a date, so `description` is the only required field. Everything else exists
// purely to make the later promotion into a real plan a single click.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState } from "react";
import { theme as s } from "../../../styles/theme";
import { SubcategorySelect } from "../../ui/SubcategorySelect";
import { TagMultiSelect } from "../../ui/TagMultiSelect";
import { PriorityPicker } from "../../ui/PriorityPicker";
import type { WishPostPayload } from "../../../hooks/usePlanned";

interface WishFormProps {
  onSubmit: (payload: WishPostPayload) => void;
  isSaving?: boolean;
}

const EMPTY = {
  description:           "",
  estimatedAmount:       "",
  targetCategoryId:      "",
  targetCategoryName:    "",
  targetSubcategoryId:   "",
  targetSubcategoryName: "",
  tags:                  [] as string[],
  priority:              2 as 1 | 2 | 3 | 4,
  url:                   "",
};

const frow: React.CSSProperties = { marginBottom: 16 };

export function WishForm({ onSubmit, isSaving = false }: WishFormProps) {
  const [form, setForm] = useState(EMPTY);

  function set<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const canSubmit = form.description.trim().length > 0 && !isSaving;

  function submit() {
    if (!canSubmit) return;
    const amount = form.estimatedAmount.trim().replace(",", ".");
    onSubmit({
      description:           form.description.trim(),
      // Blank stays blank. A zero here would read as "free" rather than
      // "not decided yet", and the whole list is about undecided things.
      estimatedAmount:       amount ? Number(amount) : null,
      targetCategoryId:      form.targetCategoryId,
      targetCategoryName:    form.targetCategoryName,
      targetSubcategoryId:   form.targetSubcategoryId,
      targetSubcategoryName: form.targetSubcategoryName,
      tags:                  form.tags,
      priority:              form.priority,
      url:                   form.url.trim(),
    });
    setForm(EMPTY);
  }

  return (
    <div>
      <div style={frow}>
        <label style={s.label}>Co chcesz kupić?</label>
        <input
          autoFocus
          style={s.input}
          value={form.description}
          onChange={e => set("description", e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="np. Rower gravelowy"
          maxLength={200}
        />
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>
          Jedyne wymagane pole. Cenę i termin ustalisz, gdy będziesz gotowy —
          wtedy przeniesiesz pozycję do planowanych.
        </div>
      </div>

      <div style={{ ...frow, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px" }}>
          <label style={s.label}>Szacunkowa cena</label>
          <input
            style={s.input}
            value={form.estimatedAmount}
            onChange={e => set("estimatedAmount", e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="— nie wiem jeszcze —"
            inputMode="decimal"
          />
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label style={s.label}>Link</label>
          <input
            style={s.input}
            value={form.url}
            onChange={e => set("url", e.target.value)}
            placeholder="https://…"
            maxLength={500}
          />
        </div>
      </div>

      <div style={frow}>
        <label style={s.label}>Kategoria</label>
        <SubcategorySelect
          value={form.targetSubcategoryId}
          allowedTypes={["EXPENSE", "SAVING"]}
          onChange={({ subcategoryId, subcategoryName, categoryId, categoryName }) => {
            set("targetSubcategoryId", subcategoryId);
            set("targetSubcategoryName", subcategoryName);
            set("targetCategoryId", categoryId);
            set("targetCategoryName", categoryName);
          }}
        />
      </div>

      <div style={frow}>
        <label style={s.label}>Jak bardzo tego chcesz?</label>
        <PriorityPicker value={form.priority} onChange={p => set("priority", p as 1 | 2 | 3 | 4)} />
      </div>

      <div style={frow}>
        <label style={s.label}>Tagi</label>
        <TagMultiSelect value={form.tags} onChange={t => set("tags", t)} />
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{ ...s.btn(c.info), opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? "pointer" : "not-allowed" }}
      >
        {isSaving ? "Zapisuję…" : "🛒 Dodaj do listy"}
      </button>
    </div>
  );
}
