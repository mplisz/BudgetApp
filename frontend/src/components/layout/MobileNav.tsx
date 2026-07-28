// ============================================================
// File: src/components/layout/MobileNav.tsx
//
// Bottom mobile navigation — 4 quick-add panels + "Więcej".
//
// The first four slots are NavLinks to the quick-add screens
// (unchanged behaviour). The fifth slot is a plain button that
// toggles the MoreSheet — a bottom sheet listing every panel
// flagged `mobile: true` in PANEL_META.
//
// "Więcej" highlights in two cases:
//   - the sheet is currently open, or
//   - the active panel is one of the sheet's panels (so the bar
//     always shows *where you are*, even after the sheet closes).
//
// Links are PLAIN paths (no `?m=`): switching panels resets the
// month to the first open budget month (AuthenticatedLayout fills
// ?m= in) — prevents adding expenses to a stale month.
// ============================================================

import { c } from "../../styles/tokens";
import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { PANEL_PATHS, panelIdFromPath } from "../../data/routes";
import { MoreSheet, MORE_SHEET_PANEL_IDS } from "./MoreSheet";

interface MobileItem {
  panelId: string;
  icon:    string;
  label:   string;
}

const MOBILE_ITEMS: MobileItem[] = [
  { panelId: "expenses",     icon: "➕", label: "Wydatki"    },
  { panelId: "addincome",    icon: "💵", label: "Wpływy"     },
  { panelId: "addrecurring", icon: "🔄", label: "Cykliczne"  },
  { panelId: "addplanned",   icon: "📅", label: "Planowane"  },
];

// Shared look for every slot in the bar — links and the button
// must be pixel-identical.
const slotStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: "10px 4px 14px",
  textAlign: "center", cursor: "pointer",
  background: "none", border: "none",
  textDecoration: "none",
  color: active ? c.success : c.textMuted,
  font: "inherit",
});

export function MobileNav() {
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Any navigation closes the sheet (covers browser back too).
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  const activePanelId = panelIdFromPath(pathname);
  const moreIsActive  =
    sheetOpen ||
    (activePanelId !== null && MORE_SHEET_PANEL_IDS.includes(activePanelId));

  return (
    <>
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: c.surface, borderTop: `1px solid ${c.border}`,
        display: "flex", zIndex: 300,
      }}>
        {MOBILE_ITEMS.map(item => {
          const path = PANEL_PATHS[item.panelId];
          if (!path) return null;
          return (
            <NavLink
              key={item.panelId}
              to={path}
              end
              onClick={() => setSheetOpen(false)}
              style={({ isActive }) => slotStyle(isActive)}
            >
              <span style={{ fontSize: 20, display: "block" }}>{item.icon}</span>
              <span style={{ fontSize: 10, display: "block", marginTop: 2, fontWeight: 600 }}>
                {item.label}
              </span>
            </NavLink>
          );
        })}

        {/* Fifth slot: "Więcej" — toggles the bottom sheet */}
        <button
          type="button"
          onClick={() => setSheetOpen(o => !o)}
          aria-expanded={sheetOpen}
          aria-label="Więcej paneli"
          style={slotStyle(moreIsActive)}
        >
          <span style={{ fontSize: 20, display: "block", lineHeight: "20px" }}>
            {sheetOpen ? "✕" : "☰"}
          </span>
          <span style={{ fontSize: 10, display: "block", marginTop: 2, fontWeight: 600 }}>
            Więcej
          </span>
        </button>
      </nav>

      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
