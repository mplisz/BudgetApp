// ============================================================
// File: src/hooks/useFilters.ts
//
// Generic filter-state hook.
//
// Instead of declaring N separate useState calls per panel and
// writing a custom clearFilters every time, this hook takes a
// typed "initial state" object and returns:
//   - the current filter values
//   - individual setters (one per key)
//   - clear()         — resets all filters to initial values
//   - hasActive       — true when any filter differs from initial
//
// Usage (PanelTransactions):
//
//   const { filters, set, clear, hasActive } = useFilters({
//     categories:  [] as string[],
//     subs:        [] as string[],
//     dateFrom:    null as Date | null,
//     dateTo:      null as Date | null,
//     prio:        [] as number[],
//     tags:        [] as string[],
//     hasReturn:   false,
//   });
//
//   // Read:  filters.categories
//   // Write: set("categories", ["Dom i ogród"])
//   //        set("dateFrom", new Date())
//   // Clear: clear()
//   // Guard: hasActive
//
// The hook is intentionally dumb about what the values mean —
// it just holds state and knows how to reset it. All filtering
// logic (the useMemo that actually filters rows) stays in the
// panel, because it depends on the panel's data shape.
//
// Design notes:
//   - `initial` is captured once on mount (via useRef) so callers
//     can pass an inline object literal without causing re-renders.
//   - `hasActive` uses deep-equality via JSON.stringify — fine for
//     the small, serialisable filter objects used here.
//   - Individual setters are stable (created once, not recreated
//     on every render) thanks to the `set` dispatch pattern.
// ============================================================

import { useReducer, useRef, useCallback, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────

type FilterState = Record<string, unknown>;

type Action<S extends FilterState> =
  | { type: "SET"; key: keyof S; value: S[keyof S] }
  | { type: "CLEAR"; initial: S };

type Setters<S extends FilterState> = {
  [K in keyof S]: (value: S[K]) => void;
};

interface UseFiltersReturn<S extends FilterState> {
  /** Current filter values. */
  filters:   S;
  /** Set a single filter by key. */
  set:       <K extends keyof S>(key: K, value: S[K]) => void;
  /** Typed setters object — convenient for passing to child components. */
  setters:   Setters<S>;
  /** Reset all filters to initial values. */
  clear:     () => void;
  /** True when any filter differs from its initial value. */
  hasActive: boolean;
}

// ── Reducer ───────────────────────────────────────────────────

function filtersReducer<S extends FilterState>(state: S, action: Action<S>): S {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value };
    case "CLEAR":
      return { ...action.initial };
    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────

export function useFilters<S extends FilterState>(initial: S): UseFiltersReturn<S> {
  // Capture initial on mount — lets callers pass inline object literals
  // without causing the hook to reset on every render.
  const initialRef = useRef<S>(initial);

  const [filters, dispatch] = useReducer(
    filtersReducer as (state: S, action: Action<S>) => S,
    initialRef.current,
  );

  const set = useCallback(<K extends keyof S>(key: K, value: S[K]) => {
    dispatch({ type: "SET", key, value });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR", initial: initialRef.current });
  }, []);

  // Build one stable setter per key (created once on mount).
  const setters = useMemo(() => {
    const result = {} as Setters<S>;
    for (const key of Object.keys(initialRef.current) as (keyof S)[]) {
      // Each setter is a stable closure over `key`.
      result[key] = (value: S[typeof key]) => dispatch({ type: "SET", key, value });
    }
    return result;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActive = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(initialRef.current),
    [filters],
  );

  return { filters, set, setters, clear, hasActive };
}
