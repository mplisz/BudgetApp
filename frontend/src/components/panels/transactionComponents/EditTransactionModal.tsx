// ============================================================
// File: src/components/panels/transactionComponents/EditTransactionModal.jsx
// Edit modal — thin wrapper around TransactionForm (mode="edit").
// Sends PATCH via updateTransaction.
// If transaction has returns, backend returns requiresConfirmation: true
// → shows confirmation modal → resends with forceArchiveLinked: true
// ============================================================

import { useState }        from "react";
import { useTransactions } from "../../../hooks/useTransactions";
import { TransactionForm, txToFormValues } from "./TransactionForm";
import { ConfirmModal }    from "../../ui/ConfirmModal";
import { s }               from "./txStyles";
import type { Transaction } from "../../../types/appContext";
import type { TransactionPayload } from "../../../types/transaction";

interface EditTransactionModalProps {
  tx:        Transaction;
  onClose:   () => void;
  onUpdated: (tx: Transaction) => void;
}

export function EditTransactionModal({ tx, onClose, onUpdated }: EditTransactionModalProps) {
  const { updateTransaction, isSaving } = useTransactions();

  const [pendingPayload,  setPendingPayload]  = useState<TransactionPayload | null>(null);
  const [confirmOpen,     setConfirmOpen]     = useState(false);

  async function handleSubmit(payload: TransactionPayload) {
    const result = await updateTransaction(tx.id, { ...payload });

    if (result === null) {
      // Check if backend returned requiresConfirmation
      // updateTransaction returns null on error — we need to check the last error
      // We handle this via a special sentinel response from updateTransaction
      return;
    }

    if ("_requiresConfirmation" in result) {
      // Backend requires confirmation before archiving linked items
      setPendingPayload(payload);
      setConfirmOpen(true);
      return;
    }

    onUpdated(result);
    onClose();
  }

  async function handleConfirmedEdit() {
    setConfirmOpen(false);
    if (!pendingPayload) return;
    const result = await updateTransaction(tx.id, {
      ...pendingPayload,
      forceArchiveLinked: true,
    });
    if (result && !("_requiresConfirmation" in result)) {
      onUpdated(result);
      onClose();
    }
  }

  return (
    <>
      <div style={s.modal} onClick={onClose}>
        <div
          style={{ ...s.modalBox, maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
          onClick={e => e.stopPropagation()}
        >
          <div style={s.modalTitle}>✏️ Edytuj transakcję</div>
          <TransactionForm
            initialValues={txToFormValues({ ...tx })}
            budgetMonth={tx.budgetMonth}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isSaving={isSaving}
            mode="edit"
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title="⚠️ Transakcja ma powiązane zwroty"
        message={
          `Ta transakcja ma zarejestrowane zwroty. Edycja spowoduje zarchiwizowanie:\n` +
          `• wszystkich powiązanych transferów TRANSFER\n` +
          `• wszystkich voucherów utworzonych ze zwrotów tej transakcji\n\n` +
          `Czy chcesz kontynuować?`
        }
        onConfirm={handleConfirmedEdit}
        onCancel={() => { setConfirmOpen(false); setPendingPayload(null); }}
      />
    </>
  );
}