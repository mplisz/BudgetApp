// ============================================================
// File: src/context/AppContext.jsx
// Central React Context — shared app data.
//
// Bootstrap (once per session, after auth): categories, tags,
// settings, closedMonths, vouchers. Each feature module manages
// its own slice via hooks but stores data here so components share
// it without re-fetching.
//
// NOTE on month/year: this context deliberately does NOT hold the
// active budget month. The single source of truth for "which month
// is the user viewing" is the ?m= URL param, read via useMonthFromUrl.
// This keeps the month deep-linkable (shareable URLs, F5-safe,
// back/forward navigation) and avoids a second, drift-prone copy.
// ============================================================

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth }  from "./AuthContext";
import { MONTHS }   from "../data/constants";
import { fmt }      from "../utils/helpers";

const AppContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }) {
  const { fetchWithAuth, accessToken } = useAuth();

  // ── Transactions ─────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [cart,         setCart]         = useState([]);

  // ── Vouchers ─────────────────────────────────────────────────
  const [vouchers, setVouchers] = useState([]);

  // ── Recurring (shared between PanelRecurring + NotificationBell) ──
  const [recurring, setRecurring] = useState([]);

  // ── Limits (shared between PanelBaseBudget + Summary) ────────
  const [limits, setLimits] = useState([]);

  // ── Planned expenses ──────────────────────────────────────────
  const [planned, setPlanned] = useState([]);

  // ── Months / closed ──────────────────────────────────────────
  const [closedMonths, setClosedMonths] = useState(new Set());

  // ── Categories / tags / settings ─────────────────────────────
  const [categories,    setCategories]   = useState([]);
  const [tags,          setTags]         = useState([]);
  const [settings,      setSettings]     = useState(null);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  // ── Parse categories from DB format ──────────────────────────
  // DB stores a flat list (parents + children via parentCategoryId).
  // We nest children under their parent's `sub[]` for the UI.
  const parseCategories = (dbCategories) => {
    const parents = dbCategories
      .filter(c => !c.parentCategoryId)
      .map(parent => ({
        id:         parent.id,
        name:       parent.name,
        icon:       parent.icon || "📦",
        type:       parent.type || "EXPENSE",
        isArchived: parent.isArchived || false,
        sub:        [],
      }));

    dbCategories.filter(c => c.parentCategoryId).forEach(child => {
      const parentObj = parents.find(p => p.id === child.parentCategoryId);
      if (parentObj) {
        parentObj.sub.push({
          id:             child.id,
          name:           child.name,
          priority:       child.priority       || 2,
          isArchived:     child.isArchived      || false,
          canBeRecurring: child.canBeRecurring  ?? false,
          isCritical:     child.isCritical      ?? false,
        });
      }
    });

    return parents;
  };

  // Remaining value on a voucher = initial minus sum of recorded usages.
  function computeVoucherRemaining(v) {
    const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
    return Math.max(0, v.initialValue - used);
  }

  // ── Bootstrap ─────────────────────────────────────────────────
  // Runs once when an access token becomes available. Loads the shared
  // reference data the whole app needs. Per-month transaction data is
  // loaded on demand by useTransactions, NOT here.
  useEffect(() => {
    if (!accessToken) return;

    async function bootstrap() {
      try {
        const [catsRes, tagsRes, settingsRes] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/categories`),
          fetchWithAuth(`${API_URL}/api/tags`),
          fetchWithAuth(`${API_URL}/api/settings`),
        ]);

        if (catsRes.ok)     setCategories(parseCategories(await catsRes.json()));
        if (tagsRes.ok)     setTags((await tagsRes.json()).filter(t => !t.isArchived));
        if (settingsRes.ok) setSettings(await settingsRes.json());

        // Closed months — the URL/navigator logic reads this set to
        // decide the first open month and to lock closed months.
        const monthsRes = await fetchWithAuth(`${API_URL}/api/months`);
        if (monthsRes.ok) {
          const data = await monthsRes.json();
          setClosedMonths(new Set(data.map(m => m.budgetMonth)));
        }

        // Vouchers — precompute remainingValue for display.
        const vouchersRes = await fetchWithAuth(`${API_URL}/api/vouchers`);
        if (vouchersRes.ok) {
          const data = await vouchersRes.json();
          setVouchers(data.map(v => ({ ...v, remainingValue: computeVoucherRemaining(v) })));
        }
      } catch (err) {
        console.error("[AppContext bootstrap]", err);
      } finally {
        setBootstrapDone(true);
      }
    }

    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // ── Context value ─────────────────────────────────────────────
  const value = {
    // Transactions
    transactions, setTransactions,
    cart,         setCart,

    // Vouchers
    vouchers, setVouchers,

    // Recurring (shared)
    recurring, setRecurring,

    // Limits (shared)
    limits, setLimits,

    // Planned expenses (shared)
    planned, setPlanned,

    // Months
    closedMonths, setClosedMonths,

    // Categories / tags / settings
    categories, setCategories,
    tags,       setTags,
    settings,   setSettings,
    bootstrapDone,

    // Utils
    fmt, MONTHS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
