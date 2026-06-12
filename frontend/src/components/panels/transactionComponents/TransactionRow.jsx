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
import { fmt }                from "../../../utils/helpers";
import { s, PrioBadge, calcReturns } from "./txStyles.jsx";
import { EditTransactionModal }      from "./EditTransactionModal";
import { ReceiptModal } from "./ReceiptModal";

export function TransactionRow({ tx, isMonthClosed, onDelete, onReturn, onUpdated }) {
  const [editOpen, setEditOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const { isFullyReturned, isPartiallyReturned, totalReturnedAmount } = calcReturns(tx);

  const hasReturns  = (tx.returns || []).length > 0;
  const isRecurring = !!tx.isRecurring;

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