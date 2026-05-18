// ============================================================
// File: src/components/panels/recurringComponents/RecurringRow.jsx
// ============================================================

import { useEffect }              from "react";
import { FREQUENCY_OPTIONS, MONTH_NAMES, getActiveCost } from "../../../hooks/useRecurring";
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
      background: "#0d1424",
      border: `1px solid ${isConfirmedThisMonth ? "#10b98133" : "#1e293b"}`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 10,
      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14 }}>{doc.description}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#1e293b", color: "#64748b" }}>
            {FREQ_LABEL[doc.frequency] || doc.frequency}
          </span>
          {isConfirmedThisMonth && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>✅ potwierdzony</span>}
          {doc.validTo && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>do {doc.validTo}</span>}
        </div>

        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
          {doc.categoryName} › {doc.subcategoryName}
          {doc.frequency === "custom" && doc.activeMonths?.length > 0 && (
            <span style={{ marginLeft: 8, color: "#475569" }}>
              ({doc.activeMonths.map(m => MONTH_NAMES[m - 1]).join(", ")})
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#475569", flexWrap: "wrap" }}>
          <span>💳 {doc.plannedDay}. każdego miesiąca</span>
          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{amountStr}</span>
          {firstValidFrom && <span style={{ color: "#334155" }}>od {firstValidFrom}</span>}
          {/* Show cost history count if more than one */}
          {doc.costs?.length > 1 && (
            <span style={{ color: "#334155" }} title="Historia zmian kwoty">
              📝 {doc.costs.length} wersji kwoty
            </span>
          )}
        </div>
      </div>

      {!isLocked && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
          <button onClick={() => onEdit(doc)} title="Edytuj"
            style={{ background: "transparent", border: "1px solid #3b82f644", color: "#3b82f6", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            ✏️
          </button>
          <button onClick={() => onArchive(doc)} title="Archiwizuj od tego miesiąca"
            style={{ background: "transparent", border: "1px solid #ef444444", color: "#ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}