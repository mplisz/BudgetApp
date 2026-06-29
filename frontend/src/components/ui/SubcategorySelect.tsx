// ============================================================
// File: src/components/ui/SubcategorySelect.jsx
// Reusable <select> of subcategory with category grouping.
// Props:
//   allowedTypes  – filter by category type (default: ["EXPENSE", "SAVING"])
//   filter        – optional (sub) => boolean predicate for extra filtering
//                   e.g. filter={sub => sub.canBeRecurring} for recurring panel
// ============================================================

import { c } from "../../styles/tokens";
import { useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import type { AppCategory, AppSubcategory } from "../../types/appContext";

interface SubSelection {
  subcategoryId:   string;
  subcategoryName: string;
  categoryId:      string;
  categoryName:    string;
  categoryType:    string | null;
}

interface SubcategorySelectProps {
  value:         string;
  onChange:      (sel: SubSelection) => void;
  style?:        React.CSSProperties;
  placeholder?:  string;
  disabled?:     boolean;
  allowedTypes?: string[];
  filter?:       ((sub: AppSubcategory, cat: AppCategory) => boolean) | null;
}

export function SubcategorySelect({
  value,
  onChange,
  style = {},
  placeholder = "— wybierz subkategorię —",
  disabled = false,
  allowedTypes = ["EXPENSE", "SAVING"],
  filter = null,   // optional (sub) => boolean
}: SubcategorySelectProps) {
  const { categories } = useAppContext();

  const groups = useMemo(() =>
    categories
      .filter(cat => !cat.isArchived && allowedTypes.includes(cat.type))
      .map(cat => ({
        id:   cat.id,
        name: cat.name,
        icon: cat.icon,
        subs: (cat.sub || []).filter(s => {
          if (s.isArchived) return false;
          if (filter) return filter(s, cat);
          return true;
        }),
        type: cat.type,
      }))
      .filter(cat => cat.subs.length > 0),
    [categories, allowedTypes] // filter omitted — assumed stable, wrap in useCallback at call site if needed
  );

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) {
      onChange({ subcategoryId: "", subcategoryName: "", categoryId: "", categoryName: "", categoryType: null });
      return;
    }
    for (const cat of groups) {
      const sub = cat.subs.find(s => s.id === id);
      if (sub) {
        onChange({ subcategoryId: sub.id, subcategoryName: sub.name, categoryId: cat.id, categoryName: cat.name, categoryType: cat.type });
        return;
      }
    }
  }

  const base = {
    width: "100%",
    background: c.bg,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
    padding: "9px 12px",
    fontSize: 14,
    outline: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };

  return (
    <select value={value} onChange={handleChange} disabled={disabled} style={{ ...base, ...style }}>
      <option value="">{placeholder}</option>
      {groups.map(cat => (
        <optgroup key={cat.id} label={`${cat.icon} ${cat.name}`}>
          {cat.subs.map(sub => (
            <option key={sub.id} value={sub.id}>{sub.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}