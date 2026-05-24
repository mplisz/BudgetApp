// ============================================================
// File: src/hooks/useLinkWithMonth.ts
//
// Helper that builds a <NavLink to={...}> target object preserving
// the current `?m=` query param. Used by Sidebar and MobileNav so
// that clicking "Transakcje" while on /expenses/add?m=2026-03
// takes you to /transactions?m=2026-03 (not /transactions).
//
// Why a hook vs. inline `{ pathname, search: location.search }`:
//   1. Strips other query params (filters, etc.) — we only want `m`.
//   2. Single place to evolve the "what's preserved" policy.
// ============================================================

import { useLocation } from "react-router-dom";
import type { To } from "react-router-dom";

export function useLinkWithMonth() {
  const { search } = useLocation();

  return function buildTo(pathname: string): To {
    const params = new URLSearchParams(search);
    const m = params.get("m");
    const out = new URLSearchParams();
    if (m) out.set("m", m);
    const qs = out.toString();
    return { pathname, search: qs ? `?${qs}` : "" };
  };
}
