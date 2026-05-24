// ============================================================
// File: src/data/routes.ts
//
// Single source of truth mapping PANEL_META keys → URL paths.
//
// Why we keep PANEL_META keys around (rather than dropping them):
//   - Sidebar.jsx derives section grouping from PANEL_META.
//   - NotificationBell uses panel IDs to choose where to navigate.
//   - Migration is incremental — keeping the key→path map means
//     we don't have to rewrite PANEL_META right now.
//
// Routing model:
//   - All "main" panels are top-level routes (/transactions, /vouchers, etc.)
//   - "Add X" forms live under nested paths (/expenses/add, /income/add)
//   - The `?m=YYYY-MM` query param is the universal "active month"
//     indicator — read by panels that care, ignored by others.
// ============================================================

/** Maps PANEL_META keys to their route paths. */
export const PANEL_PATHS: Record<string, string> = {
  // Main / quick-add
  expenses:           "/expenses/add",
  addincome:          "/income/add",
  addrecurring:       "/recurring/add",
  addplanned:         "/planned/add",

  // Per-month analysis
  transactions:       "/transactions",
  incometransactions: "/income-transactions",
  planned:            "/planned",
  recurring:          "/recurring",
  summary:            "/summary",
  basebudget:         "/basebudget",

  // Tools
  vouchers:           "/vouchers",
  safetynet:          "/safetynet",
  analytics:          "/analytics",

  // Admin
  settings:           "/settings",
  admin:              "/admin",
};

/** Inverse: pathname → panel id (used by Sidebar to highlight active). */
export const PATH_TO_PANEL: Record<string, string> = Object.fromEntries(
  Object.entries(PANEL_PATHS).map(([id, path]) => [path, id]),
);

/** Default landing path after login. Override via VITE_DEFAULT_PANEL. */
export function getDefaultPath(): string {
  const envPanel = import.meta.env.VITE_DEFAULT_PANEL;
  if (envPanel && PANEL_PATHS[envPanel]) return PANEL_PATHS[envPanel];
  return PANEL_PATHS.expenses;   // /expenses/add
}

/** Resolves the current panel id from a pathname (best-effort). */
export function panelIdFromPath(pathname: string): string | null {
  // Direct match first
  if (PATH_TO_PANEL[pathname]) return PATH_TO_PANEL[pathname];

  // Strip trailing slash and try again
  const trimmed = pathname.replace(/\/$/, "");
  if (PATH_TO_PANEL[trimmed]) return PATH_TO_PANEL[trimmed];

  // No match (e.g. unknown route, hit 404)
  return null;
}
