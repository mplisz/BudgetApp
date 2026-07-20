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
import type { AppSubcategory } from "../../../types/appContext";
import type { CategoryUpdates } from "../../../hooks/useCategoryManager";

interface SubcategoryRowProps {
  subName:          string;
  subData:          AppSubcategory;
  parentName?:      string;
  parentId:         string;
  parentType:       string;
  parentIsArchived: boolean;
  onUpdate:         (id: string, name: string, parentId: string | null, updates: CategoryUpdates) => void;
  onError:          (msg: string) => void;
}

/**
 * THE single definition of the subcategory grid columns, shared by the
 * header (CategoriesSection) and every row — when those drifted apart the
 * table skewed and buttons wrapped onto a second line.
 *
 * EXPENSE always has the SAME six columns
 *   name | priority | recurring | critical | luxmed | archive
 * A constant column count is what keeps header and rows aligned; a
 * conditional one is how they drift.
 */
export const SUBCAT_MIN_WIDTH = 580;   // below this the table scrolls instead of crushing

export function subcategoryGridColumns(type: string | undefined): string {
  if (type !== "EXPENSE") return "1fr 34px";
  return "minmax(140px, 1fr) 120px 92px 92px 92px 34px";
}

export function SubcategoryRow({ subName, subData, parentId, parentType, parentIsArchived, onUpdate, onError }: SubcategoryRowProps) {
  const isMobile   = useIsMobile();
  const isExpense  = parentType === "EXPENSE";
  const isDisabled = subData.isArchived || parentIsArchived;

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

  // LuxMed is togglable on ANY expense subcategory. It used to be locked
  // to the health category, which left a column you could see but never
  // click everywhere else — and refunds legitimately show up outside
  // "Zdrowie" (glasses, rehab, dentistry booked elsewhere).
  const luxmedBtn = isExpense ? (
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
      gridTemplateColumns: subcategoryGridColumns(parentType),
      gap:                 6,
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
