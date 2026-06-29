// ============================================================
// File: src/components/panels/PanelAdmin.jsx
// Admin panel – session management
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { theme as s } from "../../styles/theme";

const ACCESS_TOKEN_EXPIRY = import.meta.env.VITE_ACCESS_TOKEN_EXPIRY || "15 min";

interface FamilyMember { email: string; name: string }
interface AdminResult  { success: boolean; message: string }

export default function PanelAdmin() {
  const { user } = useAuth();
  const api = useApi();
  const [members, setMembers]         = useState<FamilyMember[]>([]);
  const [selected, setSelected]       = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [isRevoking, setIsRevoking]   = useState(false);
  const [result, setResult]           = useState<AdminResult | null>(null);

  // Load family members
  useEffect(() => {
    async function loadMembers() {
      setIsLoading(true);
      try {
        const data = await api.get<FamilyMember[]>(`/api/auth/family-members`);
        setMembers(data);
        setSelected(data[0]?.email || null);
      } catch {
        setResult({ success: false, message: "Nie udało się załadować członków rodziny." });
      } finally {
        setIsLoading(false);
      }
    }
    loadMembers();
  }, [api]);

  // Load session count when selected changes
  useEffect(() => {
    if (!selected) return;
    const email = selected;
    async function loadSessionCount() {
      setSessionCount(null);
      try {
        const data = await api.get<{ count: number }>(`/api/auth/sessions?email=${encodeURIComponent(email)}`);
        setSessionCount(data.count);
      } catch {
        setSessionCount(null);
      }
    }
    loadSessionCount();
  }, [selected, api]);

  async function handleRevokeAll() {
    if (!selected) return;
    setIsRevoking(true);
    setResult(null);
    try {
      const data = await api.del<{ message: string }>(`/api/auth/revoke-all`, { email: selected }, { fallback: "Błąd serwera" });
      setResult({ success: true, message: `✅ ${data.message}` });
      setSessionCount(0); // po revoke zerujemy
    } catch (err) {
      setResult({ success: false, message: `❌ ${(err as Error).message}` });
    } finally {
      setIsRevoking(false);
    }
  }

  return (
      <div style={{ ...s.panel, maxWidth: 600, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={s.sectionTitle}>🔐 Admin</div>
        <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>
          Zarządzanie sesjami członków rodziny
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 16 }}>
          🚫 Unieważnij wszystkie sesje
        </div>

        {isLoading ? (
          <div style={{ color: c.textMuted, fontSize: 13 }}>Ładowanie...</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: c.textSecondary, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
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
              <div style={{ marginTop: 8, fontSize: 12, color: c.textSecondary }}>
                Aktywne sesje:{" "}
                {sessionCount === null ? (
                  <span style={{ color: c.textMuted }}>Ładowanie...</span>
                ) : (
                  <strong style={{ color: sessionCount === 0 ? c.success : c.text }}>
                    {sessionCount}
                  </strong>
                )}
              </div>
            </div>

            <div style={{ background: alpha(c.danger, "11"), border: `1px solid ${alpha(c.danger, "33")}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: c.dangerLight }}>
              ⚠️ Spowoduje to wylogowanie wszystkich urządzeń wybranego użytkownika. Przy następnym odświeżeniu tokenu (max {ACCESS_TOKEN_EXPIRY}) sesja wygaśnie.
            </div>

            <button
              onClick={handleRevokeAll}
              disabled={isRevoking || !selected || sessionCount === 0}
              style={{
                ...s.btn(),
                background: isRevoking ? c.border : alpha(c.danger, "22"),
                color: isRevoking ? c.textMuted : c.danger,
                border: `1px solid ${alpha(c.danger, "44")}`,
                opacity: (isRevoking || sessionCount === 0) ? 0.5 : 1,
                cursor: sessionCount === 0 ? "not-allowed" : "pointer"
              }}
            >
              {isRevoking ? "⏳ Unieważnianie..." : "🚫 Wyloguj wszystkie urządzenia"}
            </button>

            {result && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                background: result.success ? alpha(c.success, "11") : alpha(c.danger, "11"),
                color: result.success ? c.success : c.dangerLight,
                border: `1px solid ${result.success ? alpha(c.success, "33") : alpha(c.danger, "33")}`
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