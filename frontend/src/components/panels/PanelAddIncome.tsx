// ============================================================
// File: src/components/panels/PanelAddIncome.tsx
// "Dodaj wpływ" panel — section: Główne
// Saves INCOME / TRANSFER transactions to Transactions container.
//
// Month source: ?m= via useMonthStatus().activeBudgetMonth (URL is the
// single source of truth, not AppContext month/year).
//
// Future-month limit (point 4): mirrors the expense panel — income may
// be added at most ONE calendar month ahead (isFutureMonth). Prevents
// adding income to months far in the future via navigator or deep link.
// ============================================================


import { c } from "../../styles/tokens";
import { useMonthStatus }   from "../../hooks/useMonthStatus";
import { usePanelLock }     from "../../hooks/usePanelLock";
import { useTransactions }  from "../../hooks/useTransactions";
import { theme as s }       from "../../styles/theme";
import { LockBanner }       from "../ui/LockBanner";
import { IncomeEntryCard }  from "./transactionComponents/IncomeEntryCard";

export default function PanelAddIncome() {
  const { loadTransactions } = useTransactions() as { loadTransactions: (m: string) => void };
  const { activeBudgetMonth, isFutureMonth } = useMonthStatus() as {
    activeBudgetMonth: string;
    isFutureMonth:     boolean;
  };

  const selectedMonth = activeBudgetMonth;
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
          <strong style={{ color: c.success }}>{selectedMonth}</strong>
        </div>
      </div>

      {/* Future-month block (point 4) — same rule as expenses */}
      {isFutureMonth ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#1e1a0e", border: "1px solid #92400e44", borderRadius: 12,
          padding: "12px 16px", color: c.warningLight, fontSize: 13, fontWeight: 600,
        }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <span>
            Miesiąc <strong>{selectedMonth}</strong> jest zbyt daleko w przyszłości.
            Wpływy można dodawać najwyżej miesiąc do przodu.
          </span>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
