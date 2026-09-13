// ============================================================
// File: src/hooks/useTxLinkFilters.ts
//
// Receiving end of txLink() (src/data/routes.ts): when a transaction panel
// is opened through a deep link, hand the link's filters to the panel once
// and strip them from the URL.
//
// Why strip instead of keeping the URL as the filter state:
//   - the panels own their filters in useFilters; "✕ Wyczyść" must clear
//     to nothing, not back to whatever the link said
//   - a filter the user changes afterwards would otherwise disagree with
//     the address bar
// `replace` keeps history clean: Back from the panel returns to the page
// the link was clicked on, not to the same panel without its filters.
// ============================================================

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { readTxLink, TX_LINK_PARAMS, type TxLinkFilters } from "../data/routes";

export function useTxLinkFilters(apply: (link: TxLinkFilters) => void): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const link = readTxLink(searchParams);
  const key  = link ? `${link.type}|${link.category ?? ""}|${link.sub ?? ""}` : null;

  // Latest callback without re-running the effect on every render.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!link) return;
    applyRef.current(link);
    setSearchParams(prev => {
      const out = new URLSearchParams(prev);
      for (const p of TX_LINK_PARAMS) out.delete(p);
      return out;
    }, { replace: true });
    // Keyed on the link's content: `link` is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
