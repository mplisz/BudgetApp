// ============================================================
// File: src/components/panels/transactionComponents/EditTransactionModal.jsx
// Edit modal — thin wrapper around TransactionForm (mode="edit").
// Sends PATCH via updateTransaction.
// If transaction has returns, backend returns requiresConfirmation: true
// → shows confirmation modal → resends with forceArchiveLinked: true
// ============================================================

import { useState }        from "react";
import { c }               from "../../../styles/tokens";
import { useTransactions } from "../../../hooks/useTransactions";
import { TransactionForm, txToFormValues } from "./TransactionForm";
import { ReturnEntriesModal } from "./ReturnEntriesModal";
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

  // Returns-kind editing lives here too (not only under the row badge):
  // a fully returned transaction hides the 🔙 button, so ✏️ Edytuj must
  // offer a path to reclassify existing returns. Kind-only PATCH — the
  // amounts and the archive-linked confirmation flow are untouched.
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [currentTx,   setCurrentTx]   = useState(tx);
  const returnsCount = (currentTx.returns ?? []).length;

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

          {/* Returns of this transaction — kind/source reclassification */}
          {returnsCount > 0 && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: "8px 12px", marginBottom: 14, fontSize: 12,
            }}>
              <span style={{ color: c.textSecondary }}>
                🔙 Zwroty tej transakcji: <strong style={{ color: c.text }}>{returnsCount}</strong>
              </span>
              <button
                style={{ ...s.actionBtn(c.orange), padding: "5px 12px", fontSize: 12 }}
                onClick={() => setReturnsOpen(true)}
              >
                Zmień rodzaj zwrotu
              </button>
            </div>
          )}

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

      {returnsOpen && (
        <ReturnEntriesModal
          tx={currentTx}
          onClose={() => setReturnsOpen(false)}
          onSaved={updated => { setCurrentTx(updated); onUpdated(updated); }}
        />
      )}
    </>
  );
}