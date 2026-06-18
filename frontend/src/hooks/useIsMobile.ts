// ============================================================
// File: src/hooks/useIsMobile.ts
//
// Shared viewport-width hook. Replaces the local copies that
// previously lived in PanelSafetyNet.tsx and ToastContainer —
// import from here instead of redeclaring.
//
// Uses matchMedia (not a resize listener) so React re-renders
// only when the breakpoint is actually crossed, not on every
// resize event.
//
// Usage:
//   const isMobile = useIsMobile();                       // ≤700px
//   const isNarrow = useIsMobile(BREAKPOINT_NARROW_PX);   // ≤900px
// ============================================================

import { useEffect, useState } from "react";
import { BREAKPOINT_MOBILE_PX } from "../data/constants";

export function useIsMobile(breakpointPx: number = BREAKPOINT_MOBILE_PX): boolean {
  const query = `(max-width: ${breakpointPx}px)`;

  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Sync once in case `breakpointPx` changed between renders.
    setMatches(mql.matches);

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
