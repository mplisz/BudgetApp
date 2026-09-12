import type { CSSProperties } from "react";
import { pillStyle } from "../../utils/helpers";

export interface QuickPill {
  label:   string;
  active:  boolean;
  onClick: () => void;
  title?:  string;
  /** Per-pill overrides on top of pillStyle — e.g. the shopping list
   *  needs thumb-sized targets, since that row is tapped while walking. */
  style?:  CSSProperties;
}

// Renders a wrapping row of quick-action pills. Each pill's active state and
// handler are computed by the caller — keeps this component fully generic.
export function QuickPills({ pills, style }: { pills: QuickPill[]; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", ...style }}>
      {pills.map((p, i) => (
        <button
          key={i}
          type="button"
          onClick={p.onClick}
          title={p.title}
          style={{ ...pillStyle(p.active), ...p.style }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}