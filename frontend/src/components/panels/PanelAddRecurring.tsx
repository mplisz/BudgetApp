// ============================================================
// File: src/components/panels/PanelAddRecurring.jsx
// Mobile-first panel for adding a new recurring expense.
// Mirrors PanelAddIncome pattern.
// ============================================================

import { useState }      from "react";
import { useRecurring }  from "../../hooks/useRecurring";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { RecurringForm } from "./recurringComponents/RecurringForm";
import { theme as s }    from "../../styles/theme";

export default function PanelAddRecurring() {
  const { activeBudgetMonth } = useMonthStatus();
  const { addRecurring, isSaving } = useRecurring();
  const [formKey, setFormKey] = useState(0);

  async function handleSubmit(payload: any) {
    const result = await addRecurring({
      ...payload,
      costs: [payload.newCostEntry],
    });
    if (result) setFormKey(k => k + 1);
  }

  return (
    <div style={{ padding: "0 0 80px 0" }}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>🔄 Nowy wydatek cykliczny</div>
      </div>

      <RecurringForm
        key={`${activeBudgetMonth}_${formKey}`}
        validFrom={activeBudgetMonth}
        activeBudgetMonth={activeBudgetMonth}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        mode="add"
      />
    </div>
  );
}