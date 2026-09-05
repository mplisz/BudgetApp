// ============================================================
// File: src/components/panels/transactionComponents/TransactionList.tsx
// The transaction table (desktop) / card stack (mobile) that every view in
// PanelTransactions renders: the flat list, a category group, a receipt card
// and the no-receipt section. One copy of the eight column headers instead
// of four — they used to drift apart on every column change.
// ============================================================

import type { CSSProperties } from "react";
import { s } from "./txStyles";
import { TransactionRow, TransactionCard } from "./TransactionRow";
import type { Transaction } from "../../../types/appContext";

interface TransactionListProps {
  items:     Transaction[];
  isMobile:  boolean;
  onDelete:  (tx: Transaction) => void;
  onReturn:  (tx: Transaction) => void;
  onUpdated: (tx: Transaction) => void;
  /** Wrapper style for the mobile card stack — group views inset theirs. */
  mobileStyle?: CSSProperties;
}

export function TransactionList({
  items, isMobile, onDelete, onReturn, onUpdated, mobileStyle,
}: TransactionListProps) {
  if (isMobile) {
    return (
      <div style={mobileStyle}>
        {items.map(tx => (
          <TransactionCard
            key={tx.id}
            tx={tx}
            onDelete={() => onDelete(tx)}
            onReturn={() => onReturn(tx)}
            onUpdated={onUpdated}
          />
        ))}
      </div>
    );
  }

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Data</th>
          <th style={s.th}>Kategoria</th>
          <th style={s.th}>Opis</th>
          <th style={s.th}>Tagi</th>
          <th style={s.th}>Prio</th>
          <th style={{ ...s.th, textAlign: "right" }}>Kwota</th>
          <th style={s.th}>Autor</th>
          <th style={s.th}>Akcje</th>
        </tr>
      </thead>
      <tbody>
        {items.map(tx => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            onDelete={() => onDelete(tx)}
            onReturn={() => onReturn(tx)}
            onUpdated={onUpdated}
          />
        ))}
      </tbody>
    </table>
  );
}
