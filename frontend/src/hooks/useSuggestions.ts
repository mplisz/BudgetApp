// ============================================================
// File: src/hooks/useSuggestions.ts
// The shared behaviour behind every "type freely, but here are your own
// past values" field in the app (shop names, shopping-list products).
//
// What is shared is the BEHAVIOUR, not the look: suggestions appear only
// while typing, an exact match closes the list (you have finished typing
// — or picked one), free text always wins, arrows move the highlight,
// Escape closes, and the close on blur is delayed so a tap on a
// suggestion registers before the list disappears.
//
// Rendering and placement stay with the caller: the merchant field drops
// its list downwards inside a form, the shopping bar opens upwards from a
// sticky footer. Those differ for real reasons, so only the logic moved
// here.
// ============================================================

import { useState, useMemo, useRef, useCallback } from "react";
import type { KeyboardEvent } from "react";

const DEFAULT_MAX = 6;
// Long enough for a tap to land, short enough that the list never lingers.
const BLUR_CLOSE_MS = 120;

interface UseSuggestionsOptions<T> {
  /** Everything the user could pick from (already loaded). */
  options: T[];
  /** Current input text. */
  query: string;
  /** How to read an option's display text. */
  getLabel: (option: T) => string;
  /** Called when a suggestion is chosen (click, tap or Enter). */
  onPick: (option: T) => void;
  /** Called on Enter when no suggestion is highlighted — i.e. the user
   *  means the raw text they typed. */
  onEnterRaw?: () => void;
  max?: number;
}

export function useSuggestions<T>({
  options, query, getLabel, onPick, onEnterRaw, max = DEFAULT_MAX,
}: UseSuggestionsOptions<T>) {
  const [open, setOpen]           = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // An exact match means there is nothing left to suggest — and keeping
    // the list open there is what makes typing a brand-new value fight
    // with the dropdown on a phone.
    if (options.some(o => getLabel(o).toLowerCase() === q)) return [];
    return options.filter(o => getLabel(o).toLowerCase().includes(q)).slice(0, max);
  }, [options, query, getLabel, max]);

  const showList = open && suggestions.length > 0;

  const close = useCallback(() => { setOpen(false); setHighlight(-1); }, []);

  const pick = useCallback((option: T) => { onPick(option); close(); }, [onPick, close]);

  /** Call from the input's onChange, after updating the value. */
  const handleInput = useCallback(() => { setOpen(true); setHighlight(-1); }, []);

  const handleFocus = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
  }, []);

  const handleBlur = useCallback(() => {
    blurTimer.current = setTimeout(close, BLUR_CLOSE_MS);
  }, [close]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
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
      onEnterRaw?.();
      return;
    }
    if (e.key === "Escape") close();
  }, [showList, suggestions, highlight, pick, onEnterRaw, close]);

  return {
    suggestions, showList, highlight, setHighlight,
    pick, close,
    handleInput, handleFocus, handleBlur, handleKeyDown,
  };
}
