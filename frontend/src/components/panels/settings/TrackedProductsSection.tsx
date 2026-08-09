// ============================================================
// File: src/components/panels/settings/TrackedProductsSection.jsx
// Tracked products — the personal "inflation basket". Registering a
// product here is what makes the OCR scan allowed to attach it to a
// receipt line at all (see backend resolveTrackedProduct); nothing the
// user hasn't explicitly added ever reaches the price history, regardless
// of what the model could technically recognize.
// ============================================================

import { useState, useEffect } from "react";
import { c } from "../../../styles/tokens";
import { theme as s } from "../../../styles/theme";
import { CollapsibleSection } from "../../ui";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { useProductCatalog, type CatalogProduct } from "../../../hooks/useProductCatalog";
import { formatSize, parseSizeInput } from "../../../utils/productPricing";
import { UNIT_ENTRY_OPTIONS, type UnitEntryKey } from "../../../data/constants/productUnits";

const UNIT_SCALE = UNIT_ENTRY_OPTIONS;

const PRODUCT_MODAL_CLOSED = { isOpen: false, product: null as CatalogProduct | null };

export function TrackedProductsSection() {
  const { catalog, load, create, updateDefaultSize, remove } = useProductCatalog();
  useEffect(() => { load(); }, [load]);

  const [newName,     setNewName]     = useState("");
  const [newSize,     setNewSize]     = useState("");
  const [newUnitKey,  setNewUnitKey]  = useState<UnitEntryKey>("szt");
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
    <CollapsibleSection title="🏷️ Produkty śledzone (koszyk inflacyjny)" defaultOpen={false}>
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
    </CollapsibleSection>
  );
}
