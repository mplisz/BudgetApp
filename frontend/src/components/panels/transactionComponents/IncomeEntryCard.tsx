// ============================================================
// File: src/components/panels/transactionComponents/IncomeEntryCard.tsx
// Thin wrapper around IncomeForm — handles POST to Transactions.
// Moved from panels/ to transactionComponents/ for co-location.
// ============================================================

import { useState, useEffect } from "react";
import { useAuth }    from "../../../context/AuthContext";
import { useToast }   from "../../../hooks/useToast";
import { theme as s } from "../../../styles/theme";
import { IncomeForm } from "./IncomeForm";
import { toYMD }      from "../../ui/AppDatePicker";
import { translateError } from "../../../data/constants/errorMessages";
import type { IncomeFormValues } from "./IncomeForm";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface IncomeEntryCardProps {
  selectedMonth: string;
  readOnly?:     boolean;
  onSaved?:      () => void;
}

function emptyForm(): IncomeFormValues {
  return {
    categoryId:      "",
    categoryName:    "",
    categoryType:    null,
    subcategoryId:   "",
    subcategoryName: "",
    amount:          "",
    date:            new Date(),
    description:     "",
  };
}

export function IncomeEntryCard({ selectedMonth, readOnly = false, onSaved }: IncomeEntryCardProps) {
  const { fetchWithAuth }           = useAuth() as { fetchWithAuth: typeof fetch };
  const { showSuccess, showError }  = useToast() as {
    showSuccess: (m: string) => void;
    showError:   (m: string) => void;
  };
  const [formKey, setFormKey] = useState(0);

  // Reset form when month changes
  useEffect(() => { setFormKey(k => k + 1); }, [selectedMonth]);

  const inp: React.CSSProperties = {
    ...(s as any).input,
    background: readOnly ? "#0a0f1e" : "#1e293b",
    color:      readOnly ? "#475569" : "#e2e8f0",
    cursor:     readOnly ? "not-allowed" : "text",
    opacity:    readOnly ? 0.6 : 1,
  };

  async function handleSubmit(form: IncomeFormValues) {
    const res = await fetchWithAuth(`${API_URL}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:             form.categoryType,
        categoryId:       form.categoryId,
        categoryName:     form.categoryName,
        subcategoryId:    form.subcategoryId,
        subcategoryName:  form.subcategoryName,
        amount:           Number(form.amount),
        originalAmount:   Number(form.amount),
        originalCurrency: "PLN",
        fxRate:           1,
        date:             toYMD(form.date),
        budgetMonth:      selectedMonth,
        priority:         2,
        tags:             [],
        description:      form.description || "",
      }),
    }) as Response;

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(translateError(body.error ?? "", "Nie udało się zapisać wpływu."));
    }
    showSuccess("Wpływ dodany! ✅");
    setFormKey(k => k + 1);
    onSaved?.();
  }

  return (
    <div style={{ ...(s as any).card, marginTop: 8 }}>
      <div style={{
        fontWeight: 700, color: "#94a3b8", fontSize: 12,
        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14,
      }}>
        💵 Dodaj wpływ
      </div>

      <IncomeForm
        key={formKey}
        initialValues={emptyForm()}
        selectedMonth={selectedMonth}
        onSubmit={handleSubmit}
        submitLabel="➕ Dodaj wpływ"
        readOnly={readOnly}
        inputStyle={inp}
        labelStyle={(s as any).label}
        btnPrimaryStyle={{ ...(s as any).btn(readOnly ? "#334155" : "#6366f1") }}
      />

      <div style={{ height: 32 }} />
    </div>
  );
}
