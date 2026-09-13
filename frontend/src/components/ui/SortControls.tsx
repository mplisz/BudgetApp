// ============================================================
// File: src/components/ui/SortControls.tsx
//
// Clickable sort UI for the transaction tables, in two shapes that share one
// arrow vocabulary:
//   - SortableTh — a table header cell (desktop)
//   - SortBar    — a row of chips (mobile, where the cards have no headers)
//
// Arrows: a column that can sort but isn't shows a faint ↕; the active one
// shows a blue ↓ (descending) or ↑ (ascending) and its label brightens.
// ============================================================

import type { CSSProperties } from "react";
import { c, alpha } from "../../styles/tokens";
import { TX_SORT_LABELS, type TxSort, type TxSortKey } from "../../utils/txSort";

interface SortProps {
  sort:   TxSort;
  onSort: (key: TxSortKey) => void;
}

function SortArrow({ active, dir }: { active: boolean; dir: TxSort["dir"] }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block", width: "1em", textAlign: "center",
        color: active ? c.infoLight : c.textSecondary,
        opacity: active ? 1 : 0.7,
        fontSize: active ? "1.25em" : "1.1em",
        fontWeight: 700, lineHeight: 1,
      }}
    >
      {!active ? "↕" : dir === "desc" ? "↓" : "↑"}
    </span>
  );
}

function sortTitle(key: TxSortKey, sort: TxSort): string {
  const label = TX_SORT_LABELS[key];
  if (sort.key !== key) return `Sortuj: ${label}`;
  return `Sortowanie: ${label} ${sort.dir === "desc" ? "malejąco" : "rosnąco"} — kliknij, aby odwrócić`;
}

// ── Table header cell ─────────────────────────────────────────

interface SortableThProps extends SortProps {
  sortKey: TxSortKey;
  /** Base <th> style of the table (e.g. txStyles `s.th`). */
  style:   CSSProperties;
  align?:  "left" | "right";
}

export function SortableTh({ sortKey, sort, onSort, style, align = "left" }: SortableThProps) {
  const active = sort.key === sortKey;
  return (
    <th
      style={{ ...style, textAlign: align }}
      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={sortTitle(sortKey, sort)}
        style={{
          // Keep the header's type styling — a button resets it otherwise.
          font: "inherit", fontWeight: "inherit", textTransform: "inherit", letterSpacing: "inherit",
          display: "inline-flex", alignItems: "center", gap: 4,
          flexDirection: align === "right" ? "row-reverse" : "row",
          cursor: "pointer", userSelect: "none",
          padding: 0, border: "none", background: "none",
          color: active ? c.text : style.color,
        }}
      >
        {TX_SORT_LABELS[sortKey]}
        <SortArrow active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

// ── Mobile chip bar ───────────────────────────────────────────

interface SortBarProps extends SortProps {
  keys:   TxSortKey[];
  style?: CSSProperties;
}

export function SortBar({ keys, sort, onSort, style }: SortBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8, ...style }}>
      <span style={{ fontSize: 11, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
        Sortuj
      </span>
      {keys.map(key => {
        const active = sort.key === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSort(key)}
            title={sortTitle(key, sort)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              color:      active ? c.text : c.textSecondary,
              background: active ? alpha(c.info, "22") : c.border,
              border:     `1px solid ${active ? alpha(c.info, "66") : "transparent"}`,
            }}
          >
            {TX_SORT_LABELS[key]}
            <SortArrow active={active} dir={sort.dir} />
          </button>
        );
      })}
    </div>
  );
}
