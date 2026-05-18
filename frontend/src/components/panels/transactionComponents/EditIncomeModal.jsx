// ============================================================
// File: src/components/panels/transactionComponents/EditIncomeModal.jsx
// Edit modal for INCOME / TRANSFER — uses shared IncomeForm.
// No priority, no vouchers, no returns.
// ============================================================

import { useAuth }    from "../../../context/AuthContext";
import { useToast }   from "../../../hooks/useToast";
import { IncomeForm } from "./IncomeForm";
import { toYMD }      from "../../ui/AppDatePicker";
import { translateError } from "../../../data/constants/errorMessages";
import { s }          from "./txStyles.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function EditIncomeModal({ tx, onClose, onUpdated }) {
  const { fetchWithAuth } = useAuth();
  const { showSuccess, showError } = useToast();

  // Init form values from existing transaction
  const [y, m, d] = tx.date.split("-").map(Number);
  const initialValues = {
    subcategoryId:   tx.subcategoryId   || "",
    subcategoryName: tx.subcategoryName || "",
    categoryId:      tx.categoryId      || "",
    categoryName:    tx.categoryName    || "",
    categoryType:    tx.type            || "INCOME",
    amount:          String(tx.originalAmount ?? tx.amount ?? ""),
    date:            new Date(y, m - 1, d),
  };

  async function handleSubmit(form) {
    const res = await fetchWithAuth(`${API_URL}/api/transactions/${tx.id}`, {
      method: "PATCH",
      body: JSON.stringify({
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
        description:      tx.description ?? "",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(translateError(body.error, "Nie udało się zaktualizować wpływu."));
    }
    const updated = await res.json();
    showSuccess("Wpływ zaktualizowany! ✅");
    onUpdated(updated);
    onClose();
  }

  const modalInp = {
    width: "100%",
    background: "#0a0f1e",
    border: "1px solid #1e293b",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "9px 12px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={s.modal} onClick={onClose}>
      <div
        style={{ ...s.modalBox, maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
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