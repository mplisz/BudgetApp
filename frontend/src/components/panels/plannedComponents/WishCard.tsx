// ============================================================
// File: src/components/panels/plannedComponents/WishCard.tsx
// One row of the potential-purchases list ("Potencjalne zakupy").
//
// Deliberately shows no totals or progress: an item here has no committed
// price and no month, so there is nothing to sum. "Zaplanuj" is where it
// stops being a want and becomes a plan.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { fmt } from "../../../utils/helpers";
import { safeHttpUrl } from "../../../utils/safeUrl";
import type { PlannedDoc } from "../../../hooks/usePlanned";

interface WishCardProps {
  wish:       PlannedDoc;
  onPromote:  (wish: PlannedDoc) => void;
  onArchive:  (wish: PlannedDoc) => void;
  onToBuy:    (wish: PlannedDoc) => void;
  isBusy?:    boolean;
}

export function WishCard({ wish, onPromote, onArchive, onToBuy, isBusy = false }: WishCardProps) {
  const safeUrl = wish.url ? safeHttpUrl(wish.url) : null;

  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
      padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{wish.description}</span>
            {safeUrl && (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer" title={wish.url}
                style={{ fontSize: 12, color: c.info, textDecoration: "none" }}>
                🔗 link
              </a>
            )}
          </div>
          {wish.targetSubcategoryName && (
            <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 4 }}>
              {wish.targetCategoryName} › {wish.targetSubcategoryName}
            </div>
          )}
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 800,
            color: wish.estimatedAmount != null ? c.textTertiary : c.borderStrong,
          }}>
            {wish.estimatedAmount != null ? `~ ${fmt(wish.estimatedAmount)}` : "bez ceny"}
          </div>
          {wish.estimatedAmount != null && (
            <div style={{ fontSize: 10, color: c.textMuted }}>szacunkowo</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
        {/* The third way out, for things that need no financial decision:
            a light bulb doesn't deserve a plan with a month and an amount,
            and deleting it just loses the fact that we need one. */}
        <button
          onClick={() => onToBuy(wish)}
          disabled={isBusy}
          title="Przenieś na listę zakupów"
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${alpha(c.cyanLight, "55")}`, background: "transparent", color: c.cyanLight, cursor: isBusy ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12, opacity: isBusy ? 0.5 : 1 }}
        >
          🧺 Na listę
        </button>
        <button
          onClick={() => onPromote(wish)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: c.success, color: c.white, cursor: "pointer", fontWeight: 700, fontSize: 12 }}
        >
          📅 Zaplanuj
        </button>
        <button
          onClick={() => onArchive(wish)}
          title="Usuń z potencjalnych zakupów"
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${alpha(c.borderStrong, "88")}`, background: "transparent", color: c.textMuted, cursor: "pointer", fontSize: 12 }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
