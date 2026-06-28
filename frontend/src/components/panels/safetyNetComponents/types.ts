// ============================================================
// File: src/components/panels/safetyNetComponents/types.ts
// Domain types for the Safety Net (Poduszka finansowa) panel.
// ============================================================

export type BudgetMonth = string;       // "YYYY-MM"
export type PriorityLevel = 1 | 2 | 3 | 4;

// ── Transaction (loose, matches useTransactionsRange row) ────

export interface SnTransaction {
  id:              string;
  type:            "EXPENSE" | "INCOME" | "SAVING" | "TRANSFER";
  date:            string;
  budgetMonth:     BudgetMonth;
  categoryId:      string;
  categoryName:    string;
  subcategoryId?:  string;
  subcategoryName?: string;
  amount:          number;
  netAmount?:      number;
  priority?:       PriorityLevel;
  tags?:           string[];
  returns?:        Array<{
    moneyReturnedInMonth: string;
    cashAmount?:          number;
  }>;
}

// ── Cost layers (cumulative P1..P4) ──────────────────────────

export interface CostLayer {
  level:           PriorityLevel;     // 1..4
  label:           string;            // "Survival Mode" etc.
  color:           string;
  // Average monthly cost = sum(EXPENSE with priority <= level OR isCritical) / months
  monthlyCost:     number;
  // Average monthly cost from this single priority bucket (for stacked breakdown).
  // Does NOT include critical — that lives in its own field.
  bucketCost:      number;
  // Average monthly cost from EXPENSES in subcategories marked as `isCritical`
  // (non-negotiable like school fees, medication). Same number across all
  // levels — they're always included regardless of priority filter.
  // Kept separate so the UI can show a 🔒 segment.
  criticalCost:    number;
}

export const LEVEL_META: Record<PriorityLevel, { label: string; modeLabel: string; color: string; desc: string }> = {
  1: { label: "Przetrwanie", modeLabel: "Tryb przetrwania", color: "#ef4444", desc: "Absolutne minimum — czynsz, raty, leki, bazowe jedzenie" },
  2: { label: "OK",          modeLabel: "Tryb OK",           color: "#f97316", desc: "P1 + ważne stałe koszty — drobne subskrypcje, ubrania" },
  3: { label: "Komfort",     modeLabel: "Tryb komfortowy",   color: "#eab308", desc: "P1+P2 + komfort — restauracje, hobby, wycieczki" },
  4: { label: "Bez zmian",   modeLabel: "Tryb bez zmian",    color: "#10b981", desc: "Pełen styl życia bez cięć — wszystko 1:1" },
};

// ── Income sources ───────────────────────────────────────────

export interface IncomeSource {
  // Unique key. We group by subcategoryId when present, else categoryId.
  key:         string;
  label:       string;       // Display name (categoryName › subcategoryName)
  categoryId:  string;
  categoryName: string;
  // Average monthly amount across the lookback window
  avgMonthly:  number;
  // How many of the lookback months had any income from this source
  monthsSeen:  number;
}

// ── Deficit per level ────────────────────────────────────────

export interface LevelDeficit {
  level:           PriorityLevel;
  monthlyCost:     number;       // From CostLayer
  remainingIncome: number;       // Sum of NOT-excluded income sources
  monthlyDeficit:  number;       // max(0, monthlyCost - remainingIncome)
  // ── Target breakdown ──────────────────────────────────────
  // baseTarget = monthlyDeficit × horizonMonths (cost of surviving)
  // plannedTarget = obligations falling within the horizon at this level
  // totalTarget   = baseTarget + plannedTarget (the real cushion the user needs)
  baseTarget:      number;
  plannedTarget:   number;
  targetCushion:   number;       // == totalTarget (kept for back-compat; equals baseTarget + plannedTarget)
  // How many months the current assets would last covering ONLY this deficit
  runwayMonths:    number;       // assetsTotal / monthlyDeficit  (Infinity if deficit = 0)
  runwayDays:      number;       // assetsTotal / (monthlyDeficit / 30)
  coveragePercent: number;       // assetsTotal / targetCushion * 100 (clamped reported separately)
}

// ── Upcoming planned expenses (in horizon window) ────────────

/**
 * Summary of a single planned expense that falls within the user's
 * safety-net horizon. Used to add concrete, named obligations to
 * the cushion target.
 *
 * For envelope mode: `amountInHorizon` is `totalAmountPLN - sumPaid`
 * if `plannedMonth` falls within the horizon; otherwise it's the
 * sum of unpaid+undismissed `virtualSavings` entries inside the
 * horizon window (i.e. only what we committed to put aside in this
 * period — losing the job means we can stop the rest).
 */
