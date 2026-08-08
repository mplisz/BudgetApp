// ============================================================
// File: src/components/panels/plannedComponents/planFields.tsx
// Fields shared by PlannedForm (a committed plan) and WishForm (an item on
// the shopping list, with no price or month yet).
//
// Extracted per FIELD rather than as one contiguous block on purpose. The two
// forms interleave these with their own fields in different orders — a plan
// puts tryb/kwota/miesiąc between them — so a single shared block would have
// forced one form to reorder its layout. Individual fields compose in any
// order, which is what makes the sharing free.
//
// All of them are dumb: value in, change out. Each form keeps its own state
// shape and its own validation.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { theme as s } from "../../../styles/theme";
import { SubcategorySelect } from "../../ui/SubcategorySelect";
import { TagMultiSelect } from "../../ui/TagMultiSelect";
import { PriorityPicker } from "../../ui/PriorityPicker";
import type { ReactNode } from "react";

const frow: React.CSSProperties = { marginBottom: 16 };

/** What SubcategorySelect hands back — both forms store all four. */
export interface CategorySelection {
  subcategoryId:   string;
  subcategoryName: string;
  categoryId:      string;
  categoryName:    string;
}

// ── Row wrapper ───────────────────────────────────────────────

interface FieldRowProps {
  label?:   string;
  /** Muted note after the label — the "(opcjonalnie…)" style aside. */
  hint?:    string;
  children: ReactNode;
}

export function FieldRow({ label, hint, children }: FieldRowProps) {
  return (
    <div style={frow}>
      {label && (
        <label style={s.label}>
          {label}
          {hint && (
            <span style={{ color: c.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              {" "}{hint}
            </span>
          )}
        </label>
      )}
      {children}
    </div>
  );
}

// ── Fields ────────────────────────────────────────────────────

interface DescriptionFieldProps {
  value:       string;
  onChange:    (v: string) => void;
  label:       string;
  hint?:       string;
  placeholder?: string;
  /** Outline the input while empty — used where the field gates submission. */
  highlightEmpty?: boolean;
  onEnter?:    () => void;
}

export function DescriptionField({
  value, onChange, label, hint, placeholder, highlightEmpty = false, onEnter,
}: DescriptionFieldProps) {
  const empty = !value?.trim();
  return (
    <FieldRow label={label} hint={hint}>
      <input
        type="text"
        maxLength={500}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        style={{
          ...s.input,
          border: `1px solid ${highlightEmpty && empty ? alpha(c.danger, "66") : c.border}`,
        }}
      />
    </FieldRow>
  );
}

interface CategoryFieldProps {
  subcategoryId: string;
  /** Parent category name, echoed under the select once something is picked. */
  categoryName?: string;
  onChange:      (sel: CategorySelection) => void;
  label?:        string;
  placeholder?:  string;
}

export function CategoryField({
  subcategoryId, categoryName, onChange,
  label = "Kategoria zakupu",
  placeholder = "— Kategoria zakupu - gdzie trafi wydatek? —",
}: CategoryFieldProps) {
  return (
    <FieldRow label={label}>
      <SubcategorySelect
        value={subcategoryId}
        allowedTypes={["EXPENSE", "SAVING"]}
        placeholder={placeholder}
        onChange={({ subcategoryId: sid, subcategoryName, categoryId, categoryName: cname }) =>
          onChange({ subcategoryId: sid, subcategoryName, categoryId, categoryName: cname })
        }
      />
      {categoryName && (
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{categoryName}</div>
      )}
    </FieldRow>
  );
}

export function UrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <FieldRow label="Link" hint="(opcjonalnie — np. strona produktu)">
      <input
        type="url"
        maxLength={2000}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://..."
        style={s.input}
      />
    </FieldRow>
  );
}

/** PriorityPicker renders its own "Priorytet" label — no FieldRow label here,
 *  or the row ends up with two. */
export function PriorityField({
  value, onChange, subcategoryId,
}: { value: number; onChange: (v: 1 | 2 | 3 | 4) => void; subcategoryId?: string }) {
  return (
    <FieldRow>
      <PriorityPicker
        value={value}
        onChange={v => onChange(v as 1 | 2 | 3 | 4)}
        subcategoryId={subcategoryId}
      />
    </FieldRow>
  );
}

export function TagsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <FieldRow label="Tagi">
      <TagMultiSelect value={value} onChange={onChange} />
    </FieldRow>
  );
}
