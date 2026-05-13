// ============================================================
// File: src/context/AppContext.jsx
// Central React Context — all shared state and actions.
// Bootstrap: categories, tags, settings, closedMonths, vouchers
// loaded on startup once accessToken is available.
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth }  from "./AuthContext";
import { MONTHS }   from "../data/constants";
import { buildSubLookup, recurringActiveForMonth, computeMonthBudget, formatBudgetMonth } from "../utils/helpers";
import { fmt }      from "../utils/helpers";

const AppContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }) {
  const { fetchWithAuth, user, accessToken } = useAuth();

  // ── Navigation ───────────────────────────────────────────────
  const [panel,         _setPanel]      = useState("expenses");

  // ── Active month / year ──────────────────────────────────────
  const [month, setMonth] = useState(new Date().getMonth());
  const [year,  setYear]  = useState(new Date().getFullYear());

  // ── Core data ────────────────────────────────────────────────
  const [expenses,      setExpenses]     = useState([]);
  const [planned,       setPlanned]      = useState([]);
  const [actualIncome,  setActualIncome] = useState([]);
  const [transactions,  setTransactions] = useState([]);
  const [cart,          setCart]         = useState([]);
  const [closedMonths,  setClosedMonths] = useState(new Set());
  const [vouchers,      setVouchers]     = useState([]);

  // ── Configuration ────────────────────────────────────────────
  const [categories,    setCategories]   = useState([]);
  const [tags,          setTags]         = useState([]);
  const [incomeSources, setIncomeSources]= useState([]);
  const [settings,      setSettings]     = useState(null);
  const [archivedSubs,  setArchivedSubs] = useState(new Set());

  // ── Budget ───────────────────────────────────────────────────
  const [baseBudget,      setBaseBudget]      = useState({});
  const [budgetOverrides, setBudgetOverrides] = useState({});

  // ── Goals ────────────────────────────────────────────────────
  const [goals,         setGoals]        = useState([]);

  // ── Bootstrap flag ───────────────────────────────────────────
  const [bootstrapDone, setBootstrapDone] = useState(false);

  // ── OCR ──────────────────────────────────────────────────────
  const [form,       setForm]       = useState({});
  const [fxRate,     setFxRate]     = useState(null);
  const [ocrMode,    setOcrMode]    = useState(false);
  const [ocrLines,   setOcrLines]   = useState([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileRef = useRef(null);

  // ── Tag filters ──────────────────────────────────────────────
  const [activeTagFilter, setActiveTagFilter] = useState(null);
  const [tagBudgets,      setTagBudgets]      = useState({});

  // ── Cushion ──────────────────────────────────────────────────
  const [cushionMonths,      setCushionMonths]      = useState(3);
  const [cushionCoverMonths, setCushionCoverMonths] = useState(6);
  const [cushionLevel,       setCushionLevel]       = useState(3);
  const [cushionLossSource,  setCushionLossSource]  = useState("all");

  // ── Notifications ────────────────────────────────────────────
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [paidNotifIds,  setPaidNotifIds]  = useState(new Set());

  // ── Stash ────────────────────────────────────────────────────
  const [stash,             setStash]             = useState([]);
  const [savedFromImpulses, setSavedFromImpulses] = useState(0);
  const [stashMoveModal,    setStashMoveModal]    = useState(false);
  const [stashMoveDate,     setStashMoveDate]     = useState("");

  // ── Legacy settings fields ───────────────────────────────────
  const [retirementMin, setRetirementMin] = useState(15);
  const [insuranceMax,  setInsuranceMax]  = useState(10);
  const [warnThreshold, setWarnThreshold] = useState(80);

  // ── Navigate to first open month from now() ──────────────────
  // Called at bootstrap and on every panel change.
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
  }, [closedMonths, setMonth, setYear]);

  // Wrapped setPanel — navigates to first open month on every panel change
  const setPanel = useCallback((id) => {
    navigateToFirstOpenMonth();
    _setPanel(id);
  }, [navigateToFirstOpenMonth]);

  // ── Bootstrap ─────────────────────────────────────────────────
  const parseCategories = (dbCategories) => {
    const parents = dbCategories.filter(c => !c.parentCategoryId).map(parent => ({
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
          id:         child.id,
          name:       child.name,
          priority:   child.priority || 2,
          isArchived: child.isArchived || false,
        });
      }
    });
    return parents;
  };

  function computeVoucherRemaining(v) {
    const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
    return Math.max(0, v.initialValue - used);
  }

  useEffect(() => {
    if (!accessToken) return;

    async function bootstrap() {
      try {
        const [catsRes, tagsRes, settingsRes] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/categories`),
          fetchWithAuth(`${API_URL}/api/tags`),
          fetchWithAuth(`${API_URL}/api/settings`),
        ]);

        if (catsRes.ok) {
          const data = await catsRes.json();
          setCategories(parseCategories(data));
        }

        if (tagsRes.ok) {
          const data = await tagsRes.json();
          setTags(data.filter(t => !t.isArchived));
        }

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data);
        }

        // Load closed months + auto-navigate
        const monthsRes = await fetchWithAuth(`${API_URL}/api/months`);
        if (monthsRes.ok) {
          const data = await monthsRes.json();
          const closedSet = new Set(data.map(m => m.budgetMonth));
          setClosedMonths(closedSet);
          navigateToFirstOpenMonth(closedSet);
        }

        // Load vouchers
        const vouchersRes = await fetchWithAuth(`${API_URL}/api/vouchers`);
        if (vouchersRes.ok) {
          const data = await vouchersRes.json();
          setVouchers(data.map(v => ({ ...v, remainingValue: computeVoucherRemaining(v) })));
        }

      } catch (err) {
        console.error("[AppContext bootstrap] Failed:", err);
      } finally {
        setBootstrapDone(true);
      }
    }

    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // ── Budget helpers ────────────────────────────────────────────
  function setMonthOverride(cat, val, m, y) {
    const key = `${y}-${m}`;
    setBudgetOverrides(prev => ({
      ...prev, [key]: { ...(prev[key] || {}), [cat]: parseFloat(val) || 0 },
    }));
  }

  function clearMonthOverride(cat, m, y) {
    const key = `${y}-${m}`;
    setBudgetOverrides(prev => {
      const updated = { ...(prev[key] || {}) };
      delete updated[cat];
      return { ...prev, [key]: updated };
    });
  }

  // ── Derived lookups ──────────────────────────────────────────
  const subLookup = buildSubLookup(categories);

  // ── Monthly derived data ─────────────────────────────────────
  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const monthActualIncome = actualIncome.filter(i => {
    const d = new Date(i.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const totalActualIncome       = monthActualIncome.reduce((s, i) => s + i.amount, 0);
  const totalSpent              = monthExpenses.filter(e => !e.isEnvelopTransfer).reduce((s, e) => s + e.amount, 0);
  const recurringThisMonth      = expenses.filter(e => e.recurring && recurringActiveForMonth(e, month, year));
  const totalRecurringThisMonth = recurringThisMonth.reduce((s, e) => s + e.amount, 0);

  const filteredExpenses = activeTagFilter
    ? monthExpenses.filter(e => (e.tags || []).includes(activeTagFilter))
    : monthExpenses;

  // ── Goal helpers ─────────────────────────────────────────────
  function goalSaved(goalId) {
    return expenses
      .filter(e => e.goalId === goalId && e.isEnvelopTransfer)
      .reduce((s, e) => s + e.amount, 0);
  }

  function monthsUntilGoal(targetMonth, m, y) {
    const [ty, tm] = targetMonth.split("-").map(Number);
    return Math.max((ty - y) * 12 + (tm - (m + 1)) + 1, 1);
  }

  function goalSuggestedInstallment(goal, m, y) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    if (goal.startMonth && key < goal.startMonth) return 0;
    const saved     = goalSaved(goal.id);
    const remaining = Math.max((goal.target || 0) - saved, 0);
    const months    = monthsUntilGoal(goal.targetMonth, m, y);
    return remaining / Math.max(months, 1);
  }

  function isGoalTargetMonth(goal, m, y) {
    return goal.targetMonth === `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  function isGoalConfirmedThisMonth(goal, m, y) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    return (goal.confirmedMonths || []).includes(key);
  }

  function isGoalSkippedThisMonth(goal, m, y) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    return (goal.skippedMonths || []).includes(key);
  }

  const totalGoalsSaved = goals.filter(g => !g.archived).reduce((s, g) => s + goalSaved(g.id), 0);

  const goalsDeductedThisMonth = expenses
    .filter(e => {
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      return e.isEnvelopTransfer && e.date?.startsWith(key);
    })
    .reduce((s, e) => s + e.amount, 0);

  // ── Budget computation ────────────────────────────────────────
  const currentMonthBudget = computeMonthBudget({
    categories,
    baseBudget,
    budgetOverrides,
    planned,
    expenses,
    month,
    year,
    goals,
    goalInstallment: goalSuggestedInstallment,
  });

  const budget      = Object.fromEntries(
    Object.entries(currentMonthBudget.byCat).map(([cat, v]) => [cat, v.total])
  );
  const totalBudget = currentMonthBudget.grandTotal;

  // ── Cushion helper ────────────────────────────────────────────
  function calcCushion() {
    const recentMonths = [];
    for (let i = 0; i < cushionMonths; i++) {
      let m = month - i; let y = year;
      if (m < 0) { m += 12; y--; }
      recentMonths.push({ m, y });
    }
    const filtered = expenses.filter(e => {
      const d          = new Date(e.date);
      const inPeriod   = recentMonths.some(rm => rm.m === d.getMonth() && rm.y === d.getFullYear());
      if (!inPeriod) return false;
      const expTags    = (e.tags || []).map(tid => tags.find(t => t.id === tid)).filter(Boolean);
      const effectivePrio = expTags.length > 0
        ? Math.min(...expTags.map(t => t.priority))
        : (subLookup[e.sub]?.priority ?? 4);
      return effectivePrio <= cushionLevel && effectivePrio < 4;
    });
    const relevantCats    = [...new Set(filtered.map(e => e.category))];
    const total           = filtered.reduce((s, e) => s + e.amount, 0);
    const monthly         = total / cushionMonths;
    let lostIncome        = totalActualIncome;
    if (cushionLossSource !== "all") {
      const src  = monthActualIncome.find(i => i.source === cushionLossSource);
      lostIncome = src?.amount || 0;
    }
    const remainingIncome = cushionLossSource === "all" ? 0 : totalActualIncome - lostIncome;
    const monthlyDeficit  = Math.max(monthly - remainingIncome, 0);
    const cushionNeeded   = monthlyDeficit * cushionCoverMonths;
    return { monthly, monthlyDeficit, cushionNeeded, relevantCats };
  }

  // ── Notifications ─────────────────────────────────────────────
  const upcomingPayments = recurringThisMonth.filter(e => !paidNotifIds.has(e.id));
  const markNotifPaid    = (notif) => setPaidNotifIds(prev => new Set([...prev, notif.id ?? notif]));

  // ── OCR simulate ─────────────────────────────────────────────
  function simulateOCR() {
    setOcrLoading(true);
    setTimeout(() => {
      setOcrLines([
        { id: 1, desc: "Mleko 3.2%",     amount: 4.99,  sub: "Spożywcze", category: "Zakupy codzienne", selected: true },
        { id: 2, desc: "Chleb żytni",    amount: 6.49,  sub: "Spożywcze", category: "Zakupy codzienne", selected: true },
        { id: 3, desc: "Płyn do naczyń", amount: 8.99,  sub: "Chemia",    category: "Zakupy codzienne", selected: true },
        { id: 4, desc: "Pomidory 0.5kg", amount: 5.49,  sub: "Spożywcze", category: "Zakupy codzienne", selected: true },
        { id: 5, desc: "Piwo 6-pak",     amount: 18.99, sub: "Alkohol",   category: "Zakupy codzienne", selected: false },
      ]);
      setOcrLoading(false);
    }, 1500);
  }

  // ── Context value ─────────────────────────────────────────────
  const value = {
    // Navigation
    panel, setPanel,
    month, setMonth,
    year,  setYear,

    // Core data (legacy panels)
    expenses,     setExpenses,
    planned,      setPlanned,
    actualIncome, setActualIncome,

    // Transactions + cart + months
    transactions,  setTransactions,
    cart,          setCart,
    closedMonths,  setClosedMonths,

    // Vouchers
    vouchers, setVouchers,

    // Derived monthly
    monthExpenses, monthActualIncome,
    totalActualIncome, totalSpent,
    filteredExpenses,
    recurringThisMonth, totalRecurringThisMonth,

    // Budget
    budget, totalBudget, currentMonthBudget,
    baseBudget,      setBaseBudget,
    budgetOverrides, setBudgetOverrides,
    setMonthOverride, clearMonthOverride,

    // Configuration
    categories, setCategories,
    tags,       setTags,
    incomeSources, setIncomeSources,
    settings,   setSettings,
    archivedSubs, setArchivedSubs,

    subLookup,

    // Bootstrap
    bootstrapDone,

    // OCR
    form, setForm,
    fxRate, setFxRate,
    ocrMode,    setOcrMode,
    ocrLines,   setOcrLines,
    ocrLoading, setOcrLoading,
    fileRef,
    simulateOCR,

    // Tag filters
    activeTagFilter, setActiveTagFilter,
    tagBudgets,      setTagBudgets,

    // Cushion
    cushionMonths,      setCushionMonths,
    cushionCoverMonths, setCushionCoverMonths,
    cushionLevel,       setCushionLevel,
    cushionLossSource,  setCushionLossSource,
    calcCushion,

    // Notifications
    notifOpen, setNotifOpen,
    upcomingPayments, markNotifPaid,

    // Stash
    stash,             setStash,
    savedFromImpulses, setSavedFromImpulses,
    stashMoveModal,    setStashMoveModal,
    stashMoveDate,     setStashMoveDate,

    // Goals
    goals, setGoals,
    totalGoalsSaved, goalsDeductedThisMonth,
    goalSaved, goalSuggestedInstallment,
    isGoalTargetMonth, isGoalConfirmedThisMonth,
    isGoalSkippedThisMonth, monthsUntilGoal,

    // Legacy settings
    retirementMin, setRetirementMin,
    insuranceMax,  setInsuranceMax,
    warnThreshold, setWarnThreshold,

    // Utils
    fmt, MONTHS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}