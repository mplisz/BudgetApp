// ============================================================
// File: src/types/summary.ts
// Domain types for PanelSummary and its sub-components.
// ============================================================

export type BudgetMonth = string; // "YYYY-MM"

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING";

export interface Transaction {
  id: string;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  amount: number;
  budgetMonth: BudgetMonth;
  isArchived: boolean;
  // Optional fields present on real transaction documents
  date?: string;
  description?: string;
  tags?: string[];          // array of tagIds (e.g. "tag_raty_MMs")
  priority?: 1 | 2 | 3 | 4;
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
