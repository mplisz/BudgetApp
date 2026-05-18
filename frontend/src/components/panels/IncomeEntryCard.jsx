// ============================================================
// File: src/components/panels/IncomeEntryCard.jsx
// Thin wrapper around IncomeForm — handles POST to Transactions.
// ============================================================

import { useState, useEffect } from "react";
import { useAuth }    from "../../context/AuthContext";
import { useToast }   from "../../hooks/useToast";
import { theme as s } from "../../styles/theme";
import { IncomeForm } from "./transactionComponents/IncomeForm";
import { toYMD }      from "../ui/AppDatePicker";
import { translateError } from "../../data/constants/errorMessages";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function emptyForm(selectedMonth) {
  const [y, m] = selectedMonth.split("-").map(Number);
  return {
    categoryId:      "",
    categoryName:    "",
    categoryType:    null,
    subcategoryId:   "",
    subcategoryName: "",
    amount:          "",
    date:            new Date(y, m - 1, 1),
  };
}

export function IncomeEntryCard({ selectedMonth, readOnly, onSaved }) {
  const { fetchWithAuth } = useAuth();
  const { showSuccess, showError } = useToast();
  const [formKey, setFormKey] = useState(0); // forces IncomeForm remount on reset/month change

  // Reset form when month changes
  useEffect(() => { setFormKey(k => k + 1); }, [selectedMonth]);

  const inp = {
    ...s.input,
    background: readOnly ? "#0a0f1e" : "#1e293b",
    color:      readOnly ? "#475569" : "#e2e8f0",
    cursor:     readOnly ? "not-allowed" : "text",
    opacity:    readOnly ? 0.6 : 1,
  };

  async function handleSubmit(form) {
    const res = await fetchWithAuth(`${API_URL}/api/transactions`, {
      method: "POST",
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
        description:      "",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(translateError(body.error, "Nie udało się zapisać wpływu."));
    }
    showSuccess("Wpływ dodany! ✅");
    setFormKey(k => k + 1); // reset form
    onSaved?.();
  }

  return (
    <div style={{ ...s.card, marginTop: 8 }}>
      <div style={{
        fontWeight: 700, color: "#94a3b8", fontSize: 12,
        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14,
      }}>
        💵 Dodaj wpływ
      </div>

      <IncomeForm
        key={formKey}
        initialValues={emptyForm(selectedMonth)}
        selectedMonth={selectedMonth}
        onSubmit={handleSubmit}
        submitLabel="➕ Dodaj wpływ"
        readOnly={readOnly}
        inputStyle={inp}
        labelStyle={s.label}
        btnPrimaryStyle={{ ...s.btn(readOnly ? "#334155" : "#6366f1") }}
      />

      <div style={{ height: 32 }} />
    </div>
  );
}