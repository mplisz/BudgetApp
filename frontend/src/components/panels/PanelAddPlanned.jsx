// ============================================================
// File: src/components/panels/PanelAddPlanned.jsx
// Mobile-first panel for adding a new planned expense.
// ============================================================

import { useState }       from "react";
import { usePlanned }     from "../../hooks/usePlanned";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { PlannedForm }    from "./plannedComponents/PlannedForm";
import { theme as s }     from "../../styles/theme";

export default function PanelAddPlanned() {
  const { addPlanned, isSaving } = usePlanned();
  const { activeBudgetMonth }    = useMonthStatus();
  const [formKey, setFormKey]    = useState(0);

  async function handleSubmit(payload) {
    const result = await addPlanned(payload);
    if (result) setFormKey(k => k + 1);
  }

  return (
    <div style={{ padding: "0 0 80px 0" }}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>📅 Nowy planowany wydatek</div>
      </div>

      <PlannedForm
        key={`${activeBudgetMonth}_${formKey}`}
        startMonth={activeBudgetMonth}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        mode="add"
      />
    </div>
  );
}