// ============================================================
// File: src/components/panels/settings/TagsSection.jsx
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useEffect } from "react";
import { theme as s }        from "../../../styles/theme";
import { CollapsibleSection } from "../../ui/index";
import { EmojiSelector }     from "../../ui/EmojiSelector";
import { ConfirmModal }      from "../../ui/ConfirmModal";
import { ArchiveToggleButton } from "./ArchiveToggleButton";
import { useTagManager }     from "../../../hooks/useTagManager";
import { useSettings }       from "../../../hooks/useSettings";
import { TagMultiSelect }    from "../../ui/TagMultiSelect";
import { EditableLabel }     from "../../ui/EditableLabel";
import type { Tag } from "../../../types/appContext";

const MODAL_CLOSED = { isOpen: false, title: "", message: "", onConfirm: () => {} };

export function TagsSection() {
  const {
    tags, allTags,
    newTagIcon, setNewTagIcon,
    newTagName, setNewTagName,
    isLoading, isSaving,
    handleAddTag, handleArchiveTag, handleRestoreTag, handleUpdateTag,
  } = useTagManager();

  const [showArchived, setShowArchived] = useState(false);
  const [modalConfig,  setModalConfig]  = useState(MODAL_CLOSED);

  // ── Auto-tags ("holiday mode") ─────────────────────────────
  // Pre-selected on every new expense rather than forced on at save time:
  // the whole point is being able to drop the tag on the one purchase that
  // doesn't belong, which only works if it is visible in the form first.
  const { settings, isSaving: isSavingSettings, updateSettings } = useSettings();
  const [autoTags, setAutoTags] = useState<string[]>([]);

  useEffect(() => {
    if (!settings) return;
    setAutoTags(Array.isArray(settings.autoTagIds) ? settings.autoTagIds : []);
  }, [settings]);

  const savedAutoTags = Array.isArray(settings?.autoTagIds) ? settings!.autoTagIds! : [];
  const autoTagsDirty =
    autoTags.length !== savedAutoTags.length ||
    autoTags.some(id => !savedAutoTags.includes(id));

  const archivedTags = allTags.filter(t => t.isArchived);
  const activeAutoTags = allTags.filter(t => savedAutoTags.includes(t.id));

  function confirmArchive(tag: Tag) {
    setModalConfig({
      isOpen: true,
      title:   "Archiwizacja tagu",
      message: `Czy na pewno chcesz zarchiwizować tag "${tag.name}"? Możesz go później przywrócić.`,
      onConfirm: () => { setModalConfig(MODAL_CLOSED); handleArchiveTag(tag.id); },
    });
  }

  return (
    <>
      <CollapsibleSection title="🏷️ Zarządzanie tagami" defaultOpen={false}>
        {isLoading ? (
          <div style={{ color: c.textMuted, fontSize: 13 }}>Ładowanie tagów...</div>
        ) : (
          <>
            {/* Active tags */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: c.textTertiary, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Aktywne</span>
              <ArchiveToggleButton isShowingArchived={showArchived} onToggle={() => setShowArchived(!showArchived)} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {tags.map(tag => (
                <div key={tag.id} style={{ display: "flex", alignItems: "center", gap: 6, background: c.border, border: `1px solid ${c.borderStrong}`, borderRadius: 8, padding: "6px 12px" }}>
                  <EmojiSelector
                    currentEmoji={tag.icon}
                    onSelect={emoji => handleUpdateTag(tag.id, { icon: emoji })}
                  />
                  <EditableLabel value={tag.name} onSave={(newName) => handleUpdateTag(tag.id, { name: newName })} />
                  <button onClick={() => confirmArchive(tag)}
                    style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 14 }}>
                    🗑️
                  </button>
                </div>
              ))}
              {tags.length === 0 && (
                <div style={{ color: c.textMuted, fontSize: 13 }}>Brak aktywnych tagów.</div>
              )}
            </div>

            {/* Archive */}
            {showArchived && (
              <>
                <div style={{ color: c.textTertiary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
                  Archiwum
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {archivedTags.map(tag => (
                    <div key={tag.id} style={{ display: "flex", alignItems: "center", gap: 6, background: c.border, border: `1px solid ${c.borderStrong}`, borderRadius: 8, padding: "6px 12px", opacity: 0.5 }}>
                      <span style={{ fontSize: 16 }}>{tag.icon}</span>
                      <span style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>{tag.name}</span>
                      <button onClick={() => handleRestoreTag(tag.id)} title="Przywróć"
                        style={{ background: "none", border: "none", color: c.success, cursor: "pointer", fontSize: 14 }}>
                        🔄
                      </button>
                    </div>
                  ))}
                  {archivedTags.length === 0 && (
                    <div style={{ color: c.textMuted, fontSize: 13 }}>Brak zarchiwizowanych tagów.</div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Add new */}
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <EmojiSelector currentEmoji={newTagIcon} onSelect={setNewTagIcon} />
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Nowy tag..."
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddTag()}
            maxLength={30}
          />
          <button
            onClick={handleAddTag}
            disabled={isSaving || !newTagName.trim()}
            style={{ ...s.btn(), width: "auto", padding: "10px 18px", marginTop: 0, opacity: (isSaving || !newTagName.trim()) ? 0.4 : 1, cursor: !newTagName.trim() ? "not-allowed" : "pointer" }}>
            {isSaving ? "..." : "➕ Dodaj"}
          </button>
        </div>

        {/* ── Auto-tags ── */}
        <div style={{
          marginTop: 18, paddingTop: 14, borderTop: `1px solid ${c.border}`,
        }}>
          <div style={{ color: c.textTertiary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
            Tag automatyczny
          </div>
          <div style={{ color: c.textMuted, fontSize: 11, marginBottom: 10 }}>
            Wybrane tagi będą <strong>wstępnie zaznaczone</strong> przy każdym nowym wydatku —
            wygodne na czas wyjazdu. Nie są narzucane: przy pojedynczym wydatku możesz je
            odznaczyć przed zapisem. Zostaw puste, żeby wyłączyć.
          </div>

          {activeAutoTags.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              background: alpha(c.info, "11"), border: `1px solid ${alpha(c.info, "44")}`,
              borderRadius: 8, padding: "8px 12px", marginBottom: 10,
              fontSize: 12, color: c.info,
            }}>
              <span>🏷️ Aktywne:</span>
              <strong>{activeAutoTags.map(t => `${t.icon ?? ""} ${t.name}`.trim()).join(", ")}</strong>
              <button
                onClick={() => { setAutoTags([]); updateSettings({ autoTagIds: [] }); }}
                disabled={isSavingSettings}
                style={{
                  marginLeft: "auto", background: "transparent", border: `1px solid ${alpha(c.info, "55")}`,
                  color: c.info, borderRadius: 6, padding: "2px 10px", fontSize: 11,
                  fontWeight: 700, cursor: isSavingSettings ? "not-allowed" : "pointer",
                }}
              >
                Wyłącz
              </button>
            </div>
          )}

          <TagMultiSelect
            value={autoTags}
            onChange={setAutoTags}
            placeholder="Wybierz tagi doklejane do nowych wydatków…"
          />

          {autoTagsDirty && (
            <button
              onClick={() => updateSettings({ autoTagIds: autoTags })}
              disabled={isSavingSettings}
              style={{ ...s.btn(), width: "auto", padding: "8px 16px", marginTop: 10, opacity: isSavingSettings ? 0.4 : 1 }}
            >
              {isSavingSettings ? "Zapisuję…" : "💾 Zapisz tag automatyczny"}
            </button>
          )}
        </div>
      </CollapsibleSection>

      <ConfirmModal
        isOpen={modalConfig.isOpen} title={modalConfig.title}
        message={modalConfig.message} onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig(MODAL_CLOSED)}
      />
    </>
  );
}