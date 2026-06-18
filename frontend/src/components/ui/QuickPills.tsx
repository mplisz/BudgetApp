import type { CSSProperties } from "react";
import { pillStyle } from "../../utils/helpers";

export interface QuickPill {
  label:   string;
  active:  boolean;
  onClick: () => void;
}

// Renders a wrapping row of quick-action pills. Each pill's active state and
// handler are computed by the caller — keeps this component fully generic.
export function QuickPills({ pills, style }: { pills: QuickPill[]; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", ...style }}>
      {pills.map((p, i) => (
        <button key={i} type="button" onClick={p.onClick} style={pillStyle(p.active)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}