// ============================================================
// File: src/types/summary.ts
// Domain types for PanelSummary and its sub-components.
// ============================================================

import type { LineItemProduct } from "../utils/productPricing";

export type BudgetMonth = string; // "YYYY-MM"

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING";

// A return entry's link to one receipt line: `index` points into the parent
// tx's lineItems[]; description + amount are a snapshot (stale-client guard,
// audit). A line whose cumulative returned amount covers its full price is
// excluded from the price history.
export interface ReturnedLineItem {
  index:       number;
  description: string;
  amount:      number;
}

// What kind of return this is: money back FROM THE SHOP (goods returned),
// someone REIMBURSING the user (goods kept — family for groceries, LuxMed
// refunds), or a bottle-DEPOSIT refund (batch endpoint). Old entries carry
// no kind ("unknown" in analytics, treated like a store return by the
// price history).
export type ReturnKind = "store" | "reimbursement" | "deposit";

// For reimbursements: who paid the user back — a person (family, friends)
// or a company/institution (employer, LuxMed, an office). Reporting-only.
export type ReturnSource = "person" | "company";

// A returned portion of a transaction (cross-month refund splits cash/voucher).
export interface Return {
  amount:               number;
  moneyReturnedInMonth: string;
  kind?:          ReturnKind;
  source?:        ReturnSource;
  cashAmount?:    number;
  voucherAmount?: number;
  // Money received above the transaction amount — materialized as a TRANSFER
  // by the backend, never part of `amount` (returnUtils assumes Σ ≤ tx.amount).
  surplusAmount?: number;
  returnedAt?:    string;
  reason?:        string;
  returnedLineItems?: ReturnedLineItem[];
}

// One scanned/merged receipt line. A transaction with ≥2 line items shows a
// breakdown row in the UI.
export interface TxLineItem {
  description?:      string;
  amount:           number;
  originalAmount?:   number;
  originalCurrency?: string;
  product?:          LineItemProduct | null;
}

// Canonical transaction document. Superset of every shape the panels read —
// required fields are present on all real docs, the rest are optional.
export interface Transaction {
  id: string;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  amount: number;
  budgetMonth: BudgetMonth;
  date: string;
  isArchived?: boolean;
  description?: string;
  tags?: string[];          // array of tagIds (e.g. "tag_raty_MMs")
  tagNames?: string[];      // resolved names — enriched client-side
  priority?: 1 | 2 | 3 | 4;
  netAmount?: number;
  voucherAmount?: number;
  isRecurring?: boolean;
  recurringId?: string | null;
  returns?: Return[];
  receiptBlobPath?: string | null;
  // Receipt entity id — shared by every transaction the same scan produced.
  // The grouping key of the "Paragony" view (see utils/receiptGroups.ts).
  receiptId?: string | null;
  merchant?: string | null;
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
  isWarranty?: boolean;
  author?: string;
  useVoucher?: boolean;
  lineItems?: TxLineItem[];
  // Derived client-side (PanelTransactions useMemo), not stored server-side.
  effectiveAmount?: number;
  sameMonthReturned?: number;
}


export type LimitType = "base" | "override";

export interface LimitEntry {
  date: BudgetMonth;
  amount: number;
  type: LimitType;
}

export interface LimitDoc {
  id: string;
  categoryId: string;
  limits: LimitEntry[];
}

export interface ActiveLimit {
  amount: number;
  type: LimitType;
  date: BudgetMonth;
}

export interface SettingsTargets {
  maxInsurancePercent: number;
  maxObligationsPercent: number;
  minRetirementPercent: number;
  minSavingsPercent: number;
}

export interface Settings {
  targets?: SettingsTargets;
  thresholds?: {
    warningPercent: number;
    criticalPercent: number;
  };
}

export type IndicatorStatus = "ok" | "warning" | "danger";

export interface CategorySummary {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  spent: number;
  limit: number | null;
  percent: number | null;
}

export interface SubcategorySummary {
  subcategoryId: string;
  subcategoryName: string;
  spent: number;
  percentOfCategory: number;
  percentOfTotal: number;
}
