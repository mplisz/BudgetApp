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
// Free text is always allowed; the typed value is POSTed/remembered
// on save. Junk values are filtered by cleanMerchant on the consumer
// side, so this component stays purely about input + suggestions.
// ============================================================

import { useState, useMemo, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useAppContext } from "../../context/AppContext";

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

const MAX_SUGGESTIONS = 6;

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
  const { merchants } = useAppContext() as { merchants?: string[] };
  const options = Array.isArray(merchants) ? merchants : [];

  const [open, setOpen]           = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show suggestions only while the user is typing, match by substring,
  // and hide the list once the value is an exact (case-insensitive) match —
  // that's the signal they've finished typing or picked one.
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    if (options.some(m => m.toLowerCase() === q)) return [];
    return options
      .filter(m => m.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [value, options]);

  const showList = open && suggestions.length > 0;

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setHighlight(h => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        return ((next % suggestions.length) + suggestions.length) % suggestions.length;
      });
      return;
    }
    if (e.key === "Enter") {
      if (showList && highlight >= 0) {
        e.preventDefault();
        pick(suggestions[highlight]);
        return;
      }
      onEnter?.();
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", ...wrapperStyle }}>
      <input
        type="text"
        value={value || ""}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay close so a tap on a suggestion registers first.
          blurTimer.current = setTimeout(() => { setOpen(false); setHighlight(-1); }, 120);
          onBlur?.();
        }}
        style={style}
      />

      {showList && (
        <ul
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            margin: 0, padding: 4, listStyle: "none", zIndex: 50,
            background: "#0d1424", border: "1px solid #1e293b",
            borderRadius: 8, maxHeight: 220, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          {suggestions.map((m, i) => (
            <li
              key={m}
              role="option"
              aria-selected={i === highlight}
              // onMouseDown + preventDefault so the input's onBlur doesn't
              // fire first and close the list before the tap selects.
              onMouseDown={e => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "9px 12px", borderRadius: 6, cursor: "pointer",
                fontSize: 14, color: "#e2e8f0",
                background: i === highlight ? "#1e293b" : "transparent",
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
