// ============================================================
// File: src/components/ui/FilterGroup.tsx
//
// Collapsible groups for the transaction panels' filter bars (Wydatki,
// Wpływy). A flat row of a dozen filters wrapped into an unreadable heap on
// a phone; grouped, each part of the question ("which category", "when",
// "which shop") gets one header you can fold away.
//
// A collapsed group still says what it is filtering: the header carries the
// number of active filters, a one-line summary of their values and a ✕ that
// clears just that group — so a short list never has a hidden reason.
//
// Open/closed state (useFilterGroups):
//   - desktop: every group starts open; mobile: only groups already filtering
//   - the user's own toggles are remembered per panel (localStorage)
//   - a closed group opens by itself when it BECOMES active from outside
//     (e.g. a deep link from Podsumowanie) — but nothing ever closes on its
//     own, so clearing a filter never snaps the group shut under your finger
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import { c, alpha } from "../../styles/tokens";

export interface FilterGroupDef {
  id:     string;
  /** Number of filters in the group that are set. 0 = inactive. */
  active: number;
}

// ── Open/closed state ─────────────────────────────────────────

function readStored(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

export function useFilterGroups(storageKey: string, groups: FilterGroupDef[], isMobile: boolean) {
  const key = `filterGroups:${storageKey}`;

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const stored = readStored(key);
    return Object.fromEntries(groups.map(g => [g.id, stored[g.id] ?? (!isMobile || g.active > 0)]));
  });

  // Auto-open on an inactive → active transition only.
  const prevActive = useRef<Record<string, number>>(Object.fromEntries(groups.map(g => [g.id, g.active])));
  const activeKey  = groups.map(g => `${g.id}:${g.active}`).join("|");
  useEffect(() => {
    const opened = groups.filter(g => g.active > 0 && !(prevActive.current[g.id] > 0));
    prevActive.current = Object.fromEntries(groups.map(g => [g.id, g.active]));
    if (opened.length) setOpen(prev => ({ ...prev, ...Object.fromEntries(opened.map(g => [g.id, true])) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  function toggle(id: string) {
    setOpen(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode etc. */ }
      return next;
    });
  }

  return { isOpen: (id: string) => open[id] ?? !isMobile, toggle };
}

// ── Summary helpers ───────────────────────────────────────────

/** "Alkohol, Kino +2" — the first `max` values, then how many more. */
export function listSummary(values: string[], max = 2): string {
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} +${values.length - max}`;
}

/** Summary line from parts; empty parts are skipped. */
export function joinSummary(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

// ── Layout ────────────────────────────────────────────────────

/** Desktop: groups side by side, wrapping. Mobile: one stacked accordion. */
export function FilterGroupGrid({ isMobile, children }: { isMobile: boolean; children: ReactNode }) {
  return (
    <div style={isMobile
      ? { display: "flex", flexDirection: "column" }
      : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, alignItems: "start" }}
    >
      {children}
    </div>
  );
}

interface FilterGroupProps {
  icon:     string;
  title:    string;
  active:   number;
  /** What the group filters, shown while collapsed. */
  summary:  string;
  open:     boolean;
  onToggle: () => void;
  onClear:  () => void;
  isMobile: boolean;
  children: ReactNode;
}

export function FilterGroup({ icon, title, active, summary, open, onToggle, onClear, isMobile, children }: FilterGroupProps) {
  return (
    <div style={isMobile
      ? { borderTop: `1px solid ${c.border}` }
      : { border: `1px solid ${active ? alpha(c.info, "44") : c.border}`, borderRadius: 10, padding: "0 12px" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          minHeight: isMobile ? 44 : 36, cursor: "pointer", userSelect: "none",
        }}
      >
        <span aria-hidden style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: active ? c.text : c.textTertiary, textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {active > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: c.infoLight, background: alpha(c.info, "22"), border: `1px solid ${alpha(c.info, "55")}`, borderRadius: 10, padding: "0 6px", lineHeight: "16px" }}>
            {active}
          </span>
        )}
        <span style={{
          flex: 1, minWidth: 0, textAlign: "right", fontSize: 12,
          color: summary ? c.textSecondary : c.textMuted,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {!open && (summary || "brak")}
        </span>
        {active > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onClear(); }}
            title={`Wyczyść: ${title}`}
            aria-label={`Wyczyść: ${title}`}
            style={{ border: "none", background: "none", color: c.danger, cursor: "pointer", fontSize: 12, padding: "2px 4px" }}
          >
            ✕
          </button>
        )}
        <span aria-hidden style={{ color: c.textMuted, fontSize: 14, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s" }}>▾</span>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", paddingBottom: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}
