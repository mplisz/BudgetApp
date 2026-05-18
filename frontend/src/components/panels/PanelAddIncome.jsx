// ============================================================
// File: src/components/panels/PanelAddIncome.jsx
// "Dodaj wpływ" panel — section: Główne
// Saves INCOME / TRANSFER transactions to Transactions container.
// Respects MonthNavigator via AppContext + usePanelLock.
// UI: Polish | Comments: English
// ============================================================

import React from "react";
import { useAppContext }    from "../../context/AppContext";
import { usePanelLock }    from "../../hooks/usePanelLock";
import { useTransactions } from "../../hooks/useTransactions";
import { theme as s }      from "../../styles/theme";
import { LockBanner }      from "../ui/LockBanner";
import { IncomeEntryCard } from "./IncomeEntryCard";
import { formatBudgetMonth } from "../../utils/helpers";

export default function PanelAddIncome() {
  const { month, year } = useAppContext();
  const { loadTransactions } = useTransactions();

  const selectedMonth = formatBudgetMonth(month, year);
  const { isHistoricalLock, isPastMonth, isMonthClosed } = usePanelLock(selectedMonth);

  return (
    <div style={{ ...s.panel, maxWidth: 520 }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>💵 Dodaj wpływ</div>
        <div style={s.sectionSub}>
          Wpływy i transfery dla miesiąca{" "}
          <strong style={{ color: "#10b981" }}>{selectedMonth}</strong>
        </div>
      </div>

      <LockBanner isPastMonth={isPastMonth} isMonthClosed={isMonthClosed} selectedMonth={selectedMonth} />

      <IncomeEntryCard
        selectedMonth={selectedMonth}
        readOnly={isHistoricalLock}
        onSaved={() => loadTransactions(selectedMonth)}
      />
    </div>
  );
}