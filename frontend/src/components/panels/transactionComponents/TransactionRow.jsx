// ============================================================
// File: frontend/src/components/panels/transactionComponents/TransactionRow.jsx
// Single transaction table row (read-only).
// Edit button opens EditTransactionModal (full form, all tags).
// ============================================================

import { useState }           from "react";
import { AppDatePicker }      from "../../ui/AppDatePicker";
import { fmt }                from "../../../utils/helpers";
import { s, PrioBadge, calcReturns } from "./txStyles.jsx";
import { EditTransactionModal }      from "./EditTransactionModal";

export function TransactionRow({ tx, isMonthClosed, onDelete, onReturn, onUpdated }) {
  const [editOpen, setEditOpen] = useState(false);

  const { isFullyReturned, isPartiallyReturned, totalReturnedAmount } = calcReturns(tx);

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

        {/* Description — wraps instead of stretching the column */}
        <td style={{ ...s.td, maxWidth: 200, wordBreak: "break-word", whiteSpace: "normal" }}>
          <span style={{ color: "#94a3b8" }}>
            {tx.description || <span style={{ color: "#334155" }}>—</span>}
          </span>
          {tx.isRecurring && <span style={{ marginLeft: 6 }} title="Cykliczne">🔄</span>}
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
          {!isMonthClosed && (
            <>
              <button style={{ ...s.actionBtn("#3b82f6"), marginRight: 4 }} onClick={() => setEditOpen(true)} title="Edytuj">✏️</button>
              <button style={{ ...s.actionBtn("#f97316"), marginRight: 4 }} onClick={onReturn} title="Zwróć">🔙</button>
              <button style={s.actionBtn("#ef4444")} onClick={onDelete} title="Usuń">🗑️</button>
            </>
          )}
        </td>
      </tr>

      {/* Edit modal — rendered outside the table row to avoid DOM nesting issues */}
      {editOpen && (
        <EditTransactionModal
          tx={tx}
          onClose={() => setEditOpen(false)}
          onUpdated={updated => { onUpdated(updated); setEditOpen(false); }}
        />
      )}
    </>
  );
}