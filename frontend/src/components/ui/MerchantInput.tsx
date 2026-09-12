// ============================================================
// File: src/components/ui/MerchantInput.tsx
// Editable shop-name field with a lightweight, non-intrusive
// autocomplete from the family's known merchants (AppContext).
//
// Replaces the native <datalist>, which on mobile aggressively
// covers the field and makes free-text entry of a NEW shop awkward.
// This custom dropdown only appears while typing, shows a short
// filtered list, and disappears on an exact match — so typing a
// brand-new name never fights with the suggestions.
//
// The interaction itself lives in useSuggestions (shared with the
// shopping list's quick-add bar); what stays here is the merchant
// wiring and this field's own dropdown, which opens downwards.
//
// Free text is always allowed; the typed value is POSTed/remembered
// on save. Junk values are filtered by cleanMerchant on the consumer
// side, so this component stays purely about input + suggestions.
// ============================================================

import { c } from "../../styles/tokens";
import { useCallback } from "react";
import type { CSSProperties } from "react";
import { useAppContext } from "../../context/AppContext";
import { useSuggestions } from "../../hooks/useSuggestions";

interface MerchantInputProps {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  autoFocus?:   boolean;
  style?:       CSSProperties;
  /** Optional override for the positioning wrapper (e.g. flex sizing in the OCR bar). */
  wrapperStyle?: CSSProperties;
  onBlur?:      () => void;
  onEnter?:     () => void;
}

const identity = (s: string) => s;

export function MerchantInput({
  value,
  onChange,
  placeholder = "Nazwa sklepu…",
  autoFocus = false,
  style = {},
  wrapperStyle = {},
  onBlur,
  onEnter,
}: MerchantInputProps) {
  const { merchants } = useAppContext();
  const options = Array.isArray(merchants) ? merchants : [];

  const sug = useSuggestions<string>({
    options,
    query: value,
    getLabel: identity,
    onPick: onChange,
    onEnterRaw: useCallback(() => { onEnter?.(); }, [onEnter]),
  });

  return (
    <div style={{ position: "relative", width: "100%", ...wrapperStyle }}>
      <input
        type="text"
        value={value || ""}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); sug.handleInput(); }}
        onFocus={sug.handleFocus}
        onKeyDown={sug.handleKeyDown}
        onBlur={() => { sug.handleBlur(); onBlur?.(); }}
        style={style}
      />

      {sug.showList && (
        <ul
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            margin: 0, padding: 4, listStyle: "none", zIndex: 50,
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 8, maxHeight: 220, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          {sug.suggestions.map((m, i) => (
            <li
              key={m}
              role="option"
              aria-selected={i === sug.highlight}
              // onMouseDown + preventDefault so the input's onBlur doesn't
              // fire first and close the list before the tap selects.
              onMouseDown={e => { e.preventDefault(); sug.pick(m); }}
              onMouseEnter={() => sug.setHighlight(i)}
              style={{
                padding: "9px 12px", borderRadius: 6, cursor: "pointer",
                fontSize: 14, color: c.text,
                background: i === sug.highlight ? c.border : "transparent",
              }}
            >
              🏪 {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
