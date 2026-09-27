// ============================================================
// File: src/components/panels/shoppingComponents/layout.ts
// The few style values every part of the shopping list shares, so the
// pills, the day chips and the group headings cannot drift apart.
// ============================================================

import type { CSSProperties } from "react";

/** A pill tapped one-handed while walking — the frequent products and
 *  the day chips of "na termin". */
export const THUMB_PILL: CSSProperties = { padding: "9px 14px", fontSize: 13, borderRadius: 20, minHeight: 38 };

/** A CollapsibleSection stripped of its card chrome — the list's groups
 *  (aisles, days) are headings over rows, not boxes around them. */
export const GROUP_SECTION: CSSProperties = {
  background: "transparent", border: "none", borderRadius: 0,
  padding: 0, marginTop: 0, marginBottom: 14,
};
