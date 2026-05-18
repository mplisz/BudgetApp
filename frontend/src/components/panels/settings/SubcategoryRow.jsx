// ============================================================
// File: src/components/panels/settings/SubcategoryRow.jsx
// ============================================================

import { EditableLabel }  from "../../ui/EditableLabel";
import { PriorityPicker } from "../../ui/PriorityPicker";

export function SubcategoryRow({ subName, subData, parentName, parentId, parentType, parentIsArchived, onUpdate, onError }) {
  const isExpense  = parentType === "EXPENSE";
  const isDisabled = subData.isArchived || parentIsArchived;

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: isExpense ? "1fr 140px 100px 40px" : "1fr 40px",
      gap:                 8,
      alignItems:          "center",
      padding:             "8px 0",
      borderBottom:        "1px solid #1e293b",
      opacity:             subData.isArchived ? 0.4 : 1,
    }}>

      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <EditableLabel
          value={subName}
          disabled={isDisabled}
          onSave={(newName) => onUpdate(subData.id, subName, parentId, { name: newName })}
        />
        {subData.isArchived && (
          <span style={{ fontSize: 10, color: "#ef4444" }}>(Arch)</span>
        )}
      </div>

      {/* Prio — only EXPENSE */}
      {isExpense && (
        <PriorityPicker
          compact
          value={subData.priority ?? 2}
          onChange={(p) => onUpdate(subData.id, subName, parentId, { priority: p })}
          disabled={isDisabled}
        />
      )}

      {/* canBeRecurring toggle — only EXPENSE */}
      {isExpense && (
        <button
          onClick={() => !isDisabled && onUpdate(subData.id, subName, parentId, { canBeRecurring: !subData.canBeRecurring })}
          disabled={isDisabled}
          title={subData.canBeRecurring ? "Wyłącz z cyklicznych" : "Włącz do cyklicznych"}
          style={{
            background:    subData.canBeRecurring ? "#10b98122" : "transparent",
            border:        `1px solid ${subData.canBeRecurring ? "#10b98166" : "#1e293b"}`,
            color:         subData.canBeRecurring ? "#10b981" : "#334155",
            borderRadius:  6,
            padding:       "4px 8px",
            cursor:        isDisabled ? "not-allowed" : "pointer",
            fontSize:      11,
            fontWeight:    700,
            whiteSpace:    "nowrap",
            opacity:       isDisabled ? 0.4 : 1,
          }}
        >
          🔄 {subData.canBeRecurring ? "Cykliczne" : "—"}
        </button>
      )}

      {/* Archive/Restore */}
      <button
        onClick={() => {
          if (parentIsArchived && subData.isArchived) {
            onError("Nie możesz przywrócić subkategorii, dopóki główna kategoria jest w archiwum.");
            return;
          }
          onUpdate(subData.id, subName, parentId, { isArchived: !subData.isArchived });
        }}
        style={{
          background: "none",
          border:     "none",
          color:      subData.isArchived ? "#10b981" : "#475569",
          cursor:     (parentIsArchived && subData.isArchived) ? "not-allowed" : "pointer",
          fontSize:   16,
          opacity:    (parentIsArchived && subData.isArchived) ? 0.3 : 1,
        }}>
        {subData.isArchived ? "🔄" : "🗑️"}
      </button>
    </div>
  );
}