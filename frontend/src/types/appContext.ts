// ============================================================
// File: src/types/appContext.ts
// The shape of AppContext's value — the single typed contract for the
// app's shared state. Consumers should read `useAppContext()` directly
// (it returns AppContextValue) instead of re-casting with `as { ... }`.
//
// Precise where the domain type is settled (transactions, categories,
// cart, vouchers, tags). Deliberately loose at the raw-document edges
// (planned / recurring) where the per-feature hooks own the rich types
// and narrow as needed — keeps this file free of import cycles.
// ============================================================

import type { Transaction, SettingsTargets } from "./summary";
import type { Voucher } from "./transaction";
import type { CartItem } from "../components/panels/transactionComponents/CartPanel";
import type { LimitDoc } from "../hooks/useLimits";
import type { PlannedDoc } from "../hooks/usePlanned";

// Re-export the rich domain types so consumers (and AppContext itself) have
// a single import point for everything the context exposes.
export type { Transaction, Voucher, CartItem, LimitDoc, PlannedDoc };

export interface AppSubcategory {
  id:              string;
  name:            string;
  priority?:       number;
  isArchived?:     boolean;
  canBeRecurring?: boolean;
  isCritical?:     boolean;
  canBeLuxmed?:    boolean;
}

export interface AppCategory {
  id:         string;
  name:       string;
  icon?:      string;
  type:       "EXPENSE" | "INCOME" | "SAVING" | "TRANSFER";
  isArchived: boolean;
  sub:        AppSubcategory[];
}

export interface Tag {
  id:         string;
  name:       string;
  icon?:      string;
  isArchived: boolean;
}

export interface Currency {
  code:       string;
  name:       string;
  isArchived: boolean;
  isBase:     boolean;
}

// Settings is an open-ended user document — known keys are typed, but the
// index signature keeps it honest about server-driven extra fields.
export interface AppSettings {
  appStartMonth?:            string | null;
  notifyDaysBefore?:         number;
  voucherExpiryWarningDays?: number;
  thresholds?:               { warningPercent: number; criticalPercent: number };
  targets?:                  SettingsTargets;
  currencies?:               Currency[];
  luxmed?:                   { maxPercent?: number; maxTotal?: number };
  safetyNet?:                unknown;
  [key: string]:             unknown;
}

// The recurring-expense document. Index signature keeps it honest about
// server fields not enumerated here.
export interface RecurringDoc {
  id:                  string;
  description:         string;
  categoryName:        string;
  categoryId?:         string;
  subcategoryName?:    string;
  subcategoryId?:      string;
  plannedDay?:         number;
  isArchived?:         boolean;
  archivedFrom?:       string;
  validTo?:            string;
  frequency?:          "monthly" | "quarterly" | "biannual" | "yearly" | "custom";
  activeMonths?:       number[];
  lastConfirmedMonth?: string;   // legacy single-month marker (kept for back-compat)
  confirmedMonths?:    string[];  // every budget month this recurring was confirmed in
  notifiedAt?:         string | null;
  costs?:              Array<{ validFrom: string; amount: number; originalCurrency?: string; fxRate?: number; amountPLN?: number }>;
  [key: string]:       unknown;
}

type Setter<T> = (value: T | ((prev: T) => T)) => void;

export interface AppContextValue {
  transactions:    Transaction[];
  setTransactions: Setter<Transaction[]>;

  cart:    CartItem[];
  setCart: Setter<CartItem[]>;

  vouchers:    Voucher[];
  setVouchers: Setter<Voucher[]>;

  recurring:    RecurringDoc[];
  setRecurring: Setter<RecurringDoc[]>;

  limits:    LimitDoc[];
  setLimits: Setter<LimitDoc[]>;

  planned:    PlannedDoc[];
  setPlanned: Setter<PlannedDoc[]>;

  closedMonths:    Set<string>;
  setClosedMonths: Setter<Set<string>>;

  merchants:    string[];
  setMerchants: Setter<string[]>;

  categories:    AppCategory[];
  setCategories: Setter<AppCategory[]>;

  tags:    Tag[];
  setTags: Setter<Tag[]>;

  settings:    AppSettings | null;
  setSettings: Setter<AppSettings | null>;

  bootstrapDone: boolean;

  fmt:    (value: number) => string;
  MONTHS: readonly string[];
}
