// ============================================================
// File: src/components/panels/PanelAdmin.jsx
// Admin panel – session management
// ============================================================

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { theme as s } from "../../styles/theme";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const ACCESS_TOKEN_EXPIRY = import.meta.env.VITE_ACCESS_TOKEN_EXPIRY || "15 min";

export default function PanelAdmin() {
  const { fetchWithAuth, user } = useAuth();
  const [members, setMembers]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [sessionCount, setSessionCount] = useState(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [isRevoking, setIsRevoking]   = useState(false);
  const [result, setResult]           = useState(null);

  // Load family members
  useEffect(() => {
    async function loadMembers() {
      setIsLoading(true);
      try {
        const res = await fetchWithAuth(`${API_URL}/api/auth/family-members`);
        const data = await res.json();
        setMembers(data);
        setSelected(data[0]?.email || null);
      } catch (err) {
        setResult({ success: false, message: "Nie udało się załadować członków rodziny." });
      } finally {
        setIsLoading(false);
      }
    }
    loadMembers();
  }, [fetchWithAuth]);

  // Load session count when selected changes
  useEffect(() => {
    if (!selected) return;
    async function loadSessionCount() {
      setSessionCount(null);
      try {
        const res = await fetchWithAuth(`${API_URL}/api/auth/sessions?email=${encodeURIComponent(selected)}`);
        const data = await res.json();
        setSessionCount(data.count);
      } catch (err) {
        setSessionCount(null);
      }
    }
    loadSessionCount();
  }, [selected, fetchWithAuth]);

  async function handleRevokeAll() {
    if (!selected) return;
    setIsRevoking(true);
    setResult(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/revoke-all`, {
        method: "DELETE",
        body: JSON.stringify({ email: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd serwera");
      setResult({ success: true, message: `✅ ${data.message}` });
      setSessionCount(0); // po revoke zerujemy
    } catch (err) {
      setResult({ success: false, message: `❌ ${err.message}` });
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <div style={{ ...s.panel, maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={s.sectionTitle}>🔐 Admin</div>
        <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>
          Zarządzanie sesjami członków rodziny
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase", marginBottom: 16 }}>
          🚫 Unieważnij wszystkie sesje
        </div>

        {isLoading ? (
          <div style={{ color: "#475569", fontSize: 13 }}>Ładowanie...</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#64748b", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Wybierz użytkownika:
              </label>
              <select
                value={selected || ""}
                onChange={e => { setSelected(e.target.value); setResult(null); }}
                style={{ ...s.input, width: "100%", cursor: "pointer" }}
              >
                {members.map(m => (
                  <option key={m.email} value={m.email}>
                    {m.name} ({m.email}){m.email === user?.email ? " — Ty" : ""}
                  </option>
                ))}
              </select>

              {/* Session count */}
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                Aktywne sesje:{" "}
                {sessionCount === null ? (
                  <span style={{ color: "#475569" }}>Ładowanie...</span>
                ) : (
                  <strong style={{ color: sessionCount === 0 ? "#10b981" : "#e2e8f0" }}>
                    {sessionCount}
                  </strong>
                )}
              </div>
            </div>

            <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#f87171" }}>
              ⚠️ Spowoduje to wylogowanie wszystkich urządzeń wybranego użytkownika. Przy następnym odświeżeniu tokenu (max {ACCESS_TOKEN_EXPIRY}) sesja wygaśnie.
            </div>

            <button
              onClick={handleRevokeAll}
              disabled={isRevoking || !selected || sessionCount === 0}
              style={{
                ...s.btn(),
                background: isRevoking ? "#1e293b" : "#ef444422",
                color: isRevoking ? "#475569" : "#ef4444",
                border: "1px solid #ef444444",
                opacity: (isRevoking || sessionCount === 0) ? 0.5 : 1,
                cursor: sessionCount === 0 ? "not-allowed" : "pointer"
              }}
            >
              {isRevoking ? "⏳ Unieważnianie..." : "🚫 Wyloguj wszystkie urządzenia"}
            </button>

            {result && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                background: result.success ? "#10b98111" : "#ef444411",
                color: result.success ? "#10b981" : "#f87171",
                border: `1px solid ${result.success ? "#10b98133" : "#ef444433"}`
              }}>
                {result.message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}