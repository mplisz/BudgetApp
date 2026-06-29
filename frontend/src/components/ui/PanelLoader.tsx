// ============================================================
// File: src/components/ui/PanelLoader.tsx
//
// Used as the <Suspense> fallback in App.tsx — shown briefly while
// the lazy-loaded JS chunk for a panel is fetched (typically 200ms
// on warm cache, 1-2s on first visit / slow connection).
//
// Different from the data-loading skeletons: this is "code is on the
// way", they're "data is on the way". The panel's own skeleton
// kicks in once its chunk has loaded and the component mounts.
//
// Why centered with a small spinner instead of a full-panel skeleton:
//   - We don't know in advance which panel will load → can't pick a
//     fitting shape
//   - The wait here is short, so a minimal indicator is enough
//   - User expects "Ładowanie..." in this context
// ============================================================

import { c } from "../../styles/tokens";

const SPIN_STYLE_ID = "panel-loader-spin-keyframes";
const SPIN_CSS = `
@keyframes panel-loader-spin {
  to { transform: rotate(360deg); }
}
`;

function ensureSpinStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SPIN_STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = SPIN_STYLE_ID;
  tag.textContent = SPIN_CSS;
  document.head.appendChild(tag);
}

export function PanelLoader() {
  ensureSpinStyle();

  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "60px 20px",
      gap:            14,
    }}>
      <div style={{
        width:        28,
        height:       28,
        border:       `3px solid ${c.border}`,
        borderTop:    `3px solid ${c.success}`,
        borderRadius: "50%",
        animation:    "panel-loader-spin 0.8s linear infinite",
      }} />
      <div style={{
        color:      c.textSecondary,
        fontSize:   13,
        fontWeight: 600,
      }}>
        Ładowanie panelu...
      </div>
    </div>
  );
}
