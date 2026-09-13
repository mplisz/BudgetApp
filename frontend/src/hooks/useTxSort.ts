// ============================================================
// File: src/hooks/useTxSort.ts
//
// Sort state for a transaction table: the current column + direction, the
// click handler, and the sorted rows. Rules live in utils/txSort.ts.
//
// `onChange` fires on every click — panels pass their pagination reset, so a
// new order starts from its top instead of leaving you on page 3 of it.
// ============================================================

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TX_SORT, nextTxSort, sortTransactions,
  type SortableTx, type TxSort, type TxSortKey,
} from "../utils/txSort";

export interface UseTxSortResult<T> {
  sort:   TxSort;
  onSort: (key: TxSortKey) => void;
  sorted: T[];
}

export function useTxSort<T extends SortableTx>(items: T[], onChange?: () => void): UseTxSortResult<T> {
  const [sort, setSort] = useState<TxSort>(DEFAULT_TX_SORT);

  // Latest callback, while onSort itself stays stable.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSort = useCallback((key: TxSortKey) => {
    setSort(prev => nextTxSort(prev, key));
    onChangeRef.current?.();
  }, []);

  const sorted = useMemo(() => sortTransactions(items, sort), [items, sort]);

  return { sort, onSort, sorted };
}
