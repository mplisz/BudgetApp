// ============================================================
// File: src/components/panels/transactionComponents/EditIncomeModal.tsx
// Edit modal for INCOME / TRANSFER — uses shared IncomeForm.
// ============================================================

import { c } from "../../../styles/tokens";
import { useToast }   from "../../../hooks/useToast";
import { useApi }     from "../../../hooks/useApi";
import { IncomeForm } from "./IncomeForm";
import { toYMD }      from "../../ui/AppDatePicker";
import { s }          from "./txStyles";
import type { IncomeFormValues } from "./IncomeForm";
import type { Transaction } from "../../../types/appContext";

interface EditIncomeModalProps {
  tx:         Transaction;
  onClose:    () => void;
  onUpdated:  (updated: Transaction) => void;
}

export function EditIncomeModal({ tx, onClose, onUpdated }: EditIncomeModalProps) {
  const api                        = useApi();
  const { showSuccess } = useToast();

  const [y, m, d] = tx.date.split("-").map(Number);

  const initialValues: IncomeFormValues = {
    subcategoryId:   tx.subcategoryId   || "",
    subcategoryName: tx.subcategoryName || "",
    categoryId:      tx.categoryId      || "",
    categoryName:    tx.categoryName    || "",
    categoryType:    (tx.type === "TRANSFER" ? "TRANSFER" : "INCOME"),
    amount:          String(tx.originalAmount ?? tx.amount ?? ""),
    date:            new Date(y, m - 1, d),
    description:     tx.description     || "",
  };

  async function handleSubmit(form: IncomeFormValues) {
    const updated = await api.patch<Transaction>(`/api/transactions/${tx.id}`, {
      type:             form.categoryType ?? tx.type,
      subcategoryId:    form.subcategoryId,
      subcategoryName:  form.subcategoryName,
      categoryId:       form.categoryId,
      categoryName:     form.categoryName,
      amount:           Number(form.amount),
      originalAmount:   Number(form.amount),
      originalCurrency: "PLN",
      fxRate:           1,
      date:             toYMD(form.date),
      description:      form.description || "",
    }, { fallback: "Nie udało się zaktualizować wpływu." });
    showSuccess("Wpływ zaktualizowany! ✅");
    onUpdated(updated);
    onClose();
  }

  const modalInp: React.CSSProperties = {
    width:        "100%",
    background:   c.bg,
    border:       `1px solid ${c.border}`,
    borderRadius: 8,
    color:        c.text,
    padding:      "9px 12px",
    fontSize:     14,
    outline:      "none",
    boxSizing:    "border-box",
  };

  return (
    <div style={s.modal} onClick={onClose}>
      <div
        style={{ ...s.modalBox, maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={s.modalTitle}>✏️ Edytuj wpływ</div>

        <IncomeForm
          initialValues={initialValues}
          selectedMonth={tx.budgetMonth}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel="💾 Zapisz zmiany"
          showBudgetHint
          budgetMonth={tx.budgetMonth}
          inputStyle={modalInp}
          btnPrimaryStyle={s.btn("primary")}
          btnSecondaryStyle={s.btn("secondary")}
        />
      </div>
    </div>
  );
}
