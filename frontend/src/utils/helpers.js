// ============================================================
// File: src/utils/helpers.js
// Pure utility functions: formatting, date helpers, budget math
// ============================================================

// Format a number as PLN currency string
export const fmt = (n) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n || 0);

// Parse a decimal string that may use comma or dot as separator
export const parseDecimal = (v) => {
  if (v === "" || v === null || v === undefined) return "";
  return parseFloat(String(v).replace(",", ".")) || 0;
};

// Display number with Polish decimal separator (comma)
export const fmtNum = (v) => (v === "" ? "" : String(v).replace(".", ","));


export const fmtAmount = (n, currency = "PLN") =>
  currency === "PLN"
    ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n || 0)
    : new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    
// Build a flat sub-category lookup: subName → { categoryId, categoryName, priority }
// Works with new array structure
export function buildSubLookup(categories) {
  const lookup = {};
  if (!Array.isArray(categories)) return lookup;
  categories.forEach(cat => {
    (cat.sub || []).forEach(sub => {
      lookup[sub.name] = { 
        categoryId:   cat.id,
        categoryName: cat.name,
        category:     cat.name, // backwards compat
        priority:     sub.priority 
      };
    });
  });
  return lookup;
}

// Build sorted flat expense-type list from categories
export function buildExpenseTypes(categories) {
  if (!Array.isArray(categories)) return [];
  return categories
    .flatMap(cat =>
      (cat.sub || []).map(sub => ({ 
        label:    sub.name, 
        category: cat.name, 
        categoryId: cat.id,
        icon:     cat.icon, 
        priority: sub.priority 
      }))
    )
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));
}

// Round a number up to the nearest multiple
export function roundToNearest(val, nearest) {
  return Math.ceil(val / nearest) * nearest;
}

// Check if a recurring expense is active for the given month/year.
export function recurringActiveForMonth(e, m, y) {
  const currentKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  if (e.startMonth && e.startMonth > currentKey) return false;
  if (e.endMonth   && e.endMonth   < currentKey) return false;

  const freq = e.frequency || "monthly";
  if (freq === "monthly")   return true;
  if (freq === "quarterly") return m % 3 === 0;
  if (freq === "yearly")    return e.scheduledMonth ? e.scheduledMonth === m + 1 : m === 0;
  if (freq === "custom")    return (e.activeMonths || []).includes(m);
  return false;
}

// Compute the full budget breakdown for a given month.
export function computeMonthBudget({ categories, baseBudget, budgetOverrides, planned, expenses, month, year, goals = [], goalInstallment = null }) {
  const subLookup = buildSubLookup(categories);

  const getStaticLimit = (catName, m, y) => {
    const key = `${y}-${m}`;
    if (budgetOverrides[key]?.[catName] !== undefined) return budgetOverrides[key][catName];
    return baseBudget[catName] || 0;
  };

  const mStart = new Date(year, month, 1);
  const mEnd   = new Date(year, month + 1, 1);
  const plannedM = planned.filter(p => {
    if (!p.date || p.done) return false;
    if (p.linkedToGoal) return false;
    const d = new Date(p.date);
    return d >= mStart && d < mEnd;
  });
  const plannedByCatM = {};
  plannedM.forEach(p => { plannedByCatM[p.category] = (plannedByCatM[p.category] || 0) + p.amount; });

  const recurringM = expenses.filter(e => e.recurring && recurringActiveForMonth(e, month, year));
  const recurringByCatM = {};
  recurringM.forEach(e => { recurringByCatM[e.category] = (recurringByCatM[e.category] || 0) + e.amount; });

  const goalsForMonth = goalInstallment
    ? goals.filter(g => !g.archived).map(g => ({ ...g, installment: goalInstallment(g, month, year) }))
    : [];
  const goalsByCatM = {};
  goalsForMonth.forEach(g => {
    goalsByCatM[g.category] = (goalsByCatM[g.category] || 0) + g.installment;
  });

  const byCat = {};
  let grandTotal = 0;

  // Iterate over array instead of object keys
  (Array.isArray(categories) ? categories : []).forEach(cat => {
    const catName = cat.name;
    const staticLimit = getStaticLimit(catName, month, year);
    const pVal = plannedByCatM[catName] || 0;
    const rVal = recurringByCatM[catName] || 0;
    const gVal = goalsByCatM[catName] || 0;
    const total = staticLimit + pVal + rVal + gVal;
    byCat[catName] = {
      staticLimit, planned: pVal, recurring: rVal, goals: gVal, total,
      plannedItems:   plannedM.filter(p => p.category === catName),
      recurringItems: recurringM.filter(e => e.category === catName),
      goalsItems:     goalsForMonth.filter(g => g.category === catName),
    };
    grandTotal += total;
  });
  

  return { byCat, grandTotal, plannedM, recurringM, goalsForMonth };
}
// Returns "YYYY-MM" for the given month (0-indexed) and year
export function formatBudgetMonth(month, year) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
 
// Returns "YYYY-MM" for next calendar month relative to today
export function nextCalendarMonth() {
  const now = new Date();
  const m   = now.getMonth() + 2; // 0-indexed + 1 for next month
  const y   = now.getFullYear();
  if (m > 12) return `${y + 1}-01`;
  return `${y}-${String(m).padStart(2, "0")}`;
}
 
// Returns "YYYY-MM" for current calendar month
export function currentCalendarMonth() {
  const now = new Date();
  return formatBudgetMonth(now.getMonth(), now.getFullYear());
}
 
// Returns true if budgetMonth a is strictly after b ("YYYY-MM" strings)
export function budgetMonthAfter(a, b) {
  return a > b;
}

/**
 * Returns the active limit for a given month from a limit document.
 * override → exact month match only
 * base     → highest date <= month
 */
export function getActiveLimit(doc, month) {
  if (!doc?.limits?.length) return null;

  // Override has priority — exact month only
  const override = doc.limits.find(l => l.type === "override" && l.date === month);
  if (override) return { amount: override.amount, type: "override", date: override.date };

  // Base — highest date <= month
  const bases = doc.limits
    .filter(l => l.type === "base" && l.date <= month)
    .sort((a, b) => b.date.localeCompare(a.date));

  return bases.length
    ? { amount: bases[0].amount, type: "base", date: bases[0].date }
    : null;
}

// Safety rounding to 2 decimal places
// Standard Math.round(x * 100) / 100 contains IEEE 754 errors for some amounts (np. 1.005, 2.675). Number.EPSILON solves that
export const round2 = (n) => {
  if (typeof n !== "number" || isNaN(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

// Shared style for quick-action pills (vouchers, filters, …).
export function pillStyle(active) {
  return {
    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border:     `1px solid ${active ? "#10b981" : "#1e293b"}`,
    background: active ? "#10b98122" : "transparent",
    color:      active ? "#10b981"   : "#94a3b8",
  };
}