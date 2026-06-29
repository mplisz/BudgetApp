// ============================================================
// File: src/components/ui/EnvelopeBreakdown.tsx
// Reusable "Wirtualne koperty" panel — shared between
// PanelBaseBudget and PanelSummary. DRY.
//
// Props:
//   items          — list of envelope entries for the month
//   total          — pre-summed total (PLN)
//   activeBudgetMonth — e.g. "2025-12"
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { fmt } from "../../utils/helpers";

export interface EnvelopeBreakdownItem {
  categoryName: string;
  description:  string;
  amount:       number;
  isPaid:       boolean;
}

interface EnvelopeBreakdownProps {
  items:             EnvelopeBreakdownItem[];
  total:             number;
  activeBudgetMonth: string;
  /** Optional wrapper style override */
  style?:            React.CSSProperties;
  variant?:          "default" | "card";  // default = styl BaseBudget
}

export function EnvelopeBreakdown({
  items,
  total,
  activeBudgetMonth,
  style,
  variant = "default"
}: EnvelopeBreakdownProps) {
  if (items.length === 0) return null;
  
  const isCard = variant === "card";

  return (
    <div style={{
      padding: 16,
      background:   isCard ? c.border : c.bg,
      border:       isCard ? `1px solid ${c.borderStrong}` : `1px solid ${alpha(c.voucher, "33")}`,
      borderRadius: isCard ? 16 : 8,
      ...style,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <span style={{ fontWeight: 700, color: c.voucher, fontSize: 13 }}>
          🪙 Wirtualne koperty — {activeBudgetMonth}
        </span>
        <span style={{ fontWeight: 800, fontSize: 14, color: c.voucher }}>
          {fmt(total)} 
        </span>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            padding: "2px 0",
          }}>
            <span style={{ color: c.textTertiary }}>
              <span style={{ marginRight: 6 }}>{item.isPaid ? "✅" : "○"}</span>
              <span style={{ color: c.text, fontWeight: 600 }}>{item.description}</span>
              <span style={{ color: c.textMuted, marginLeft: 6 }}>({item.categoryName})</span>
            </span>
            <span style={{ color: item.isPaid ? c.success : c.textTertiary, fontWeight: 600 }}>
              {fmt(item.amount)} 
            </span>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 10,
        fontSize: 10,
        color: c.textMuted,
        fontStyle: "italic",
        lineHeight: 1.5,
      }}>
        Wirtualne raty na planowane zakupy. Nie obciążają limitów kategorii —
        odkładasz na sub-konto poza budżetem miesięcznym.{" "}
        ✅ = już opłacone, ○ = jeszcze nie.
      </div>
    </div>
  );
}
