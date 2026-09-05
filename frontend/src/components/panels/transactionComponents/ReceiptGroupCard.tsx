// ============================================================
// File: src/components/panels/transactionComponents/ReceiptGroupCard.tsx
// One receipt = one card. Rendered by PanelTransactions in the
// "🧾 Paragony" view, where the pagination unit is the receipt, so every
// transaction a single scan produced always stays on one page together.
//
// The card is deliberately louder than the category group header (amber
// frame + tinted header): "these rows are one purchase" has to read at a
// glance, without counting dates or shop names down the list.
// ============================================================

import { useState } from "react";
import { c, alpha } from "../../../styles/tokens";
import { fmt, plural } from "../../../utils/helpers";
import { s } from "./txStyles";
import { TransactionList } from "./TransactionList";
import { ReceiptModal } from "./ReceiptModal";
import type { ReceiptGroup } from "../../../utils/receiptGroups";
import type { Transaction } from "../../../types/appContext";

interface ReceiptGroupCardProps {
  group:      ReceiptGroup;
  collapsed:  boolean;
  onToggle:   () => void;
  isMobile:   boolean;
  onDelete:   (tx: Transaction) => void;
  onReturn:   (tx: Transaction) => void;
  onUpdated:  (tx: Transaction) => void;
}

export function ReceiptGroupCard({
  group, collapsed, onToggle, isMobile, onDelete, onReturn, onUpdated,
}: ReceiptGroupCardProps) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const count = group.items.length;

  return (
    <div style={{
      ...s.card,
      border:     `1px solid ${alpha(c.warning, "44")}`,
      borderLeft: `3px solid ${c.warning}`,
    }}>
      {/* Header — the "one purchase" line */}
      <div
        style={{ ...s.groupHeader, background: alpha(c.warning, "0f"), gap: 12, flexWrap: "wrap" }}
        onClick={onToggle}
      >
        <div style={{ ...s.groupTitle, minWidth: 0 }}>
          <span style={{ color: c.textSecondary }}>{collapsed ? "▶" : "▼"}</span>
          <span style={{ color: c.warningLight }}>🧾</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.label}
          </span>
          <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400, whiteSpace: "nowrap" }}>
            {group.date} · {count} {plural(count, "transakcja", "transakcje", "transakcji")}
          </span>
          {group.isWarranty && <span style={s.badge(c.warning)}>🛡️ gwarancja</span>}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {group.returnedSum > 0 && (
            <span style={{ fontSize: 12, color: c.successLight }}>-{fmt(group.returnedSum)}</span>
          )}
          {group.voucherSum > 0 && (
            <span style={{ fontSize: 12, color: c.voucherLight }}>voucher: {fmt(group.voucherSum)}</span>
          )}
          <span style={{ ...s.groupSum, color: c.text }}>{fmt(group.sum)} PLN</span>
          {group.previewTxId && (
            <button
              style={s.actionBtn(c.warning)}
              onClick={e => { e.stopPropagation(); setReceiptOpen(true); }}
              title="Pokaż zdjęcie paragonu"
            >
              📎 Paragon
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <TransactionList
          items={group.items}
          isMobile={isMobile}
          mobileStyle={{ padding: "8px 8px 0" }}
          onDelete={onDelete}
          onReturn={onReturn}
          onUpdated={onUpdated}
        />
      )}

      {receiptOpen && group.previewTxId && (
        <ReceiptModal txId={group.previewTxId} onClose={() => setReceiptOpen(false)} />
      )}
    </div>
  );
}
