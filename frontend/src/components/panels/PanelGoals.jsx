// ============================================================
// File: src/components/panels/PanelGoals.jsx
// Sinking funds / goals panel.
// currentSavedAmount DERIVED from expenses (isEnvelopTransfer).
// Installments are dynamic floats editable before confirming.
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { MONTHS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";

function PanelGoals() {
  const {
    goals, setGoals, expenses, setExpenses,
    month, year,
    categories, subLookup, totalGoalsSaved,
    goalSaved, goalSuggestedInstallment,
    isGoalTargetMonth, isGoalConfirmedThisMonth, isGoalSkippedThisMonth,
    monthsUntilGoal,
  } = useAppContext();

  // Use an offset from global month to avoid the "frozen at mount" useState bug.
  // monthOffset=0 always means "current global month".
  const [monthOffset, setMonthOffset] = useState(0);
  const totalMonths = (year * 12 + month) + monthOffset;
  const viewYear    = Math.floor(totalMonths / 12);
  const viewMonth   = totalMonths % 12;
  const currentKey  = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const EMPTY_FORM = { name: "", targetAmount: "", targetMonth: "", category: "Finanse", sub: "Oszczędności krótkofalowe" };
  const [showForm,   setShowForm]   = useState(false);
  const [editGoalId, setEditGoalId] = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [errors,     setErrors]     = useState({});
  const [pendingAmounts, setPendingAmounts] = useState({});

  const activeGoals   = goals.filter(g => !g.archived);
  const archivedGoals = goals.filter(g => g.archived);

  function enrichGoal(g) {
    const key          = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    const isBeforeStart = g.startMonth && key < g.startMonth;
    const saved        = goalSaved(g.id);
    const suggested    = goalSuggestedInstallment(g, viewMonth, viewYear);
    const confirmed    = isGoalConfirmedThisMonth(g, viewMonth, viewYear);
    const skipped      = isGoalSkippedThisMonth(g, viewMonth, viewYear);
    const isTargetM    = isGoalTargetMonth(g, viewMonth, viewYear);
    const isPast       = g.targetMonth < currentKey;
    const mLeft        = monthsUntilGoal(g.targetMonth, viewMonth, viewYear);
    const pct          = g.targetAmount > 0 ? Math.min((saved / g.targetAmount) * 100, 100) : 0;
    const pending      = pendingAmounts[g.id] != null ? pendingAmounts[g.id] : parseFloat(suggested.toFixed(2));
    return { ...g, saved, suggested, confirmed, skipped, isTargetM, isPast, mLeft, pct, pending, isBeforeStart };
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Podaj nazwę celu";
    if (!form.targetAmount || parseFloat(form.targetAmount) <= 0) e.targetAmount = "Podaj kwotę docelową";
    if (!form.targetMonth) e.targetMonth = "Wybierz miesiąc docelowy";
    setErrors(e); return Object.keys(e).length === 0;
  }

  function saveGoal() {
    if (!validate()) return;
    if (editGoalId) {
      setGoals(prev => prev.map(g => g.id === editGoalId
        ? { ...g, name: form.name, targetAmount: parseFloat(form.targetAmount),
            targetMonth: form.targetMonth, category: form.category, sub: form.sub }
        : g));
    } else {
      setGoals(prev => [...prev, {
        id: Date.now(), name: form.name, targetAmount: parseFloat(form.targetAmount),
        targetMonth: form.targetMonth, category: form.category, sub: form.sub,
        archived: false, skippedMonths: [],
        startMonth: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`,
      }]);
    }
    setForm(EMPTY_FORM); setShowForm(false); setEditGoalId(null); setErrors({});
  }

  function startEdit(g) {
    setForm({ name: g.name, targetAmount: String(g.targetAmount),
      targetMonth: g.targetMonth, category: g.category, sub: g.sub });
    setEditGoalId(g.id); setShowForm(true); setErrors({});
  }

  function confirmTransfer(g, amount) {
    setExpenses(prev => [...prev, {
      id: Date.now(), date: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-10`,
      category: g.category, sub: g.sub, amount: parseFloat(amount),
      desc: `[Koperta] ${g.name} – rata ${currentKey}`,
      author: "Marcin", recurring: false, tags: [],
      isEnvelopTransfer: true, goalId: g.id,
    }]);
    setPendingAmounts(prev => { const n = {...prev}; delete n[g.id]; return n; });
  }

  function skipMonth(g) {
    setGoals(prev => prev.map(x => x.id === g.id
      ? { ...x, skippedMonths: [...(x.skippedMonths || []), currentKey] }
      : x));
  }

  function realizePurchase(g) {
    const saved = goalSaved(g.id);
    setExpenses(prev => [...prev, {
      id: Date.now(), date: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-15`,
      category: g.category, sub: g.sub, amount: g.targetAmount,
      desc: `[Koperta – finał] ${g.name}`,
      author: "Marcin", recurring: false, tags: [],
      isSinkingFundFinal: true, isEnvelopTransfer: false,
      sinkingFundPaidBefore: saved, goalId: g.id,
    }]);
    setGoals(prev => prev.map(x => x.id === g.id
      ? { ...x, archived: true, targetMonth: currentKey } : x));
  }

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <div>
          <div style={s.sectionTitle}>🎯 Koperty / Cele</div>
          <div style={s.sectionSub}>Odkładaj małe raty zamiast jednorazowo obciążać budżet</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 8, padding: "3px 8px" }}>
            <button style={s.monthBtn} onClick={() => {
                // Find the earliest startMonth across all active goals
                const minKey = goals.filter(g=>!g.archived&&g.startMonth).map(g=>g.startMonth).sort()[0];
                const prevKey = viewMonth === 0
                  ? `${viewYear-1}-12`
                  : `${viewYear}-${String(viewMonth).padStart(2,"0")}`;
                if (minKey && prevKey < minKey) return; // block going before first goal
                if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1);
              }}>‹</button>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13, minWidth: 90, textAlign: "center" }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button style={s.monthBtn} onClick={() => { if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }}>›</button>
          </div>
          {totalGoalsSaved > 0 && (
            <div style={{ background: "#10b98122", border: "1px solid #10b98144", borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
              <div style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>{fmt(totalGoalsSaved)}</div>
              <div style={{ color: "#475569", fontSize: 10 }}>odłożone w kopertach</div>
            </div>
          )}
          <button onClick={() => { setShowForm(v => !v); setEditGoalId(null); setForm(EMPTY_FORM); setErrors({}); }}
            style={{ ...s.btn(showForm && !editGoalId ? "#475569" : "#10b981"), width: "auto", padding: "10px 18px", marginTop: 0 }}>
            {showForm && !editGoalId ? "✕ Anuluj" : "➕ Nowy cel"}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...s.card, border: "1px solid #10b98133", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: "#10b981", fontSize: 13, marginBottom: 14 }}>
            {editGoalId ? "✏️ Edytuj cel" : "➕ Nowy cel oszczędnościowy"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Nazwa celu *</label>
              <input style={{ ...s.input, borderColor: errors.name ? "#ef444466" : "#334155" }}
                placeholder="np. Ubezpieczenie auta" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))} />
              {errors.name && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 3 }}>⚠️ {errors.name}</div>}
            </div>
            <div>
              <label style={s.label}>Kwota docelowa (PLN) *</label>
              <BudgetInput style={{ ...s.input, borderColor: errors.targetAmount ? "#ef444466" : "#334155" }}
                value={parseFloat(form.targetAmount)||0}
                onChange={v => setForm(f => ({...f, targetAmount: String(v)}))} />
              {errors.targetAmount && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 3 }}>⚠️ {errors.targetAmount}</div>}
            </div>
            <div>
              <label style={s.label}>Miesiąc docelowy *</label>
              <input style={{ ...s.input, borderColor: errors.targetMonth ? "#ef444466" : "#334155" }}
                type="month" value={form.targetMonth}
                onChange={e => setForm(f => ({...f, targetMonth: e.target.value}))} />
              {errors.targetMonth && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 3 }}>⚠️ {errors.targetMonth}</div>}
            </div>
            <div>
              <label style={s.label}>Typ wydatku (docelowy)</label>
              <select style={s.select} value={form.sub}
                onChange={e => { const sub = e.target.value; const m2 = subLookup[sub]; setForm(f => ({...f, sub, category: m2?.category || f.category})); }}>
                {Object.entries(categories).map(([cat, {icon, sub: subs}]) => (
                  <optgroup key={cat} label={`${icon} ${cat}`}>
                    {Object.keys(subs).map(sn => <option key={sn} value={sn}>{sn}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          {form.targetAmount && form.targetMonth && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b", fontSize: 12 }}>Sugerowana rata od teraz:</span>
                <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>
                  {fmt(goalSuggestedInstallment({ id: editGoalId || -1, targetAmount: parseFloat(form.targetAmount)||0, targetMonth: form.targetMonth }, viewMonth, viewYear))}
                </span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveGoal} style={{ ...s.btn(), width: "auto", padding: "10px 20px", marginTop: 0 }}>
              {editGoalId ? "✅ Zapisz zmiany" : "✅ Dodaj cel"}
            </button>
            <button onClick={() => { setShowForm(false); setEditGoalId(null); setForm(EMPTY_FORM); setErrors({}); }}
              style={{ ...s.btn("#475569"), width: "auto", padding: "10px 16px", marginTop: 0 }}>Anuluj</button>
          </div>
        </div>
      )}

      {activeGoals.length === 0 && !showForm && (
        <div style={{ ...s.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ color: "#475569", fontSize: 14 }}>Brak aktywnych celów.</div>
        </div>
      )}

      {activeGoals.map(g => {
        const eg = enrichGoal(g);
        const barColor = eg.pct >= 100 ? "#10b981" : eg.pct >= 60 ? "#3b82f6" : eg.pct >= 30 ? "#eab308" : "#f97316";
        return (
          <div key={g.id} style={{ ...s.card, border: `1px solid ${eg.isTargetM ? "#10b98155" : "#1e293b"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{g.name}</span>
                  {eg.isTargetM && <span style={{ background: "#10b98122", color: "#10b981", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>🎯 TEN MIESIĄC!</span>}
                  {eg.isPast && !eg.isTargetM && <span style={{ background: "#eab30822", color: "#eab308", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>⏰ Termin minął</span>}
                </div>
                <div style={{ color: "#475569", fontSize: 11, marginTop: 3 }}>
                  {categories[g.category]?.icon} {g.sub} · cel: {g.targetMonth} · {eg.isPast ? "termin minął" : `${eg.mLeft} mies. do celu`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => startEdit(g)} style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>✏️</button>
                <button onClick={() => setGoals(prev => prev.map(x => x.id === g.id ? {...x, archived: true} : x))} style={{ background: "#ef444411", border: "1px solid #ef444433", color: "#ef4444", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#64748b", fontSize: 12 }}>Zebrano: <strong style={{ color: "#e2e8f0" }}>{fmt(eg.saved)}</strong></span>
                <span style={{ color: "#64748b", fontSize: 12 }}>Cel: <strong style={{ color: "#e2e8f0" }}>{fmt(g.targetAmount)}</strong></span>
              </div>
              <div style={{ height: 10, background: "#0d1424", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${eg.pct}%`, background: barColor, borderRadius: 99, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: barColor, fontWeight: 700, fontSize: 12 }}>{eg.pct.toFixed(0)}% zebrane</span>
                <span style={{ color: "#475569", fontSize: 11 }}>brakuje {fmt(Math.max(g.targetAmount - eg.saved, 0))}</span>
              </div>
            </div>
            <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
                {eg.confirmed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 18 }}>✅</span>
                    <div>
                      <div style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>Przelew {MONTHS[viewMonth]} potwierdzony</div>
                      <div style={{ color: "#475569", fontSize: 11 }}>
                        {fmt(expenses.filter(e => e.goalId === g.id && e.isEnvelopTransfer && e.date.startsWith(currentKey)).reduce((s,e) => s+e.amount, 0))} odłożone
                      </div>
                    </div>
                  </div>
                ) : eg.skipped ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, color: "#475569" }}>
                    <span>⏭️</span>
                    <div style={{ fontSize: 12 }}>Pominięto {MONTHS[viewMonth]} – raty wzrosną w kolejnych miesiącach</div>
                  </div>
                ) : eg.isBeforeStart ? (
                  <div style={{ color: "#475569", fontSize: 12, flex: 1 }}>📅 Cel nie istniał jeszcze w tym miesiącu (dodano od {g.startMonth})</div>
                ) : !eg.isTargetM ? (
                  <div style={{ background: "#eab30811", border: "1px solid #eab30844", borderRadius: 10, padding: "10px 12px", flex: 1 }}>
                    <div style={{ color: "#eab308", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>⏳ Oczekujący przelew – {MONTHS[viewMonth]}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...s.label, fontSize: 9, color: "#64748b" }}>Kwota raty (edytowalna)</label>
                        <input type="number" min="0" step="0.01"
                          style={{ ...s.input, color: "#eab308", fontWeight: 700, fontSize: 15 }}
                          value={eg.pending}
                          onChange={e => setPendingAmounts(prev => ({...prev, [g.id]: parseFloat(e.target.value)||0}))} />
                        <div style={{ color: "#475569", fontSize: 10, marginTop: 3 }}>sugerowana: {fmt(eg.suggested)}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={() => confirmTransfer(g, eg.pending)}
                          style={{ background: "#eab308", color: "#0a0f1e", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                          💸 Potwierdź
                        </button>
                        <button onClick={() => skipMonth(g)}
                          style={{ background: "#1e293b", border: "1px solid #334155", color: "#64748b", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                          ⏭️ Odrzuć ratę
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <button onClick={() => realizePurchase(g)}
                  style={{ background: eg.isTargetM ? "#10b981" : "#1e293b",
                    border: `1px solid ${eg.isTargetM ? "#10b98188" : "#334155"}`,
                    color: eg.isTargetM ? "#0a0f1e" : "#94a3b8",
                    borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", alignSelf: "center" }}>
                  🎯 Zrealizuj zakup{!eg.isTargetM && <span style={{ color: "#475569", fontWeight: 400, marginLeft: 6, fontSize: 10 }}>wcześniej</span>}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {archivedGoals.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ color: "#334155", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>📦 Archiwum ({archivedGoals.length})</div>
          {archivedGoals.map(g => (
            <div key={g.id} style={{ ...s.card, opacity: 0.45, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13 }}>{g.name}</span>
                <span style={{ color: "#475569", fontSize: 11, marginLeft: 10 }}>{fmt(goalSaved(g.id))} / {fmt(g.targetAmount)} · {g.targetMonth}</span>
              </div>
              <button onClick={() => setGoals(prev => prev.map(x => x.id === g.id ? {...x, archived: false} : x))}
                style={{ ...s.btnSm("#475569"), fontSize: 11 }}>↩ Przywróć</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PanelGoals;