// ============================================================
// File: src/components/panels/plannedComponents/PlannedCard.jsx
// Card for a single planned expense in the desktop panel.
// Shows progress bar for envelope, planned date for oneoff.
// ============================================================

import { useEffect }              from "react";
import { useCurrencyConverter }   from "../../../hooks/useCurrencyConverter";
import { sumPaid, computeSuggestion, isReadyToPurchase } from "../../../hooks/usePlanned";
import { fmt, fmtAmount }         from "../../../utils/helpers";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function PlannedCard({ doc, onEdit, onArchive, onPurchase }) {
  const currentMonth = todayYMD().slice(0, 7);
  const isForeign    = doc.originalCurrency && doc.originalCurrency !== "PLN";
  const ready        = isReadyToPurchase(doc);
  const paid         = sumPaid(doc.virtualSavings);
  const suggestion   = computeSuggestion(doc, currentMonth);

  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter();

  useEffect(() => {
    if (isForeign) loadRate(doc.originalCurrency, todayYMD());
  }, [doc.originalCurrency, isForeign]);

  const liveRate   = activeRate || doc.fxRate || 1;
  const totalPLN   = isForeign
    ? Math.round(doc.totalAmount * liveRate * 100) / 100
    : doc.totalAmountPLN;

  const progressPct = totalPLN > 0
    ? Math.min(100, Math.round(paid / totalPLN * 100))
    : 0;

  const progressColor = ready
    ? "#10b981"
    : progressPct >= 80
      ? "#f59e0b"
      : "#3b82f6";

  const amountStr = isForeign
    ? `${fmtAmount(doc.totalAmount, doc.originalCurrency)} ${doc.originalCurrency} ≈ ${rateLoading ? "…" : fmt(totalPLN)} PLN`
    : fmt(doc.totalAmountPLN);

  return (
    <div style={{
      background: "#0d1424",
      border: `1px solid ${ready ? "#10b98166" : "#1e293b"}`,
      borderRadius: 12, padding: "16px",
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14 }}>{doc.description}</span>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 20,
              background: doc.mode === "envelope" ? "#3b82f622" : "#f59e0b22",
              color:      doc.mode === "envelope" ? "#3b82f6"   : "#f59e0b",
              fontWeight: 700,
            }}>
              {doc.mode === "envelope" ? "🪙 Koperta" : "💳 Jednorazowy"}
            </span>
            <span style={{ fontSize: 11, color: "#475569" }}>📅 {doc.plannedMonth}</span>
            {ready && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>✅ Gotowy do zakupu!</span>}
            {doc.isPurchased && <span style={{ fontSize: 10, color: "#475569", fontWeight: 700 }}>✅ Kupiony</span>}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {doc.targetCategoryName} › {doc.targetSubcategoryName}
          </div>
        </div>

        {/* Actions */}
        {!doc.isPurchased && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {ready && (
              <button
                onClick={() => onPurchase(doc)}
                style={{ background: "#10b981", border: "none", color: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
              >
                🛍️ Kup
              </button>
            )}
            <button onClick={() => onEdit(doc)}
              style={{ background: "transparent", border: "1px solid #3b82f644", color: "#3b82f6", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
              ✏️
            </button>
            <button onClick={() => onArchive(doc)}
              style={{ background: "transparent", border: "1px solid #ef444444", color: "#ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* Amount + planned month */}
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: doc.mode === "envelope" ? 10 : 0, flexWrap: "wrap" }}>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>{amountStr}</span>
        {doc.mode === "envelope" && suggestion !== null && !ready && (
          <span style={{ fontSize: 12, color: "#10b981" }}>
            💡 {fmt(suggestion)} PLN/miesiąc
          </span>
        )}
      </div>

      {/* Progress bar — envelope only */}
      {doc.mode === "envelope" && (
        <div>
          <div style={{
            background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden", marginBottom: 4,
          }}>
            <div style={{
              width: `${progressPct}%`, height: "100%",
              background: progressColor,
              transition: "width 0.3s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569" }}>
            <span style={{ color: progressColor }}>
              {fmt(paid)} PLN zebrano ({progressPct}%)
            </span>
            <span>{fmt(totalPLN)} PLN cel</span>
          </div>
        </div>
      )}
    </div>
  );
}