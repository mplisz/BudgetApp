// ============================================================
// File: src/components/layout/Sidebar.tsx
//
// Sidebar navigation using React Router NavLink.
//
// Key behaviour:
//   - Active highlighting comes from NavLink's isActive — no
//     need to compare panel IDs anymore.
//   - useLinkWithMonth() preserves `?m=YYYY-MM` across panels,
//     so jumping from /transactions?m=2026-03 to "Summary" lands
//     on /summary?m=2026-03 (not "today").
// ============================================================

import { NavLink } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { PANEL_META } from "../../data/constants";
import { PANEL_PATHS } from "../../data/routes";
import { useLinkWithMonth } from "../../hooks/useLinkWithMonth";

interface PanelMetaEntry {
  icon:    string;
  label:   string;
  section: string;
}

interface SidebarItem {
  section?: string;
  id?:      string;
  icon?:    string;
  label?:   string;
  path?:    string;
}

// Derive sidebar items from PANEL_META — single source of truth.
// Panels without a matching path entry in PANEL_PATHS are silently
// skipped (e.g. if someone forgets to register a route).
const SIDEBAR_ITEMS: SidebarItem[] = (() => {
  const items: SidebarItem[] = [];
  let lastSection: string | null = null;
  for (const [id, raw] of Object.entries(PANEL_META as Record<string, PanelMetaEntry>)) {
    const path = PANEL_PATHS[id];
    if (!path) continue;
    if (raw.section !== lastSection) {
      items.push({ section: raw.section });
      lastSection = raw.section;
    }
    items.push({ id, icon: raw.icon, label: raw.label, path });
  }
  return items;
})();

interface Voucher {
  isArchived:     boolean;
  remainingValue: number;
  expiresAt:      string | null;
}

interface AppCtxView {
  vouchers: Voucher[];
  settings: { voucherExpiryWarningDays?: number } | null;
}

export function Sidebar() {
  const { vouchers, settings } = useAppContext() as AppCtxView;
  const linkWithMonth = useLinkWithMonth();

  // Badge: count active vouchers expiring within configured window
  const warnDays = settings?.voucherExpiryWarningDays ?? 14;
  const expiringCount = (vouchers || []).filter(v => {
    if (v.isArchived || v.remainingValue <= 0 || !v.expiresAt) return false;
    const days = Math.ceil((new Date(v.expiresAt).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= warnDays;
  }).length;

  return (
    <aside style={{
      width: 220, background: "#0d1424", borderRight: "1px solid #1e293b",
      display: "flex", flexDirection: "column",
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200,
    }}>
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#10b981", letterSpacing: "-0.5px" }}>
          💚 BudżetRodzinny
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {SIDEBAR_ITEMS.map((item, i) => item.section ? (
          <div key={`section-${i}`} style={{
            padding: "12px 16px 4px", fontSize: 10, color: "#334155",
            textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700,
          }}>
            {item.section}
          </div>
        ) : (
          <NavLink
            key={item.id}
            to={linkWithMonth(item.path!)}
            end
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", margin: "2px 8px",
              width: "calc(100% - 16px)",
              borderRadius: 10, border: "none", textDecoration: "none",
              cursor: "pointer", textAlign: "left",
              background:  isActive ? "#10b98122" : "transparent",
              color:       isActive ? "#10b981"   : "#64748b",
              borderLeft:  isActive ? "3px solid #10b981" : "3px solid transparent",
              transition: "all 0.15s",
            })}
          >
            {({ isActive }) => (
              <>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  flex: 1,
                }}>
                  {item.label}
                </span>
                {item.id === "vouchers" && expiringCount > 0 && (
                  <span style={{
                    background: "#ef4444", color: "#fff",
                    borderRadius: 99, padding: "1px 6px",
                    fontSize: 10, fontWeight: 800,
                  }}>
                    {expiringCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
