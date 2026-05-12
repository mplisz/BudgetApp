// ============================================================
// File: src/components/layout/Sidebar.jsx
// ============================================================

import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";

const SIDEBAR_ITEMS = [
  { section: "Główne" },
  { id: "expenses",   icon: "➕", label: "Dodaj wydatek" },
  { id: "planned",    icon: "📋", label: "Planowane wydatki" },
  { section: "Analiza" },
  { id: "income",     icon: "📅", label: "Planowanie" },
  { id: "results",    icon: "📊", label: "Podsumowanie" },
  { id: "trends",     icon: "📈", label: "Historia" },
  { section: "Narzędzia i Cele" },
  { id: "cushion",    icon: "🛡️", label: "Poduszka" },
  { id: "recurring",  icon: "🔄", label: "Cykliczne" },
  { id: "basebudget", icon: "🏦", label: "Baza budżetu" },
  { id: "goals",      icon: "🎯", label: "Koperty / Cele" },
  { id: "stash",      icon: "🗄️", label: "Schowek" },
  { id: "documents",  icon: "🧾", label: "Dokumenty" },
  { id: "settings",   icon: "⚙️", label: "Ustawienia" },
  { section: "Admin" }, { id: "admin", icon: "🔐", label: "Admin" },
];

export function Sidebar() {
  const { panel, setPanel } = useAppContext();
  const { user } = useAuth();

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
              background: panel === item.id ? "#10b98122" : "transparent",
              color:       panel === item.id ? "#10b981"   : "#64748b",
              borderLeft:  panel === item.id ? "3px solid #10b981" : "3px solid transparent",
              transition: "all 0.15s"
            }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span style={{ fontSize: 13, fontWeight: panel === item.id ? 700 : 500 }}>{item.label}</span>
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
          onError={(e) => { e.target.style.display = 'none'; }}
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