// ============================================================
// File: src/components/panels/settings/CategoriesSection.jsx
// ============================================================

import { useState, useMemo } from "react";
import { useAppContext } from "../../../context/AppContext";
import { theme as s } from "../../../styles/theme";
import { EmojiSelector } from "../../ui/EmojiSelector";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { CollapsibleSection } from "../../ui/index";
import { CategoryRow } from "./CategoryRow";
import { SubcategoryRow } from "./SubcategoryRow";
import { ArchiveToggleButton } from "./ArchiveToggleButton";
import { useCategoryManager } from "../../../hooks/useCategoryManager";

const MODAL_CLOSED = { isOpen: false, title: "", message: "", onConfirm: () => {} };

export function CategoriesSection() {
  const { categories } = useAppContext();

  const { isLoadingCats, isSavingCat, errorMsg, showError, executePatch, addCategoryToDb } = useCategoryManager();

  const [showArchived, setShowArchived]         = useState(false);
  const [showArchivedSubs, setShowArchivedSubs] = useState(false);
  const [expandedCatId, setExpandedCatId]       = useState(null); // teraz id, nie name
  const [newCatName, setNewCatName]             = useState("");
  const [newCatIcon, setNewCatIcon]             = useState("📦");
  const [newCatType, setNewCatType]             = useState("EXPENSE");
  const [newSubName, setNewSubName]             = useState("");
  const [newSubPriority, setNewSubPriority]     = useState(2);
  const [modalConfig, setModalConfig]           = useState(MODAL_CLOSED);

  // Aktualnie rozwinięta kategoria jako obiekt
  const expandedCat = useMemo(() => {
    return categories.find(c => c.id === expandedCatId) || null;
  }, [expandedCatId, categories]);

  const visibleCats = useMemo(() => {
    return (categories || []).filter(cat => showArchived ? true : !cat.isArchived);
  }, [categories, showArchived]);

  function handleUpdateCategory(id, name, parentId, updates) {
    if (updates.isArchived === true) {
      setModalConfig({
        isOpen: true,
        title: "Archiwizacja",
        message: `Czy na pewno chcesz zarchiwizować "${name}"? Element zniknie z widoków, ale będziesz mógł go przywrócić.`,
        onConfirm: () => {
          setModalConfig(MODAL_CLOSED);
          executePatch(id, name, parentId, updates);
        }
      });
      return;
    }
    executePatch(id, name, parentId, updates);
  }

  async function handleAddSubCategory() {
    const cleanName = newSubName.trim();
    if (!cleanName || cleanName.length < 2) { showError("Nazwa subkategorii jest za krótka."); return; }
    if (cleanName.length > 50) { showError("Nazwa subkategorii nie może przekraczać 50 znaków."); return; }
    if (!expandedCat) return;
    const success = await addCategoryToDb(cleanName, "📁", null, expandedCat.id, expandedCat.name, newSubPriority);
    if (success) { setNewSubName(""); setNewSubPriority(2); }
  }

  async function handleAddCategory() {
    const cleanName = newCatName.trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 50) { showError("Nazwa musi mieć od 2 do 50 znaków."); return; }
    const cleanIcon = newCatIcon ? String(newCatIcon).substring(0, 10) : "📦";
    const success = await addCategoryToDb(cleanName, cleanIcon, newCatType);
    if (success) { setNewCatName(""); setNewCatIcon("📦"); setNewCatType("EXPENSE"); }
  }

  return (
    <>
      <CollapsibleSection title="📂 Kategorie" defaultOpen={false}>
        {errorMsg && (
          <div style={{ padding: "10px 14px", background: "#ef444422", borderLeft: "4px solid #ef4444", color: "#f87171", marginBottom: 16, borderRadius: 4, fontSize: 13 }}>
            {errorMsg}
          </div>
        )}

        {isLoadingCats ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>⏳ Ładowanie bazy...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "stretch" }}>

            {/* LEFT COLUMN */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={s.card}>
                <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase", marginBottom: 12 }}>➕ Nowa główna</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <EmojiSelector currentEmoji={newCatIcon} onSelect={setNewCatIcon} />
                  <input style={{ ...s.input, flex: 1 }} placeholder="Nazwa..." value={newCatName}
                    onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "#0d1424", padding: 3, borderRadius: 10 }}>
                  {[{ id: "EXPENSE", label: "Wyd", icon: "💸" }, { id: "INCOME", label: "Prz", icon: "💰" }, { id: "SAVING", label: "Osz", icon: "🏦" }].map(t => (
                    <button key={t.id} onClick={() => setNewCatType(t.id)} style={{
                      flex: 1, padding: "6px 2px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                      background: newCatType === t.id ? "#10b981" : "transparent",
                      color: newCatType === t.id ? "#fff" : "#64748b",
                    }}>{t.icon} {t.label}</button>
                  ))}
                </div>
                <button onClick={handleAddCategory} disabled={isSavingCat} style={{ ...s.btn(), opacity: isSavingCat ? 0.5 : 1 }}>
                  {isSavingCat ? "..." : "Dodaj kategorię"}
                </button>
              </div>

              <div style={{ ...s.card, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>📂 Lista</div>
                  <ArchiveToggleButton isShowingArchived={showArchived} onToggle={() => setShowArchived(!showArchived)} />
                </div>
                <div style={{ maxHeight: 400, overflowY: "auto", overflowX: "clip", paddingRight: 16 }}>
                  {[
                    { id: "EXPENSE", label: "Wydatki", color: "#ef4444" },
                    { id: "INCOME", label: "Przychody", color: "#10b981" },
                    { id: "SAVING", label: "Oszczędności", color: "#3b82f6" }
                  ].map(section => {
                    const catsInSection = visibleCats.filter(cat => (cat.type || "EXPENSE") === section.id);
                    if (catsInSection.length === 0) return null;
                    return (
                      <div key={section.id} style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: section.color, textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: section.color }} />
                          {section.label}
                        </div>
                        {catsInSection.map(cat => (
                          <CategoryRow
                            key={cat.id}
                            cat={cat}
                            expandedCatId={expandedCatId}
                            setExpandedCatId={setExpandedCatId}
                            onUpdate={handleUpdateCategory}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {expandedCat ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <div style={s.card}>
                    <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase", marginBottom: 12 }}>
                      ➕ Subkategoria w: {expandedCat.name}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={{ ...s.input, flex: 1 }} placeholder="Nazwa..." value={newSubName}
                        onChange={e => setNewSubName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubCategory()} />
                      {expandedCat.type === 'EXPENSE' && (
                        <div style={{ display: "flex", gap: 2, background: "#0d1424", padding: 2, borderRadius: 8 }}>
                          {[1, 2, 3, 4].map(p => (
                            <button key={p} onClick={() => setNewSubPriority(p)} style={{
                              padding: "6px 8px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 800, cursor: "pointer",
                              background: newSubPriority === p ? (p === 1 ? "#ef4444" : "#3b82f6") : "transparent",
                              color: newSubPriority === p ? "#fff" : "#64748b",
                            }}>P{p}</button>
                          ))}
                        </div>
                      )}
                      <button onClick={handleAddSubCategory} disabled={isSavingCat || !newSubName.trim()} style={{
                        ...s.btn(), width: "auto", padding: "0 20px",
                        opacity: (isSavingCat || !newSubName.trim()) ? 0.4 : 1,
                        cursor: !newSubName.trim() ? "not-allowed" : "pointer"
                      }}>{isSavingCat ? "..." : "Dodaj"}</button>
                    </div>
                  </div>

                  <div style={{ ...s.card, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 16 }}>
                        {expandedCat.icon} {expandedCat.name}
                      </div>
                      <ArchiveToggleButton isShowingArchived={showArchivedSubs} onToggle={() => setShowArchivedSubs(!showArchivedSubs)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: expandedCat.type === 'EXPENSE' ? "1fr 140px 40px" : "1fr 40px", gap: 8, marginBottom: 8 }}>
                      <span style={{ color: "#475569", fontSize: 10, fontWeight: 700 }}>NAZWA</span>
                      {expandedCat.type === 'EXPENSE' && <span style={{ color: "#475569", fontSize: 10, fontWeight: 700 }}>PRIORYTET</span>}
                    </div>
                    <div style={{ maxHeight: 400, overflowY: "auto" }}>
                      {(expandedCat.sub || [])
                        .filter(sub => showArchivedSubs ? true : !sub.isArchived)
                        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                        .map((sub, index) => (
                          <div key={sub.id} style={{ background: index % 2 === 0 ? "transparent" : "#ffffff08", borderRadius: 4 }}>
                            <SubcategoryRow
                              subName={sub.name}
                              subData={sub}
                              parentName={expandedCat.name}
                              parentId={expandedCat.id}
                              parentType={expandedCat.type}
                              parentIsArchived={expandedCat.isArchived}
                              onUpdate={handleUpdateCategory}
                              onError={showError}
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  ...s.card, flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#475569", border: "2px dashed #1e293b", background: "transparent", minHeight: 200,
                }}>
                  Wybierz kategorię główną po lewej.
                </div>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig(MODAL_CLOSED)}
      />
    </>
  );
}