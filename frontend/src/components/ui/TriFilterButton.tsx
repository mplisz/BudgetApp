// ============================================================
// File: src/components/ui/TriFilterButton.tsx
// Reusable tri-state toggle for boolean filters.
// 3 states: off (—) → yes (only matching) → no (exclude matching).
// UI: Polish | Comments: English
// ============================================================

export type Tri = "off" | "yes" | "no";

// Cycle order: off → yes → no → off
const NEXT: Record<Tri, Tri> = { off: "yes", yes: "no", no: "off" };
export const cycleTri = (state: Tri): Tri => NEXT[state];

/**
 * Predicate for the filtering useMemo — keeps panels free of if/else noise.
 *   off → row always passes
 *   yes → passes only when `value` is true   (keep only matching)
 *   no  → passes only when `value` is false  (exclude matching)
 *
 * Usage:
 *   if (!matchTri(filters.warranty, !!tx.isWarranty)) return false;
 */
export const matchTri = (state: Tri, value: boolean): boolean =>
  state === "off" || (state === "yes" ? value : !value);

interface TriFilterButtonProps {
  state:     Tri;
  onChange:  (next: Tri) => void;
  /** Full label with icon, e.g. "🛡️ Gwarancyjne". */
  label:     string;
  /** Background color for the "yes" state (defaults to amber). "no" is always red. */
  color?:    string;
}

export function TriFilterButton({
  state, onChange, label, color = "#f59e0b",
}: TriFilterButtonProps) {
  const bg  = state === "yes" ? color : state === "no" ? "#ef4444" : "#1e293b";
  const txt = state === "off" ? "#64748b" : "#000";
  const prefix = state === "yes" ? "✓ " : state === "no" ? "🚫 " : "";

  return (
    <button
      type="button"
      onClick={() => onChange(cycleTri(state))}
      aria-pressed={state !== "off"}
      title="Klik: — → Tak → Nie"
      style={{
        height: 28, padding: "0 10px", borderRadius: 6, border: "none",
        cursor: "pointer", fontWeight: 700, fontSize: 11,
        background: bg, color: txt,
        transition: "background .15s, color .15s",
        textDecoration: state === "no" ? "line-through" : "none",
      }}
    >
      {prefix}{label}
    </button>
  );
}
