// ============================================================
// File: src/components/panels/PanelBaseBudget.jsx
// Budget limits panel.
// Left: base limits (validFrom semantics, applies forward)
// Right: monthly overrides (exact month only)
// Uses useLimits with new limits[] schema.
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { useAppContext }  from "../../context/AppContext";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { usePanelLock }   from "../../hooks/usePanelLock";
import { useLimits, getActiveLimit } from "../../hooks/useLimits";
import { LockBanner }     from "../ui/LockBanner";
import { BudgetInput }    from "../ui/BudgetInput";
import { fmt }            from "../../utils/helpers";
import { theme as s }     from "../../styles/theme";

export default function PanelBaseBudget() {
  const { categories }          = useAppContext();
  const { activeBudgetMonth }   = useMonthStatus();
  const { isPastMonth, isMonthClosed, isHistoricalLock } = usePanelLock(activeBudgetMonth);

  const {
    limits, isLoading, isSaving,
    loadLimits, saveLimit, removeLimit, getLimitDoc,
  } = useLimits();

  const [baseEdits,     setBaseEdits]     = useState({});
  const [overrideEdits, setOverrideEdits] = useState({});
  const [isDirty,       setIsDirty]       = useState(false);

  useEffect(() => { loadLimits(); }, []);

  const expenseCategories = useMemo(() => {
    const active = categories.filter(c => c.type === "EXPENSE" && !c.isArchived);

    // Archived categories that had a limit this month — shown read-only for historical accuracy
    const archivedWithLimits = categories.filter(c =>
      c.type === "EXPENSE" && c.isArchived &&
      limits.some(l => l.categoryId === c.id && getActiveLimit(l, activeBudgetMonth))
    );

    return [
      ...active,
      ...archivedWithLimits.map(c => ({ ...c, _readOnly: true })),
    ];
  }, [categories, limits, activeBudgetMonth]);

  // Init local edit state when limits or month changes
  useEffect(() => {
    const bases = {};
    const overrides = {};
    for (const cat of expenseCategories) {
      const doc = getLimitDoc(cat.id);
      const currentBase = (doc?.limits || [])
        .filter(l => l.type === "base")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const active = getActiveLimit(doc, activeBudgetMonth);
      bases[cat.id]     = currentBase?.amount ?? "";
      overrides[cat.id] = active?.type === "override" ? active.amount : "";
    }
    setBaseEdits(bases);
    setOverrideEdits(overrides);
    setIsDirty(false);
  }, [limits, expenseCategories, activeBudgetMonth]);

  function setBase(catId, val)     { setBaseEdits(p => ({ ...p, [catId]: val }));     setIsDirty(true); }
  function setOverride(catId, val) { setOverrideEdits(p => ({ ...p, [catId]: val })); setIsDirty(true); }

  async function handleSave() {
    const promises = [];
    for (const cat of expenseCategories) {
      if (cat._readOnly) continue; // skip archived categories
      const doc     = getLimitDoc(cat.id);
      const baseVal = parseFloat(baseEdits[cat.id]);
      const ovrVal  = parseFloat(overrideEdits[cat.id]);

      const currentBase = (doc?.limits || [])
        .filter(l => l.type === "base")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const active = getActiveLimit(doc, activeBudgetMonth);

      // Save base if value changed
      if (!isNaN(baseVal) && baseVal !== currentBase?.amount) {
        promises.push(saveLimit(cat.id, activeBudgetMonth, baseVal, "base"));
      }

      // Override
      const hasOverride = overrideEdits[cat.id] !== "" && !isNaN(ovrVal);
      const hadOverride = active?.type === "override";

      if (hasOverride && ovrVal !== active?.amount) {
        promises.push(saveLimit(cat.id, activeBudgetMonth, ovrVal, "override"));
      } else if (!hasOverride && hadOverride) {
        promises.push(removeLimit(cat.id, activeBudgetMonth, "override"));
      }
    }
    await Promise.all(promises);
    setIsDirty(false);
  }

  // ── Single row ────────────────────────────────────────────

  function LimitRow({ cat }) {
    const doc    = getLimitDoc(cat.id);
    const active = getActiveLimit(doc, activeBudgetMonth);

    const baseHistory = (doc?.limits || [])
      .filter(l => l.type === "base")
      .sort((a, b) => b.date.localeCompare(a.date));

    const hasOverride    = active?.type === "override";
    const effectiveLimit = active?.amount ?? null;
    const isReadOnly     = isHistoricalLock || cat._readOnly;

    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 160px 160px 80px",
        gap: 8, alignItems: "center",
        padding: "10px 0", borderBottom: "1px solid #1e293b",
        opacity: cat._readOnly ? 0.5 : 1,
      }}>
        {/* Category name */}
        <div>
          <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13 }}>
            {cat.icon} {cat.name}
            {cat._readOnly && (
              <span style={{ fontSize: 10, color: "#475569", marginLeft: 6, fontWeight: 400 }}>
                (zarchiwizowana)
              </span>
            )}
          </div>
          {baseHistory.length > 1 && (
            <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
              📝 {baseHistory.length} wersji bazy
            </div>
          )}
        </div>

        {/* Base */}
        <div>
          {isReadOnly ? (
            <div style={{ ...s.input, fontSize: 13, color: "#64748b", cursor: "not-allowed", opacity: 0.6 }}>
              {baseHistory[0] ? fmt(baseHistory[0].amount) : "—"}
            </div>
          ) : (
            <BudgetInput
              value={baseEdits[cat.id] ?? ""}
              onChange={v => setBase(cat.id, v)}
              style={{ ...s.input, fontSize: 13 }}
              placeholder={baseHistory[0] ? fmt(baseHistory[0].amount) : "brak"}
            />
          )}
          {baseHistory[0] && (
            <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>
              od {baseHistory[0].date}
            </div>
          )}
        </div>

        {/* Override */}
        <div>
          {isReadOnly ? (
            <div style={{ ...s.input, fontSize: 13, color: hasOverride ? "#f59e0b" : "#334155", cursor: "not-allowed", opacity: 0.6 }}>
              {hasOverride ? fmt(active.amount) : "—"}
            </div>
          ) : (
            <BudgetInput
              value={overrideEdits[cat.id] ?? ""}
              onChange={v => setOverride(cat.id, v)}
              style={{
                ...s.input, fontSize: 13,
                borderColor: hasOverride ? "#f59e0b66" : "#1e293b",
              }}
              placeholder="—"
            />
          )}
          {hasOverride && (
            <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 3 }}>
              ⚡ nadpisanie {activeBudgetMonth}
            </div>
          )}
        </div>

        {/* Effective */}
        <div style={{ textAlign: "right" }}>
          {effectiveLimit !== null ? (
            <span style={{ fontWeight: 700, fontSize: 13, color: hasOverride ? "#f59e0b" : "#10b981" }}>
              {fmt(effectiveLimit)}
            </span>
          ) : (
            <span style={{ color: "#334155", fontSize: 12 }}>—</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 40px 0", maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>
          🏦 Baza budżetu
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {activeBudgetMonth} · limity wydatkowe
        </div>
      </div>

      <LockBanner isPastMonth={isPastMonth} isMonthClosed={isMonthClosed} selectedMonth={activeBudgetMonth} />

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 160px 160px 80px",
        gap: 8, padding: "6px 0 10px", borderBottom: "2px solid #1e293b", marginBottom: 4,
      }}>
        <div style={s.label}>Kategoria</div>
        <div style={s.label}>
          Baza
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            od daty wzwyż
          </div>
        </div>
        <div style={s.label}>
          Nadpisanie
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            tylko {activeBudgetMonth}
          </div>
        </div>
        <div style={{ ...s.label, textAlign: "right" }}>Aktywny</div>
      </div>

      {isLoading && (
        <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && expenseCategories.map(cat => (
        <LimitRow key={cat.id} cat={cat} />
      ))}

      {/* Save */}
      {!isHistoricalLock && isDirty && (
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={() => { loadLimits(); setIsDirty(false); }}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{ ...s.btn("#10b981"), opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "Zapisuję…" : "💾 Zapisz limity"}
          </button>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 32, fontSize: 11, color: "#334155", lineHeight: 1.8 }}>
        <div>🟢 <strong>Baza</strong> — obowiązuje od podanego miesiąca wzwyż aż do kolejnej zmiany.</div>
        <div>🟡 <strong>Nadpisanie</strong> — jednorazowe tylko dla {activeBudgetMonth}. Nadpisuje bazę.</div>
        <div>⚡ <strong>Aktywny</strong> — faktyczna wartość w {activeBudgetMonth} (nadpisanie ma priorytet nad bazą).</div>
      </div>
    </div>
  );
}