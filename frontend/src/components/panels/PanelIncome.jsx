// ============================================================
// File: src/components/panels/PanelIncome.jsx
// Monthly planning panel – read-only budget table
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS, PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle } from "../ui";

function PanelIncome() {
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
    totalGoalsSaved,
    goalsDeductedThisMonth,
    month,
    setMonth,
    year,
    setYear,
    fmt,
    MONTHS
  } = ctx;


  // No local form state – income entry moved to PanelBaseBudget
  const { byCat, grandTotal, plannedM, recurringM } = currentMonthBudget;
  const totalPlanned = Object.values(byCat).reduce((s, v) => s + v.planned, 0);
  const totalRecurring = Object.values(byCat).reduce((s, v) => s + v.recurring, 0);
  const totalStatic = Object.values(byCat).reduce((s, v) => s + v.staticLimit, 0);

  return (
    <div style={{ ...s.panel, maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>Planowanie miesięczne</div>
        <div style={s.monthSel}>
          <button style={s.monthBtn} onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}>‹</button>
          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{MONTHS[month]} {year}</span>
          <button style={s.monthBtn} onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}>›</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ ...s.statBox, borderLeft: "3px solid #10b981" }}>
          <div style={{ ...s.statVal, color: "#10b981" }}>{fmt(totalActualIncome)}</div>
          <div style={s.statLab}>✅ Wpływy</div>
        </div>
        <div style={{ ...s.statBox, borderLeft: "3px solid #475569" }}>
          <div style={{ ...s.statVal, color: "#94a3b8", fontSize: 18 }}>{fmt(totalStatic)}</div>
          <div style={s.statLab}>📋 Stałe założenia</div>
        </div>
        <div style={{ ...s.statBox, borderLeft: "3px solid #a855f7" }}>
          <div style={{ ...s.statVal, color: "#a855f7", fontSize: 18 }}>{fmt(totalPlanned)}</div>
          <div style={s.statLab}>📅 + Jednorazowe</div>
        </div>
        <div style={{ ...s.statBox, borderLeft: "3px solid #3b82f6" }}>
          <div style={{ ...s.statVal, color: "#3b82f6", fontSize: 18 }}>{fmt(totalRecurring)}</div>
          <div style={s.statLab}>🔄 + Cykliczne</div>
        </div>
      </div>

      {/* Free cash = income minus all planned spending */}
      {(() => {
        const freeCash = totalActualIncome - grandTotal;
        const isPositive = freeCash >= 0;
        return (
          <div style={{ background: isPositive ? "linear-gradient(135deg, #10b98111, #05966911)" : "linear-gradient(135deg, #ef444411, #dc262611)", border: `1px solid ${isPositive ? "#10b98133" : "#ef444433"}`, borderRadius: 12, padding: "12px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: isPositive ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 13 }}>
                {isPositive ? "✅ Wolna gotówka po zaplanowanych wydatkach" : "⚠️ Zaplanowane wydatki przekraczają wpływy"}
              </div>
              <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>Wpływy {fmt(totalActualIncome)} − Stałe {fmt(totalStatic)} − Jednorazowe {fmt(totalPlanned)} − Cykliczne {fmt(totalRecurring)}</div>
            </div>
            <div style={{ color: isPositive ? "#10b981" : "#ef4444", fontWeight: 800, fontSize: 26 }}>{fmt(Math.abs(freeCash))}</div>
          </div>
        );
      })()}

      {/* Two columns: actual income + read-only budget table */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12 }}>

        {/* Left: actual income – READ-ONLY, editing is in PanelBaseBudget */}
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>✅ Rzeczywiste wpływy</div>
            <div style={{ color: "#475569", fontSize: 10 }}>
              🔒 <span style={{ color: "#10b981", cursor: "pointer" }} onClick={() => setPanel("basebudget")}>edytuj w Bazie budżetu</span>
            </div>
          </div>
          {monthActualIncome.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              Brak wpływów –{" "}
              <span style={{ color: "#10b981", cursor: "pointer" }} onClick={() => setPanel("basebudget")}>dodaj w Bazie budżetu</span>
            </div>
          ) : (
            <>
              {monthActualIncome.map((inc, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e293b" }}>
                  <div>
                    <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13 }}>{inc.source}</div>
                    <div style={{ color: "#475569", fontSize: 11 }}>{inc.date}</div>
                  </div>
                  <span style={{ ...s.amount(), fontSize: 14 }}>{fmt(inc.amount)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "2px solid #334155", marginTop: 4 }}>
                <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>Suma</span>
                <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>{fmt(totalActualIncome)}</span>
              </div>
            </>
          )}
        </div>

        {/* Right: READ-ONLY computed budget table, 4 columns */}
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📊 Budżet {MONTHS[month]} – wyliczony automatycznie
            </div>
            <div style={{ color: "#475569", fontSize: 10 }}>
              🔒 Tylko do odczytu · edytuj w{" "}
              <span style={{ color: "#10b981", cursor: "pointer" }} onClick={() => setPanel("basebudget")}>Bazie Budżetu</span>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px", gap: 6, padding: "0 4px 6px", borderBottom: "1px solid #334155" }}>
            <span style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Kategoria</span>
            <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "right" }}>Stałe</span>
            <span style={{ color: "#a855f7", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "right" }}>+Jednoraz.</span>
            <span style={{ color: "#3b82f6", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "right" }}>+Cykl.</span>
            <span style={{ color: "#10b981", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "right" }}>= SUMA</span>
          </div>

          {/* Rows */}
          {Object.entries(byCat).map(([cat, v]) => {
            const hasAny = v.total > 0;
            return (
              <div key={cat} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px", gap: 6, alignItems: "center", padding: "7px 4px", borderBottom: "1px solid #1e293b", opacity: hasAny ? 1 : 0.4 }}>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{categories[cat]?.icon} {cat}</span>
                {/* Static limit */}
                <span style={{ textAlign: "right", fontSize: 12, color: v.staticLimit > 0 ? "#64748b" : "#334155", fontWeight: v.staticLimit > 0 ? 600 : 400 }}>
                  {v.staticLimit > 0 ? fmt(v.staticLimit) : "—"}
                </span>
                {/* Planned one-off */}
                {v.planned > 0 ? (
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: "#a855f7", fontWeight: 700, fontSize: 12 }}>{fmt(v.planned)}</span>
                    <div style={{ color: "#6d28d9", fontSize: 9, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.plannedItems.map(p => p.name).join(", ")}
                    </div>
                  </div>
                ) : <span style={{ textAlign: "right", color: "#334155", fontSize: 12 }}>—</span>}
                {v.recurring > 0 ? (
                  <span style={{ textAlign: "right", color: "#3b82f6", fontWeight: 700, fontSize: 12 }}>{fmt(v.recurring)}</span>
                ) : <span style={{ textAlign: "right", color: "#334155", fontSize: 12 }}>—</span>}
                {/* Total (computed sum) */}
                <span style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: v.total > 0 ? "#10b981" : "#334155" }}>
                  {v.total > 0 ? fmt(v.total) : "—"}
                </span>
              </div>
            );
          })}

          {/* Footer totals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px", gap: 6, padding: "10px 4px 0", borderTop: "2px solid #334155", marginTop: 4 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>Suma</span>
            <span style={{ color: "#64748b", fontWeight: 800, fontSize: 13, textAlign: "right" }}>{fmt(totalStatic)}</span>
            <span style={{ color: totalPlanned > 0 ? "#a855f7" : "#334155", fontWeight: 800, fontSize: 13, textAlign: "right" }}>
              {totalPlanned > 0 ? fmt(totalPlanned) : "—"}
            </span>
            <span style={{ color: totalRecurring > 0 ? "#3b82f6" : "#334155", fontWeight: 800, fontSize: 13, textAlign: "right" }}>
              {totalRecurring > 0 ? fmt(totalRecurring) : "—"}
            </span>
            <span style={{ color: "#10b981", fontWeight: 900, fontSize: 14, textAlign: "right" }}>{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

    </div>
  );

}

export default PanelIncome;