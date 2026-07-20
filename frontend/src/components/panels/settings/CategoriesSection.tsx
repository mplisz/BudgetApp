// ============================================================
// File: src/components/panels/settings/CategoriesSection.jsx
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useMemo, useRef, useEffect } from "react";
import { useAppContext }      from "../../../context/AppContext";
import { theme as s }        from "../../../styles/theme";
import { EmojiSelector }     from "../../ui/EmojiSelector";
import { ConfirmModal }      from "../../ui/ConfirmModal";
import { CollapsibleSection } from "../../ui/index";
import { CategoryRow }       from "./CategoryRow";
import { SubcategoryRow, subcategoryGridColumns, SUBCAT_MIN_WIDTH } from "./SubcategoryRow";
import { ArchiveToggleButton } from "./ArchiveToggleButton";
import { useCategoryManager } from "../../../hooks/useCategoryManager";
import type { CategoryUpdates } from "../../../hooks/useCategoryManager";
import { getCategoryTypeSections } from "../../../data/constants/categoryTypes";

const MODAL_CLOSED = { isOpen: false, title: "", message: "", onConfirm: () => {} };

export function CategoriesSection() {
  const { categories } = useAppContext();
  const { isLoadingCats, isSavingCat, showError, executePatch, addCategoryToDb } = useCategoryManager();

  const [showArchived,         setShowArchived]         = useState(false);
  const [showArchivedSubs,     setShowArchivedSubs]     = useState(false);
  const [expandedCatId,        setExpandedCatId]        = useState<string | null>(null);
  const [newCatName,           setNewCatName]           = useState("");
  const [newCatIcon,           setNewCatIcon]           = useState("📦");
  const [newCatType,           setNewCatType]           = useState("EXPENSE");
  const [newSubName,           setNewSubName]           = useState("");
  const [newSubPriority,       setNewSubPriority]       = useState(2);
  const [newSubCanBeRecurring, setNewSubCanBeRecurring] = useState(false);
  const [newSubIsCritical,     setNewSubIsCritical]     = useState(false);
  const [newSubCanBeLuxmed,    setNewSubCanBeLuxmed]    = useState(false);
  const [newSubTrackPrices,    setNewSubTrackPrices]    = useState(false);
  const [modalConfig,          setModalConfig]          = useState(MODAL_CLOSED);

  // ── Keep the subcategory panel level with the categories column ──
  // Short list → it fills that height; long list → it scrolls instead of
  // growing past and leaving a gap beside the categories. CSS can't say
  // "match my sibling": with alignItems:stretch the grid row just grows to
  // the tallest content, so nothing is ever constrained enough to scroll.
  // Hence measuring. Only in the two-column layout — under 700px the grid
  // stacks and each card should keep its natural height.
  const leftColRef = useRef<HTMLDivElement>(null);
  const [leftHeight, setLeftHeight] = useState<number | null>(null);
  const [isTwoCol, setIsTwoCol] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 701px)");
    const sync = () => setIsTwoCol(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = leftColRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setLeftHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoadingCats]);

  const panelHeight = isTwoCol && leftHeight ? leftHeight : undefined;

  const expandedCat = useMemo(() =>
    categories.find(c => c.id === expandedCatId) || null,
    [expandedCatId, categories]
  );

  const visibleCats = useMemo(() =>
    (categories || []).filter(cat => showArchived ? true : !cat.isArchived),
    [categories, showArchived]
  );

  const typeSections = getCategoryTypeSections();

  function handleUpdateCategory(id: string, name: string, parentId: string | null, updates: CategoryUpdates) {
    if (updates.isArchived === true) {
      setModalConfig({
        isOpen: true,
        title: "Archiwizacja",
        message: `Czy na pewno chcesz zarchiwizować "${name}"? Element zniknie z widoków, ale będziesz mógł go przywrócić.`,
        onConfirm: () => { setModalConfig(MODAL_CLOSED); executePatch(id, name, parentId, updates); },
      });
      return;
    }
    executePatch(id, name, parentId, updates);
  }

  async function handleAddSubCategory() {
    const cleanName = newSubName.trim();
    if (!cleanName || cleanName.length < 2)  { showError("Nazwa subkategorii jest za krótka."); return; }
    if (cleanName.length > 50)               { showError("Nazwa subkategorii nie może przekraczać 50 znaków."); return; }
    if (!expandedCat) return;
    const success = await addCategoryToDb(
      cleanName, "📁", null,
      expandedCat.id, expandedCat.name,
      newSubPriority,
      newSubCanBeRecurring,
      newSubIsCritical,
      newSubCanBeLuxmed,
      newSubTrackPrices,
    );
    if (success) {
      setNewSubName("");
      setNewSubPriority(2);
      setNewSubCanBeRecurring(false);
      setNewSubIsCritical(false);
      setNewSubCanBeLuxmed(false);
      setNewSubTrackPrices(false);
    }
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
        {isLoadingCats ? (
          <div style={{ padding: 40, textAlign: "center", color: c.textTertiary }}>⏳ Ładowanie bazy...</div>
        ) : (
          // alignItems:start keeps the left column at its NATURAL height —
          // with stretch it would grow to whatever the right column needs,
          // making the measurement above circular.
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "start" }} data-cats-grid>

            {/* ── LEFT COLUMN ───────────────────────────────── */}
            <div ref={leftColRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* Add new root category */}
              <div style={s.card}>
                <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 12 }}>
                  ➕ Nowa główna
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <EmojiSelector currentEmoji={newCatIcon} onSelect={setNewCatIcon} />
                  <input
                    style={{ ...s.input, flex: 1 }}
                    placeholder="Nazwa..."
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                  />
                </div>

                <div style={{ display: "flex", gap: 4, marginBottom: 12, background: c.surface, padding: 3, borderRadius: 10 }}>
                  {typeSections.map(({ type, label, icon }) => (
                    <button
                      key={type}
                      onClick={() => setNewCatType(type)}
                      style={{
                        flex: 1, padding: "6px 2px", borderRadius: 8, border: "none",
                        fontSize: 10, fontWeight: 700, cursor: "pointer",
                        background: newCatType === type ? c.success : "transparent",
                        color:      newCatType === type ? c.white    : c.textSecondary,
                      }}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleAddCategory}
                  disabled={isSavingCat}
                  style={{ ...s.btn(), opacity: isSavingCat ? 0.5 : 1 }}
                >
                  {isSavingCat ? "..." : "Dodaj kategorię"}
                </button>
              </div>

              {/* Category list grouped by type */}
              <div style={{ ...s.card, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase" }}>📂 Lista</div>
                  <ArchiveToggleButton isShowingArchived={showArchived} onToggle={() => setShowArchived(!showArchived)} />
                </div>

                <div style={{ maxHeight: 400, overflowY: "auto", overflowX: "clip", paddingRight: 16 }}>
                  {typeSections.map(({ type, label, color }) => {
                    const catsInSection = visibleCats.filter(cat => (cat.type || "EXPENSE") === type);
                    if (catsInSection.length === 0) return null;
                    return (
                      <div key={type} style={{ marginBottom: 18 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 800, color,
                          textTransform: "uppercase", marginBottom: 8,
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                          {label}
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

            {/* ── RIGHT COLUMN ──────────────────────────────── */}
            {/* minWidth:0 is load-bearing: a grid item defaults to
                min-width:auto, so a wide table would push this track past
                the card instead of letting the table scroll inside it.
                minHeight:0 does the same job vertically — it lets the list
                below shrink and scroll instead of stretching the row. */}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: panelHeight }}>
              {expandedCat ? (
                // flex:1 makes the card match the left column's height, so a
                // short list leaves no gap beside the main categories and a
                // long one scrolls instead of overshooting it.
                <div style={{ ...s.card, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase" }}>
                      {expandedCat.icon} {expandedCat.name} — subkategorie
                    </div>
                    <ArchiveToggleButton
                      isShowingArchived={showArchivedSubs}
                      onToggle={() => setShowArchivedSubs(!showArchivedSubs)}
                    />
                  </div>

                  {/* Add subcategory */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      style={{ ...s.input, flex: "1 1 200px", minWidth: 160 }}
                      placeholder="Nazwa subkategorii..."
                      value={newSubName}
                      onChange={e => setNewSubName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddSubCategory()}
                    />
                    {expandedCat.type === "EXPENSE" && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {[1, 2, 3, 4].map(p => (
                          <button
                            key={p}
                            onClick={() => setNewSubPriority(p)}
                            style={{
                              width: 28, height: 36, borderRadius: 6,
                              border: `1px solid ${newSubPriority === p ? c.success : c.borderStrong}`,
                              background: newSubPriority === p ? alpha(c.success, "22") : "transparent",
                              color:      newSubPriority === p ? c.success   : c.textMuted,
                              cursor: "pointer", fontSize: 11, fontWeight: 700,
                            }}
                          >
                            P{p}
                          </button>
                        ))}
                      </div>
                    )}

                    {expandedCat.type === "EXPENSE" && (
                      <label
                        title="Cykliczne"
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "0 4px", whiteSpace: "nowrap" }}
                      >
                        <input
                          type="checkbox"
                          checked={newSubCanBeRecurring}
                          onChange={e => setNewSubCanBeRecurring(e.target.checked)}
                        />
                        <span style={{ fontSize: 11, color: c.textSecondary }}>🔄</span>
                      </label>
                    )}

                    {expandedCat.type === "EXPENSE" && (
                      <label
                        title="Krytyczne — wliczane do Trybu przetrwania niezależnie od priorytetu (czesne, leki, opłaty dla dzieci)"
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "0 4px", whiteSpace: "nowrap" }}
                      >
                        <input
                          type="checkbox"
                          checked={newSubIsCritical}
                          onChange={e => setNewSubIsCritical(e.target.checked)}
                        />
                        <span style={{ fontSize: 11, color: c.textSecondary }}>🔒</span>
                      </label>
                    )}

                    {expandedCat.type === "EXPENSE" && (
                      <label
                        title="LuxMed — transakcje z tej subkategorii będą widoczne w panelu Zwroty LuxMed"
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "0 4px", whiteSpace: "nowrap" }}
                      >
                        <input
                          type="checkbox"
                          checked={newSubCanBeLuxmed}
                          onChange={e => setNewSubCanBeLuxmed(e.target.checked)}
                        />
                        <span style={{ fontSize: 11, color: c.textSecondary }}>🏥</span>
                      </label>
                    )}

                    {expandedCat.type === "EXPENSE" && (
                      <label
                        title="Ceny — produkty z tej subkategorii trafią do historii cen (Analiza → Ceny produktów)"
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "0 4px", whiteSpace: "nowrap" }}
                      >
                        <input
                          type="checkbox"
                          checked={newSubTrackPrices}
                          onChange={e => setNewSubTrackPrices(e.target.checked)}
                        />
                        <span style={{ fontSize: 11, color: c.textSecondary }}>🏷️</span>
                      </label>
                    )}

                    <button
                      onClick={handleAddSubCategory}
                      disabled={isSavingCat}
                      style={{ ...s.btn(), width: "auto", padding: "8px 14px", marginTop: 0, opacity: isSavingCat ? 0.5 : 1 }}
                    >
                      {isSavingCat ? "..." : "Dodaj"}
                    </button>
                  </div>

                  {/* Subcategory list header */}
                  {/* Grows to fill the card, scrolls only once it would grow
                      past the left column. ONE scroller owns both axes, and
                      it wraps header + rows together so they can never
                      desynchronise (a second scroller was what skewed them). */}
                  <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                    <div style={{ minWidth: expandedCat.type === "EXPENSE" ? SUBCAT_MIN_WIDTH : "auto" }}>

                  {/* Columns come from ONE shared definition (SubcategoryRow)
                      so the header can never drift from the rows again. */}
                  <div data-subcat-header style={{
                    display: "grid",
                    gridTemplateColumns: subcategoryGridColumns(expandedCat.type),
                    gap: 6, marginBottom: 8,
                  }}>
                    <span style={{ color: c.textMuted, fontSize: 10, fontWeight: 700 }}>NAZWA</span>
                    {expandedCat.type === "EXPENSE" && (
                      <>
                        <span style={{ color: c.textMuted, fontSize: 10, fontWeight: 700 }}>PRIORYTET</span>
                        <span style={{ color: c.textMuted, fontSize: 10, fontWeight: 700 }}>CYKL.</span>
                        <span style={{ color: c.textMuted, fontSize: 10, fontWeight: 700 }}>KRYT.</span>
                        <span style={{ color: c.cyan,    fontSize: 10, fontWeight: 700 }}>LUXMED</span>
                        <span style={{ color: c.success, fontSize: 10, fontWeight: 700 }}>CENY</span>
                      </>
                    )}
                  </div>

                  {/* Rows — no scroll of their own; the wrapper owns it. */}
                  <div>
                    {(expandedCat.sub || [])
                      .filter(sub => showArchivedSubs ? true : !sub.isArchived)
                      .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                      .map((sub, index) => (
                        <div
                          key={sub.id}
                          style={{ background: index % 2 === 0 ? "transparent" : alpha(c.white, "08"), borderRadius: 4 }}
                        >
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

                    </div>{/* min-width wrapper */}
                  </div>{/* horizontal scroller */}
                </div>
              ) : (
                <div style={{
                  ...s.card, flex: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: c.textMuted, border: `2px dashed ${c.border}`,
                  background: "transparent", minHeight: 200,
                }}>
                  Wybierz kategorię główną po lewej.
                </div>
              )}
            </div>

          </div>
        )}
      </CollapsibleSection>
      <style>{`
        @media (max-width: 700px) {
          [data-cats-grid] { grid-template-columns: 1fr !important; }
          [data-subcat-header] { display: none !important; }
        }
      `}</style>
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