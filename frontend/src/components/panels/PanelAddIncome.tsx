// ============================================================
// File: src/components/panels/PanelAddIncome.tsx
// "Dodaj wpływ" panel — section: Główne
// Saves INCOME / TRANSFER transactions to Transactions container.
// Respects MonthNavigator via AppContext + usePanelLock.
// ============================================================

import { useAppContext }    from "../../context/AppContext";
import { usePanelLock }     from "../../hooks/usePanelLock";
import { useTransactions }  from "../../hooks/useTransactions";
import { theme as s }       from "../../styles/theme";
import { LockBanner }       from "../ui/LockBanner";
// IncomeEntryCard moved to transactionComponents/
import { IncomeEntryCard }  from "./transactionComponents/IncomeEntryCard";
import { formatBudgetMonth } from "../../utils/helpers";

export default function PanelAddIncome() {
  const { month, year }      = useAppContext() as { month: number; year: number };
  const { loadTransactions } = useTransactions() as { loadTransactions: (m: string) => void };

  const selectedMonth = formatBudgetMonth(month, year);
  const { isHistoricalLock, isPastMonth, isMonthClosed } = usePanelLock(selectedMonth) as {
    isHistoricalLock: boolean;
    isPastMonth:      boolean;
    isMonthClosed:    boolean;
  };

  return (
    <div style={{ ...(s as any).panel, maxWidth: 520 }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={(s as any).sectionTitle}>💵 Dodaj wpływ</div>
        <div style={(s as any).sectionSub}>
          Wpływy i transfery dla miesiąca{" "}
          <strong style={{ color: "#10b981" }}>{selectedMonth}</strong>
        </div>
      </div>

      <LockBanner
        isPastMonth={isPastMonth}
        isMonthClosed={isMonthClosed}
        selectedMonth={selectedMonth}
      />

      <IncomeEntryCard
        selectedMonth={selectedMonth}
        readOnly={isHistoricalLock}
        onSaved={() => loadTransactions(selectedMonth)}
      />
    </div>
  );
}
