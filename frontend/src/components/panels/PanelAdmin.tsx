// ============================================================
// File: src/components/panels/PanelAdmin.jsx
// Admin panel – session management + tracked-products whitelist
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { theme as s } from "../../styles/theme";
import { useProductCatalog, type CatalogProduct } from "../../hooks/useProductCatalog";
import { formatSize, type SizeUnit } from "../../utils/productPricing";
import { ConfirmModal } from "../ui/ConfirmModal";

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

      <TrackedProductsSection />
    </div>
  );
}

// ── Tracked products — the personal "inflation basket" ──────────
// Registering a product here is what makes the OCR scan allowed to
// attach it to a receipt line at all (see backend resolveTrackedProduct);
// nothing the user hasn't explicitly added ever reaches the price
// history, regardless of what the model could technically recognize.

/** User-facing unit choices, each mapped to the BASE unit (g/ml/szt) the
 *  rest of the app works in — so "1,5 l" is stored as 1500/ml, matching
 *  every other size already parsed off a receipt. */
const UNIT_SCALE: Record<string, { base: SizeUnit; factor: number; label: string }> = {
  g:   { base: "g",   factor: 1,    label: "g"   },
  kg:  { base: "g",   factor: 1000, label: "kg"  },
  ml:  { base: "ml",  factor: 1,    label: "ml"  },
  l:   { base: "ml",  factor: 1000, label: "l"   },
  szt: { base: "szt", factor: 1,    label: "szt" },
};

function parseSizeInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PRODUCT_MODAL_CLOSED = { isOpen: false, product: null as CatalogProduct | null };

function TrackedProductsSection() {
  const { catalog, load, create, updateDefaultSize, remove } = useProductCatalog();
  useEffect(() => { load(); }, [load]);

  const [newName,     setNewName]     = useState("");
  const [newSize,     setNewSize]     = useState("");
  const [newUnitKey,  setNewUnitKey]  = useState<keyof typeof UNIT_SCALE>("szt");
  const [isSaving,    setIsSaving]    = useState(false);

  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editSize,    setEditSize]    = useState("");
  const [deleteModal, setDeleteModal] = useState(PRODUCT_MODAL_CLOSED);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const scale = UNIT_SCALE[newUnitKey];
    const raw   = parseSizeInput(newSize);
    setIsSaving(true);
    const ok = await create(name, scale.base, raw !== null ? raw * scale.factor : null);
    setIsSaving(false);
    if (ok) { setNewName(""); setNewSize(""); }
  }

  function startEdit(p: CatalogProduct) {
    setEditingId(p.id);
    setEditSize(p.defaultSize != null ? String(p.defaultSize) : "");
  }
  async function saveEdit(id: string) {
    const ok = await updateDefaultSize(id, parseSizeInput(editSize));
    if (ok) setEditingId(null);
  }

  const input: React.CSSProperties = {
    background: c.bg, border: `1px solid ${c.borderStrong}`, borderRadius: 8,
    color: c.text, padding: "8px 10px", fontSize: 13, outline: "none",
  };

  return (
    <div style={{ ...s.card, marginTop: 16 }}>
      <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>
        🏷️ Produkty śledzone (koszyk inflacyjny)
      </div>
      <div style={{ color: c.textMuted, fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
        Tylko produkty z tej listy trafiają do Analiza → Ceny produktów — nowy skan paragonu
        dopasowuje pozycje do tych nazw i pomija resztę. Gdy paragon nie poda gramatury,
        użyty zostanie podany tu domyślny rozmiar.
      </div>

      {/* Add form */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nazwa produktu, np. Coca-Cola Zero"
          style={{ ...input, flex: "2 1 220px" }}
        />
        <input
          value={newSize}
          onChange={e => setNewSize(e.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="Domyślny rozmiar (opcjonalnie)"
          style={{ ...input, flex: "1 1 140px" }}
        />
        <select
          value={newUnitKey}
          onChange={e => setNewUnitKey(e.target.value as keyof typeof UNIT_SCALE)}
          style={{ ...input, cursor: "pointer", flex: "0 0 80px" }}
        >
          {Object.entries(UNIT_SCALE).map(([key, u]) => (
            <option key={key} value={key}>{u.label}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={isSaving || !newName.trim()}
          style={{
            ...s.btn(), width: "auto", marginTop: 0,
            opacity: (isSaving || !newName.trim()) ? 0.5 : 1,
            cursor: !newName.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? "⏳" : "Dodaj"}
        </button>
      </div>

      {/* List */}
      {catalog.length === 0 ? (
        <div style={{ color: c.borderStrong, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
          Brak śledzonych produktów.
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Nazwa", "Domyślnie", "Kupione", "Sklepy", ""].map((h, i) => (
                  <th key={i} style={{
                    position: "sticky", top: 0, background: c.surface,
                    textAlign: i === 0 ? "left" : i === 4 ? "right" : "center",
                    padding: "6px 10px", fontSize: 10, color: c.textMuted, textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.map(p => (
                <tr key={p.id} style={{ borderTop: `1px solid ${c.border}` }}>
                  <td style={{ padding: "6px 10px", color: c.text, fontWeight: 600 }}>{p.canonicalName}</td>
                  <td style={{ padding: "6px 10px", textAlign: "center", color: c.textTertiary, whiteSpace: "nowrap" }}>
                    {editingId === p.id ? (
                      <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                        <input
                          value={editSize}
                          onChange={e => setEditSize(e.target.value.replace(/[^\d.,]/g, ""))}
                          autoFocus
                          style={{ ...input, width: 70, padding: "3px 6px", fontSize: 11, textAlign: "right" }}
                        />
                        <span style={{ fontSize: 11, color: c.textMuted }}>{p.unit}</span>
                        <button onClick={() => saveEdit(p.id)} style={{ background: "none", border: "none", color: c.success, cursor: "pointer", fontSize: 13 }}>✓</button>
                        <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 13 }}>✕</button>
                      </div>
                    ) : (
                      <span onClick={() => startEdit(p)} style={{ cursor: "pointer" }} title="Kliknij, aby zmienić">
                        {p.defaultSize != null && p.unit ? formatSize(p.defaultSize, p.unit) : "— ✏️"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "center", color: c.textTertiary }}>{p.purchaseCount}</td>
                  <td style={{ padding: "6px 10px", textAlign: "center", color: c.textTertiary }}>{p.merchants.length || "—"}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, product: p })}
                      style={{ background: "none", border: "none", color: c.danger, cursor: "pointer", fontSize: 13 }}
                      title="Przestań śledzić"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Przestań śledzić produkt"
        message={
          deleteModal.product
            ? `„${deleteModal.product.canonicalName}” zniknie z koszyka inflacyjnego i historii cen. Zebrana historia zakupów tego produktu zostanie utracona.`
            : ""
        }
        onConfirm={async () => {
          if (deleteModal.product) await remove(deleteModal.product.id);
          setDeleteModal(PRODUCT_MODAL_CLOSED);
        }}
        onCancel={() => setDeleteModal(PRODUCT_MODAL_CLOSED)}
      />
    </div>
  );
}