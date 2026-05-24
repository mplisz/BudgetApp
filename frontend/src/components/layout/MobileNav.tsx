// ============================================================
// File: src/components/layout/MobileNav.tsx
//
// Bottom mobile navigation — 4 main quick-add panels.
// Uses NavLink for proper active highlighting + URL change.
// Preserves the current ?m=YYYY-MM via useLinkWithMonth so the
// month context follows the user as they jump between quick-add
// screens.
// ============================================================

import { NavLink } from "react-router-dom";
import { PANEL_PATHS } from "../../data/routes";
import { useLinkWithMonth } from "../../hooks/useLinkWithMonth";

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

export function MobileNav() {
  const linkWithMonth = useLinkWithMonth();

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "#0d1424", borderTop: "1px solid #1e293b",
      display: "flex", zIndex: 300,
    }}>
      {MOBILE_ITEMS.map(item => {
        const path = PANEL_PATHS[item.panelId];
        if (!path) return null;
        return (
          <NavLink
            key={item.panelId}
            to={linkWithMonth(path)}
            end
            style={({ isActive }) => ({
              flex: 1, padding: "10px 4px 14px",
              textAlign: "center", cursor: "pointer",
              background: "none", border: "none",
              textDecoration: "none",
              color: isActive ? "#10b981" : "#475569",
            })}
          >
            <span style={{ fontSize: 20, display: "block" }}>{item.icon}</span>
            <span style={{ fontSize: 10, display: "block", marginTop: 2, fontWeight: 600 }}>
              {item.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
