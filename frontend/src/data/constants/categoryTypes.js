// ============================================================
// File: src/data/constants/categoryTypes.js
//
// Single source of truth for category type metadata.
// Used by: PanelBaseBudget, PanelTransactions, PanelIncomeTransactions,
//          CategoriesSection, SubcategorySelect, TransactionForm, txStyles.
//
// Fields per type:
//   label        — Polish display name (e.g. in filters, section headers)
//   labelPlural  — plural form where needed
//   icon         — emoji for UI buttons and badges
//   color        — primary color (badges, borders, section headers)
//   accentBase     — color for the BASE limits column (PanelBaseBudget)
//   accentOverride — color for the OVERRIDE limits column (PanelBaseBudget)
// ============================================================

export const CATEGORY_TYPE_META = {
  EXPENSE: {
    label:          "Wydatki",
    labelPlural:    "Wydatki",
    icon:           "💸",
    color:          "#ef4444",
    accentBase:     "#10b981",
    accentOverride: "#f59e0b",
  },
  INCOME: {
    label:          "Wpływ",
    labelPlural:    "Wpływy",
    icon:           "💰",
    color:          "#10b981",
    accentBase:     null,
    accentOverride: null,
  },
  SAVING: {
    label:          "Oszczędności",
    labelPlural:    "Oszczędności",
    icon:           "🏦",
    color:          "#3b82f6",
    accentBase:     "#3b82f6",
    accentOverride: "#a78bfa",
  },
  TRANSFER: {
    label:          "Transfer",
    labelPlural:    "Transfery",
    icon:           "🔄",
    color:          "#a855f7",
    accentBase:     null,
    accentOverride: null,
  },
};

// ── Derived helpers ───────────────────────────────────────────

// Ordered array for rendering type tabs/sections consistently across the app.
// Order: EXPENSE first (most used), then SAVING, INCOME, TRANSFER.
export const CATEGORY_TYPE_ORDER = ["EXPENSE", "SAVING", "INCOME", "TRANSFER"];

// Returns the color for a given type, with a safe fallback.
export function typeColor(type) {
  return CATEGORY_TYPE_META[type]?.color ?? "#64748b";
}

// Returns the label for a given type, with a safe fallback.
export function typeLabel(type) {
  return CATEGORY_TYPE_META[type]?.label ?? type;
}

// Returns the icon for a given type, with a safe fallback.
export function typeIcon(type) {
  return CATEGORY_TYPE_META[type]?.icon ?? "📦";
}

// Full ordered array of { type, ...meta } — used for rendering
// type selectors, filter dropdowns, and section configs.
// Pass allowedTypes to restrict which types appear.
export function getCategoryTypeSections(allowedTypes = null) {
  return CATEGORY_TYPE_ORDER
    .filter(t => !allowedTypes || allowedTypes.includes(t))
    .map(t => ({ type: t, ...CATEGORY_TYPE_META[t] }));
}

// Budget panel section config — only types that have limit support (BASE/OVERRIDE).
// INCOME and TRANSFER don't have budget limits, so they're excluded.
export const BUDGET_SECTION_TYPES = ["EXPENSE", "SAVING"];

export function getBudgetSections() {
  return BUDGET_SECTION_TYPES.map(type => ({
    type,
    title: `${CATEGORY_TYPE_META[type].icon} ${CATEGORY_TYPE_META[type].labelPlural}`,
    accentBase:     CATEGORY_TYPE_META[type].accentBase,
    accentOverride: CATEGORY_TYPE_META[type].accentOverride,
  }));
}