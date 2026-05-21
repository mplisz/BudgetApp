// ============================================================
// File: src/components/panels/plannedComponents/PlannedCard.tsx
// Card for a single planned expense. Shows progress for envelope,
// planned date for oneoff. Actions: edit, archive, purchase.
// ============================================================

import { useEffect } from "react";
import { useCurrencyConverter }  from "../../../hooks/useCurrencyConverter";
import { sumPaid, computeSuggestion, isReadyToPurchase } from "../../../hooks/usePlanned";
import { fmt }                   from "../../../utils/helpers";
import type { PlannedDoc }       from "../../../hooks/usePlanned";

interface PlannedCardProps {
  doc:        PlannedDoc;
  onEdit:     (doc: PlannedDoc) => void;
  onArchive:  (doc: PlannedDoc) => void;
  onPurchase: (doc: PlannedDoc) => void;
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function PlannedCard({ doc, onEdit, onArchive, onPurchase }: PlannedCardProps) {
  const currentMonth = todayYMD().slice(0, 7);
  const isForeign    = doc.originalCurrency && doc.originalCurrency !== "PLN";
  const ready        = isReadyToPurchase(doc);
  const paid         = sumPaid(doc.virtualSavings);
  const suggestion   = computeSuggestion(doc, currentMonth);

  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter() as {
    loadRate:  (currency: string, date: string) => void;
    activeRate: number | null;
    isLoading: boolean;
  };

  useEffect(() => {
    if (isForeign) loadRate(doc.originalCurrency, todayYMD());
  }, [doc.originalCurrency, isForeign]);

  const liveRate    = activeRate || doc.fxRate || 1;
  const totalPLN    = isForeign
    ? Math.round(doc.totalAmount * liveRate * 100) / 100
    : doc.totalAmountPLN;
  const progressPct = totalPLN > 0 ? Math.min(100, Math.round(paid / totalPLN * 100)) : 0;
  const progressColor = ready ? "#10b981" : progressPct >= 80 ? "#f59e0b" : "#3b82f6";

  // Current month virtual saving entry
  const thisMonthEntry = doc.mode === "envelope"
    ? (doc.virtualSavings || []).find(v => v.month === currentMonth)
    : null;

  return (
    <div style={{
      background:   "#0d1424",
      border:       `1px solid ${ready ? "#10b98166" : "#1e293b"}`,
      borderRadius: 12,
      padding:      "16px",
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
              {doc.mode === "envelope" ? "Koperta" : "Jednorazowy"}
            </span>
            {ready && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#10b98122", color: "#10b981", fontWeight: 700 }}>
                ✅ Gotowe do zakupu
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {doc.targetCategoryName} › {doc.targetSubcategoryName}
            <span style={{ marginLeft: 8 }}>📅 {doc.plannedMonth}</span>
          </div>
        </div>

        {/* Amount */}
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#e2e8f0" }}>
            {isForeign
              ? `${fmt(doc.totalAmount)} ${doc.originalCurrency}`
              : fmt(doc.totalAmountPLN)
            }
          </div>
          {isForeign && (
            <div style={{ fontSize: 11, color: "#475569" }}>
              ≈ {rateLoading ? "…" : fmt(totalPLN)} PLN
            </div>
          )}
        </div>
      </div>

      {/* Envelope progress */}
      {doc.mode === "envelope" && (
        <>
          {/* Progress bar */}
          <div style={{ height: 6, background: "#1e293b", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: progressColor, borderRadius: 99, transition: "width 0.4s ease" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: "#64748b" }}>
              Zebrano: <strong style={{ color: progressColor }}>{fmt(paid)} PLN</strong>
            </span>
            <span style={{ color: "#475569" }}>{progressPct}%</span>
            <span style={{ color: "#64748b" }}>
              Cel: <strong style={{ color: "#94a3b8" }}>{fmt(totalPLN)} PLN</strong>
            </span>
          </div>

          {/* This month entry */}
          {thisMonthEntry && !thisMonthEntry.paidByUser && !thisMonthEntry.dismissedByUser && (
            <div style={{ fontSize: 12, color: "#3b82f6", marginBottom: 6 }}>
              💡 Ten miesiąc: <strong>{fmt(thisMonthEntry.amount)}</strong>
              {doc.originalCurrency !== "PLN" ? ` ${doc.originalCurrency}` : " PLN"}
            </div>
          )}

          {suggestion !== null && !ready && (
            <div style={{ fontSize: 11, color: "#475569" }}>
              Sugerowana rata: <strong style={{ color: "#10b981" }}>{fmt(suggestion)} PLN/mies.</strong>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
        {ready && (
          <button onClick={() => onPurchase(doc)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            🛍️ Kup
          </button>
        )}
        <button onClick={() => onEdit(doc)}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
          ✏️ Edytuj
        </button>
        <button onClick={() => onArchive(doc)}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#475569", cursor: "pointer", fontSize: 12 }}>
          🗑️
        </button>
      </div>
    </div>
  );
}
