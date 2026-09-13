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
  addwish:            "/wishlist/add",

  // Per-month analysis
  transactions:       "/transactions",
  incometransactions: "/income-transactions",
  planned:            "/planned",
  recurring:          "/recurring",
  summary:            "/summary",
  basebudget:         "/basebudget",

  // Tools
  wishlist:           "/wishlist",
  shopping:           "/shopping",
  tags:               "/tags",
  vouchers:           "/vouchers",
  safetynet:          "/safetynet",
  analytics:          "/analytics",
  luxmed:             "/luxmed",
  bottledeposits:     "/bottle-deposits",

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

// ── Deep links into the transaction panels ──────────────────
//
// One builder + one reader, so every "show me these transactions" link
// (PanelSummary KPI tiles, category / subcategory rows) and both panels
// that honour it speak exactly the same query string:
//
//   /transactions?m=2026-09&type=EXPENSE&cat=Zakupy+codzienne&sub=Alkohol
//
// The type picks the panel: EXPENSE/SAVING live in Wydatki, INCOME/TRANSFER
// in Wpływy. Category and subcategory go by NAME, because that is what the
// panels' filters match on (tx.categoryName / tx.subcategoryName).

export type TxLinkType = "EXPENSE" | "SAVING" | "INCOME" | "TRANSFER";

export interface TxLinkFilters {
  type:      TxLinkType;
  category?: string;
  /** Only meaningful together with `category` — the panels show the
   *  subcategory filter only once a category is picked. */
  sub?:      string;
}

/** Query params a transaction deep link owns (`m` is shared, not owned). */
export const TX_LINK_PARAMS = ["type", "cat", "sub"] as const;

const TX_LINK_TYPES: readonly TxLinkType[] = ["EXPENSE", "SAVING", "INCOME", "TRANSFER"];

export function txLink(month: string, { type, category, sub }: TxLinkFilters): string {
  const panel = type === "INCOME" || type === "TRANSFER" ? "incometransactions" : "transactions";
  const q = new URLSearchParams({ m: month, type });
  if (category) {
    q.set("cat", category);
    if (sub) q.set("sub", sub);
  }
  return `${PANEL_PATHS[panel]}?${q}`;
}

/** Reads a deep link back; null when the URL carries none (or a bogus type). */
export function readTxLink(params: URLSearchParams): TxLinkFilters | null {
  const type = params.get("type") as TxLinkType | null;
  if (!type || !TX_LINK_TYPES.includes(type)) return null;
  const category = params.get("cat") || undefined;
  const sub      = category ? params.get("sub") || undefined : undefined;
  return { type, category, sub };
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
