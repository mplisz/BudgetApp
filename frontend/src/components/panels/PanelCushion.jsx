// ============================================================
// File: src/components/panels/PanelCushion.jsx
// Financial cushion calculator
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS, PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle } from "../ui";

function PanelCushion() {
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
    form,
    setForm,
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


  const { monthly, monthlyDeficit, cushionNeeded, relevantCats } = calcCushion();

  function roundToNearest(val, nearest) {
    return Math.ceil(val / nearest) * nearest;
  }

  const cushionRounded = roundToNearest(cushionNeeded, 500);
  const monthlyRounded = roundToNearest(monthly, 100);
  const deficitRounded = roundToNearest(monthlyDeficit, 100);

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>Poduszka finansowa</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Left: Analiza */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={s.card}>
            <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 12, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>⚙️ Analiza</div>

            <label style={s.label}>Okres analizy (dane historyczne)</label>
            <select style={s.select} value={cushionMonths} onChange={e => setCushionMonths(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,9,12].map(m => <option key={m} value={m}>{m} {m===1?"miesiąc":m<5?"miesiące":"miesięcy"} wstecz</option>)}
            </select>

            <div style={{ marginTop: 14 }}>
              <label style={s.label}>Na jak długo ma starczyć poduszka?</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {[3,6,9,12,18,24].map(m => (
                  <button key={m} onClick={() => setCushionCoverMonths(m)}
                    style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${cushionCoverMonths===m ? "#10b981" : "#334155"}`,
                      background: cushionCoverMonths===m ? "#10b98122" : "transparent",
                      color: cushionCoverMonths===m ? "#10b981" : "#64748b",
                      fontWeight: cushionCoverMonths===m ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                    {m} mies.
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={s.label}>Poziom życia po utracie dochodu</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {[1,2,3].map(p => (
                  <div key={p} onClick={() => setCushionLevel(p)}
                    style={{ cursor: "pointer", borderRadius: 10, padding: "10px 14px", border: `2px solid ${cushionLevel===p ? PRIORITY_LABELS[p].color : "#1e293b"}`,
                      background: cushionLevel===p ? PRIORITY_LABELS[p].color + "11" : "transparent", transition: "all 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: PRIORITY_LABELS[p].color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13 }}>Priorytet {p} – {PRIORITY_LABELS[p].label}</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>{PRIORITY_LABELS[p].desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={s.label}>Symulacja utraty dochodu</label>
              <select style={s.select} value={cushionLossSource} onChange={e => setCushionLossSource(e.target.value)}>
                <option value="all">Utrata wszystkich dochodów</option>
                <option value="Wynagrodzenie - Marcin">Utrata: Wynagrodzenie - Marcin</option>
                <option value="Wynagrodzenie - Monika">Utrata: Wynagrodzenie - Monika</option>
                {actualIncome
                  .filter(i => i.source !== "Wynagrodzenie - Marcin" && i.source !== "Wynagrodzenie - Monika")
                  .map(i => <option key={i.source} value={i.source}>Utrata: {i.source}</option>)}
              </select>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 10, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>📋 Uwzględnione typy wydatków (P1–P{cushionLevel})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(categories).map(([cat, { icon, sub }]) => {
                const matchingSubs = Object.entries(sub).filter(([, prio]) => prio <= cushionLevel && prio < 4);
                if (matchingSubs.length === 0) return null;
                return (
                  <div key={cat}>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>{icon} {cat}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {matchingSubs.map(([subName, prio]) => (
                        <span key={subName} style={{ background: PRIORITY_LABELS[prio].color + "22", color: PRIORITY_LABELS[prio].color, borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>
                          {subName}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Wyniki */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...s.card, border: "2px solid #10b98144" }}>
            <div style={{ fontWeight: 700, color: "#10b981", fontSize: 13, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.5px" }}>📊 Wyniki kalkulacji</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, fontSize: 20 }}>~{fmt(monthlyRounded)}</div>
                <div style={s.statLab}>Śr. wydatki/mies.</div>
              </div>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, fontSize: 20, color: monthlyDeficit > 0 ? "#ef4444" : "#10b981" }}>~{fmt(deficitRounded)}</div>
                <div style={s.statLab}>Mies. deficyt</div>
              </div>
            </div>

            <div style={{ background: "#10b98122", border: "1px solid #10b98144", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <div style={{ color: "#10b981", fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Potrzebna poduszka ({cushionCoverMonths} mies.)
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#10b981" }}>~{fmt(cushionRounded)}</div>
              <div style={{ color: "#475569", fontSize: 11, marginTop: 6 }}>zaokrąglone w górę do 500 zł · {cushionCoverMonths} miesięcy pokrycia</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>💡 Jak to czytać?</div>
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 6 }}>📌 Wybrany poziom: <span style={{ color: PRIORITY_LABELS[cushionLevel].color, fontWeight: 700 }}>{PRIORITY_LABELS[cushionLevel].label}</span></div>
              <div style={{ marginBottom: 6 }}>📅 Okres analizy: <span style={{ color: "#94a3b8" }}>{cushionMonths} {cushionMonths===1?"miesiąc":cushionMonths<5?"miesiące":"miesięcy"} wstecz</span></div>
              <div style={{ marginBottom: 6 }}>⚡ Scenariusz: <span style={{ color: "#94a3b8" }}>{cushionLossSource === "all" ? "utrata wszystkich dochodów" : `utrata: ${cushionLossSource}`}</span></div>
              <div style={{ marginTop: 10, padding: "8px 10px", background: "#1e293b", borderRadius: 8, fontSize: 11 }}>
                Poduszka pokrywa <strong style={{ color: "#10b981" }}>{cushionCoverMonths} miesięcy</strong> wydatków
                na poziomie <strong style={{ color: PRIORITY_LABELS[cushionLevel].color }}>{PRIORITY_LABELS[cushionLevel].label}</strong> (P1–P{cushionLevel}),
                przy założeniu {cushionLossSource === "all" ? "utraty wszystkich dochodów" : `utraty dochodu: ${cushionLossSource}`}.
                Analiza opiera się na danych z ostatnich <strong style={{ color: "#94a3b8" }}>{cushionMonths} {cushionMonths===1?"miesiąca":cushionMonths<5?"miesięcy":"miesięcy"}</strong>.
                {monthly === 0 && <span style={{ color: "#ef4444", display: "block", marginTop: 4 }}>⚠️ Brak wydatków w wybranym okresie – zmień okres analizy lub dodaj wydatki.</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

}

export default PanelCushion;