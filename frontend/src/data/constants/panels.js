// ============================================================
// File: src/data/constants/panels.js
// Panel registration metadata: which panels exist, their icons,
// section grouping in Sidebar, and which ones display the
// MonthNavigator / month-aware title in the header.
//
// Consumed by:
//   - Sidebar.tsx, MobileNav.tsx   — navigation rendering
//   - MoreSheet.tsx                 — mobile "Więcej" bottom sheet
//   - App.tsx                       — header chrome decisions
//   - data/routes.ts                — PANEL_PATHS map (panel id → URL)
//
// `mobile: true` — panel appears in the mobile "Więcej" bottom
// sheet. Quick-add panels (section "Główne") never need the flag:
// they live directly in the MobileNav bottom bar. Flip the flag
// as panels become mobile-ready; MoreSheet picks them up
// automatically (single source of truth, no separate list).
// ============================================================

export const PANEL_META = {
  // Main quick-add panels
  expenses:           { icon: "➕", label: "Dodaj wydatek",     section: "Główne"            },
  addincome:          { icon: "💵", label: "Dodaj wpływ",       section: "Główne"            },
  addrecurring:       { icon: "🔄", label: "Dodaj cykliczny",   section: "Główne"            },
  addplanned:         { icon: "📅", label: "Dodaj planowany",   section: "Główne"            },
  // Quick-add panels normally skip `mobile` because they sit in the bottom
  // bar — but that bar has four fixed slots, so this one would be
  // unreachable on a phone without the flag.
  addwish:            { icon: "🛒", label: "Dodaj do listy zakupowej", section: "Główne",    mobile: true },

  // Per-month analysis
  transactions:       { icon: "🧾", label: "Wydatki",           section: "Analiza miesiąca", mobile: true },
  incometransactions: { icon: "💵", label: "Wpływy",            section: "Analiza miesiąca", mobile: true },
  planned:            { icon: "📅", label: "Planowane",         section: "Analiza miesiąca", mobile: true },
  recurring:          { icon: "🔄", label: "Cykliczne",         section: "Analiza miesiąca", mobile: true },
  summary:            { icon: "📊", label: "Podsumowanie",      section: "Analiza miesiąca", mobile: true },
  basebudget:         { icon: "🏦", label: "Baza budżetu",      section: "Analiza miesiąca", mobile: true },

  // Tools (month-independent)
  // The shopping list has no month by design — that is what separates it from
  // a planned expense — so it belongs here rather than under "Analiza miesiąca".
  wishlist:           { icon: "🛒", label: "Lista zakupowa",     section: "Narzędzia",       mobile: true },
  // Range-based, not month-based: a trip is a span of dates, so this belongs
  // beside Analiza rather than under "Analiza miesiąca".
  tags:               { icon: "🏷️", label: "Analiza tagów",      section: "Narzędzia",       mobile: true },
  vouchers:           { icon: "🎫", label: "Vouchery",          section: "Narzędzia",       mobile:true },
  safetynet:          { icon: "🛡️", label: "Poduszka",         section: "Narzędzia",        mobile: true },
  analytics:          { icon: "📊", label: "Analiza",           section: "Narzędzia",       mobile: true},
  luxmed:             { icon: "🏥", label: "Zwroty LuxMed",     section: "Narzędzia",       mobile: true},
  bottledeposits:     { icon: "🍾", label: "Zwroty butelek",    section: "Narzędzia",       mobile: true},
  // Admin
  settings:           { icon: "⚙️", label: "Ustawienia",        section: "Administracja",     mobile: true},
  admin:              { icon: "🔐", label: "Admin",             section: "Administracja",     mobile: true},
};

// Panels that render the MonthNavigator in the page header.
// Single source of truth — App.tsx also reads from here in its own Set.
export const MONTH_SELECTOR_PANELS = [
  "expenses", "addincome", "addrecurring", "addplanned",
  "transactions", "incometransactions",
  "recurring",
  "summary", "basebudget"
];

// Panels whose page title includes the active month name.
// Currently identical to MONTH_SELECTOR_PANELS, but kept separate so the
// two concerns can drift if needed (e.g. some panel might show the
// navigator without printing the month in the title).
export const MONTH_TITLE_PANELS = [
  "expenses", "addincome", "addrecurring", "addplanned",
  "transactions", "incometransactions",
  "recurring",
  "summary", "basebudget"
];
