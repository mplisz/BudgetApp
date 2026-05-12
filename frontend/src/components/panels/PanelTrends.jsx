// ============================================================
// File: src/components/panels/PanelTrends.jsx
// Historia panel – trend, heatmap, YTD, recurring, savings charts
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS,  PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle } from "../ui";

function PanelTrends() {
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


  const [trendMonths, setTrendMonths] = useState(6);
  const [trendCat, setTrendCat] = useState("all");
  const [heatCat, setHeatCat] = useState("all");
  // Item 4: filters for income trend and YTD
  const [incomeTrendFilter, setIncomeTrendFilter] = useState("all");
  const [ytdCatFilter, setYtdCatFilter] = useState("all");
  // Item 5: filters for recurring and savings charts
  const [recurringSubFilter, setRecurringSubFilter] = useState("all");
  const [savingsSubFilter, setSavingsSubFilter] = useState("all");

  // Build months array
  function getMonthsBack(n) {
    return Array.from({ length: n }, (_, i) => {
      let m = month - (n - 1 - i); let y = year;
      if (m < 0) { m += 12; y--; }
      return { m, y, label: MONTHS[m].slice(0, 3) + " " + String(y).slice(2) };
    });
  }

  const months = getMonthsBack(trendMonths);

  function getMonthTotal(m, y, cat) {
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === m && d.getFullYear() === y && (cat === "all" || e.category === cat);
    }).reduce((s, e) => s + e.amount, 0);
  }

  function getMonthIncome(m, y, srcFilter = "all") {
    return actualIncome.filter(i => {
      const d = new Date(i.date);
      return d.getMonth() === m && d.getFullYear() === y &&
        (srcFilter === "all" || i.source === srcFilter);
    }).reduce((s, i) => s + i.amount, 0);
  }

  const trendData = months.map(({ m, y, label }) => ({
    label, value: getMonthTotal(m, y, trendCat)
  }));

  const compareData = months.map(({ m, y, label }) => ({
    label,
    wydatki: getMonthTotal(m, y, "all"),
    wplywy: getMonthIncome(m, y),
  }));

  const maxCompare = Math.max(...compareData.flatMap(d => [d.wydatki, d.wplywy]), 1);
  const maxTrend = Math.max(...trendData.map(d => d.value), 1);

  // Category breakdown per period
  const catTotals = {};
  months.forEach(({ m, y }) => {
    Object.keys(categories).forEach(cat => {
      const v = getMonthTotal(m, y, cat);
      if (!catTotals[cat]) catTotals[cat] = 0;
      catTotals[cat] += v;
    });
  });
  const totalAllCats = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const sortedCats = Object.entries(catTotals).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);

  // Heatmap: category × month
  const heatCats = heatCat === "all"
    ? Object.keys(categories)
    : [heatCat];
  const heatMax = Math.max(...heatCats.flatMap(cat => months.map(({ m, y }) => getMonthTotal(m, y, cat))), 1);

  // Recurring per month – filtered by sub (item 5)
  const recurringData = months.map(({ m, y, label }) => {
    const total = expenses
      .filter(e => e.recurring && recurringActiveForMonth(e, m, y) &&
        (recurringSubFilter === "all" || e.sub === recurringSubFilter || e.desc === recurringSubFilter))
      .reduce((s, e) => s + e.amount, 0);
    return { label, value: total };
  });
  const totalRecurringInPeriod = recurringData.reduce((s, d) => s + d.value, 0);
  const maxRecurring = Math.max(...recurringData.map(d => d.value), 1);

  // Savings per month – filtered by sub (item 5)
  const savingsData = months.map(({ m, y, label }) => {
    const total = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === m && d.getFullYear() === y &&
        e.category === "Finanse" &&
        (savingsSubFilter === "all" || e.sub === savingsSubFilter);
    }).reduce((s, e) => s + e.amount, 0);
    return { label, value: total };
  });
  const totalSavingsInPeriod = savingsData.reduce((s, d) => s + d.value, 0);
  const maxSavings = Math.max(...savingsData.map(d => d.value), 1);

  // YTD cumulative – filtered by category (item 4)
  const ytdMonths = [];
  for (let i = 0; i <= month; i++) ytdMonths.push({ m: i, y: year, label: MONTHS[i].slice(0,3) });
  const cumulData = ytdMonths.map(({ m, y, label }) => {
    const monthlyTotal = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === m && d.getFullYear() === y &&
        (ytdCatFilter === "all" || e.category === ytdCatFilter);
    }).reduce((s, e) => s + e.amount, 0);
    return { label, value: monthlyTotal };
  });
  // Make cumulative
  for (let i = 1; i < cumulData.length; i++) cumulData[i].value += cumulData[i-1].value;
  const maxCumul = Math.max(...cumulData.map(d => d.value), 1);

  const periodBtns = [
    { label: "3M", val: 3 }, { label: "6M", val: 6 },
    { label: "9M", val: 9 }, { label: "12M", val: 12 },
  ];

  return (
    <div style={{ ...s.panel, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>Historia</div>
        <div style={{ display: "flex", gap: 4 }}>
          {periodBtns.map(b => (
            <button key={b.val} onClick={() => setTrendMonths(b.val)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: trendMonths === b.val ? "#10b981" : "#1e293b",
                color: trendMonths === b.val ? "#fff" : "#64748b" }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rząd 1: Trend wydatków + Narastająco YTD */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>📈 Trend wydatków</div>
            <select style={{ ...s.select, width: "auto", fontSize: 11, padding: "4px 8px" }} value={trendCat} onChange={e => setTrendCat(e.target.value)}>
              <option value="all">Wszystkie</option>
              {Object.keys(categories).map(c => <option key={c} value={c}>{categories[c].icon} {c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {trendData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ fontSize: 9, color: "#64748b" }}>{d.value > 0 ? (d.value/1000).toFixed(1)+"k" : ""}</div>
                <div style={{ width: "100%", background: "#1e293b", borderRadius: 4, height: 80, display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: `${(d.value/maxTrend)*80}px`, background: trendCat === "all" ? "#3b82f6" : "#10b981", borderRadius: 4, transition: "height 0.4s ease", minHeight: d.value > 0 ? 3 : 0 }} />
                </div>
                <div style={{ fontSize: 9, color: "#475569" }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>📊 Wydatki skumulowane YTD {year}</div>
            <select style={{ ...s.select, width: "auto", fontSize: 11, padding: "3px 7px" }} value={ytdCatFilter} onChange={e => setYtdCatFilter(e.target.value)}>
              <option value="all">Wszystkie</option>
              {Object.keys(categories).map(c => <option key={c} value={c}>{categories[c].icon} {c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 90 }}>
            {cumulData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", background: "#1e293b", borderRadius: 4, height: 70, display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: `${(d.value/maxCumul)*70}px`, background: "linear-gradient(to top, #a855f7, #7c3aed)", borderRadius: 4, minHeight: d.value > 0 ? 3 : 0 }} />
                </div>
                <div style={{ fontSize: 8, color: "#475569" }}>{d.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b", fontSize: 11 }}>Razem YTD:</span>
            <span style={{ color: "#a855f7", fontWeight: 700, fontSize: 13 }}>{fmt(cumulData[cumulData.length-1]?.value || 0)}</span>
          </div>
        </div>
      </div>

      {/* Rząd 2: Trend wpływów + Wpływy vs Wydatki */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>💵 Trend wpływów</div>
            <select style={{ ...s.select, width: "auto", fontSize: 11, padding: "3px 7px" }} value={incomeTrendFilter} onChange={e => setIncomeTrendFilter(e.target.value)}>
              <option value="all">Wszystkie źródła</option>
              {incomeSources.map(src => <option key={src} value={src}>{src}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {months.map(({ m, y, label }, i) => {
              const v = getMonthIncome(m, y, incomeTrendFilter);
              const maxInc = Math.max(...months.map(mo => getMonthIncome(mo.m, mo.y, incomeTrendFilter)), 1);
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#64748b" }}>{v > 0 ? (v/1000).toFixed(1)+"k" : ""}</div>
                  <div style={{ width: "100%", background: "#1e293b", borderRadius: 4, height: 80, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", height: `${(v/maxInc)*80}px`, background: "#10b981", borderRadius: 4, transition: "height 0.4s ease", minHeight: v > 0 ? 3 : 0 }} />
                  </div>
                  <div style={{ fontSize: 9, color: "#475569" }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={s.card}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>⚖️ Wpływy vs Wydatki</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#10b981" }}/><span style={{ fontSize: 10, color: "#64748b" }}>Wpływy</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#ef4444" }}/><span style={{ fontSize: 10, color: "#64748b" }}>Wydatki</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 95 }}>
            {compareData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: "100%", background: "#1e293b", borderRadius: 4, height: 80, display: "flex", alignItems: "flex-end", gap: 1 }}>
                  <div style={{ flex: 1, height: `${(d.wplywy/maxCompare)*80}px`, background: "#10b981", borderRadius: "3px 3px 0 0", minHeight: d.wplywy > 0 ? 3 : 0 }} />
                  <div style={{ flex: 1, height: `${(d.wydatki/maxCompare)*80}px`, background: "#ef4444", borderRadius: "3px 3px 0 0", minHeight: d.wydatki > 0 ? 3 : 0 }} />
                </div>
                <div style={{ fontSize: 9, color: "#475569" }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rząd 3: Heatmapa (lewo) + Podział/Cykliczne/Oszczędności (prawo) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>🗓️ Heatmapa kategorii</div>
            <select style={{ ...s.select, width: "auto", fontSize: 11, padding: "4px 8px" }} value={heatCat} onChange={e => setHeatCat(e.target.value)}>
              <option value="all">Wszystkie kategorie</option>
              {Object.keys(categories).map(c => <option key={c} value={c}>{categories[c].icon} {c}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${Math.min(trendMonths, 8)}, 1fr)`, gap: 3, marginBottom: 4 }}>
            <div />
            {months.slice(-Math.min(trendMonths, 8)).map((mo, i) => (
              <div key={i} style={{ fontSize: 9, color: "#475569", textAlign: "center" }}>{mo.label}</div>
            ))}
          </div>
          {heatCats.map(cat => (
            <div key={cat} style={{ display: "grid", gridTemplateColumns: `120px repeat(${Math.min(trendMonths, 8)}, 1fr)`, gap: 3, marginBottom: 3 }}>
              <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12 }}>{categories[cat]?.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
              </div>
              {months.slice(-Math.min(trendMonths, 8)).map(({ m, y }, j) => {
                const v = getMonthTotal(m, y, cat);
                const intensity = v / heatMax;
                const bg = intensity < 0.01 ? "#1e293b" : `rgba(16,185,129,${Math.max(0.1, intensity)})`;
                return (
                  <div key={j} title={`${MONTHS[m]}: ${fmt(v)}`}
                    style={{ height: 24, borderRadius: 4, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {v > 0 && <span style={{ fontSize: 8, color: intensity > 0.5 ? "#fff" : "#64748b" }}>{(v/1000).toFixed(1)}k</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={s.card}>
            <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>🥧 Podział za {trendMonths} mies.</div>
            {sortedCats.slice(0, 5).map(([cat, val], i) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>{categories[cat]?.icon} {cat}</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 11 }}>{((val/totalAllCats)*100).toFixed(1)}%</span>
                </div>
                <div style={{ height: 5, background: "#1e293b", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${(val/totalAllCats)*100}%`, background: PIE_COLORS_TREND[i % PIE_COLORS_TREND.length], borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>🔄 Cykliczne za {trendMonths} mies.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#3b82f6", fontWeight: 800, fontSize: 14 }}>{fmt(totalRecurringInPeriod)}</span>
                <select style={{ ...s.select, width: "auto", fontSize: 10, padding: "2px 6px" }} value={recurringSubFilter} onChange={e => setRecurringSubFilter(e.target.value)}>
                  <option value="all">Wszystkie</option>
                  {[...new Set(expenses.filter(e=>e.recurring).map(e=>e.desc||e.sub))].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, marginBottom: 8 }}>
              {recurringData.map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", background: "#1e293b", borderRadius: 3, height: 46, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", height: `${(d.value/maxRecurring)*46}px`, background: "#3b82f6", borderRadius: 3, minHeight: d.value > 0 ? 2 : 0 }} />
                  </div>
                  <div style={{ fontSize: 8, color: "#475569" }}>{d.label}</div>
                </div>
              ))}
            </div>
            <div style={{ color: "#475569", fontSize: 11 }}>Śr. {fmt(totalRecurringInPeriod / trendMonths)} / mies.</div>
          </div>

          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>💰 Oszczędności za {trendMonths} mies.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>{fmt(totalSavingsInPeriod)}</span>
                <select style={{ ...s.select, width: "auto", fontSize: 10, padding: "2px 6px" }} value={savingsSubFilter} onChange={e => setSavingsSubFilter(e.target.value)}>
                  <option value="all">Wszystkie</option>
                  {Object.keys(categories["Finanse"]?.sub || {}).map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, marginBottom: 8 }}>
              {savingsData.map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", background: "#1e293b", borderRadius: 3, height: 46, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", height: `${(d.value/maxSavings)*46}px`, background: "#10b981", borderRadius: 3, minHeight: d.value > 0 ? 2 : 0 }} />
                  </div>
                  <div style={{ fontSize: 8, color: "#475569" }}>{d.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#475569", fontSize: 11 }}>Śr. {fmt(totalSavingsInPeriod / trendMonths)} / mies.</span>
              {totalActualIncome > 0 && (
                <span style={{ color: "#10b981", fontSize: 11, fontWeight: 700 }}>
                  ~{(totalSavingsInPeriod / (totalActualIncome * trendMonths) * 100).toFixed(1)}% dochodu
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );

}
export default PanelTrends;