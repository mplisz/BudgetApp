// ============================================================
// File: src/types/creditCard.ts
// Credit cards — the shapes GET /api/cards returns.
// The model is described in backend/utils/creditCards.js.
// ============================================================

import type { Return } from "./summary";

export interface CreditCard {
  id:             string;
  name:           string;
  /** Owed on the card before the family started tracking it (PLN). */
  openingBalance: number;
  /** Day of the month the statement closes on (1–31, clamped to the month). */
  statementDay:   number;
  /** Days after the statement closes that it is due. */
  graceDays:      number;
  isArchived:     boolean;
}

export interface CardRepayment {
  id:              string;
  cardId:          string;
  amount:          number;
  date:            string;   // YYYY-MM-DD
  budgetMonth:     string;   // YYYY-MM — the month the money left the account
  /** Part of `amount` that was interest and fees, booked as an expense. */
  interestAmount?: number;
  interestTxId?:   string;
  createdBy?:      string;
}

/** A card purchase: the slim projection of an EXPENSE carrying a cardId. */
export interface CardTransaction {
  id:               string;
  cardId:           string;
  date:             string;
  budgetMonth:      string;
  amount:           number;
  netAmount?:       number;
  returns?:         Return[];
  description?:     string;
  merchant?:        string | null;
  categoryName?:    string;
  subcategoryName?: string;
}

export interface CardData {
  cards:        CreditCard[];
  repayments:   CardRepayment[];
  transactions: CardTransaction[];
}

/** What a card form sends (POST / PATCH /api/cards). */
export type CardInput = Pick<CreditCard, "name" | "openingBalance" | "statementDay" | "graceDays">;
