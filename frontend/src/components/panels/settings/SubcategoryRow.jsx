// ============================================================
// File: src/components/panels/settings/SubcategoryRow.jsx
// Rozszerzony o canBeLuxmed toggle (analogicznie do canBeRecurring)
//
// Desktop: grid 2/5/6-kolumnowy (zależnie od typu kategorii).
// Mobile (≤700px): karta — nazwa + archiwizacja na górze, przełączniki
//   (priorytet / cykliczne / krytyczne / luxmed) w zawijanym rzędzie pod
//   spodem. Każdy element zdefiniowany raz, tylko inaczej ułożony.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { EditableLabel }  from "../../ui/EditableLabel";
import { PriorityPicker } from "../../ui/PriorityPicker";
import { useIsMobile }    from "../../../hooks/useIsMobile";

export function SubcategoryRow({ subName, subData, parentName, parentId, parentType, parentIsArchived, onUpdate, onError }) {
  const isMobile   = useIsMobile();
  const isExpense  = parentType === "EXPENSE";
  const isDisabled = subData.isArchived || parentIsArchived;

  // canBeLuxmed toggle pokazujemy tylko dla kategorii Zdrowie (EXPENSE).
  // Sprawdzamy po parentId żeby nie musieć przekazywać dodatkowego flaga —
  // wszystkie znane ID kategorii Zdrowie zaczynają się od "cat_zdrowie".
  const isZdrowieCategory = parentId === "cat_zdrowie";

  // ── Cells (zdefiniowane raz, użyte w obu układach) ────────────

  const nameCell = (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <EditableLabel
        value={subName}
        disabled={isDisabled}
        onSave={(newName) => onUpdate(subData.id, subName, parentId, { name: newName })}
      />
      {subData.isArchived && (
        <span style={{ fontSize: 10, color: c.danger }}>(Arch)</span>
      )}
      {subData.canBeLuxmed && !isZdrowieCategory && (
        // Fallback badge jeśli subkategoria ma flagę ale nie jesteśmy w Zdrowie
        <span style={{ fontSize: 10, color: c.cyan }}>🏥</span>
      )}
    </div>
  );

  const prioCell = isExpense ? (
    <PriorityPicker
      compact
      value={subData.priority ?? 2}
      onChange={(p) => onUpdate(subData.id, subName, parentId, { priority: p })}
      disabled={isDisabled}
    />
  ) : null;

  const recurringBtn = isExpense ? (
    <button
      onClick={() => !isDisabled && onUpdate(subData.id, subName, parentId, { canBeRecurring: !subData.canBeRecurring })}
      disabled={isDisabled}
      title={subData.canBeRecurring ? "Wyłącz z cyklicznych" : "Włącz do cyklicznych"}
      style={{
        background:    subData.canBeRecurring ? alpha(c.success, "22") : "transparent",
        border:        `1px solid ${subData.canBeRecurring ? alpha(c.success, "66") : c.border}`,
        color:         subData.canBeRecurring ? c.success : c.borderStrong,
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
  ) : null;

  const criticalBtn = isExpense ? (
    <button
      onClick={() => !isDisabled && onUpdate(subData.id, subName, parentId, { isCritical: !subData.isCritical })}
      disabled={isDisabled}
      title={subData.isCritical
        ? "Wyłącz jako 'nienaruszalne' (przestanie wpadać do Trybu przetrwania)"
        : "Oznacz jako 'nienaruszalne' (czesne, leki, opłata za przedszkole). Te wydatki będą wliczane do każdego trybu w poduszce finansowej, niezależnie od priorytetu."
      }
      style={{
        background:    subData.isCritical ? alpha(c.voucher, "22") : "transparent",
        border:        `1px solid ${subData.isCritical ? alpha(c.voucher, "66") : c.border}`,
        color:         subData.isCritical ? c.voucher : c.borderStrong,
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
  ) : null;

  const luxmedBtn = (isExpense && isZdrowieCategory) ? (
    <button
      onClick={() => !isDisabled && onUpdate(subData.id, subName, parentId, { canBeLuxmed: !subData.canBeLuxmed })}
      disabled={isDisabled}
      title={subData.canBeLuxmed
        ? "Wyłącz z puli zwrotów LuxMed"
        : "Włącz do puli zwrotów LuxMed — transakcje z tej subkategorii będą widoczne w panelu Zwroty LuxMed"
      }
      style={{
        background:    subData.canBeLuxmed ? alpha(c.cyan, "22") : "transparent",
        border:        `1px solid ${subData.canBeLuxmed ? alpha(c.cyan, "66") : c.border}`,
        color:         subData.canBeLuxmed ? c.cyan : c.borderStrong,
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
  ) : null;

  const archiveBtn = (
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
        border:        `1px solid ${c.border}`,
        color:         c.textSecondary,
        borderRadius:  6,
        padding:       "4px 8px",
        cursor:        "pointer",
        fontSize:      12,
        flexShrink:    0,
        opacity:       (parentIsArchived && subData.isArchived) ? 0.3 : 1,
      }}
    >
      {subData.isArchived ? "↺" : "🗄"}
    </button>
  );

  // ── Mobile: card ──────────────────────────────────────────────

  if (isMobile) {
    return (
      <div style={{
        padding: "10px 0",
        borderBottom: `1px solid ${c.border}`,
        opacity: subData.isArchived ? 0.4 : 1,
      }}>
        {/* Name + archive */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{nameCell}</div>
          {archiveBtn}
        </div>

        {/* Toggles — EXPENSE only */}
        {isExpense && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
            {prioCell}
            {recurringBtn}
            {criticalBtn}
            {luxmedBtn}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: grid ─────────────────────────────────────────────

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
      borderBottom:        `1px solid ${c.border}`,
      opacity:             subData.isArchived ? 0.4 : 1,
    }}>
      {nameCell}
      {prioCell}
      {recurringBtn}
      {criticalBtn}
      {luxmedBtn}
      {archiveBtn}
    </div>
  );
}
