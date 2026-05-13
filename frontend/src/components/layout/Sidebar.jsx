// ============================================================
// File: src/components/layout/Sidebar.jsx
// ============================================================

import { useAppContext }   from "../../context/AppContext";
import { useAuth }         from "../../context/AuthContext";
import { PANEL_META }      from "../../data/constants";

// Derive sidebar items from PANEL_META — single source of truth
const SIDEBAR_ITEMS = (() => {
  const items = [];
  let lastSection = null;
  for (const [id, meta] of Object.entries(PANEL_META)) {
    if (meta.section !== lastSection) {
      items.push({ section: meta.section });
      lastSection = meta.section;
    }
    items.push({ id, icon: meta.icon, label: meta.label });
  }
  return items;
})();

export function Sidebar() {
  const { panel, setPanel, vouchers, settings } = useAppContext();
  const { user } = useAuth();

  // Badge: count active vouchers expiring within configured window
  const warnDays = settings?.voucherExpiryWarningDays ?? 14;
  const expiringCount = (vouchers || []).filter(v => {
    if (v.isArchived || v.remainingValue <= 0 || !v.expiresAt) return false;
    const days = Math.ceil((new Date(v.expiresAt) - new Date()) / 86400000);
    return days >= 0 && days <= warnDays;
  }).length;

  return (
    <aside style={{ width: 220, background: "#0d1424", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200 }}>
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#10b981", letterSpacing: "-0.5px" }}>💚 BudżetRodzinny</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {SIDEBAR_ITEMS.map((item, i) => item.section ? (
          <div key={i} style={{ padding: "12px 16px 4px", fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700 }}>
            {item.section}
          </div>
        ) : (
          <button key={item.id} onClick={() => setPanel(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", margin: "2px 8px",
              width: "calc(100% - 16px)", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left",
              background:  panel === item.id ? "#10b98122" : "transparent",
              color:       panel === item.id ? "#10b981"   : "#64748b",
              borderLeft:  panel === item.id ? "3px solid #10b981" : "3px solid transparent",
              transition: "all 0.15s",
            }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span style={{ fontSize: 13, fontWeight: panel === item.id ? 700 : 500, flex: 1 }}>{item.label}</span>
            {item.id === "vouchers" && expiringCount > 0 && (
              <span style={{ background: "#f9731622", color: "#f97316", border: "1px solid #f9731666", borderRadius: 4, padding: "0px 4px", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>
                !
              </span>
            )}
          </button>
        ))}
      </div>

      <UserBadge user={user} />
    </aside>
  );
}

function UserBadge({ user }) {
  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 10 }}>
      {user?.picture ? (
        <img
          src={user.picture}
          alt="Profil"
          onError={(e) => { e.target.style.display = "none"; }}
          style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #10b98144" }}
        />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#10b98122", border: "2px solid #10b98144", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#10b981" }}>
          {user?.name?.charAt(0) || "U"}
        </div>
      )}
      <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{user?.name}</span>
    </div>
  );
}