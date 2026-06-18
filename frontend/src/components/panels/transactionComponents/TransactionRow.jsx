// ============================================================
// File: src/components/panels/transactionComponents/TransactionRow.jsx
// Single transaction table row (read-only).
// Edit button opens EditTransactionModal via createPortal.
// Rules:
//   - isRecurring: hide edit AND return buttons
//   - hasReturns:  edit shows ⚠ indicator; confirmation handled by EditTransactionModal
//   - isFullyReturned: hide return button
// ============================================================

import { useState }           from "react";
import { createPortal }       from "react-dom";
import { fmt,fmtAmount  }                from "../../../utils/helpers";
import { s, PrioBadge, calcReturns } from "./txStyles.jsx";
import { EditTransactionModal }      from "./EditTransactionModal";
import { ReceiptModal } from "./ReceiptModal";

export function TransactionRow({ tx, isMonthClosed, onDelete, onReturn, onUpdated }) {
  const [editOpen, setEditOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lineItemsOpen, setLineItemsOpen] = useState(false);
  const { isFullyReturned, isPartiallyReturned, totalReturnedAmount } = calcReturns(tx);

  const hasReturns  = (tx.returns || []).length > 0;
  const isRecurring = !!tx.isRecurring;
  const lineItems   = Array.isArray(tx.lineItems) ? tx.lineItems : [];
  const hasLineItems = lineItems.length > 1;
  
  return (
    <>
      <tr
        onMouseEnter={e => e.currentTarget.style.background = "#0a0f1e"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        style={{ transition: "background 0.1s" }}
      >
        {/* Date */}
        <td style={s.td}>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{tx.date}</span>
        </td>

        {/* Category */}
        <td style={s.td}>
          <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{tx.categoryName}</div>
          <div style={{ color: "#64748b", fontSize: 11 }}>› {tx.subcategoryName}</div>
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
                marginRight: 6, color: "#64748b", fontSize: 11,
              }}
            >
              {lineItemsOpen ? "▾" : "▸"} {lineItems.length}×
            </button>
          )}
          <span style={{ color: "#94a3b8" }}>
            {tx.description || <span style={{ color: "#334155" }}>—</span>}
          </span>
          {isRecurring && <span style={{ marginLeft: 6 }} title="Cykliczne">🔄</span>}
        </td>

        {/* Tags */}
        <td style={s.td}>
          {(tx.tagNames || []).length > 0
            ? tx.tagNames.map((name, i) => <span key={i} style={s.badge("#3b82f6")}>{name}</span>)
            : <span style={{ color: "#334155" }}>—</span>}
        </td>

        {/* Priority */}
        <td style={s.td}><PrioBadge value={tx.priority || 2} /></td>

        {/* Amount */}
        <td style={{ ...s.td, textAlign: "right" }}>
          {tx.originalCurrency !== "PLN" && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
          <div style={{ fontWeight: 700, color: "#10b981", fontSize: 14 }}>
            {fmt(tx.amount)} PLN
          </div>
          {tx.useVoucher && tx.voucherAmount > 0 && (
            <div style={{ fontSize: 10, color: "#a78bfa" }}>
              voucher: {fmt(tx.voucherAmount)} | cash: {fmt(tx.netAmount ?? tx.amount - tx.voucherAmount)}
            </div>
          )}
          {isFullyReturned     && <span style={s.badge("#10b981")}>✅ zwrócono</span>}
          {isPartiallyReturned && <span style={s.badge("#f97316")}>🔄 częściowy {fmt(totalReturnedAmount)} PLN</span>}
        </td>

        {/* Author */}
        <td style={{ ...s.td, fontSize: 11, color: "#475569" }}>{tx.author || "—"}</td>

        {/* Actions */}
        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
          {/* Receipt preview — read-only, so visible even in closed months */}
          {tx.receiptBlobPath && (
            <button
              style={{ ...s.actionBtn("#f59e0b"), marginRight: 4 }}
              onClick={() => setReceiptOpen(true)}
              title="Pokaż paragon"
            >
              📎
            </button>
          )}
          {!isMonthClosed && (
            <>
              {/* Edit — hidden for recurring; ⚠ indicator if has returns */}
              {!isRecurring && (
                <button
                  style={{ ...s.actionBtn("#3b82f6"), marginRight: 4, position: "relative" }}
                  onClick={() => setEditOpen(true)}
                  title={hasReturns ? "Edytuj — powiązane transfery i vouchery zostaną zarchiwizowane" : "Edytuj"}
                >
                  ✏️
                  {hasReturns && (
                    <span style={{
                      position: "absolute", top: -4, right: -4,
                      fontSize: 9, color: "#f59e0b", fontWeight: 800,
                    }}>⚠</span>
                  )}
                </button>
              )}

              {/* Return — hidden for recurring and fully returned */}
              {!isRecurring && !isFullyReturned && (
                <button
                  style={{ ...s.actionBtn("#f97316"), marginRight: 4 }}
                  onClick={onReturn}
                  title="Zwróć"
                >
                  🔙
                </button>
              )}

              {/* Archive */}
              <button style={s.actionBtn("#ef4444")} onClick={onDelete} title="Archiwizuj">🗑️</button>
            </>
          )}
        </td>
      </tr>

      {/* Line items breakdown — second <tr> (a <div> inside <tbody> is invalid DOM) */}
      {hasLineItems && lineItemsOpen && (
        <tr>
          <td colSpan={8} style={{ padding: "0 0 8px 0", background: "#0a0f1e" }}>
            <div style={{ padding: "6px 16px 8px 32px" }}>
              <div style={{ color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                Pozycje z paragonu ({lineItems.length})
              </div>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12, borderBottom: i < lineItems.length - 1 ? "1px solid #131a2c" : "none" }}>
                  <span style={{ color: "#94a3b8" }}>{li.description || "—"}</span>
                  <span style={{ color: "#cbd5e1", fontWeight: 600, marginLeft: 12, flexShrink: 0 }}>
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


export function TransactionCard({ tx, isMonthClosed, onDelete, onReturn, onUpdated }) {
  const [editOpen, setEditOpen]           = useState(false);
  const [receiptOpen, setReceiptOpen]     = useState(false);
  const [lineItemsOpen, setLineItemsOpen] = useState(false);
  const { isFullyReturned, isPartiallyReturned, totalReturnedAmount } = calcReturns(tx);

  const hasReturns   = (tx.returns || []).length > 0;
  const isRecurring  = !!tx.isRecurring;
  const lineItems    = Array.isArray(tx.lineItems) ? tx.lineItems : [];
  const hasLineItems = lineItems.length > 1;
  const isForeign    = tx.originalCurrency !== "PLN";

  return (
    <div style={{
      background:   "#0d1424",
      border:       "1px solid #1e293b",
      borderRadius: 12,
      padding:      "12px 14px",
      marginBottom: 8,
    }}>
      {/* Top row: priority + category + amount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <PrioBadge value={tx.priority || 2} />
            <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 14 }}>{tx.categoryName}</span>
            {isRecurring && <span title="Cykliczne">🔄</span>}
          </div>
          {tx.subcategoryName && (
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>› {tx.subcategoryName}</div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {isForeign && (
            <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
              {tx.originalAmount} {tx.originalCurrency} @ {tx.fxRate}
            </div>
          )}
          <div style={{ fontWeight: 700, color: "#10b981", fontSize: 15, whiteSpace: "nowrap" }}>
            {fmt(tx.amount)} PLN
          </div>
          {tx.useVoucher && tx.voucherAmount > 0 && (
            <div style={{ fontSize: 10, color: "#a78bfa", whiteSpace: "nowrap" }}>
              voucher: {fmt(tx.voucherAmount)} | cash: {fmt(tx.netAmount ?? tx.amount - tx.voucherAmount)}
            </div>
          )}
        </div>
      </div>

      {/* Return status badges */}
      {(isFullyReturned || isPartiallyReturned) && (
        <div style={{ marginTop: 6 }}>
          {isFullyReturned     && <span style={s.badge("#10b981")}>✅ zwrócono</span>}
          {isPartiallyReturned && <span style={s.badge("#f97316")}>🔄 częściowy {fmt(totalReturnedAmount)} PLN</span>}
        </div>
      )}

      {/* Meta row: date + tags + author */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>{tx.date}</span>
        {(tx.tagNames || []).map((name, i) => (
          <span key={i} style={s.badge("#3b82f6")}>{name}</span>
        ))}
        {tx.author && (
          <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>{tx.author}</span>
        )}
      </div>

      {/* Description */}
      {tx.description && (
        <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 8, wordBreak: "break-word" }}>
          {tx.description}
        </div>
      )}

      {/* Line items toggle + breakdown */}
      {hasLineItems && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setLineItemsOpen(o => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#64748b", fontSize: 12 }}
          >
            {lineItemsOpen ? "▾" : "▸"} {lineItems.length} pozycji z paragonu
          </button>
          {lineItemsOpen && (
            <div style={{ marginTop: 6, paddingLeft: 8 }}>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12, borderBottom: i < lineItems.length - 1 ? "1px solid #131a2c" : "none" }}>
                  <span style={{ color: "#94a3b8" }}>{li.description || "—"}</span>
                  <span style={{ color: "#cbd5e1", fontWeight: 600, marginLeft: 12, flexShrink: 0 }}>
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

      {/* Actions — receipt visible even in closed months; rest only when open */}
      {(tx.receiptBlobPath || !isMonthClosed) && (
        <div style={{
          display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
          marginTop: 12, paddingTop: 10, borderTop: "1px solid #0f172a",
        }}>
          {tx.receiptBlobPath && (
            <button style={{ ...s.actionBtn("#f59e0b"), padding: "6px 12px" }} onClick={() => setReceiptOpen(true)}>
              📎 Paragon
            </button>
          )}
          {!isMonthClosed && !isRecurring && (
            <button style={{ ...s.actionBtn("#3b82f6"), padding: "6px 12px" }} onClick={() => setEditOpen(true)}>
              ✏️ Edytuj{hasReturns ? " ⚠" : ""}
            </button>
          )}
          {!isMonthClosed && !isRecurring && !isFullyReturned && (
            <button style={{ ...s.actionBtn("#f97316"), padding: "6px 12px" }} onClick={onReturn}>
              🔙 Zwróć
            </button>
          )}
          {!isMonthClosed && (
            <button style={{ ...s.actionBtn("#ef4444"), padding: "6px 12px" }} onClick={onDelete}>
              🗑️ Usuń
            </button>
          )}
        </div>
      )}

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
