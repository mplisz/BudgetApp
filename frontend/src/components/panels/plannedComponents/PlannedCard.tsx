// ============================================================
// File: src/components/panels/plannedComponents/PlannedCard.tsx
// Card for a single planned expense. Shows progress for envelope,
// planned date for oneoff. Actions: edit, archive, purchase.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
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
function safeHttpUrl(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  // must be  http(s) — blocks  javascript:, data:, vbscript etc.,
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  const candidate = scheme ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null;
  } catch {
    return null;
  }
}
export function PlannedCard({ doc, onEdit, onArchive, onPurchase }: PlannedCardProps) {
  const currentMonth = todayYMD().slice(0, 7);
  const isForeign    = doc.originalCurrency && doc.originalCurrency !== "PLN";
  const ready        = isReadyToPurchase(doc);
  const paid         = sumPaid(doc.virtualSavings);
  const suggestion   = computeSuggestion(doc, currentMonth);

  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter();

  useEffect(() => {
    if (isForeign) loadRate(doc.originalCurrency, todayYMD());
  }, [doc.originalCurrency, isForeign]);

  const liveRate    = activeRate || doc.fxRate || 1;
  const totalPLN    = isForeign
    ? Math.round(doc.totalAmount * liveRate * 100) / 100
    : doc.totalAmountPLN;
  const progressPct = totalPLN > 0 ? Math.min(100, Math.round(paid / totalPLN * 100)) : 0;
  const progressColor = ready ? c.success : progressPct >= 80 ? c.warning : c.info;

  // Current month virtual saving entry
  const thisMonthEntry = doc.mode === "envelope"
    ? (doc.virtualSavings || []).find(v => v.month === currentMonth)
    : null;

  //safe url - make sure only https/http links are actually rendered
  const safeUrl = doc.url ? safeHttpUrl(doc.url) : null;


  return (
    <div style={{
      background:   c.surface,
      border:       `1px solid ${ready ? alpha(c.success, "66") : c.border}`,
      borderRadius: 12,
      padding:      "16px",
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: c.text, fontSize: 14 }}>{doc.description}</span>
            {safeUrl && (
               <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title={doc.url}
                style={{ fontSize: 12, color: c.info, textDecoration: "none" }}
              >
                🔗 link
              </a>
            )}
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 20,
              background: doc.mode === "envelope" ? alpha(c.info, "22") : alpha(c.warning, "22"),
              color:      doc.mode === "envelope" ? c.info   : c.warning,
              fontWeight: 700,
            }}>
              {doc.mode === "envelope" ? "Koperta" : "Jednorazowy"}
            </span>
            {ready && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: alpha(c.success, "22"), color: c.success, fontWeight: 700 }}>
                ✅ Gotowe do zakupu
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary }}>
            {doc.targetCategoryName} › {doc.targetSubcategoryName}
            <span style={{ marginLeft: 8 }}>📅 {doc.plannedMonth}</span>
          </div>
        </div>

        {/* Amount */}
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: c.text }}>
            {isForeign
              ? `${fmt(doc.totalAmount)} ${doc.originalCurrency}`
              : fmt(doc.totalAmountPLN)
            }
          </div>
          {isForeign && (
            <div style={{ fontSize: 11, color: c.textMuted }}>
              ≈ {rateLoading ? "…" : fmt(totalPLN)} PLN
            </div>
          )}
        </div>
      </div>

      {/* Envelope progress */}
      {doc.mode === "envelope" && (
        <>
          {/* Progress bar */}
          <div style={{ height: 6, background: c.border, borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: progressColor, borderRadius: 99, transition: "width 0.4s ease" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4, fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: c.textSecondary }}>
              Zebrano: <strong style={{ color: progressColor }}>{fmt(paid)} PLN</strong>
            </span>
            <span style={{ color: c.textMuted }}>{progressPct}%</span>
            <span style={{ color: c.textSecondary }}>
              Cel: <strong style={{ color: c.textTertiary }}>{fmt(totalPLN)} PLN</strong>
            </span>
          </div>

          {/* This month entry */}
          {thisMonthEntry && !thisMonthEntry.paidByUser && !thisMonthEntry.dismissedByUser && (
            <div style={{ fontSize: 12, color: c.info, marginBottom: 6 }}>
              💡 Ten miesiąc: <strong>{fmt(thisMonthEntry.amount)}</strong>
              {doc.originalCurrency !== "PLN" ? ` ${doc.originalCurrency}` : " PLN"}
            </div>
          )}

          {suggestion !== null && !ready && (
            <div style={{ fontSize: 11, color: c.textMuted }}>
              Sugerowana rata: <strong style={{ color: c.success }}>{fmt(suggestion)} PLN/mies.</strong>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
        {ready && (
          <button onClick={() => onPurchase(doc)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: c.success, color: c.white, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            🛍️ Kup
          </button>
        )}
        <button onClick={() => onEdit(doc)}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${c.borderStrong}`, background: "transparent", color: c.textTertiary, cursor: "pointer", fontSize: 12 }}>
          ✏️ Edytuj
        </button>
        <button onClick={() => onArchive(doc)}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${c.borderStrong}`, background: "transparent", color: c.textMuted, cursor: "pointer", fontSize: 12 }}>
          🗑️
        </button>
      </div>
    </div>
  );
}
