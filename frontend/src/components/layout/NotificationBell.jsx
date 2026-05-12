// ============================================================
// File: src/components/layout/NotificationBell.jsx
// ============================================================

import { useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { fmt } from "../../utils/helpers";

export function NotificationBell() {
  const { notifOpen, setNotifOpen, upcomingPayments, markNotifPaid } = useAppContext();

  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = () => setNotifOpen(false);
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [notifOpen, setNotifOpen]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen); }}
        style={{ background: notifOpen ? "#10b98122" : "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 10, padding: "6px 12px", cursor: "pointer", position: "relative" }}>
        🔔
        {upcomingPayments.length > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {upcomingPayments.length}
          </span>
        )}
      </button>

      {notifOpen && (
        <div
          style={{ position: "absolute", right: 0, top: "120%", background: "#0d1424", border: "1px solid #1e293b", borderRadius: 14, width: 320, zIndex: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
          onClick={e => e.stopPropagation()}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b", fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>
            🔔 Nadchodzące płatności
          </div>
          {upcomingPayments.length === 0 ? (
            <div style={{ padding: 20, color: "#475569", textAlign: "center", fontSize: 12 }}>Wszystko zapłacone! ✅</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {upcomingPayments.map((n, i) => (
                <div key={i} style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{n.label}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{n.date} • {fmt(n.amount)}</div>
                  </div>
                  <button
                    onClick={() => markNotifPaid(n)}
                    style={{ background: "#10b98122", color: "#10b981", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                    ZAPŁACONE
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}