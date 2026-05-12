// ============================================================
// File: src/components/panels/PanelBaseBudget.jsx
// Base budget configuration panel.
// UI: Polish | Comments: English
// ============================================================

import React, { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt, recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { IncomeEntryForm } from "./IncomeEntryForm";

// CHANGED: Added export default for React.lazy compatibility
export default function PanelBaseBudget() {
  const ctx = useAppContext();
  
  // CLEANUP: Destructure ONLY what is actually used in this component
  const {
    categories,
    baseBudget,
    setBaseBudget,
    budgetOverrides,
    setMonthOverride,
    clearMonthOverride,
    actualIncome,
    setActualIncome,
    incomeSources,
    tags,
    tagBudgets,
    setTagBudgets,
    monthExpenses,
    warnThreshold,
    month,
    year
  } = ctx;

  // Local state for the override month selector (right column)
  const [ovMonth, setOvMonth] = useState(month);
  const [ovYear, setOvYear] = useState(year);

  const ovKey = `${ovYear}-${ovMonth}`;
  const hasOverride = !!budgetOverrides[ovKey] && Object.keys(budgetOverrides[ovKey]).length > 0;

  // Helper: Get value for category (override or base)
  function getCatValue(cat) {
    if (budgetOverrides[ovKey]?.[cat] !== undefined) return budgetOverrides[ovKey][cat];
    return baseBudget[cat] || 0;
  }

  // Helper: Check if category is overridden in selected month
  function isOverridden(cat) {
    return budgetOverrides[ovKey]?.[cat] !== undefined;
  }

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>🏦 Baza budżetu</div>
        <div style={s.sectionSub}>Stałe limity kategorii – podstawa planowania miesięcznego</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* ── LEFT COLUMN: Permanent Base Limits ────────────────── */}
        <div style={s.card}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
            📋 Stałe limity domyślne
          </div>
          <div style={{ color: "#475569", fontSize: 11, marginBottom: 14, lineHeight: 1.5 }}>
            Wartości obowiązują każdego miesiąca, chyba że ustawisz nadpisanie po prawej stronie.
          </div>
          
          {Object.entries(categories).map(([cat, { icon }]) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #1e293b" }}>
              <span style={{ flex: 0, fontSize: 16 }}>{icon}</span>
              <span style={{ flex: 1, color: "#94a3b8", fontSize: 13 }}>{cat}</span>
              <BudgetInput
                style={{ ...s.input, width: 110, textAlign: "right", padding: "5px 10px", fontSize: 13 }}
                value={baseBudget[cat] || 0}
                onChange={v => setBaseBudget(prev => ({ ...prev, [cat]: v }))}
              />
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "2px solid #334155", marginTop: 6 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>Suma bazy</span>
            <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>
              {fmt(Object.values(baseBudget).reduce((sum, v) => sum + (v || 0), 0))}
            </span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Monthly Overrides ───────────────────── */}
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              🗓️ Nadpisania miesięczne
            </div>
            {/* Month selector for overrides */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 8, padding: "3px 6px" }}>
              <button style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }} onClick={() => { if(ovMonth===0){setOvMonth(11);setOvYear(y=>y-1)}else setOvMonth(m=>m-1) }}>‹</button>
              <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13, minWidth: 80, textAlign: "center" }}>{MONTHS[ovMonth]} {ovYear}</span>
              <button style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }} onClick={() => { if(ovMonth===11){setOvMonth(0);setOvYear(y=>y+1)}else setOvMonth(m=>m+1) }}>›</button>
            </div>
          </div>

          <div style={{ color: "#475569", fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>
            Zmiana limitu tylko dla wybranego miesiąca.
            {hasOverride && <span style={{ color: "#eab308", marginLeft: 6 }}>⚡ Ten miesiąc ma nadpisania</span>}
          </div>

          {Object.entries(categories).map(([cat, { icon }]) => {
            const base = baseBudget[cat] || 0;
            const overridden = isOverridden(cat);
            const val = getCatValue(cat);
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #1e293b" }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ flex: 1, color: overridden ? "#eab308" : "#64748b", fontSize: 12 }}>{cat}</span>
                <BudgetInput
                  style={{ 
                    ...s.input, width: 100, textAlign: "right", padding: "5px 8px", fontSize: 13,
                    borderColor: overridden ? "#eab30844" : "#334155",
                    background: overridden ? "#eab30811" : "#1e293b" 
                  }}
                  value={val || 0}
                  placeholder={String(base || 0)}
                  onChange={v => setMonthOverride(cat, v, ovMonth, ovYear)}
                />
                {overridden && (
                  <button title="Przywróć domyślny" onClick={() => clearMonthOverride(cat, ovMonth, ovYear)}
                    style={{ background: "none", border: "none", color: "#eab308", cursor: "pointer", fontSize: 14, padding: 0 }}>↩</button>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 10, padding: "8px 0 0", borderTop: "2px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>Suma {MONTHS[ovMonth]}</span>
              <span style={{ color: "#eab308", fontWeight: 800, fontSize: 14 }}>
                {fmt(Object.keys(categories).reduce((sum, cat) => sum + (getCatValue(cat) || 0), 0))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTUAL INCOME ENTRY ────────────────────────────────── */}
      <div style={{ ...s.card, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            💵 Rzeczywiste wpływy – {MONTHS[ovMonth]} {ovYear}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <IncomeEntryForm
            incomeSources={incomeSources}
            onAdd={entry => setActualIncome(p => [...p, entry])}
            defaultDate={`${ovYear}-${String(ovMonth + 1).padStart(2, "0")}-01`}
            s_input={s.input} s_select={s.select}
            s_btn={{ color: "#fff", background: "#10b981", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 15, fontWeight: 700, width: "100%", marginTop: 4, cursor: "pointer" }}
            s_label={s.label}
          />
          <div>
            {(() => {
              const ovIncome = actualIncome.filter(i => {
                const d = new Date(i.date);
                return d.getMonth() === ovMonth && d.getFullYear() === ovYear;
              });
              
              if (ovIncome.length === 0) return (
                <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
                  Brak wpływów w {MONTHS[ovMonth]} {ovYear}
                </div>
              );

              return (
                <>
                  {ovIncome.map((inc, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1e293b" }}>
                      <div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13 }}>{inc.source}</div>
                        <div style={{ color: "#475569", fontSize: 11 }}>{inc.date}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#10b981", fontWeight: 700, fontSize: 14 }}>{fmt(inc.amount)}</span>
                        <button onClick={() => setActualIncome(prev => prev.filter(x => x !== inc))}
                          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", borderTop: "2px solid #334155", marginTop: 4 }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>Suma wpływów</span>
                    <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>
                      {fmt(ovIncome.reduce((sum, i) => sum + i.amount, 0))}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── TAG BUDGET LIMITS ─────────────────────────────────── */}
      <div style={{ ...s.card, marginTop: 12 }}>
        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
          🏷️ Budżety dla tagów
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
          {tags.map(tag => {
            const spent = (monthExpenses || [])
              .filter(e => (e.tags || []).includes(tag.id))
              .reduce((sum, e) => sum + e.amount, 0);
            
            const tagBudgetVal = tagBudgets[tag.id] || 0;
            const pct = tagBudgetVal > 0 ? (spent / tagBudgetVal) * 100 : 0;
            const over = spent > tagBudgetVal && tagBudgetVal > 0;
            const color = over ? "#ef4444" : "#10b981";

            return (
              <div key={tag.id} style={{ background: "#1e293b", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>{tag.icon} {tag.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>Limit:</span>
                  <BudgetInput
                    style={{ ...s.input, width: 110, padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                    value={tagBudgetVal || 0}
                    onChange={v => setTagBudgets(b => ({ ...b, [tag.id]: v }))}
                  />
                </div>
                {tagBudgetVal > 0 && (
                  <div style={{ height: 6, background: "#0d1424", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, transition: "width 0.4s" }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                   <span style={{ color: "#475569", fontSize: 10 }}>{fmt(spent)} wydane</span>
                   <span style={{ color: over ? "#ef4444" : "#64748b", fontSize: 10 }}>
                     {over ? `Nadwyżka: ${fmt(spent - tagBudgetVal)}` : `Zostało: ${fmt(tagBudgetVal - spent)}`}
                   </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}