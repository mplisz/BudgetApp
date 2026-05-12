// ============================================================
// File: src/components/panels/PanelResults.jsx
// Month summary panel – gauges, pie chart, alerts
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS,  PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle } from "../ui";
import { ExpensesTable } from "./ExpensesTable";

function PanelResults() {
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


  const byCategory = {};
  filteredExpenses.forEach(e => {
    if (!byCategory[e.category]) byCategory[e.category] = 0;
    byCategory[e.category] += e.amount;
  });

  const filteredTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalActualIncome - totalSpent;

  // Savings & insurance stats
  const savingsTotal = monthExpenses.filter(e => e.category === "Finanse").reduce((s,e) => s+e.amount, 0);
  const insuranceTotal = monthExpenses.filter(e => e.category === "Ubezpieczenia").reduce((s,e) => s+e.amount, 0);
  const retirementTotal = monthExpenses.filter(e => e.category === "Finanse" && e.sub === "Emerytura").reduce((s,e) => s+e.amount, 0);
  const savingsRate = totalActualIncome > 0 ? (savingsTotal / totalActualIncome * 100) : 0;
  const retirementRate = totalActualIncome > 0 ? (retirementTotal / totalActualIncome * 100) : 0;
  const insuranceRate = totalActualIncome > 0 ? (insuranceTotal / totalActualIncome * 100) : 0;
  const retirementOk = retirementRate >= retirementMin;
  const insuranceOk = insuranceRate <= insuranceMax;

  // Pie chart without Finanse and Ubezpieczenia (shown separately)
  const byCategoryForPie = Object.fromEntries(
    Object.entries(byCategory).filter(([c]) => c !== "Finanse" && c !== "Ubezpieczenia")
  );
  const pieTotal = Object.values(byCategoryForPie).reduce((s,v) => s+v, 0);

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>Podsumowanie miesiąca</div>
        <div style={s.monthSel}>
          <button style={s.monthBtn} onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}>‹</button>
          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{MONTHS[month]} {year}</span>
          <button style={s.monthBtn} onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}>›</button>
        </div>
      </div>

      {/* ── Category budget alert banner ── */}
      {(() => {
        const over = Object.entries(budget).filter(([cat, bud]) => (byCategory[cat]||0) > bud);
        const near = Object.entries(budget).filter(([cat, bud]) => { const sv = byCategory[cat]||0; return sv <= bud && sv >= bud*(warnThreshold/100); });
        if (over.length === 0 && near.length === 0) return null;
        return (
          <div style={{ marginBottom: 8 }}>
            {over.length > 0 && (
              <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div>
                  <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 13 }}>Przekroczono budżet w {over.length} {over.length===1?"kategorii":"kategoriach"}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>{over.map(([cat]) => `${categories[cat]?.icon} ${cat}`).join(" · ")}</div>
                </div>
              </div>
            )}
            {near.length > 0 && (
              <div style={{ background: "#eab30822", border: "1px solid #eab30844", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔔</span>
                <div>
                  <div style={{ color: "#eab308", fontWeight: 700, fontSize: 13 }}>Zbliżasz się do limitu w {near.length} {near.length===1?"kategorii":"kategoriach"}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>{near.map(([cat, bud]) => `${categories[cat]?.icon} ${cat} (${Math.round(((byCategory[cat]||0)/bud)*100)}%)`).join(" · ")}</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tag budget alert banners – visually consistent with category alerts above ── */}
      {(() => {
        // Only evaluate tags that have a budget set
        const tagStats = tags
          .map(tag => {
            const spent = monthExpenses
              .filter(e => (e.tags || []).includes(tag.id))
              .reduce((s, e) => s + e.amount, 0);
            const limit = tagBudgets[tag.id] || 0;
            const pct = limit > 0 ? (spent / limit) * 100 : 0;
            return { tag, spent, limit, pct };
          })
          .filter(t => t.limit > 0); // ignore tags without a configured limit

        const overTags = tagStats.filter(t => t.pct > 100);
        const nearTags = tagStats.filter(t => t.pct >= warnThreshold && t.pct <= 100);

        if (overTags.length === 0 && nearTags.length === 0) return null;

        return (
          <div style={{ marginBottom: 14 }}>
            {overTags.length > 0 && (
              <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div>
                  <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 13 }}>
                    Przekroczono budżet dla {overTags.length === 1 ? "tagu" : "tagów"}: {overTags.map(t => `${t.tag.icon} ${t.tag.label}`).join(", ")}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>
                    {overTags.map(t => `${t.tag.label}: ${fmt(t.spent)} / ${fmt(t.limit)} (${t.pct.toFixed(0)}%)`).join(" · ")}
                  </div>
                </div>
              </div>
            )}
            {nearTags.length > 0 && (
              <div style={{ background: "#eab30822", border: "1px solid #eab30844", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔔</span>
                <div>
                  <div style={{ color: "#eab308", fontWeight: 700, fontSize: 13 }}>
                    Zbliżasz się do limitu dla {nearTags.length === 1 ? "tagu" : "tagów"}: {nearTags.map(t => `${t.tag.icon} ${t.tag.label} (${t.pct.toFixed(0)}%)`).join(", ")}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>
                    {nearTags.map(t => `${t.tag.label}: ${fmt(t.spent)} z ${fmt(t.limit)}`).join(" · ")}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tag filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setActiveTagFilter(null)}
          style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${!activeTagFilter ? "#10b981" : "#334155"}`,
            background: !activeTagFilter ? "#10b98122" : "transparent",
            color: !activeTagFilter ? "#10b981" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Wszystkie
        </button>
        {tags.map(tag => (
          <button key={tag.id} onClick={() => setActiveTagFilter(activeTagFilter === tag.id ? null : tag.id)}
            style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${activeTagFilter === tag.id ? "#a855f7" : "#334155"}`,
              background: activeTagFilter === tag.id ? "#a855f722" : "transparent",
              color: activeTagFilter === tag.id ? "#a855f7" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {tag.icon} {tag.label}
          </button>
        ))}
        {activeTagFilter && <span style={{ color: "#475569", fontSize: 12, alignSelf: "center", marginLeft: 4 }}>
          · {filteredExpenses.length} wydatków · {fmt(filteredTotal)}
        </span>}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        <div style={{ ...s.statBox, borderLeft: "3px solid #3b82f6" }}>
          <div style={{ ...s.statVal, color: "#3b82f6" }}>{fmt(totalActualIncome)}</div>
          <div style={s.statLab}>💵 Wpływy</div>
        </div>
        <div style={{ ...s.statBox, borderLeft: "3px solid #ef4444" }}>
          <div style={{ ...s.statVal, color: "#ef4444" }}>{fmt(activeTagFilter ? filteredTotal : totalSpent)}</div>
          <div style={s.statLab}>💸 {activeTagFilter ? `Wydatki (${tags.find(t=>t.id===activeTagFilter)?.label})` : "Wydatki"}</div>
        </div>
        <div style={{ ...s.statBox, borderLeft: `3px solid ${balance >= 0 ? "#10b981" : "#ef4444"}` }}>
          <div style={{ ...s.statVal, color: balance >= 0 ? "#10b981" : "#ef4444" }}>{fmt(Math.abs(balance))}</div>
          <div style={s.statLab}>{balance >= 0 ? "✅ Nadwyżka" : "⚠️ Niedobór"}</div>
        </div>
        <div style={{ ...s.statBox, borderLeft: `3px solid ${savingsRate >= 20 ? "#10b981" : savingsRate >= 10 ? "#eab308" : "#ef4444"}` }}>
          <div style={{ ...s.statVal, color: savingsRate >= 20 ? "#10b981" : savingsRate >= 10 ? "#eab308" : "#ef4444" }}>
            {savingsRate.toFixed(1)}%
          </div>
          <div style={s.statLab}>💰 Wskaźnik oszczędności</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={s.card}>
          <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 16, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>📊 Plan vs Rzeczywistość</div>
          {Object.entries(budget).map(([cat, bud]) => (
            <Gauge key={cat} label={`${categories[cat]?.icon} ${cat}`} value={byCategory[cat] || 0} max={bud} />
          ))}
          {Object.entries(byCategory).filter(([c]) => !budget[c]).map(([cat, val]) => (
            <Gauge key={cat} label={`${categories[cat]?.icon} ${cat}`} value={val} max={val} color="#f97316" />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Pie chart with drill-down – clicking a slice shows subcategory breakdown */}
          {(() => {
            // selectedPieCategory: null = top-level view, string = subcategory drill-down
            const [selectedPieCat, setSelectedPieCat] = useState(null);

            // Drill-down data: group expenses by subcategory for selected category
            const drillData = selectedPieCat
              ? (() => {
                  const bySub = {};
                  filteredExpenses
                    .filter(e => e.category === selectedPieCat)
                    .forEach(e => { bySub[e.sub] = (bySub[e.sub] || 0) + e.amount; });
                  return bySub;
                })()
              : byCategoryForPie;

            const drillTotal = Object.values(drillData).reduce((s, v) => s + v, 0);
            const catIcon = categories[selectedPieCat]?.icon ?? "";

            // Center label for drill-down view
            const drillCenterLabel = selectedPieCat ? {
              line1: catIcon + " " + selectedPieCat.slice(0, 10),
              line2: fmt(drillTotal),
              line3: null,
            } : null;

            // Label resolver: in drill-down, subs have no icon in CATEGORIES
            const drillLabelResolver = selectedPieCat
              ? (sub) => sub   // subcategory names have no icon
              : (cat) => (categories[cat]?.icon ? categories[cat].icon + " " + cat : cat);

            return (
              <div style={s.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {selectedPieCat
                      ? <>{catIcon} {selectedPieCat} – podkategorie</>
                      : "🥧 Podział wydatków"}
                  </div>
                  {selectedPieCat && (
                    <button
                      onClick={() => setSelectedPieCat(null)}
                      style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      ⬅️ Powrót
                    </button>
                  )}
                </div>

                {!selectedPieCat && (
                  <div style={{ color: "#475569", fontSize: 10, marginBottom: 8, textAlign: "center" }}>
                    Kliknij wycinek lub kategorię aby zobaczyć podkategorie
                  </div>
                )}

                {drillTotal === 0 ? (
                  <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 20 }}>Brak wydatków</div>
                ) : (
                  <PieChart
                    data={drillData}
                    total={drillTotal}
                    labelResolver={drillLabelResolver}
                    onSliceClick={selectedPieCat ? null : (cat) => setSelectedPieCat(cat)}
                  />
                )}
              </div>
            );
          })()}

          {/* Savings & Insurance */}
          <div style={s.card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {/* Savings */}
              <div style={{ paddingRight: 16, borderRight: "1px solid #1e293b" }}>
                <div style={{ fontWeight: 700, color: "#10b981", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>💰 Oszczędności</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: savingsTotal > 0 ? "#10b981" : "#334155" }}>
                  {savingsRate.toFixed(1)}%
                </div>
                <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>dochodu odkładasz</div>
                <div style={{ color: "#64748b", fontSize: 10, marginTop: 1 }}>{fmt(savingsTotal)} / {fmt(totalActualIncome)}</div>
                <div style={{ marginTop: 8, height: 5, background: "#1e293b", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${Math.min(savingsRate, 100)}%`, background: savingsRate >= 20 ? "#10b981" : savingsRate >= 10 ? "#eab308" : "#ef4444", borderRadius: 99 }} />
                </div>
                <div style={{ color: "#334155", fontSize: 10, marginTop: 3 }}>cel oszczędności: 20%</div>
                {/* Retirement breakdown – item 9 */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e293b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>🏦 Emerytura</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: retirementOk ? "#10b981" : "#ef4444" }}>
                      {retirementRate.toFixed(1)}%
                      {!retirementOk && <span style={{ marginLeft: 4 }}>⚠️</span>}
                    </span>
                  </div>
                  <div style={{ height: 4, background: "#1e293b", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${Math.min(retirementRate/retirementMin*100, 150)}%`, background: retirementOk ? "#10b981" : "#ef4444", borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 9, color: retirementOk ? "#334155" : "#ef444488", marginTop: 2 }}>
                    {retirementOk ? `✅ min. ${retirementMin}% spełnione` : `⚠️ poniżej min. ${retirementMin}% dochodu`}
                  </div>
                </div>
              </div>
              {/* Insurance – item 10 */}
              <div style={{ paddingLeft: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: "#a855f7", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>🛡️ Ubezpieczenia</div>
                  {!insuranceOk && <span style={{ background: "#ef444422", color: "#ef4444", borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>⚠️ Zbyt dużo!</span>}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: insuranceOk ? "#a855f7" : "#ef4444" }}>
                  {insuranceRate.toFixed(1)}%
                </div>
                <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>dochodu na ochronę</div>
                <div style={{ color: "#64748b", fontSize: 10, marginTop: 1 }}>{fmt(insuranceTotal)} / {fmt(totalActualIncome)}</div>
                <div style={{ marginTop: 8, height: 5, background: "#1e293b", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${Math.min(insuranceRate/insuranceMax*100, 100)}%`, background: insuranceOk ? "#a855f7" : "#ef4444", borderRadius: 99 }} />
                </div>
                <div style={{ color: insuranceOk ? "#334155" : "#ef444488", fontSize: 10, marginTop: 3 }}>
                  {insuranceOk ? `✅ bezpieczny limit: ${insuranceMax}%` : `⚠️ powyżej max. ${insuranceMax}% dochodu`}
                </div>
                {!insuranceOk && (
                  <div style={{ marginTop: 8, background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#ef4444" }}>
                    Rozważ przegląd polis – wydatki na ubezpieczenia są powyżej zalecanego progu {insuranceMax}% dochodu.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses table – collapsible */}
      <ExpensesTable />

      {/* Recurring this month summary – collapsible, default collapsed */}
      {recurringThisMonth.length > 0 && (() => {
        const [open, setOpen] = useState(false);
        return (
          <div style={{ ...s.card, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setOpen(v=>!v)}>
              <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                🔄 Cykliczne – {MONTHS[month]} {year}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#3b82f6", fontWeight: 800, fontSize: 16 }}>{fmt(totalRecurringThisMonth)}</span>
                <span style={{ color: "#475569", fontSize: 16, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▾</span>
              </div>
            </div>
            {open && recurringThisMonth.map(e => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e293b", marginTop: 10 }}>
                <div>
                  <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>{e.desc || e.sub}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <span style={{ background: "#1e293b", color: "#64748b", borderRadius: 5, padding: "1px 7px", fontSize: 10 }}>{categories[e.category]?.icon} {e.category}</span>
                    <span style={{ background: "#3b82f622", color: "#3b82f6", borderRadius: 5, padding: "1px 7px", fontSize: 10 }}>{e.frequency === "yearly" ? "co rok" : e.frequency === "quarterly" ? "co kwartał" : "co miesiąc"}</span>
                    {(e.tags||[]).map(tid => { const tag = tags.find(t=>t.id===tid); return tag ? <span key={tid} style={{ background: "#a855f722", color: "#a855f7", borderRadius: 5, padding: "1px 6px", fontSize: 10 }}>{tag.icon}</span> : null; })}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#10b981", fontWeight: 700, fontSize: 14 }}>{fmt(e.amount)}</div>
                  {e.currency && e.currency !== "PLN" && e.foreignAmount && (
                    <div style={{ color: "#475569", fontSize: 10 }}>{e.foreignAmount} {e.currency}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Year-over-Year – collapsible, default collapsed */}
      {(() => {
        const [open, setOpen] = useState(false);
        const hasData = Object.entries(categories).some(([cat]) => {
          const prev = expenses.filter(e => { const d = new Date(e.date); return d.getMonth()===month && d.getFullYear()===year-1 && e.category===cat; }).length;
          const curr = expenses.filter(e => { const d = new Date(e.date); return d.getMonth()===month && d.getFullYear()===year && e.category===cat; }).length;
          return prev > 0 || curr > 0;
        });
        return (
          <div style={{ ...s.card, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setOpen(v=>!v)}>
              <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                📅 Rok do roku – {MONTHS[month]} {year-1} vs {MONTHS[month]} {year}
              </div>
              <span style={{ color: "#475569", fontSize: 16, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▾</span>
            </div>
            {open && (
              <div style={{ marginTop: 12 }}>
                {!hasData && <div style={{ color: "#475569", textAlign: "center", padding: 20, fontSize: 13 }}>Brak danych do porównania</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {Object.entries(categories).map(([cat, { icon }]) => {
                    const prev = expenses.filter(e => { const d = new Date(e.date); return d.getMonth()===month && d.getFullYear()===year-1 && e.category===cat; }).reduce((s,e)=>s+e.amount,0);
                    const curr = expenses.filter(e => { const d = new Date(e.date); return d.getMonth()===month && d.getFullYear()===year && e.category===cat; }).reduce((s,e)=>s+e.amount,0);
                    if (prev === 0 && curr === 0) return null;
                    const diff = curr - prev;
                    const pct = prev > 0 ? ((diff/prev)*100).toFixed(0) : null;
                    const color = diff > 0 ? "#ef4444" : diff < 0 ? "#10b981" : "#475569";
                    return (
                      <div key={cat} style={{ background: "#1e293b", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{icon} {cat}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: "#475569" }}>{year-1}</span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(prev)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: "#475569" }}>{year}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{fmt(curr)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTop: "1px solid #334155" }}>
                          <span style={{ fontSize: 11, color, fontWeight: 700 }}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>
                          {pct !== null && <span style={{ fontSize: 10, background: color+"22", color, borderRadius: 5, padding: "2px 6px", fontWeight: 700 }}>{diff>0?"+":""}{pct}%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );

}

export default PanelResults;