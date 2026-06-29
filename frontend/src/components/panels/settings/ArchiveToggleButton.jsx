// ============================================================
// File: src/components/settings/ArchiveToggleButton.jsx
// Specific toggle button for archive views in settings
// ============================================================

import { c, alpha } from "../../../styles/tokens";

export function ArchiveToggleButton({ isShowingArchived, onToggle }) {
  return (
    <button 
      onClick={onToggle} 
      style={{ 
        background: isShowingArchived ? alpha(c.success, "22") : "transparent", 
        border: `1px solid ${isShowingArchived ? c.success : c.borderStrong}`, 
        color: isShowingArchived ? c.success : c.textTertiary, 
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