export interface UpcomingPlanned {
  id:               string;
  description:      string;
  categoryName:     string;
  subcategoryId?:   string;        // present when the plan targets a specific subcategory
  subcategoryName?: string;
  mode:             "oneoff" | "envelope";
  priority:         PriorityLevel;
  /** True when subcategory is flagged isCritical — bypasses priority filter. */
  isCritical:       boolean;
  plannedMonth:     string;        // YYYY-MM
  amountInHorizon:  number;        // PLN — what we still need to set aside in the horizon
  totalAmountPLN:   number;        // total cost (for context)
  paidPLN:          number;        // already covered (envelope only)
}

// ── Assets ───────────────────────────────────────────────────

export type LiquidityLevel = "instant" | "fast" | "slow";

export const LIQUIDITY_META: Record<LiquidityLevel, { label: string; color: string; desc: string }> = {
  instant: { label: "Natychmiastowa", color: "#10b981", desc: "Gotówka, ROR, konto oszczędnościowe — 0-1 dni" },
  fast:    { label: "Szybka",          color: "#f59e0b", desc: "Lokaty, obligacje krótkie, fundusze — kilka dni" },
  slow:    { label: "Wolna",           color: "#ef4444", desc: "Obligacje długie, akcje, krypto, nieruchomości — tygodnie+" },
};

export interface AssetBucket {
  id:           string;
  label:        string;          // "Konto oszczędnościowe ING"
  amount:       number;          // PLN — always normalised, used for sums
  liquidity:    LiquidityLevel;
  // Optional link to a savings category (for cross-ref with savings flow)
  categoryId?:  string;
  categoryName?: string;
  // Optional FX origin — when the user entered a foreign-currency amount.
  // We keep it for audit / re-conversion during edits, but `amount` (PLN)
  // remains authoritative for all calculations.
  originalAmount?:   number;       // e.g. 100
  originalCurrency?: string;       // e.g. "USD"
  fxRate?:           number;       // e.g. 3.95 — base (PLN) per 1 unit
  fxRateDate?:       string;       // YYYY-MM-DD — effective date from NBP
  // Soft delete — preserved instead of physically removed so the user can
  // restore an accidentally-deleted bucket. Filtered out of sums and the
  // active list by default.
  isArchived?:  boolean;
  archivedAt?:  string;            // ISO timestamp
}

// ── Settings payload (persisted under settings.safetyNet) ────

export interface SafetyNetSettings {
  lookbackMonths:        number;            // 3 | 6 | 12 | 24
  horizonMonths:         number;            // 3 | 6 | 12
  excludedIncomeKeys:    string[];          // Income source keys treated as "lost"
  assets:                AssetBucket[];
  selectedLevel?:        PriorityLevel;     // For Saving Assistant (default: 2)
  // Toggle: include known upcoming planned expenses (OC, taxes, camps, etc.)
  // in the cushion target. Default true — the panel is supposed to be honest.
  includePlannedExpenses?: boolean;
}

export const DEFAULT_SAFETY_NET: SafetyNetSettings = {
  lookbackMonths:        6,
  horizonMonths:         6,
  excludedIncomeKeys:    [],
  assets:                [],
  selectedLevel:         2,
  includePlannedExpenses: true,
};

// ── Saving capability ────────────────────────────────────────

export interface SavingCapability {
  avgMonthlyIncome:   number;   // average across lookback (all sources)
  avgMonthlyExpenses: number;   // average across lookback (all expenses, all priorities)
  avgMonthlySavings:  number;   // income - expenses
}

// ── What-if delta ────────────────────────────────────────────

export interface WhatIfDelta {
  extraSavingsPerMonth: number;   // Slider: "I save X zł more per month"
  cutCostsPerMonth:     number;   // Slider: "I cut X zł of monthly costs"
}

// ── Categories — local view, just what we need ───────────────
//
// AppContext exposes categories as JS without types. Defining a minimal
// shape here lets PanelSafetyNet read isCritical / sub[] safely without
// having to retrofit the entire categories layer.

export interface AppSubcategory {
  id:              string;
  name:            string;
  priority?:       PriorityLevel;
  isArchived?:     boolean;
  canBeRecurring?: boolean;
  isCritical?:     boolean;
}

export interface AppCategory {
  id:         string;
  name:       string;
  icon?:      string;
  type:       "EXPENSE" | "INCOME" | "SAVING" | "TRANSFER";
  isArchived: boolean;
  sub:        AppSubcategory[];
}
