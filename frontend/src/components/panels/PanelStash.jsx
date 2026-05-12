// ============================================================
// File: src/components/panels/PanelStash.jsx
// Impulse buy blocker / stash panel
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS,  PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle } from "../ui";

function PanelStash() {
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
    setMonth,
    year,
    setYear,
    fmt,
    MONTHS
  } = ctx;


  const [form, setForm] = useState({ name: "", amount: "", link: "", note: "" });

  function addToStash() {
    if (!form.name.trim()) return;
    setStash(prev => [...prev, { ...form, id: Date.now(), amount: parseFloat(form.amount) || 0 }]);
    setForm({ amount: "", link: "", note: "" });
  }

  function movePlanned(item) {
    setStashMoveModal(item);
    setStashMoveDate(`${year}-${String(month+2).padStart(2,"0")}`);
  }

  function confirmMove() {
    if (!stashMoveModal) return;
    setPlanned(prev => [...prev, {
      id: Date.now(), name: stashMoveModal.name,
      amount: stashMoveModal.amount, link: stashMoveModal.link || "",
      note: stashMoveModal.note || "", date: stashMoveDate + "-01",
      category: "", sub: "", done: false,
    }]);
    setStash(prev => prev.filter(i => i.id !== stashMoveModal.id));
    setStashMoveModal(null);
  }

  function dismiss(item) {
    setSavedFromImpulses(v => v + (item.amount || 0));
    setStash(prev => prev.filter(i => i.id !== item.id));
  }

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>🗄️ Schowek</div>
        <div style={s.sectionSub}>Impulse Buy Blocker – pomysły na zakupy bez konkretnej daty</div>
      </div>

      {/* Saved counter */}
      {savedFromImpulses > 0 && (
        <div style={{ background: "linear-gradient(135deg, #10b98122, #05966922)", border: "1px solid #10b98144", borderRadius: 14, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🎉</span>
          <div>
            <div style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>Kasa uratowana przed impulsami!</div>
            <div style={{ color: "#10b981", fontSize: 22, fontWeight: 800 }}>{fmt(savedFromImpulses)}</div>
            <div style={{ color: "#475569", fontSize: 12 }}>zamiast kupować, odpuściłeś – brawo!</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
        {/* Form */}
        <div style={s.card}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>➕ Nowy pomysł</div>
          <label style={s.label}>Nazwa</label>
          <input style={s.input} placeholder="np. Nowe słuchawki..." value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} />
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Szacunkowa kwota</label>
            <input style={s.input} type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Link (opcjonalnie)</label>
            <input style={s.input} placeholder="https://..." value={form.link} onChange={e => setForm(f=>({...f,link:e.target.value}))} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={s.label}>Notatka</label>
            <input style={s.input} placeholder="Czemu chcę to kupić?" value={form.note} onChange={e => setForm(f=>({...f,note:e.target.value}))} />
          </div>
          <button onClick={addToStash} style={s.btn()}>➕ Dodaj do schowka</button>
        </div>

        {/* List */}
        <div>
          {stash.length === 0 && (
            <div style={{ ...s.card, textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ color: "#475569", fontSize: 14 }}>Schowek pusty – żadnych impulsów!</div>
              {savedFromImpulses > 0 && <div style={{ color: "#10b981", fontWeight: 700, marginTop: 8 }}>Zaoszczędziłeś już {fmt(savedFromImpulses)} 💪</div>}
            </div>
          )}
          {stash.map(item => (
            <div key={item.id} style={{ ...s.card, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{item.name}</div>
                  {item.note && <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>💭 {item.note}</div>}
                  {item.link && <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", fontSize: 12 }}>🔗 Link</a>}
                </div>
                <div style={{ color: "#10b981", fontWeight: 800, fontSize: 18, marginLeft: 16 }}>
                  {item.amount > 0 ? fmt(item.amount) : "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => movePlanned(item)}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #10b98144", background: "#10b98111", color: "#10b981", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                  ✅ Przenieś do planowanych
                </button>
                <button onClick={() => dismiss(item)}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ef444444", background: "#ef444411", color: "#ef4444", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                  🗑️ Odpuść (zapisz kwotę)
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Move to planned modal */}
      {stashMoveModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setStashMoveModal(null)}>
          <div style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16, padding: 24, width: 340 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 16, marginBottom: 6 }}>📋 Przenieś do planowanych</div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>{stashMoveModal.name}</div>
            <label style={s.label}>Kiedy planujesz zakup?</label>
            <input style={s.input} type="month" value={stashMoveDate}
              onChange={e => setStashMoveDate(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={confirmMove} style={{ ...s.btn(), marginTop: 0 }}>✅ Przenieś</button>
              <button onClick={() => setStashMoveModal(null)} style={{ ...s.btn("#475569"), marginTop: 0 }}>Anuluj</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}

export default PanelStash;