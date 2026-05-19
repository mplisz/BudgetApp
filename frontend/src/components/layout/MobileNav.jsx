// ============================================================
// File: src/components/layout/MobileNav.jsx
// ============================================================
 
import { useAppContext } from "../../context/AppContext";
 
const MOBILE_ITEMS = [
  { id: "expenses",    icon: "➕", label: "Wydatki"    },
  { id: "addincome",   icon: "💵", label: "Wpływy"     },
  { id: "addrecurring",icon: "🔄", label: "Cykliczne"  },
  { id: "addplanned",  icon: "📅", label: "Planowane"  },
];
 
export function MobileNav() {
  const { panel, setPanel } = useAppContext();
 
  return (
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1424", borderTop: "1px solid #1e293b", display: "flex", zIndex: 300 }}>
      {MOBILE_ITEMS.map(item => (
        <button key={item.id} onClick={() => setPanel(item.id)}
          style={{ flex: 1, padding: "10px 4px 14px", textAlign: "center", cursor: "pointer", background: "none", border: "none", color: panel === item.id ? "#10b981" : "#475569" }}>
          <span style={{ fontSize: 20, display: "block" }}>{item.icon}</span>
          <span style={{ fontSize: 10, display: "block", marginTop: 2, fontWeight: 600 }}>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}