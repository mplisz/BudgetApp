// ============================================================
// File: src/components/panels/transactionComponents/EditIncomeModal.tsx
// Edit modal for INCOME / TRANSFER — uses shared IncomeForm.
// ============================================================

import { useAuth }    from "../../../context/AuthContext";
import { useToast }   from "../../../hooks/useToast";
import { IncomeForm } from "./IncomeForm";
import { toYMD }      from "../../ui/AppDatePicker";
import { translateError } from "../../../data/constants/errorMessages";
import { s }          from "./txStyles.jsx";
import type { IncomeFormValues } from "./IncomeForm";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface Transaction {
  id:              string;
  type:            "INCOME" | "TRANSFER";
  date:            string;
  budgetMonth:     string;
  subcategoryId:   string;
  subcategoryName: string;
  categoryId:      string;
  categoryName:    string;
  amount:          number;
  originalAmount?: number;
  description?:    string;
}

interface EditIncomeModalProps {
  tx:         Transaction;
  onClose:    () => void;
  onUpdated:  (updated: Transaction) => void;
}

export function EditIncomeModal({ tx, onClose, onUpdated }: EditIncomeModalProps) {
  const { fetchWithAuth }          = useAuth() as { fetchWithAuth: typeof fetch };
  const { showSuccess, showError } = useToast() as {
    showSuccess: (m: string) => void;
    showError:   (m: string) => void;
  };

  const [y, m, d] = tx.date.split("-").map(Number);

  const initialValues: IncomeFormValues = {
    subcategoryId:   tx.subcategoryId   || "",
    subcategoryName: tx.subcategoryName || "",
    categoryId:      tx.categoryId      || "",
    categoryName:    tx.categoryName    || "",
    categoryType:    tx.type            || "INCOME",
    amount:          String(tx.originalAmount ?? tx.amount ?? ""),
    date:            new Date(y, m - 1, d),
    description:     tx.description     || "",
  };

  async function handleSubmit(form: IncomeFormValues) {
    const res = await fetchWithAuth(`${API_URL}/api/transactions/${tx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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
        description:      form.description || "",
      }),
    }) as Response;

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(translateError(body.error ?? "", "Nie udało się zaktualizować wpływu."));
    }
    const updated = await res.json() as Transaction;
    showSuccess("Wpływ zaktualizowany! ✅");
    onUpdated(updated);
    onClose();
  }

  const modalInp: React.CSSProperties = {
    width:        "100%",
    background:   "#0a0f1e",
    border:       "1px solid #1e293b",
    borderRadius: 8,
    color:        "#e2e8f0",
    padding:      "9px 12px",
    fontSize:     14,
    outline:      "none",
    boxSizing:    "border-box",
  };

  return (
    <div style={(s as any).modal} onClick={onClose}>
      <div
        style={{ ...(s as any).modalBox, maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={(s as any).modalTitle}>✏️ Edytuj wpływ</div>

        <IncomeForm
          initialValues={initialValues}
          selectedMonth={tx.budgetMonth}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel="💾 Zapisz zmiany"
          showBudgetHint
          budgetMonth={tx.budgetMonth}
          inputStyle={modalInp}
          btnPrimaryStyle={(s as any).btn("primary")}
          btnSecondaryStyle={(s as any).btn("secondary")}
        />
      </div>
    </div>
  );
}
