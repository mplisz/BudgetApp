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
import { SortableTh } from "../../ui/SortControls";
import type { TxSort, TxSortKey } from "../../../utils/txSort";
import type { Transaction } from "../../../types/appContext";

interface TransactionListProps {
  items:     Transaction[];
  isMobile:  boolean;
  onDelete:  (tx: Transaction) => void;
  onReturn:  (tx: Transaction) => void;
  onUpdated: (tx: Transaction) => void;
  /** Column sort. The rows arrive ALREADY sorted (the panel sorts once for
   *  every view); these only drive the clickable headers. Without them the
   *  headers are plain text. Mobile cards have no headers — the panel shows
   *  a SortBar above the list instead. */
  sort?:     TxSort;
  onSort?:   (key: TxSortKey) => void;
  /** Wrapper style for the mobile card stack — group views inset theirs. */
  mobileStyle?: CSSProperties;
}

export function TransactionList({
  items, isMobile, onDelete, onReturn, onUpdated, sort, onSort, mobileStyle,
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

  // A sortable header when the panel wired sorting in, plain text otherwise.
  const th = (key: TxSortKey, label: string, align?: "right") =>
    sort && onSort
      ? <SortableTh sortKey={key} sort={sort} onSort={onSort} style={s.th} align={align} />
      : <th style={{ ...s.th, textAlign: align }}>{label}</th>;

  return (
    <table style={s.table}>
      <thead>
        <tr>
          {th("date", "Data")}
          <th style={s.th}>Kategoria</th>
          <th style={s.th}>Opis</th>
          <th style={s.th}>Tagi</th>
          {th("priority", "Prio")}
          {th("amount", "Kwota", "right")}
          {th("author", "Autor")}
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
