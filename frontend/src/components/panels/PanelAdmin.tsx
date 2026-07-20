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

// Retroactive product backfill — see backend/routes/products.js
interface BackfillProduct { name: string; size: number | null; unit: string | null; packCount: number | null }
interface BackfillResult {
  dryRun:              boolean;
  trackedSubcategories: number;
  scanned:             number;
  missingLines:        number;
  uniqueTexts:         number;
  queued?:             number;
  resolved:            number;
  remaining?:          number;
  updatedTransactions?: number;
  failed?:             number;
  message?:            string;
  /** Full text→product mapping from the dry run; sent back on commit so
   *  the approved result is exactly what gets written (one model call). */
  products?:           Array<{ text: string; product: BackfillProduct }>;
}

/** How many proposed rows to render — the mapping itself can be larger. */
const PREVIEW_ROWS = 100;

export default function PanelAdmin() {
  const { user } = useAuth();
  const api = useApi();
  const [members, setMembers]         = useState<FamilyMember[]>([]);
  const [selected, setSelected]       = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [isRevoking, setIsRevoking]   = useState(false);
  const [result, setResult]           = useState<AdminResult | null>(null);

  // ── Product backfill ──────────────────────────────────────
  const [backfill,        setBackfill]        = useState<BackfillResult | null>(null);
  const [backfillError,   setBackfillError]   = useState<string | null>(null);
  const [isBackfilling,   setIsBackfilling]   = useState(false);

  async function runBackfill(dryRun: boolean) {
    setIsBackfilling(true);
    setBackfillError(null);
    if (dryRun) setBackfill(null);
    try {
      const data = await api.post<BackfillResult>(
        "/api/products/backfill",
        // On commit, hand back the mapping the preview produced — the
        // server then writes exactly what was shown, without re-asking
        // the model (which could word things differently).
        dryRun ? { dryRun: true } : { dryRun: false, products: backfill?.products },
        { fallback: "Nie udało się uruchomić uzupełniania." },
      );
      setBackfill(data);
    } catch (err) {
      setBackfillError((err as Error).message);
    } finally {
      setIsBackfilling(false);
    }
  }

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

      {/* ── Retroactive product backfill ─────────────────────── */}
      <div style={{ ...s.card, marginTop: 16 }}>
        <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>
          🏷️ Uzupełnij brakujące produkty
        </div>
        <div style={{ color: c.textMuted, fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
          Historia cen pokazuje tylko pozycje z rozpoznanym produktem. Ta akcja znajduje starsze
          transakcje w subkategoriach oznaczonych <strong>🏷️ Ceny</strong>, które go nie mają, i uzupełnia
          je przez AI. Możesz ją uruchomić ponownie po oznaczeniu kolejnej subkategorii — wtedy
          dobierze tylko to, czego brakuje.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => runBackfill(true)}
            disabled={isBackfilling}
            style={{
              ...s.btn(), width: "auto", marginTop: 0,
              background: alpha(c.info, "22"), color: c.info,
              border: `1px solid ${alpha(c.info, "44")}`,
              opacity: isBackfilling ? 0.5 : 1,
            }}
          >
            {isBackfilling ? "⏳ Analizuję…" : "🔍 Sprawdź (podgląd)"}
          </button>

          {/* Commit only makes sense once a preview found something. */}
          {backfill?.dryRun && backfill.resolved > 0 && (
            <button
              onClick={() => runBackfill(false)}
              disabled={isBackfilling}
              style={{
                ...s.btn(), width: "auto", marginTop: 0,
                background: alpha(c.success, "22"), color: c.success,
                border: `1px solid ${alpha(c.success, "44")}`,
                opacity: isBackfilling ? 0.5 : 1,
              }}
            >
              ✅ Zapisz {backfill.resolved} produktów
            </button>
          )}
        </div>

        {backfillError && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: alpha(c.danger, "11"), color: c.dangerLight,
            border: `1px solid ${alpha(c.danger, "33")}`,
          }}>
            ❌ {backfillError}
          </div>
        )}

        {backfill && (
          <div style={{ marginTop: 12, fontSize: 12, color: c.textSecondary, lineHeight: 1.8 }}>
            {backfill.message ? (
              <div style={{ color: c.success }}>✅ {backfill.message}</div>
            ) : (
              <>
                <div>
                  Przejrzano <strong style={{ color: c.text }}>{backfill.scanned}</strong> transakcji
                  w <strong style={{ color: c.text }}>{backfill.trackedSubcategories}</strong> śledzonych subkategoriach ·
                  brakujących pozycji: <strong style={{ color: c.text }}>{backfill.missingLines}</strong> ·
                  unikalnych nazw: <strong style={{ color: c.text }}>{backfill.uniqueTexts}</strong>
                </div>
                <div>
                  Rozpoznano: <strong style={{ color: c.success }}>{backfill.resolved}</strong>
                  {backfill.queued !== undefined && ` z ${backfill.queued} przetworzonych`}
                  {!!backfill.remaining && (
                    <span style={{ color: c.warning }}> · zostało {backfill.remaining} na kolejny przebieg</span>
                  )}
                </div>
                {!backfill.dryRun && (
                  <div style={{ color: c.success }}>
                    ✅ Zaktualizowano {backfill.updatedTransactions} transakcji
                    {!!backfill.failed && <span style={{ color: c.danger }}> · błędów: {backfill.failed}</span>}
                  </div>
                )}
              </>
            )}

            {/* Preview — what the AI proposes, before anything is written */}
            {backfill.dryRun && !!backfill.products?.length && (
              <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Tekst z paragonu", "Produkt", "Ilość"].map((h, i) => (
                        <th key={h} style={{
                          position: "sticky", top: 0, background: c.surface, textAlign: i === 2 ? "right" : "left",
                          padding: "5px 10px", fontSize: 10, color: c.textMuted, textTransform: "uppercase",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backfill.products.slice(0, PREVIEW_ROWS).map(({ text, product }, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
                        <td style={{ padding: "4px 10px", color: c.textMuted }}>{text}</td>
                        <td style={{ padding: "4px 10px", color: c.text, fontWeight: 600 }}>{product.name}</td>
                        <td style={{ padding: "4px 10px", textAlign: "right", color: c.textTertiary, whiteSpace: "nowrap" }}>
                          {product.size ? `${product.size} ${product.unit ?? ""}` : "—"}
                          {product.packCount ? ` ×${product.packCount}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {backfill.dryRun && (backfill.products?.length ?? 0) > PREVIEW_ROWS && (
              <div style={{ marginTop: 6, fontSize: 11, color: c.textMuted }}>
                Pokazano {PREVIEW_ROWS} z {backfill.products?.length} — zapis obejmie wszystkie.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}