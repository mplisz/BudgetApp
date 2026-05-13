// ============================================================
// File: frontend/src/components/panels/transactionComponents/EditTransactionModal.jsx
// Edit modal — thin wrapper around TransactionForm (mode="edit").
// Sends PATCH via updateTransaction.
// ============================================================

import { useTransactions } from "../../../hooks/useTransactions";
import { TransactionForm, txToFormValues } from "./TransactionForm";
import { s } from "./txStyles.jsx";

export function EditTransactionModal({ tx, onClose, onUpdated }) {
  const { updateTransaction, isSaving } = useTransactions();

  async function handleSubmit(payload) {
    // PATCH — keep original budgetMonth, only update editable fields
    const result = await updateTransaction(tx.id, payload);
    if (result) { onUpdated(result); onClose(); }
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalBox, maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
           onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>✏️ Edytuj transakcję</div>
        <TransactionForm
          initialValues={txToFormValues(tx)}
          budgetMonth={tx.budgetMonth}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isSaving={isSaving}
          mode="edit"
        />
      </div>
    </div>
  );
}