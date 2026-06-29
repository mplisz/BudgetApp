// ============================================================
// File: src/components/panels/transactionComponents/IncomeEntryCard.tsx
// Thin wrapper around IncomeForm — handles POST to Transactions.
// Moved from panels/ to transactionComponents/ for co-location.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState, useEffect } from "react";
import { useToast }   from "../../../hooks/useToast";
import { useApi }     from "../../../hooks/useApi";
import { theme as s } from "../../../styles/theme";
import { IncomeForm } from "./IncomeForm";
import { toYMD }      from "../../ui/AppDatePicker";
import type { IncomeFormValues } from "./IncomeForm";

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
  const api                         = useApi();
  const { showSuccess }             = useToast() as {
    showSuccess: (m: string) => void;
  };
  const [formKey, setFormKey] = useState(0);

  // Reset form when month changes
  useEffect(() => { setFormKey(k => k + 1); }, [selectedMonth]);

  const inp: React.CSSProperties = {
    ...(s as any).input,
    background: readOnly ? c.bg : c.border,
    color:      readOnly ? c.textMuted : c.text,
    cursor:     readOnly ? "not-allowed" : "text",
    opacity:    readOnly ? 0.6 : 1,
  };

  async function handleSubmit(form: IncomeFormValues) {
    await api.post("/api/transactions", {
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
    }, { fallback: "Nie udało się zapisać wpływu." });
    showSuccess("Wpływ dodany! ✅");
    setFormKey(k => k + 1);
    onSaved?.();
  }

  return (
    <div style={{ ...(s as any).card, marginTop: 8 }}>
      <div style={{
        fontWeight: 700, color: c.textTertiary, fontSize: 12,
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
        btnPrimaryStyle={{ ...(s as any).btn(readOnly ? c.borderStrong : c.indigo) }}
      />

      <div style={{ height: 32 }} />
    </div>
  );
}
