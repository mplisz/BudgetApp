// ============================================================
// File: src/components/panels/recurringComponents/RecurringRow.jsx
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useEffect }              from "react";
import {  MONTH_NAMES, getActiveCost } from "../../../hooks/useRecurring";
import {FREQUENCY_OPTIONS} from  "../../../data/constants";
import { useCurrencyConverter }   from "../../../hooks/useCurrencyConverter";
import { fmt, fmtAmount }            from "../../../utils/helpers";

const FREQ_LABEL = Object.fromEntries(FREQUENCY_OPTIONS.map(o => [o.value, o.label]));

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function RecurringRow({ doc, activeBudgetMonth, isLocked, onEdit, onArchive }) {
  const activeCost  = getActiveCost(doc, activeBudgetMonth);
  const isForeign   = activeCost?.originalCurrency && activeCost.originalCurrency !== "PLN";
  const { loadRate, activeRate, isLoading } = useCurrencyConverter();

  useEffect(() => {
    if (isForeign && activeCost?.originalCurrency) {
      loadRate(activeCost.originalCurrency, todayYMD());
    }
  }, [activeCost?.originalCurrency, isForeign]);

  const liveRate  = activeRate || activeCost?.fxRate || 1;
  const amountPLN = isForeign
    ? Math.round((activeCost?.amount || 0) * liveRate * 100) / 100
    : (activeCost?.amount || 0);

  const amountStr = activeCost
    ? isForeign
      ? `${fmtAmount(activeCost.amount, activeCost.originalCurrency)} ${activeCost.originalCurrency} ≈ ${isLoading ? "…" : fmt(amountPLN)} PLN`
      : fmt(activeCost.amount)
    : "—";

  const isConfirmedThisMonth = doc.lastConfirmedMonth === activeBudgetMonth;
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
            {FREQ_LABEL[doc.frequency] || doc.frequency}
          </span>
          {isConfirmedThisMonth && <span style={{ fontSize: 10, color: c.success, fontWeight: 700 }}>✅ potwierdzony</span>}
          {doc.validTo && <span style={{ fontSize: 10, color: c.warning, fontWeight: 600 }}>do {doc.validTo}</span>}
        </div>

        <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 6 }}>
          {doc.categoryName} › {doc.subcategoryName}
          {doc.frequency === "custom" && doc.activeMonths?.length > 0 && (
            <span style={{ marginLeft: 8, color: c.textMuted }}>
              ({doc.activeMonths.map(m => MONTH_NAMES[m - 1]).join(", ")})
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 12, color: c.textMuted, flexWrap: "wrap" }}>
          <span>💳 {doc.plannedDay}. każdego miesiąca</span>
          <span style={{ color: c.text, fontWeight: 700 }}>{amountStr}</span>
          {firstValidFrom && <span style={{ color: c.borderStrong }}>od {firstValidFrom}</span>}
          {/* Show cost history count if more than one */}
          {doc.costs?.length > 1 && (
            <span style={{ color: c.borderStrong }} title="Historia zmian kwoty">
              📝 {doc.costs.length} wersji kwoty
            </span>
          )}
        </div>
      </div>

      {!isLocked && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
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
    </div>
  );
}