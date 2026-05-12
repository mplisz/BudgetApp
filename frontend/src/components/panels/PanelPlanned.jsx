// ============================================================
// File: src/components/panels/PanelPlanned.jsx
// Planned expenses panel
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS,  PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle , TagChip} from "../ui";

function PanelPlanned() {
  const ctx = useAppContext();
  const { expenses,
    setExpenses,
    planned,
    setPlanned,
    actualIncome,
    setActualIncome,
    monthExpenses,
    monthActualIncome,
    totalActualIncome,
    totalSpent,
    filteredExpenses,
    recurringThisMonth,
    totalRecurringThisMonth,
    budget,
    totalBudget,
    currentMonthBudget,
    baseBudget,
    setBaseBudget,
    budgetOverrides,
    setBudgetOverrides,
    setMonthOverride,
    clearMonthOverride,
    categories,
    setCategories,
    tags,
    setTags,
    incomeSources,
    setIncomeSources,
    archivedSubs,
    setArchivedSubs,
    subLookup,
    fxRate,
    setFxRate,
    ocrMode,
    setOcrMode,
    ocrLines,
    setOcrLines,
    ocrLoading,
    setOcrLoading,
    fileRef,
    addExpense,
    simulateOCR,
    addOcrLines,
    cushionMonths,
    setCushionMonths,
    cushionCoverMonths,
    setCushionCoverMonths,
    cushionLevel,
    setCushionLevel,
    cushionLossSource,
    setCushionLossSource,
    calcCushion,
    activeTagFilter,
    setActiveTagFilter,
    tagBudgets,
    setTagBudgets,
    retirementMin,
    setRetirementMin,
    insuranceMax,
    setInsuranceMax,
    warnThreshold,
    setWarnThreshold,
    notifOpen,
    setNotifOpen,
    upcomingPayments,
    markNotifPaid,
    stash,
    setStash,
    savedFromImpulses,
    setSavedFromImpulses,
    stashMoveModal,
    setStashMoveModal,
    stashMoveDate,
    setStashMoveDate,
    panel,
    setPanel,
    month,
    goals,
    setGoals,
    setMonth,
    year,
    setYear,
    fmt,
    MONTHS
  } = ctx;


  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({ name: "", link: "", amount: "", category: "", sub: "", date: "", note: "", createGoal: false });
  const [horizonMonths, setHorizonMonths] = useState(3);
  const [onlyPending, setOnlyPending] = useState(true);
  const [editingPlannedId, setEditingPlannedId] = useState(null);
  const [editPlannedForm, setEditPlannedForm] = useState({});

  function add() {
    const newErrors = {};
    if (!form.name?.trim()) newErrors.name = "Podaj nazwę";
    if (!form.amount || parseFloat(form.amount) <= 0) newErrors.amount = "Podaj kwotę";
    if (!form.date) newErrors.date = "Wybierz datę planowania";
    if (!form.sub) newErrors.sub = "Wybierz typ wydatku";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    const amount = parseFloat(form.amount);
    if (form.createGoal) {
      const targetMonth = form.date.slice(0, 7);
      const mapped = subLookup[form.sub];
      // Only create goal – do NOT add to planned list
      setGoals(prev => [...prev, {
        id: Date.now(), name: form.name, targetAmount: amount,
        targetMonth, currentSavedAmount: 0,
        monthlyInstallment: null, monthlyOverrides: {}, confirmedMonths: [],
        category: mapped?.category || form.category, sub: form.sub,
        archived: false, fromPlanned: true,
      }]);
    } else {
      setPlanned(prev => [...prev, { ...form, id: Date.now(), amount, done: false }]);
    }
    setForm({ name: "", link: "", amount: "", category: "", sub: "", date: "", note: "", createGoal: false });
  }

  const now = new Date(year, month, 1);
  const horizonDate = new Date(year, month + horizonMonths, 1);

  const filtered = planned.filter(p => {
    const d = p.date ? new Date(p.date) : null;
    const inHorizon = !d || (d >= now && d < horizonDate);
    const pendingOk = !onlyPending || !p.done;
    return inHorizon && pendingOk;
  }).sort((a, b) => new Date(a.date || "9999") - new Date(b.date || "9999"));

  const totalFiltered = filtered.reduce((s, p) => s + p.amount, 0);

  const horizonBtns = [
    { label: "Ten miesiąc", val: 1 },
    { label: "3 mies.", val: 3 },
    { label: "6 mies.", val: 6 },
    { label: "12 mies.", val: 12 },
  ];

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>Planowane wydatki</div>
        <div style={s.monthSel}>
          <button style={s.monthBtn} onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}>‹</button>
          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{MONTHS[month]} {year}</span>
          <button style={s.monthBtn} onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}>›</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
        {/* Left: form */}
        <div style={s.card}>
          <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 14, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>➕ Nowy plan</div>
          <label style={s.label}>Nazwa *</label>
          <input style={{ ...s.input, borderColor: errors.name ? "#ef444466" : "#334155" }}
            placeholder="np. Nowy laptop" value={form.name} onChange={e => setForm(f=>({...f, name: e.target.value}))} />

          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Kwota (PLN) *</label>
            <BudgetInput style={{ ...s.input, borderColor: errors.amount ? "#ef444466" : "#334155" }}
              value={parseFloat(form.amount)||0}
              onChange={v => setForm(f=>({...f, amount: v > 0 ? String(v) : ""}))}
              placeholder="0,00" />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Data planowania *</label>
            <input style={{ ...s.input, borderColor: errors.date ? "#ef444466" : "#334155" }}
              type="month" value={form.date ? form.date.slice(0,7) : ""} onChange={e => setForm(f=>({...f, date: e.target.value + "-01"}))} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Typ wydatku *</label>
            <select style={s.select} value={form.sub} onChange={e => {
              const sub = e.target.value;
              const mapped = subLookup[sub];
              setForm(f=>({...f, sub, category: mapped?.category || f.category}));
            }}>
              <option value="">Wybierz typ wydatku...</option>
              {Object.entries(categories).map(([cat, { icon, sub }]) => (
                <optgroup key={cat} label={`${icon} ${cat}`}>
                  {Object.keys(sub).map(subName => (
                    <option key={subName} value={subName}>{subName}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {form.category && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#475569" }}>
                  {categories[form.category]?.icon} {form.category}
                </span>
                {subLookup[form.sub]?.priority && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_LABELS[subLookup[form.sub].priority]?.color,
                    background: PRIORITY_LABELS[subLookup[form.sub].priority]?.color + "22", borderRadius: 5, padding: "2px 7px" }}>
                    Prio {subLookup[form.sub].priority} – {PRIORITY_LABELS[subLookup[form.sub].priority]?.label}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Link (opcjonalnie)</label>
            <input style={s.input} placeholder="https://..." value={form.link} onChange={e => setForm(f=>({...f, link: e.target.value}))} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Notatka</label>
            <input style={s.input} placeholder="Dodatkowe info..." value={form.note} onChange={e => setForm(f=>({...f, note: e.target.value}))} />
          </div>
          {Object.keys(errors).length > 0 && (
            <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8, padding: "8px 12px", marginTop: 10, fontSize: 12, color: "#ef4444" }}>
              {Object.values(errors).map((e, i) => <div key={i}>⚠️ {e}</div>)}
            </div>
          )}
          <button onClick={add} style={s.btn()}>➕ Dodaj planowany wydatek</button>
        </div>

        {/* Right: list with filters */}
        <div style={s.card}>
          {/* Filters row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {horizonBtns.map(b => (
                <button key={b.val} onClick={() => setHorizonMonths(b.val)}
                  style={{ padding: "5px 10px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: horizonMonths === b.val ? "#10b981" : "#1e293b",
                    color: horizonMonths === b.val ? "#fff" : "#64748b" }}>
                  {b.label}
                </button>
              ))}
            </div>
            <button onClick={() => setOnlyPending(v => !v)}
              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${onlyPending ? "#10b981" : "#334155"}`, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: onlyPending ? "#10b98122" : "transparent",
                color: onlyPending ? "#10b981" : "#64748b", marginLeft: "auto" }}>
              {onlyPending ? "⏳ Niezrealizowane" : "📋 Wszystkie"}
            </button>
          </div>

          {/* Summary */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, padding: "8px 12px", background: "#1e293b", borderRadius: 8 }}>
            <span style={{ color: "#64748b", fontSize: 12 }}>{filtered.length} pozycji</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>{fmt(totalFiltered)}</span>
          </div>

          {/* List */}
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ color: "#475569", textAlign: "center", padding: 32, fontSize: 13 }}>Brak planów w wybranym okresie</div>
            )}
            {filtered.map(p => (
              <div key={p.id} style={{ ...s.expenseRow, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: p.done ? "#475569" : "#e2e8f0", textDecoration: p.done ? "line-through" : "none" }}>{p.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {p.category && <TagChip>{categories[p.category]?.icon} {p.category}</TagChip>}
                    {p.date && <TagChip>📅 {new Date(p.date).toLocaleDateString("pl-PL", {month:"short", year:"numeric"})}</TagChip>}
                  </div>
                  {p.note && <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{p.note}</div>}
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", fontSize: 11 }}>🔗 Link</a>}
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, marginLeft: 8 }}>
                  <div style={s.amount(p.done ? "#475569" : undefined)}>{fmt(p.amount)}</div>
                  <button onClick={() => setPlanned(prev => prev.map(x => x.id === p.id ? {...x, done: !x.done} : x))}
                    style={{ ...s.btnSm(p.done ? "#475569" : "#10b981"), fontSize: 10, padding: "4px 8px" }}>
                    {p.done ? "↩ Cofnij" : "✅ Załatwione"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

}

export default PanelPlanned;