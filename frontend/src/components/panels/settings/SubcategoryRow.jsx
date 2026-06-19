// ============================================================
// File: src/components/panels/settings/SubcategoryRow.jsx
// Rozszerzony o canBeLuxmed toggle (analogicznie do canBeRecurring)
// ============================================================

import { EditableLabel }  from "../../ui/EditableLabel";
import { PriorityPicker } from "../../ui/PriorityPicker";

export function SubcategoryRow({ subName, subData, parentName, parentId, parentType, parentIsArchived, onUpdate, onError }) {
  const isExpense  = parentType === "EXPENSE";
  const isDisabled = subData.isArchived || parentIsArchived;

  // canBeLuxmed toggle pokazujemy tylko dla kategorii Zdrowie (EXPENSE).
  // Sprawdzamy po parentId żeby nie musieć przekazywać dodatkowego flaga — 
  // wszystkie znane ID kategorii Zdrowie zaczynają się od "cat_zdrowie".
  const isZdrowieCategory = parentId === "cat_zdrowie";

  return (
    <div style={{
      display:             "grid",
      // EXPENSE (Zdrowie): name | priority | recurring | critical | luxmed | archive
      // EXPENSE (inne):    name | priority | recurring | critical | archive
      // INCOME/SAVING/TRANSFER: name | archive
      gridTemplateColumns: isExpense
        ? isZdrowieCategory
          ? "1fr 140px 100px 100px 100px 40px"
          : "1fr 140px 100px 100px 40px"
        : "1fr 40px",
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
        {subData.canBeLuxmed && !isZdrowieCategory && (
          // Fallback badge jeśli subkategoria ma flagę ale nie jesteśmy w Zdrowie
          <span style={{ fontSize: 10, color: "#06b6d4" }}>🏥</span>
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

      {/* isCritical toggle — only EXPENSE */}
      {isExpense && (
        <button
          onClick={() => !isDisabled && onUpdate(subData.id, subName, parentId, { isCritical: !subData.isCritical })}
          disabled={isDisabled}
          title={subData.isCritical
            ? "Wyłącz jako 'nienaruszalne' (przestanie wpadać do Survival Mode)"
            : "Oznacz jako 'nienaruszalne' (czesne, leki, opłata za przedszkole). Te wydatki będą wliczane do każdego trybu w poduszce finansowej, niezależnie od priorytetu."
          }
          style={{
            background:    subData.isCritical ? "#a855f722" : "transparent",
            border:        `1px solid ${subData.isCritical ? "#a855f766" : "#1e293b"}`,
            color:         subData.isCritical ? "#a855f7" : "#334155",
            borderRadius:  6,
            padding:       "4px 8px",
            cursor:        isDisabled ? "not-allowed" : "pointer",
            fontSize:      11,
            fontWeight:    700,
            whiteSpace:    "nowrap",
            opacity:       isDisabled ? 0.4 : 1,
          }}
        >
          🔒 {subData.isCritical ? "Krytyczne" : "—"}
        </button>
      )}

      {/* canBeLuxmed toggle — only EXPENSE + Zdrowie category */}
      {isExpense && isZdrowieCategory && (
        <button
          onClick={() => !isDisabled && onUpdate(subData.id, subName, parentId, { canBeLuxmed: !subData.canBeLuxmed })}
          disabled={isDisabled}
          title={subData.canBeLuxmed
            ? "Wyłącz z puli zwrotów LuxMed"
            : "Włącz do puli zwrotów LuxMed — transakcje z tej subkategorii będą widoczne w panelu Zwroty LuxMed"
          }
          style={{
            background:    subData.canBeLuxmed ? "#06b6d422" : "transparent",
            border:        `1px solid ${subData.canBeLuxmed ? "#06b6d466" : "#1e293b"}`,
            color:         subData.canBeLuxmed ? "#06b6d4" : "#334155",
            borderRadius:  6,
            padding:       "4px 8px",
            cursor:        isDisabled ? "not-allowed" : "pointer",
            fontSize:      11,
            fontWeight:    700,
            whiteSpace:    "nowrap",
            opacity:       isDisabled ? 0.4 : 1,
          }}
        >
          🏥 {subData.canBeLuxmed ? "LuxMed" : "—"}
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
        disabled={isDisabled && parentIsArchived && subData.isArchived}
        title={subData.isArchived ? "Przywróć" : "Archiwizuj"}
        style={{
          background:    "transparent",
          border:        "1px solid #1e293b",
          color:         "#64748b",
          borderRadius:  6,
          padding:       "4px 8px",
          cursor:        "pointer",
          fontSize:      12,
          opacity:       (parentIsArchived && subData.isArchived) ? 0.3 : 1,
        }}
      >
        {subData.isArchived ? "↺" : "🗄"}
      </button>
    </div>
  );
}
