// ============================================================
// File: src/components/ui/Pagination.jsx
//
// Renders page controls: ← prev | 1 2 3 … | next →
// Shows max 5 page buttons around the current page.
// ============================================================

import { c, alpha } from "../../styles/tokens";

export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  // Build the window of page numbers to show
  function getPages() {
    const delta  = 2;
    const range  = [];
    const left   = Math.max(2, page - delta);
    const right  = Math.min(totalPages - 1, page + delta);

    range.push(1);
    if (left > 2) range.push("…");
    for (let i = left; i <= right; i++) range.push(i);
    if (right < totalPages - 1) range.push("…");
    if (totalPages > 1) range.push(totalPages);

    return range;
  }

  const btn = (content, target, disabled = false, active = false) => (
    <button
      key={String(content) + String(target)}
      disabled={disabled || content === "…"}
      onClick={() => typeof target === "number" && onPageChange(target)}
      style={{
        minWidth: 34, height: 32, padding: "0 10px",
        borderRadius: 8, border: "1px solid",
        borderColor:  active ? c.success : c.border,
        background:   active ? alpha(c.success, "22") : "transparent",
        color:        active ? c.success : disabled || content === "…" ? c.borderStrong : c.textTertiary,
        cursor:       disabled || content === "…" ? "default" : "pointer",
        fontSize: 13, fontWeight: active ? 700 : 400,
      }}
    >
      {content}
    </button>
  );

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, padding: "16px 0 8px" }}>
      {btn("←", page - 1, page === 1)}
      {getPages().map((p, i) =>
        p === "…"
          ? <span key={`ellipsis-${i}`} style={{ color: c.borderStrong, padding: "0 4px" }}>…</span>
          : btn(p, p, false, p === page)
      )}
      {btn("→", page + 1, page === totalPages)}
    </div>
  );
}
