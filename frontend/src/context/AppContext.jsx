// ============================================================
// File: src/context/AppContext.jsx
// Central React Context — shared state.
// Bootstrap: categories, tags, settings, closedMonths, vouchers.
// Each feature module manages its own state via hooks,
// but stores data here so components share it without re-fetching.
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth }  from "./AuthContext";
import { MONTHS }   from "../data/constants";
import { formatBudgetMonth } from "../utils/helpers";
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

  // ── Navigation ───────────────────────────────────────────────
  const [panel, _setPanel] = useState("expenses");
  const [month, setMonth]  = useState(new Date().getMonth());
  const [year,  setYear]   = useState(new Date().getFullYear());

  // ── Transactions ─────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);

  // ── Vouchers ─────────────────────────────────────────────────
  const [vouchers, setVouchers] = useState([]);

  // ── Recurring (shared between PanelRecurring + NotificationBell) ──
  const [recurring, setRecurring] = useState([]);

  // ── Limits (shared between PanelBaseBudget + future Summary) ─
  const [limits, setLimits] = useState([]);

  // ── Planned expenses ──────────────────────────────────────────
  const [planned, setPlanned] = useState([]);

  // ── Months / closed ──────────────────────────────────────────
  const [closedMonths, setClosedMonths] = useState(new Set());

  // ── Categories / tags / settings ─────────────────────────────
  const [categories,  setCategories]  = useState([]);
  const [tags,        setTags]        = useState([]);
  const [settings,    setSettings]    = useState(null);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  // ── Navigate to first open month from today ───────────────────
  const navigateToFirstOpenMonth = useCallback((closed = closedMonths) => {
    const now = new Date();
    let m = now.getMonth();
    let y = now.getFullYear();
    for (let i = 0; i < 24; i++) {
      const bm = formatBudgetMonth(m, y);
      if (!closed.has(bm)) {
        setMonth(m);
        setYear(y);
        return;
      }
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }, [closedMonths]);

  const setPanel = useCallback((id) => {
    navigateToFirstOpenMonth();
    _setPanel(id);
  }, [navigateToFirstOpenMonth]);

  // ── Parse categories from DB format ──────────────────────────
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
          priority:       child.priority    || 2,
          isArchived:     child.isArchived  || false,
          canBeRecurring: child.canBeRecurring ?? false,
        });
      }
    });

    return parents;
  };

  function computeVoucherRemaining(v) {
    const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
    return Math.max(0, v.initialValue - used);
  }

  // ── Bootstrap ─────────────────────────────────────────────────
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

        // Closed months + auto-navigate
        const monthsRes = await fetchWithAuth(`${API_URL}/api/months`);
        if (monthsRes.ok) {
          const data = await monthsRes.json();
          const closedSet = new Set(data.map(m => m.budgetMonth));
          setClosedMonths(closedSet);
          navigateToFirstOpenMonth(closedSet);
        }

        // Vouchers
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
    // Navigation
    panel,  setPanel,
    month,  setMonth,
    year,   setYear,

    // Transactions
    transactions, setTransactions,

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