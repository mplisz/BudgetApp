// ============================================================
// File: src/components/panels/settings/TagsSection.jsx
// ============================================================

import { c } from "../../../styles/tokens";
import { useState }          from "react";
import { theme as s }        from "../../../styles/theme";
import { CollapsibleSection } from "../../ui/index";
import { EmojiSelector }     from "../../ui/EmojiSelector";
import { ConfirmModal }      from "../../ui/ConfirmModal";
import { ArchiveToggleButton } from "./ArchiveToggleButton";
import { useTagManager }     from "../../../hooks/useTagManager";
import { EditableLabel }     from "../../ui/EditableLabel";

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

  const archivedTags = allTags.filter(t => t.isArchived);

  function confirmArchive(tag) {
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
      </CollapsibleSection>

      <ConfirmModal
        isOpen={modalConfig.isOpen} title={modalConfig.title}
        message={modalConfig.message} onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig(MODAL_CLOSED)}
      />
    </>
  );
}