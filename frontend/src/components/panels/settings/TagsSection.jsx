// ============================================================
// File: src/components/panels/settings/TagsSection.jsx
// ============================================================

import { useState } from "react";
import { theme as s } from "../../../styles/theme";
import { CollapsibleSection } from "../../ui/index";
import { EmojiSelector } from "../../ui/EmojiSelector";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { ArchiveToggleButton } from "./ArchiveToggleButton";
import { useTagManager } from "../../../hooks/useTagManager";
import { EditableLabel } from "../../ui/EditableLabel";

const MODAL_CLOSED = { isOpen: false, title: "", message: "", onConfirm: () => {} };

export function TagsSection() {
  const {
    tags,
    allTags,
    newTagIcon,
    setNewTagIcon,
    newTagName,
    setNewTagName,
    isLoading,
    isSaving,
    errorMsg,
    handleAddTag,
    handleArchiveTag,
    handleRestoreTag,
    handleUpdateTag
  } = useTagManager();

  const [showArchived, setShowArchived] = useState(false);
  const [modalConfig, setModalConfig]   = useState(MODAL_CLOSED);

  const archivedTags = allTags.filter(t => t.isArchived);

  function confirmArchive(tag) {
    setModalConfig({
      isOpen: true,
      title: "Archiwizacja tagu",
      message: `Czy na pewno chcesz zarchiwizować tag "${tag.name}"? Możesz go później przywrócić.`,
      onConfirm: () => {
        setModalConfig(MODAL_CLOSED);
        handleArchiveTag(tag.id);
      }
    });
  }

  return (
    <>
      <CollapsibleSection title="🏷️ Zarządzanie tagami" defaultOpen={false}>
        {errorMsg && (
          <div style={{ padding: "10px 14px", background: "#ef444422", borderLeft: "4px solid #ef4444", color: "#f87171", marginBottom: 12, borderRadius: 4, fontSize: 13 }}>
            {errorMsg}
          </div>
        )}

        {isLoading ? (
          <div style={{ color: "#475569", fontSize: 13 }}>Ładowanie tagów...</div>
        ) : (
          <>
            {/* Active tags */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Aktywne</span>
              <ArchiveToggleButton isShowingArchived={showArchived} onToggle={() => setShowArchived(!showArchived)} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {tags.map(tag => (
              <div key={tag.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px 12px" }}>
                <span style={{ fontSize: 16 }}>{tag.icon}</span>
                <EditableLabel
                  value={tag.name}
                  onSave={(newName) => handleUpdateTag(tag.id, { name: newName })}
                />
                <button onClick={() => confirmArchive(tag)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>
                  🗑️
                </button>
              </div>
            ))}
              {tags.length === 0 && (
                <div style={{ color: "#475569", fontSize: 13 }}>Brak aktywnych tagów.</div>
              )}
            </div>

            {/* Archive */}
            {showArchived && (
              <>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
                  Archiwum
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {archivedTags.map(tag => (
                    <div key={tag.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px 12px", opacity: 0.5 }}>
                      <span style={{ fontSize: 16 }}>{tag.icon}</span>
                      <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{tag.name}</span>
                      <button
                        onClick={() => handleRestoreTag(tag.id)}
                        title="Przywróć"
                        style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer", fontSize: 14 }}
                      >
                        🔄
                      </button>
                    </div>
                  ))}
                  {archivedTags.length === 0 && (
                    <div style={{ color: "#475569", fontSize: 13 }}>Brak zarchiwizowanych tagów.</div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Add new*/}
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <EmojiSelector currentEmoji={newTagIcon} onSelect={setNewTagIcon} />
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Nowy tag..."
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
            maxLength={30}
          />
          <button
            onClick={handleAddTag}
            disabled={isSaving || !newTagName.trim()}
            style={{
              ...s.btn(),
              width: "auto",
              padding: "10px 18px",
              marginTop: 0,
              opacity: (isSaving || !newTagName.trim()) ? 0.4 : 1,
              cursor: !newTagName.trim() ? "not-allowed" : "pointer"
            }}
          >
            {isSaving ? "..." : "➕ Dodaj"}
          </button>
        </div>
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