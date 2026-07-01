// ============================================================
// File: src/components/panels/recurringComponents/RecurringRow.jsx
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { MONTH_NAMES, isConfirmedInMonth, scheduleLabel } from "../../../hooks/useRecurring";
import { FREQUENCY_OPTIONS }      from "../../../data/constants";
import { useRecurringConfirm }    from "../../../hooks/useRecurringConfirm";
import type { RecurringDoc }      from "../../../types/appContext";

const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQUENCY_OPTIONS.map(o => [o.value, o.label]));

interface RecurringRowProps {
  doc:               RecurringDoc;
  activeBudgetMonth: string;
  isLocked:          boolean;
  onEdit:            (doc: RecurringDoc) => void;
  onArchive:         (doc: RecurringDoc) => void;
}

export function RecurringRow({ doc, activeBudgetMonth, isLocked, onEdit, onArchive }: RecurringRowProps) {
  const { open, modal, amountStr } = useRecurringConfirm(doc, activeBudgetMonth);

  const isConfirmedThisMonth = isConfirmedInMonth(doc, activeBudgetMonth);
  const firstValidFrom = doc.costs?.[0]?.validFrom;

  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${isConfirmedThisMonth ? alpha(c.success, "33") : c.border}`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 10,
      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: c.text, fontSize: 14 }}>{doc.description}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: c.border, color: c.textSecondary }}>
            {doc.frequency ? (FREQ_LABEL[doc.frequency] || doc.frequency) : ""}
          </span>
          {isConfirmedThisMonth && <span style={{ fontSize: 10, color: c.success, fontWeight: 700 }}>✅ potwierdzony</span>}
          {doc.validTo && <span style={{ fontSize: 10, color: c.warning, fontWeight: 600 }}>do {doc.validTo}</span>}
        </div>

        <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 6 }}>
          {doc.categoryName} › {doc.subcategoryName}
          {doc.frequency === "custom" && (doc.activeMonths?.length ?? 0) > 0 && (
            <span style={{ marginLeft: 8, color: c.textMuted }}>
              ({(doc.activeMonths ?? []).map(m => MONTH_NAMES[m - 1]).join(", ")})
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 12, color: c.textMuted, flexWrap: "wrap" }}>
          <span>💳 {scheduleLabel(doc)}</span>
          <span style={{ color: c.text, fontWeight: 700 }}>{amountStr}</span>
          {firstValidFrom && <span style={{ color: c.borderStrong }}>od {firstValidFrom}</span>}
          {/* Show cost history count if more than one */}
          {(doc.costs?.length ?? 0) > 1 && (
            <span style={{ color: c.borderStrong }} title="Historia zmian kwoty">
              📝 {doc.costs?.length} wersji kwoty
            </span>
          )}
        </div>
      </div>

      {!isLocked && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
          {!isConfirmedThisMonth && (
            <button onClick={open} title="Potwierdź płatność"
              style={{ background: c.success, border: "none", color: c.white, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
              ✅ Potwierdzam
            </button>
          )}
          <button onClick={() => onEdit(doc)} title="Edytuj"
            style={{ background: "transparent", border: `1px solid ${alpha(c.info, "44")}`, color: c.info, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            ✏️
          </button>
          <button onClick={() => onArchive(doc)} title="Archiwizuj od tego miesiąca"
            style={{ background: "transparent", border: `1px solid ${alpha(c.danger, "44")}`, color: c.danger, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            🗑️
          </button>
        </div>
      )}

      {modal}
    </div>
  );
}
