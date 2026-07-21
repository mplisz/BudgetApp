// ============================================================
// File: src/components/panels/transactionComponents/TransactionRow.jsx
// Single transaction table row (read-only).
// Edit button opens EditTransactionModal via createPortal.
// Rules:
//   - isRecurring: hide edit AND return buttons
//   - hasReturns:  edit shows ⚠ indicator; confirmation handled by EditTransactionModal
//   - isFullyReturned: hide return button
// ============================================================

import { c } from "../../../styles/tokens";
import { useState }           from "react";
import { createPortal }       from "react-dom";
import { fmt,fmtAmount  }                from "../../../utils/helpers";
import { s, PrioBadge, calcReturns } from "./txStyles";
import { EditTransactionModal }      from "./EditTransactionModal";
import { ReceiptModal } from "./ReceiptModal";
import { trackedProductNames } from "../../../utils/productPricing";
import type { Transaction } from "../../../types/appContext";

interface TransactionRowProps {
  tx:        Transaction;
  onDelete:  () => void;
  onReturn:  () => void;
  onUpdated: (tx: Transaction) => void;
}

export function TransactionRow({ tx, onDelete, onReturn, onUpdated }: TransactionRowProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lineItemsOpen, setLineItemsOpen] = useState(false);
  const { isFullyReturned, isPartiallyReturned, totalReturnedAmount } = calcReturns(tx);

  const hasReturns  = (tx.returns || []).length > 0;
  const isRecurring = !!tx.isRecurring;
  const lineItems   = Array.isArray(tx.lineItems) ? tx.lineItems : [];
  const hasLineItems = lineItems.length > 1;
  // Independent of hasLineItems — a singleton lineItems array (the common
  // "one product, no breakdown" case) never shows the ▸ toggle below, but
  // still carries a tracked product worth surfacing.
  const trackedProducts = trackedProductNames(lineItems);

  return (
    <>
      <tr
        onMouseEnter={e => e.currentTarget.style.background = c.bg}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        style={{ transition: "background 0.1s" }}
      >
        {/* Date */}
        <td style={s.td}>
          <span style={{ color: c.textTertiary, fontSize: 12 }}>{tx.date}</span>
        </td>

        {/* Category */}
        <td style={s.td}>
          <div style={{ fontWeight: 600, color: c.text, fontSize: 13 }}>{tx.categoryName}</div>
          <div style={{ color: c.textSecondary, fontSize: 11 }}>› {tx.subcategoryName}</div>
        </td>

        {/* Description */}
        <td style={{ ...s.td, maxWidth: 200, wordBreak: "break-word", whiteSpace: "normal" }}>
          {/* Line items toggle — only when this tx merged ≥2 items */}
          {hasLineItems && (
            <button
              onClick={() => setLineItemsOpen(o => !o)}
              title={lineItemsOpen ? "Zwiń pozycje" : `Pokaż ${lineItems.length} pozycji`}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                marginRight: 6, color: c.textSecondary, fontSize: 11,
              }}
            >
              {lineItemsOpen ? "▾" : "▸"} {lineItems.length}×
            </button>
          )}
          <span style={{ color: c.textTertiary }}>
            {tx.description || <span style={{ color: c.borderStrong }}>—</span>}
          </span>
          {isRecurring && <span style={{ marginLeft: 6 }} title="Cykliczne">🔄</span>}
          {trackedProducts.length > 0 && (
            <div
              style={{ color: c.cyanLight, fontSize: 10, marginTop: 2, fontWeight: 600 }}
              title={trackedProducts.join(", ")}
            >
              🏷️ {trackedProducts.length === 1 ? trackedProducts[0] : `${trackedProducts.length} śledzone produkty`}
            </div>
          )}
        </td>

        {/* Tags */}
        <td style={s.td}>
          {(tx.tagNames || []).length > 0
            ? (tx.tagNames ?? []).map((name, i) => <span key={i} style={s.badge(c.info)}>{name}</span>)
            : <span style={{ color: c.borderStrong }}>—</span>}
        </td>

        {/* Priority */}
        <td style={s.td}><PrioBadge value={tx.priority || 2} /></td>

        {/* Amount */}
        <td style={{ ...s.td, textAlign: "right" }}>
          {tx.originalCurrency !== "PLN" && (
            <div style={{ fontSize: 11, color: c.textSecondary }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
          <div style={{ fontWeight: 700, color: c.success, fontSize: 14 }}>
            {fmt(tx.amount)} PLN
          </div>
          {tx.useVoucher && (tx.voucherAmount ?? 0) > 0 && (
            <div style={{ fontSize: 10, color: c.voucherLight }}>
              voucher: {fmt(tx.voucherAmount ?? 0)} | cash: {fmt(tx.netAmount ?? tx.amount - (tx.voucherAmount ?? 0))}
            </div>
          )}
          {isFullyReturned     && <span style={s.badge(c.success)}>✅ zwrócono</span>}
          {isPartiallyReturned && <span style={s.badge(c.orange)}>🔄 częściowy {fmt(totalReturnedAmount)} PLN</span>}
        </td>

        {/* Author */}
        <td style={{ ...s.td, fontSize: 11, color: c.textMuted }}>{tx.author || "—"}</td>

        {/* Actions */}
        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
          {/* Receipt preview — read-only, so visible even in closed months */}
          {tx.receiptBlobPath && (
            <button
              style={{ ...s.actionBtn(c.warning), marginRight: 4 }}
              onClick={() => setReceiptOpen(true)}
              title="Pokaż paragon"
            >
              📎
            </button>
          )}
          {/* Edit / return / archive stay available even in a closed month —
              only adding NEW expenses is blocked (in PanelExpenses). */}
          {/* Edit —  ⚠ indicator if has returns */}
          <button
            style={{ ...s.actionBtn(c.info), marginRight: 4, position: "relative" }}
            onClick={() => setEditOpen(true)}
            title={hasReturns ? "Edytuj — powiązane transfery i vouchery zostaną zarchiwizowane" : "Edytuj"}
          >
            ✏️
            {hasReturns && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                fontSize: 9, color: c.warning, fontWeight: 800,
              }}>⚠</span>
            )}
          </button>

          {/* Return — hidden for fully returned */}
          {!isFullyReturned && (
            <button
              style={{ ...s.actionBtn(c.orange), marginRight: 4 }}
              onClick={onReturn}
              title="Zwróć"
            >
              🔙
            </button>
          )}

          {/* Archive */}
          <button style={s.actionBtn(c.danger)} onClick={onDelete} title="Archiwizuj">🗑️</button>
        </td>
      </tr>

      {/* Line items breakdown — second <tr> (a <div> inside <tbody> is invalid DOM) */}
      {hasLineItems && lineItemsOpen && (
        <tr>
          <td colSpan={8} style={{ padding: "0 0 8px 0", background: c.bg }}>
            <div style={{ padding: "6px 16px 8px 32px" }}>
              <div style={{ color: c.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                Pozycje z paragonu ({lineItems.length})
              </div>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12, borderBottom: i < lineItems.length - 1 ? `1px solid ${c.surfaceAlt2}` : "none" }}>
                  <span style={{ color: c.textTertiary }}>{li.description || "—"}</span>
                  <span style={{ color: c.textBody, fontWeight: 600, marginLeft: 12, flexShrink: 0 }}>
                    {li.originalCurrency && li.originalCurrency !== "PLN"
                      ? `${fmtAmount(li.originalAmount, li.originalCurrency)} ${li.originalCurrency} (${fmt(li.amount)})`
                      : fmt(li.amount)}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Modal via portal — avoids <div> inside <tbody> DOM nesting */}
      {editOpen && createPortal(
        <EditTransactionModal
          tx={tx}
          onClose={() => setEditOpen(false)}
          onUpdated={updated => { onUpdated(updated); setEditOpen(false); }}
        />,
        document.body
      )}
      {receiptOpen && createPortal(
        <ReceiptModal txId={tx.id} onClose={() => setReceiptOpen(false)} />,
        document.body
      )}
    </>
  );
}

