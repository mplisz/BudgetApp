// ============================================================
// File: src/components/ui/SubcategorySelect.jsx
// Reusable <select> of subcategory with category grouping.
// By default shows only EXPENSE and SAVING categories.
// Pass allowedTypes prop to override.
// ============================================================

import { useMemo } from "react";
import { useAppContext } from "../../context/AppContext";

export function SubcategorySelect({
  value,
  onChange,
  style = {},
  placeholder = "— wybierz subkategorię —",
  disabled = false,
  allowedTypes = ["EXPENSE", "SAVING"],
}) {
  const { categories } = useAppContext();

  const groups = useMemo(() =>
    categories
      .filter(cat => !cat.isArchived && allowedTypes.includes(cat.type))
      .map(cat => ({
        id:   cat.id,
        name: cat.name,
        icon: cat.icon,
        subs: (cat.sub || []).filter(s => !s.isArchived),
        type: cat.type,
      }))
      .filter(cat => cat.subs.length > 0),
    [categories, allowedTypes]
  );

  function handleChange(e) {
    const id = e.target.value;
    if (!id) { onChange({ subcategoryId: "", subcategoryName: "", categoryId: "", categoryName: "", categoryType: null }); return; }

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
    background: "#0a0f1e",
    border: "1px solid #1e293b",
    borderRadius: 8,
    color: "#e2e8f0",
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