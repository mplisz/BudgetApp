// ============================================================
// File: src/components/panels/settings/SubcategoryRow.jsx
// ============================================================

import { EditableLabel } from "../../ui/EditableLabel";

const PRIO_COLORS = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#6b7280" };

export function SubcategoryRow({ subName, subData, parentName, parentId, parentType, parentIsArchived, onUpdate, onError }) {
  const isExpense = parentType === 'EXPENSE';
  const isDisabled = subData.isArchived || parentIsArchived;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isExpense ? "1fr 140px 40px" : "1fr 40px",
      gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e293b",
      opacity: subData.isArchived ? 0.4 : 1
    }}>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <EditableLabel
          value={subName}
          disabled={isDisabled}
          onSave={(newName) => onUpdate(subData.id, subName, parentId, { name: newName })}
        />
        {subData.isArchived && <span style={{ fontSize: 10, color: '#ef4444' }}>(Arch)</span>}
      </div>

      {isExpense && (
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4].map(p => (
            <button
              key={p}
              onClick={() => onUpdate(subData.id, subName, parentId, { priority: p })}
              disabled={isDisabled}
              style={{
                flex: 1, textAlign: 'center', fontSize: 10, padding: "2px 0", borderRadius: 4,
                border: `1px solid ${subData.priority === p ? PRIO_COLORS[p] : "#334155"}`,
                color: subData.priority === p ? PRIO_COLORS[p] : "#475569",
                background: subData.priority === p ? PRIO_COLORS[p] + "22" : "transparent",
                cursor: isDisabled ? "not-allowed" : "pointer",
                transition: "0.2s"
              }}
            >
              P{p}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          if (parentIsArchived && subData.isArchived) {
            onError("Nie możesz przywrócić subkategorii, dopóki główna kategoria jest w archiwum.");
            return;
          }
          onUpdate(subData.id, subName, parentId, { isArchived: !subData.isArchived });
        }}
        style={{
          background: "none", border: "none",
          color: subData.isArchived ? "#10b981" : "#475569",
          cursor: (parentIsArchived && subData.isArchived) ? "not-allowed" : "pointer",
          fontSize: 16,
          opacity: (parentIsArchived && subData.isArchived) ? 0.3 : 1
        }}
      >
        {subData.isArchived ? "🔄" : "🗑️"}
      </button>
    </div>
  );
}