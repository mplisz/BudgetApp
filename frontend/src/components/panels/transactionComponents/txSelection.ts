// ============================================================
// File: src/components/panels/transactionComponents/txSelection.ts
// Multi-select for the transaction list (bulk "paid with the credit card").
//
// A context rather than props: the same rows render under the flat list, a
// category group, a receipt card and the no-receipt section, and threading a
// selection through each of those would touch every one of them. The panel
// provides it while selection mode is on; without a provider the rows render
// exactly as before.
// ============================================================

import { createContext, useContext } from "react";
import type { Transaction } from "../../../types/appContext";

export interface TxSelection {
  selected:  ReadonlySet<string>;
  toggle:    (id: string) => void;
  /** Rows that can't take the bulk action show no checkbox. */
  canSelect: (tx: Transaction) => boolean;
}

export const TxSelectionContext = createContext<TxSelection | null>(null);

/** The active selection, or null when the list is not in selection mode. */
export const useTxSelection = () => useContext(TxSelectionContext);
