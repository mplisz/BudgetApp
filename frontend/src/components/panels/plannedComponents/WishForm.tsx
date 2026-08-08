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
import { DescriptionField, CategoryField, UrlField, PriorityField, TagsField, FieldRow } from "./planFields";
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
      <DescriptionField
        label="Co chcesz kupić?"
        hint="(jedyne wymagane pole)"
        placeholder="np. Rower gravelowy"
        value={form.description}
        onChange={v => set("description", v)}
        onEnter={submit}
        highlightEmpty
      />
      <div style={{ fontSize: 11, color: c.textMuted, marginTop: -12, marginBottom: 16 }}>
        Cenę i termin ustalisz, gdy będziesz gotowy — wtedy przeniesiesz pozycję do planowanych.
      </div>

      <FieldRow label="Szacunkowa cena" hint="(opcjonalnie)">
        <input
          style={s.input}
          value={form.estimatedAmount}
          onChange={e => set("estimatedAmount", e.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="— nie wiem jeszcze —"
          inputMode="decimal"
        />
      </FieldRow>

      <UrlField value={form.url} onChange={v => set("url", v)} />

      <CategoryField
        label="Kategoria"
        subcategoryId={form.targetSubcategoryId}
        categoryName={form.targetCategoryName}
        onChange={sel => setForm(f => ({ ...f,
          targetSubcategoryId:   sel.subcategoryId,
          targetSubcategoryName: sel.subcategoryName,
          targetCategoryId:      sel.categoryId,
          targetCategoryName:    sel.categoryName,
        }))}
      />

      <PriorityField
        value={form.priority}
        onChange={p => set("priority", p)}
        subcategoryId={form.targetSubcategoryId}
      />

      <TagsField value={form.tags} onChange={t => set("tags", t)} />

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
