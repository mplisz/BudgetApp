// ============================================================
// File: src/components/panels/settings/CategoryRow.jsx
// ============================================================

import { EditableLabel } from "../../ui/EditableLabel";

export function CategoryRow({ cat, expandedCatId, setExpandedCatId, onUpdate }) {
  const isExpanded = expandedCatId === cat.id;

  return (
    <div
      onClick={() => setExpandedCatId(isExpanded ? null : cat.id)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 8px", borderRadius: 8,
        cursor: "pointer", marginBottom: 2,
        background: isExpanded ? "#10b98122" : "transparent",
        opacity: cat.isArchived ? 0.4 : 1,
        borderLeft: isExpanded ? "3px solid #10b981" : "3px solid transparent"
      }}>
      <span style={{ fontSize: 16 }}>{cat.icon}</span>

      <EditableLabel
        value={cat.name}
        disabled={cat.isArchived}
        onSave={(newName) => onUpdate(cat.id, cat.name, null, { name: newName })}
      />

      {cat.isArchived && <span style={{ fontSize: 10, color: '#ef4444' }}>(Arch)</span>}

      <button
        onClick={e => {
          e.stopPropagation();
          onUpdate(cat.id, cat.name, null, { isArchived: !cat.isArchived });
        }}
        style={{ background: "none", border: "none", color: cat.isArchived ? "#10b981" : "#475569", cursor: "pointer", fontSize: 14 }}>
        {cat.isArchived ? "🔄" : "✕"}
      </button>
    </div>
  );
}