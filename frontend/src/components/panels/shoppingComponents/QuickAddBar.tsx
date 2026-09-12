// ============================================================
// File: src/components/panels/shoppingComponents/QuickAddBar.tsx
// The "dopisz produkt" field — free text with suggestions from the
// family's own catalog.
//
// Shares its interaction with MerchantInput through useSuggestions; what
// is specific here is that the list opens UPWARDS (the bar is sticky at
// the bottom of the screen) and that submitting keeps the field FOCUSED:
// adding five things in a row is the normal case, and re-tapping the
// field between each would be the whole cost of using the list.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState, useRef, useCallback } from "react";
import { theme as s } from "../../../styles/theme";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { useSuggestions } from "../../../hooks/useSuggestions";
import type { CatalogEntry } from "../../../hooks/useShoppingList";

interface QuickAddBarProps {
  catalog: CatalogEntry[];
  onAdd:   (name: string, unit: string | null) => void;
}

const entryLabel = (e: CatalogEntry) => e.name;

export function QuickAddBar({ catalog, onAdd }: QuickAddBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // On a phone the bottom navigation is fixed over the viewport edge, so
  // sticking to 0 would park this field underneath it.
  const isMobile = useIsMobile();

  const submit = useCallback((name: string, unit: string | null) => {
    const clean = name.trim();
    if (!clean) return;
    onAdd(clean, unit);
    setValue("");
    inputRef.current?.focus();   // ready for the next item
  }, [onAdd]);

  const sug = useSuggestions<CatalogEntry>({
    options: catalog,
    query: value,
    getLabel: entryLabel,
    onPick: useCallback((e: CatalogEntry) => submit(e.name, e.unit), [submit]),
    onEnterRaw: useCallback(() => submit(value, null), [submit, value]),
  });

  return (
    <div style={{
      position: "sticky", bottom: isMobile ? 62 : 0, zIndex: 20,
      background: c.bg, borderTop: `1px solid ${c.border}`,
      padding: "10px 0 6px", marginTop: 16,
    }}>
      <div style={{ position: "relative", display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder="Dopisz produkt…"
          autoComplete="off"
          onChange={e => { setValue(e.target.value); sug.handleInput(); }}
          onFocus={sug.handleFocus}
          // Enter must never submit a surrounding form, whichever branch
          // useSuggestions takes.
          onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); sug.handleKeyDown(e); }}
          onBlur={sug.handleBlur}
          style={{ ...s.input, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => submit(value, null)}
          disabled={!value.trim()}
          style={{
            background: value.trim() ? c.success : c.border,
            color: value.trim() ? c.white : c.textMuted,
            border: "none", borderRadius: 10, padding: "0 22px",
            fontSize: 20, fontWeight: 700,
            cursor: value.trim() ? "pointer" : "not-allowed",
          }}
          aria-label="Dodaj do listy"
        >
          +
        </button>

        {sug.showList && (
          <ul
            role="listbox"
            style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0,
              margin: 0, padding: 4, listStyle: "none", zIndex: 50,
              background: c.surface, border: `1px solid ${c.border}`,
              borderRadius: 8, maxHeight: 220, overflowY: "auto",
              boxShadow: "0 -8px 24px rgba(0,0,0,.4)",
            }}
          >
            {sug.suggestions.map((e, i) => (
              <li
                key={e.key}
                role="option"
                aria-selected={i === sug.highlight}
                onMouseDown={ev => { ev.preventDefault(); sug.pick(e); }}
                onMouseEnter={() => sug.setHighlight(i)}
                style={{
                  padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                  fontSize: 14, color: c.text,
                  background: i === sug.highlight ? c.border : "transparent",
                }}
              >
                🧺 {e.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
