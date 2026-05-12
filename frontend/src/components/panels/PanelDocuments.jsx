// ============================================================
// File: src/components/panels/PanelDocuments.jsx
// Receipt gallery panel
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { recurringActiveForMonth } from "../../utils/helpers";
import { MONTHS,PIE_COLORS, PIE_COLORS_TREND, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { PieChart, Gauge, BarChart, CollapsibleSection, Toggle } from "../ui";

function PanelDocuments() {
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


  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // All expenses with saveReceipt flag – apply filters properly
  const displayReceipts = expenses.filter(e => {
    if (!e.saveReceipt) return false;
    const matchSearch = !search ||
      (e.desc || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.sub || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.category || "").toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || e.date.startsWith(dateFilter);
    return matchSearch && matchDate;
  }).sort((a,b) => new Date(b.date)-new Date(a.date));

  function deleteReceipt(id) {
    // Remove saveReceipt flag (in production: also delete from Azure Blob Storage)
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, saveReceipt: false } : e));
  }

  return (
    <div style={{ ...s.panel, maxWidth: 1000 }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>🧾 Dokumenty i paragony</div>
        <div style={s.sectionSub}>Wszystkie wydatki z zapisanym paragonem</div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...s.input, flex: 1, minWidth: 200 }} placeholder="🔍 Szukaj po opisie, kategorii..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <input style={{ ...s.input, width: 180 }} type="month" value={dateFilter}
          onChange={e => setDateFilter(e.target.value)} />
        {(search || dateFilter) && (
          <button onClick={() => { setSearch(""); setDateFilter(""); }}
            style={{ ...s.btnSm("#475569"), whiteSpace: "nowrap" }}>✕ Wyczyść filtry</button>
        )}
        <span style={{ color: "#475569", fontSize: 12, alignSelf: "center" }}>
          {displayReceipts.length} paragonów
        </span>
      </div>

      {displayReceipts.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <div style={{ color: "#475569", fontSize: 14 }}>
            {search || dateFilter ? "Brak paragonów spełniających kryteria filtra." : "Brak zapisanych paragonów.\nZaznacz \"Zapisz paragon w chmurze\" przy dodawaniu wydatku."}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {displayReceipts.map(e => (
          <div key={e.id} style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
            {/* Receipt thumbnail */}
            <div style={{ height: 130, background: "linear-gradient(135deg, #1e293b, #0f172a)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 36 }}>🧾</div>
                <div style={{ color: "#334155", fontSize: 9, marginTop: 4, letterSpacing: 2 }}>PARAGON</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {[60,80,50,70,40].map((w,i) => (
                    <div key={i} style={{ height: 3, width: w, background: "#334155", borderRadius: 2, margin: "0 auto" }} />
                  ))}
                </div>
              </div>
              <div style={{ position: "absolute", top: 8, right: 8, background: "#10b98122", color: "#10b981", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
                ✓ zapisany
              </div>
            </div>
            {/* Card info */}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.desc || e.sub}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>{e.date}</span>
                <span style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>{fmt(e.amount)}</span>
              </div>
              <div style={{ background: "#1e293b", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#64748b", display: "inline-block", marginBottom: 10 }}>
                {categories[e.category]?.icon} {e.category}
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <button onClick={() => alert("W produkcji: otwiera pełny podgląd z Azure Blob Storage")}
                  style={{ flex: 1, padding: "6px", borderRadius: 7, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                  🔍 Podgląd
                </button>
                <button onClick={() => alert("W produkcji: pobiera plik z Azure Blob Storage")}
                  style={{ flex: 1, padding: "6px", borderRadius: 7, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                  ⬇️ Pobierz
                </button>
                <button onClick={() => deleteReceipt(e.id)}
                  style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ef444444", background: "#ef444411", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                  title="Usuń paragon">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

}

export default PanelDocuments;