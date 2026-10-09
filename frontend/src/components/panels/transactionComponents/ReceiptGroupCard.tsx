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
import { useAppContext }   from "../../../context/AppContext";
import { useCreditCards }  from "../../../hooks/useCreditCards";
import { useTransactions } from "../../../hooks/useTransactions";
import type { ReceiptGroup } from "../../../utils/receiptGroups";
import type { TxSort, TxSortKey } from "../../../utils/txSort";
import type { Transaction } from "../../../types/appContext";

interface ReceiptGroupCardProps {
  group:      ReceiptGroup;
  collapsed:  boolean;
  onToggle:   () => void;
  isMobile:   boolean;
  onDelete:   (tx: Transaction) => void;
  onReturn:   (tx: Transaction) => void;
  onUpdated:  (tx: Transaction) => void;
  /** Passed straight to the card's TransactionList headers. */
  sort?:      TxSort;
  onSort?:    (key: TxSortKey) => void;
}

export function ReceiptGroupCard({
  group, collapsed, onToggle, isMobile, onDelete, onReturn, onUpdated, sort, onSort,
}: ReceiptGroupCardProps) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const count = group.items.length;

  // ── Whole receipt paid with the credit card ───────────────
  // One purchase is paid one way, so the receipt is the natural unit: one
  // click marks every transaction the scan produced (the same bulk request
  // the selection mode uses, with the same rule — expenses in open months).
  const { closedMonths } = useAppContext();
  const { activeCards }  = useCreditCards();
  const { setCardPayment, isSaving } = useTransactions();
  const markable  = group.items.filter(tx => tx.type === "EXPENSE" && !closedMonths.has(tx.budgetMonth));
  const allOnCard = markable.length > 0 && markable.every(tx => !!tx.cardId);

  async function payWithCard(cardId: string | null) {
    const updated = await setCardPayment(markable.map(tx => tx.id), cardId);
    updated?.forEach(onUpdated);
  }

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
          {/* Marked → the button takes the mark off. Not marked → one card:
              a button; several: pick which. No card and no mark: nothing. */}
          {allOnCard ? (
            <button
              style={s.actionBtn(c.info)}
              disabled={isSaving}
              onClick={e => { e.stopPropagation(); payWithCard(null); }}
              title="Cały paragon jest oznaczony kartą — kliknij, aby zdjąć oznaczenie"
            >
              💳 ✓ Kartą
            </button>
          ) : markable.length > 0 && activeCards.length === 1 ? (
            <button
              style={s.actionBtn(c.textTertiary)}
              disabled={isSaving}
              onClick={e => { e.stopPropagation(); payWithCard(activeCards[0].id); }}
              title={`Oznacz cały paragon jako zapłacony kartą ${activeCards[0].name}`}
            >
              💳 Cały paragon kartą
            </button>
          ) : markable.length > 0 && activeCards.length > 1 ? (
            <select
              value=""
              disabled={isSaving}
              onClick={e => e.stopPropagation()}
              onChange={e => { if (e.target.value) payWithCard(e.target.value); }}
              aria-label="Oznacz cały paragon kartą"
              style={{ height: 28, background: c.border, color: c.textTertiary, border: "none", borderRadius: 6, padding: "0 8px", fontSize: 11, cursor: "pointer" }}
            >
              <option value="">💳 Cały paragon kartą…</option>
              {activeCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          ) : null}
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
          sort={sort}
          onSort={onSort}
        />
      )}

      {receiptOpen && group.previewTxId && (
        <ReceiptModal txId={group.previewTxId} onClose={() => setReceiptOpen(false)} />
      )}
    </div>
  );
}
