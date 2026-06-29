// ============================================================
// File: src/types/summary.ts
// Domain types for PanelSummary and its sub-components.
// ============================================================

export type BudgetMonth = string; // "YYYY-MM"

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING";

// A returned portion of a transaction (cross-month refund splits cash/voucher).
export interface Return {
  moneyReturnedInMonth: string;
  cashAmount?:    number;
  voucherAmount?: number;
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
  merchant?: string | null;
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
  isWarranty?: boolean;
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
