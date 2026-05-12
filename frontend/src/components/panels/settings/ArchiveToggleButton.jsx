// ============================================================
// File: src/components/settings/ArchiveToggleButton.jsx
// Specific toggle button for archive views in settings
// ============================================================

export function ArchiveToggleButton({ isShowingArchived, onToggle }) {
  return (
    <button 
      onClick={onToggle} 
      style={{ 
        background: isShowingArchived ? "#10b98122" : "transparent", 
        border: `1px solid ${isShowingArchived ? "#10b981" : "#334155"}`, 
        color: isShowingArchived ? "#10b981" : "#94a3b8", 
        cursor: "pointer", 
        fontSize: 10, 
        fontWeight: 700, 
        padding: "4px 8px", 
        borderRadius: 4,
        transition: "0.2s" 
      }}>
      {isShowingArchived ? "👁️ UKRYJ ARCHIWUM" : "👁️ POKAŻ ARCHIWUM"}
    </button>
  );
}