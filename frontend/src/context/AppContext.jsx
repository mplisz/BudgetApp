// ============================================================
// File: src/context/AppContext.jsx
// Central React Context – all shared state and actions.
// ============================================================

import { createContext, useContext, useState, useRef } from "react";
import { MONTHS } from "../data/constants";
import { buildSubLookup, recurringActiveForMonth, computeMonthBudget } from "../utils/helpers";
import { fmt } from "../utils/helpers";

const AppContext = createContext(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }) {

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [panel, setPanel] = useState("expenses");

  // ── Active month / year ──────────────────────────────────────────────────────
  const [month, setMonth] = useState(new Date().getMonth());
  const [year,  setYear]  = useState(new Date().getFullYear());

  // ── Core data ────────────────────────────────────────────────────────────────
  const [expenses,     setExpenses]     = useState([]);
  const [planned,      setPlanned]      = useState([]);
  const [actualIncome, setActualIncome] = useState([]);

  // ── Configuration ────────────────────────────────────────────────────────────
  const [categories, setCategories]        = useState([]);
  const [tags,           setTags]          = useState([]);
  const [incomeSources,  setIncomeSources] = useState([]);
  const [settings,       setSettings]      = useState(null);
  const [archivedSubs,   setArchivedSubs]  = useState(new Set());

  // ── Base budget + overrides ──────────────────────────────────────────────────
  const [baseBudget,      setBaseBudget]      = useState({});
  const [budgetOverrides, setBudgetOverrides] = useState({});



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

  // ── Derived lookups ──────────────────────────────────────────────────────────
  const subLookup = buildSubLookup(categories);

  // ── Monthly derived data ─────────────────────────────────────────────────────
  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const monthActualIncome = actualIncome.filter(i => {
    const d = new Date(i.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const totalActualIncome = monthActualIncome.reduce((s, i) => s + i.amount, 0);

  const totalSpent = monthExpenses
    .filter(e => !e.isEnvelopTransfer)
    .reduce((s, e) => s + e.amount, 0);

  const recurringThisMonth = expenses.filter(e =>
    e.recurring && recurringActiveForMonth(e, month, year)
  );
  const totalRecurringThisMonth = recurringThisMonth.reduce((s, e) => s + e.amount, 0);

  // ── Add-expense form ─────────────────────────────────────────────────────────
  const EMPTY_FORM = {
    category: "", sub: "", priority: null, amount: "", desc: "",
    date: new Date().toISOString().slice(0,10),
    saveReceipt: false, tags: [], currency: "PLN", foreignAmount: "",
    useVoucher: false, voucherAmount: "", totalAmount: "",
  };
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [fxRate,     setFxRate]     = useState(null);
  const [ocrMode,    setOcrMode]    = useState(false);
  const [ocrLines,   setOcrLines]   = useState([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileRef = useRef();

  function addExpense() {
    if (!form.sub || !form.amount) return;
    const mapped = subLookup[form.sub];
    const hasFx  = form.currency !== "PLN" && form.foreignAmount;
    const fxSuffix = hasFx
      ? ` [${form.foreignAmount} ${form.currency}${fxRate ? ` @ ${fxRate.toFixed(4)}` : ""}]`
      : "";
    const tAmt       = parseFloat(form.amount) || 0;
    const vAmt       = form.useVoucher ? (parseFloat(form.voucherAmount) || 0) : 0;
    const cashAmount = form.useVoucher ? Math.max(tAmt - vAmt, 0) : tAmt;
    setExpenses(prev => [...prev, {
      ...form, id: Date.now(),
      amount:        cashAmount,
      totalAmount:   form.useVoucher ? tAmt : undefined,
      voucherAmount: form.useVoucher ? vAmt : undefined,
      category:      mapped?.category || form.category,
      priority:      mapped?.priority || form.priority,
      author:        "Marcin",
      recurring:     false,
      desc:          (form.desc || "") + fxSuffix,
      currency:      form.currency,
      foreignAmount: form.foreignAmount,
      fxRate,
    }]);
    setForm(EMPTY_FORM);
  }

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

  function addOcrLines() {
    const selected = ocrLines.filter(l => l.selected);
    const newExpenses = selected.map(l => ({
      id: Date.now() + Math.random(),
      date: new Date().toISOString().slice(0,10),
      category: l.category, sub: l.sub,
      amount: l.amount, desc: l.desc,
      author: "Marcin", recurring: false, tags: [],
      saveReceipt: form.saveReceipt,
    }));
    setExpenses(prev => [...prev, ...newExpenses]);
    setOcrLines([]);
    setOcrMode(false);
  }

  // ── Cushion state ────────────────────────────────────────────────────────────
  const [cushionMonths,      setCushionMonths]      = useState(3);
  const [cushionCoverMonths, setCushionCoverMonths] = useState(6);
  const [cushionLevel,       setCushionLevel]       = useState(2);
  const [cushionLossSource,  setCushionLossSource]  = useState("all");

  function calcCushion() {
    const recentMonths = [];
    for (let i = 0; i < cushionMonths; i++) {
      let m = month - i; let y = year;
      if (m < 0) { m += 12; y--; }
      recentMonths.push({ m, y });
    }
    const filtered = expenses.filter(e => {
      const d = new Date(e.date);
      const inPeriod = recentMonths.some(rm => rm.m === d.getMonth() && rm.y === d.getFullYear());
      if (!inPeriod) return false;
      const expTags = (e.tags || []).map(tid => tags.find(t => t.id === tid)).filter(Boolean);
      const effectivePrio = expTags.length > 0
        ? Math.min(...expTags.map(t => t.priority))
        : (subLookup[e.sub]?.priority ?? 4);
      return effectivePrio <= cushionLevel && effectivePrio < 4;
    });
    const relevantCats = [...new Set(filtered.map(e => e.category))];
    const total        = filtered.reduce((s, e) => s + e.amount, 0);
    const monthly      = total / cushionMonths;
    let lostIncome     = totalActualIncome;
    if (cushionLossSource !== "all") {
      const src      = monthActualIncome.find(i => i.source === cushionLossSource);
      lostIncome     = src?.amount || 0;
    }
    const remainingIncome = cushionLossSource === "all" ? 0 : totalActualIncome - lostIncome;
    const monthlyDeficit  = Math.max(monthly - remainingIncome, 0);
    const cushionNeeded   = monthlyDeficit * cushionCoverMonths;
    return { monthly, monthlyDeficit, cushionNeeded, relevantCats };
  }

  // ── Tag filters  ───────────────────────────────────────────────────
  const [activeTagFilter, setActiveTagFilter] = useState(null);
  const [tagBudgets,      setTagBudgets]      = useState({});


  // ── Notification state ───────────────────────────────────────────────────────
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [paidNotifIds, setPaidNotifIds] = useState(new Set());

  // ── Schowek ──────────────────────────────────────────────────────────────────
  const [stash,             setStash]             = useState([]);
  const [savedFromImpulses, setSavedFromImpulses] = useState(0);
  const [stashMoveModal,    setStashMoveModal]    = useState(null);
  const [stashMoveDate,     setStashMoveDate]     = useState(`${year}-${String(month+1).padStart(2,"0")}`);

  // ── GOALS / SINKING FUNDS ────────────────────────────────────────────────────
  const [goals, setGoals] = useState([]);

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
    const remaining = Math.max(goal.targetAmount - saved, 0);
    const mLeft     = monthsUntilGoal(goal.targetMonth, m, y);
    return remaining / Math.max(mLeft, 1);
  }

  function isGoalTargetMonth(goal, m, y) {
    return goal.targetMonth === `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  function isGoalConfirmedThisMonth(goal, m, y) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    return expenses.some(e => e.goalId === goal.id && e.isEnvelopTransfer && e.date.startsWith(key));
  }

  function isGoalSkippedThisMonth(goal, m, y) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    return (goal.skippedMonths || []).includes(key);
  }

  const goalsDeductedThisMonth = (() => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return expenses
      .filter(e => e.isEnvelopTransfer && e.date.startsWith(key))
      .reduce((s, e) => s + e.amount, 0);
  })();

  const totalGoalsSaved = goals
    .filter(g => !g.archived)
    .reduce((s, g) => s + goalSaved(g.id), 0);

  // ── Budget computation ────────────────────────────────────────────────────────
  const currentMonthBudget = computeMonthBudget({
    categories, baseBudget, budgetOverrides, planned, expenses, month, year,
    goals, goalInstallment: goalSuggestedInstallment,
  });
  const budget      = Object.fromEntries(
    Object.entries(currentMonthBudget.byCat).map(([cat, v]) => [cat, v.total])
  );
  const totalBudget = currentMonthBudget.grandTotal;

  // ── Upcoming payments + notifications ────────────────────────────────────────
  const today = new Date(year, month, 3);
  const in7   = new Date(today); in7.setDate(today.getDate() + 7);

  const upcomingPayments = [
    ...planned.filter(p => {
      if (p.done || !p.date) return false;
      const d = new Date(p.date);
      return d >= today && d <= in7;
    }).map(p => ({ type: "planned", item: p, label: p.name, amount: p.amount, date: p.date, uid: `planned-${p.id}` })),
    ...expenses.filter(e => {
      if (!e.recurring) return false;
      const freq = e.frequency || "monthly";
      const day  = e.scheduledDay || 1;
      const targetDate = new Date(year, month, day);
      if (freq === "monthly") return targetDate >= today && targetDate <= in7;
      if (freq === "yearly")  return e.scheduledMonth === month + 1 && targetDate >= today && targetDate <= in7;
      return false;
    }).map(e => ({
      type: "recurring", item: e, label: e.desc || e.sub, amount: e.amount,
      date: `${year}-${String(month+1).padStart(2,"0")}-${String(e.scheduledDay||1).padStart(2,"0")}`,
      uid: `recurring-${e.id}`,
    })),
    ...goals.filter(g => {
      if (g.archived) return false;
      if (isGoalTargetMonth(g, month, year)) return false;
      if (isGoalConfirmedThisMonth(g, month, year)) return false;
      if (isGoalSkippedThisMonth(g, month, year)) return false;
      return today >= new Date(year, month, 10);
    }).map(g => ({
      type: "goal", item: g,
      label: `🎯 ${g.name}`,
      amount: goalSuggestedInstallment(g, month, year),
      date: `${year}-${String(month+1).padStart(2,"0")}-10`,
      uid: `goal-${g.id}`,
    })),
  ].filter(n => !paidNotifIds.has(n.uid));

  function markNotifPaid(notif) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (notif.type === "planned") {
      setPlanned(prev => prev.map(p => p.id === notif.item.id ? { ...p, done: true } : p));
    } else if (notif.type === "goal") {
      const g           = notif.item;
      const currentGoal = goals.find(x => x.id === g.id) || g;
      const key         = `${year}-${String(month + 1).padStart(2, "0")}`;
      const installment = goalSuggestedInstallment(currentGoal, month, year);
      setExpenses(prev => [...prev, {
        id: Date.now(), date: `${key}-10`,
        category: currentGoal.category, sub: currentGoal.sub,
        amount: installment,
        desc: `[Koperta] ${currentGoal.name} – rata ${key}`,
        author: "Marcin", recurring: false, tags: [],
        isEnvelopTransfer: true, goalId: currentGoal.id,
      }]);
    } else {
      setExpenses(prev => [...prev, {
        ...notif.item, id: Date.now(), date: todayStr,
        recurring: false, author: "Marcin",
      }]);
    }
    setPaidNotifIds(prev => new Set([...prev, notif.uid]));
  }

  // ── Filtered expenses ────────────────────────────────────────────────────────
  const filteredExpenses = activeTagFilter
    ? monthExpenses.filter(e => (e.tags || []).includes(activeTagFilter))
    : monthExpenses;

  // ── Expose everything ────────────────────────────────────────────────────────
  const value = {
    panel, setPanel,
    month, setMonth, year, setYear,
    expenses, setExpenses,
    planned, setPlanned,
    actualIncome, setActualIncome,
    monthExpenses, monthActualIncome,
    totalActualIncome, totalSpent,
    filteredExpenses,
    recurringThisMonth, totalRecurringThisMonth,
    budget, totalBudget, currentMonthBudget,
    baseBudget, setBaseBudget,
    budgetOverrides, setBudgetOverrides,
    setMonthOverride, clearMonthOverride,
    categories, setCategories,
    tags, setTags,
    incomeSources, setIncomeSources,
    archivedSubs, setArchivedSubs,
    subLookup,
    form, setForm, fxRate, setFxRate,
    ocrMode, setOcrMode, ocrLines, setOcrLines, ocrLoading, setOcrLoading,
    fileRef, addExpense, simulateOCR, addOcrLines,
    cushionMonths, setCushionMonths,
    cushionCoverMonths, setCushionCoverMonths,
    cushionLevel, setCushionLevel,
    cushionLossSource, setCushionLossSource,
    calcCushion,
    activeTagFilter, setActiveTagFilter,
    tagBudgets, setTagBudgets,
    settings, setSettings,
    notifOpen, setNotifOpen,
    upcomingPayments, markNotifPaid,
    stash, setStash,
    savedFromImpulses, setSavedFromImpulses,
    stashMoveModal, setStashMoveModal,
    stashMoveDate, setStashMoveDate,
    goals, setGoals,
    totalGoalsSaved, goalsDeductedThisMonth,
    goalSaved, goalSuggestedInstallment,
    isGoalTargetMonth, isGoalConfirmedThisMonth,
    isGoalSkippedThisMonth, monthsUntilGoal,
    fmt, MONTHS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}