// ── Transaction card (mobile) ─────────────────────────────────
// Mobile counterpart of TransactionRow: same data + actions
// (receipt, edit, return, archive) and the line-items breakdown,
// laid out as a tap-friendly card. Rendered by PanelTransactions
// when useIsMobile() is true. Lives in this file to reuse every
// import already present (s, PrioBadge, calcReturns, fmt, fmtAmount,
// EditTransactionModal, ReceiptModal, createPortal, useState).


export function TransactionCard({ tx, onDelete, onReturn, onUpdated }: TransactionRowProps) {
  const [editOpen, setEditOpen]           = useState(false);
  const [receiptOpen, setReceiptOpen]     = useState(false);
  const [lineItemsOpen, setLineItemsOpen] = useState(false);
  const { isFullyReturned, isPartiallyReturned, totalReturnedAmount } = calcReturns(tx);

  const hasReturns   = (tx.returns || []).length > 0;
  const isRecurring  = !!tx.isRecurring;
  const lineItems    = Array.isArray(tx.lineItems) ? tx.lineItems : [];
  const hasLineItems = lineItems.length > 1;
  const isForeign    = tx.originalCurrency !== "PLN";
  const trackedProducts = trackedProductNames(lineItems);

  return (
    <div style={{
      background:   c.surface,
      border:       `1px solid ${c.border}`,
      borderRadius: 12,
      padding:      "12px 14px",
      marginBottom: 8,
    }}>
      {/* Top row: priority + category + amount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <PrioBadge value={tx.priority || 2} />
            <span style={{ fontWeight: 600, color: c.text, fontSize: 14 }}>{tx.categoryName}</span>
            {isRecurring && <span title="Cykliczne">🔄</span>}
          </div>
          {tx.subcategoryName && (
            <div style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>› {tx.subcategoryName}</div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {isForeign && (
            <div style={{ fontSize: 11, color: c.textSecondary, whiteSpace: "nowrap" }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
          <div style={{ fontWeight: 700, color: c.success, fontSize: 15, whiteSpace: "nowrap" }}>
            {fmt(tx.amount)} PLN
          </div>
          {tx.useVoucher && (tx.voucherAmount ?? 0) > 0 && (
            <div style={{ fontSize: 10, color: c.voucherLight, whiteSpace: "nowrap" }}>
              voucher: {fmt(tx.voucherAmount ?? 0)} | cash: {fmt(tx.netAmount ?? tx.amount - (tx.voucherAmount ?? 0))}
            </div>
          )}
        </div>
      </div>

      {/* Return status badges */}
      {(isFullyReturned || isPartiallyReturned) && (
        <div style={{ marginTop: 6 }}>
          {isFullyReturned     && <span style={s.badge(c.success)}>✅ zwrócono</span>}
          {isPartiallyReturned && <span style={s.badge(c.orange)}>🔄 częściowy {fmt(totalReturnedAmount)} PLN</span>}
        </div>
      )}

      {/* Meta row: date + tags + author */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
        <span style={{ color: c.textTertiary, fontSize: 12 }}>{tx.date}</span>
        {(tx.tagNames || []).map((name, i) => (
          <span key={i} style={s.badge(c.info)}>{name}</span>
        ))}
        {tx.author && (
          <span style={{ color: c.textMuted, fontSize: 11, marginLeft: "auto" }}>{tx.author}</span>
        )}
      </div>

      {/* Description */}
      {tx.description && (
        <div style={{ color: c.textTertiary, fontSize: 13, marginTop: 8, wordBreak: "break-word" }}>
          {tx.description}
        </div>
      )}

      {/* Tracked product(s) */}
      {trackedProducts.length > 0 && (
        <div
          style={{ color: c.cyanLight, fontSize: 11, marginTop: 4, fontWeight: 600 }}
          title={trackedProducts.join(", ")}
        >
          🏷️ {trackedProducts.length === 1 ? trackedProducts[0] : `${trackedProducts.length} śledzone produkty`}
        </div>
      )}

      {/* Line items toggle + breakdown */}
      {hasLineItems && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setLineItemsOpen(o => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: c.textSecondary, fontSize: 12 }}
          >
            {lineItemsOpen ? "▾" : "▸"} {lineItems.length} pozycji z paragonu
          </button>
          {lineItemsOpen && (
            <div style={{ marginTop: 6, paddingLeft: 8 }}>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12, borderBottom: i < lineItems.length - 1 ? `1px solid ${c.surfaceAlt2}` : "none" }}>
                  <span style={{ color: c.textTertiary }}>{li.description || "—"}</span>
                  <span style={{ color: c.textBody, fontWeight: 600, marginLeft: 12, flexShrink: 0 }}>
                    {li.originalCurrency && li.originalCurrency !== "PLN"
                      ? `${fmtAmount(li.originalAmount, li.originalCurrency)} ${li.originalCurrency} (${fmt(li.amount)})`
                      : fmt(li.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions — edit/return/archive stay available even in a closed month;
          only adding NEW expenses is blocked (in PanelExpenses). */}
      <div style={{
        display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
        marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.surfaceAlt}`,
      }}>
        {tx.receiptBlobPath && (
          <button style={{ ...s.actionBtn(c.warning), padding: "6px 12px" }} onClick={() => setReceiptOpen(true)}>
            📎 Paragon
          </button>
        )}
        <button style={{ ...s.actionBtn(c.info), padding: "6px 12px" }} onClick={() => setEditOpen(true)}>
          ✏️ Edytuj{hasReturns ? " ⚠" : ""}
        </button>
        {!isFullyReturned && (
          <button style={{ ...s.actionBtn(c.orange), padding: "6px 12px" }} onClick={onReturn}>
            🔙 Zwróć
          </button>
        )}
        <button style={{ ...s.actionBtn(c.danger), padding: "6px 12px" }} onClick={onDelete}>
          🗑️ Usuń
        </button>
      </div>

      {editOpen && createPortal(
        <EditTransactionModal
          tx={tx}
          onClose={() => setEditOpen(false)}
          onUpdated={updated => { onUpdated(updated); setEditOpen(false); }}
        />,
        document.body
      )}
      {receiptOpen && createPortal(
        <ReceiptModal txId={tx.id} onClose={() => setReceiptOpen(false)} />,
        document.body
      )}
    </div>
  );
}
