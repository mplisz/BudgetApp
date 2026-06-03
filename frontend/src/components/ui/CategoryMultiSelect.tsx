// ============================================================
// File: src/components/ui/CategoryMultiSelect.tsx
// Multi-select filter for category names.
//
// Unlike SubcategorySelect (used in forms to pick a single
// subcategory for saving a record), this component is a filter
// widget: it lets the user select multiple category names and
// returns an array of strings via onChange.
//
// Props:
//   value          – string[]  — selected category names
//   onChange       – (string[]) => void
//   categories     – CategoryOption[] — list to render (pass only
//                    the categories relevant to the current context,
//                    e.g. only those active this month)
//   placeholder    – string (default: "Kategorie…")
//   disabled       – boolean
//
// The component does NOT read from AppContext directly so it stays
// generic and testable — callers derive the list from their data.
// ============================================================

import { useState, useCallback } from "react";
import type { ReactElement } from "react";

export interface CategoryOption {
  name: string;
  icon?: string;
}

interface CategoryMultiSelectProps {
  value:        string[];
  onChange:     (next: string[]) => void;
  categories:   CategoryOption[];
  placeholder?: string;
  disabled?:    boolean;
}

export function CategoryMultiSelect({
  value       = [],
  onChange,
  categories  = [],
  placeholder = "Kategorie…",
  disabled    = false,
}: CategoryMultiSelectProps): ReactElement {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((name: string) => {
    if (disabled) return;
    onChange(
      value.includes(name)
        ? value.filter(n => n !== name)
        : [...value, name],
    );
  }, [value, onChange, disabled]);

  const clearAll = useCallback(() => onChange([]), [onChange]);

  const hasSelection = value.length > 0;

  const triggerLabel = hasSelection
    ? value.length === 1
      ? value[0]
      : `${value.length} kategorie`
    : placeholder;

  return (
    <div style={{ position: "relative" }}>

      {/* Trigger button */}
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          background:   hasSelection ? "#3b82f620" : "#0a0f1e",
          border:       `1px solid ${hasSelection ? "#3b82f644" : "#1e293b"}`,
          borderRadius: 8,
          color:        hasSelection ? "#3b82f6" : "#94a3b8",
          padding:      "6px 10px",
          fontSize:     12,
          cursor:       disabled ? "not-allowed" : "pointer",
          display:      "flex",
          alignItems:   "center",
          gap:          6,
          whiteSpace:   "nowrap",
          transition:   "all 0.15s",
        }}
      >
        <span>{triggerLabel}</span>
        {hasSelection && (
          <span
            onClick={e => { e.stopPropagation(); clearAll(); }}
            title="Wyczyść"
            style={{ color: "#64748b", fontSize: 11, lineHeight: 1, cursor: "pointer" }}
          >
            ✕
          </span>
        )}
        <span style={{ color: "#334155", fontSize: 10, marginLeft: 2 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => setOpen(false)}
          />

          <div style={{
            position:     "absolute",
            top:          "calc(100% + 4px)",
            left:         0,
            zIndex:       50,
            background:   "#0d1424",
            border:       "1px solid #1e293b",
            borderRadius: 8,
            minWidth:     180,
            maxHeight:    240,
            overflowY:    "auto",
            boxShadow:    "0 8px 24px #0008",
          }}>
            {categories.length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>
                Brak kategorii
              </div>
            )}

            {categories.map(cat => {
              const selected = value.includes(cat.name);
              return (
                <div
                  key={cat.name}
                  onMouseDown={e => { e.preventDefault(); toggle(cat.name); }}
                  style={{
                    padding:        "8px 14px",
                    cursor:         "pointer",
                    fontSize:       13,
                    color:          selected ? "#3b82f6" : "#e2e8f0",
                    background:     selected ? "#3b82f611" : "transparent",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    gap:            8,
                    transition:     "background 0.1s",
                  }}
                >
                  <span>
                    {cat.icon && <span style={{ marginRight: 6 }}>{cat.icon}</span>}
                    {cat.name}
                  </span>
                  {selected && <span style={{ fontSize: 11, color: "#3b82f6" }}>✓</span>}
                </div>
              );
            })}

            {/* Footer: select all / clear */}
            {categories.length > 1 && (
              <div style={{
                borderTop: "1px solid #1e293b",
                padding:   "6px 14px",
                display:   "flex",
                gap:       8,
              }}>
                <button
                  onMouseDown={e => { e.preventDefault(); onChange(categories.map(c => c.name)); }}
                  style={{
                    background: "transparent", border: "none",
                    color: "#475569", fontSize: 11, cursor: "pointer", padding: 0,
                  }}
                >
                  Zaznacz wszystkie
                </button>
                {hasSelection && (
                  <>
                    <span style={{ color: "#1e293b" }}>·</span>
                    <button
                      onMouseDown={e => { e.preventDefault(); clearAll(); }}
                      style={{
                        background: "transparent", border: "none",
                        color: "#475569", fontSize: 11, cursor: "pointer", padding: 0,
                      }}
                    >
                      Wyczyść
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
