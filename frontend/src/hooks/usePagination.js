// ============================================================
// File: src/hooks/usePagination.js
//
// Generic pagination hook.
// Usage:
//   const { page, totalPages, paginated, setPage, reset } = usePagination(items, 25);
// ============================================================

import { useState, useMemo, useEffect } from "react";

export function usePagination(items, pageSize = 25) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the source data changes
  // (e.g. filter applied, month changed)
  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Clamp page to valid range if items shrink
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  function reset() { setPage(1); }

  return { page: safePage, totalPages, paginated, setPage, reset };
}
