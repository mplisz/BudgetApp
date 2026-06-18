// ============================================================
// File: src/data/constants/breakpoints.js
// Single source of truth for responsive breakpoints.
//
// Convention (keep it to TWO tiers — resist adding more):
//
//   MOBILE (≤700px)  — "this is a phone".
//     Switches navigation (Sidebar → MobileNav + MoreSheet) and
//     swaps table layouts for card layouts. Matches the existing
//     700px media query in App.tsx / ToastContainer.
//
//   NARROW (≤900px)  — "this is a narrow viewport".
//     Collapses multi-column grids (1fr 1fr → 1fr). Matches the
//     existing 900px media queries in PanelAnalytics and
//     PanelSafetyNet (data-sn-row / data-analytics-cols).
//
// Use in JS:    useIsMobile() / useIsMobile(BREAKPOINT_NARROW_PX)
// Use in CSS:   @media (max-width: ${BREAKPOINT_MOBILE_PX}px) { … }
// ============================================================

export const BREAKPOINT_MOBILE_PX = 700;
export const BREAKPOINT_NARROW_PX = 900;
