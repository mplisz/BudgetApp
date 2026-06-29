// ============================================================
// File: src/components/ui/extra.jsx
// Extra components: CollapsibleCard, DrillDownPie, DurationPicker
// ============================================================

import { c } from "../../styles/tokens";
import { useState } from "react";
import { fmt } from "../../utils/helpers";
import { CATEGORIES, PIE_COLORS } from "../../data/constants";
import { PieChart } from "./index";

export function CollapsibleCard({ title, children, badge, badgeColor, s, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ ...s.card, marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen(v => !v)}>
        <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {badge && <span style={{ color: badgeColor || c.success, fontWeight: 800, fontSize: 16 }}>{badge}</span>}
          <span style={{ color: c.textMuted, fontSize: 16, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▾</span>
        </div>
      </div>
      {open && children}
    </div>
  );
}

export function DrillDownPie({ filteredExpenses, categories, s }) {
  const [selectedPieCat, setSelectedPieCat] = React.useState(null);

  const byCategoryForPie = Object.fromEntries(
    Object.keys(categories).map(cat => [
      cat,
      filteredExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    ]).filter(([, v]) => v > 0)
  );

  const drillData = selectedPieCat
    ? (() => {
        const bySub = {};
        filteredExpenses.filter(e => e.category === selectedPieCat)
          .forEach(e => { bySub[e.sub] = (bySub[e.sub] || 0) + e.amount; });
        return bySub;
      })()
    : byCategoryForPie;

  const drillTotal = Object.values(drillData).reduce((s, v) => s + v, 0);
  const catIcon    = categories[selectedPieCat]?.icon ?? "";

  const drillLabelResolver = selectedPieCat
    ? (sub) => sub
    : (cat) => (CATEGORIES[cat]?.icon ? CATEGORIES[cat].icon + " " + cat : cat);

  return (
    <div style={s.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {selectedPieCat ? <>{catIcon} {selectedPieCat} – podkategorie</> : "🥧 Podział wydatków"}
        </div>
        {selectedPieCat && (
          <button onClick={() => setSelectedPieCat(null)}
            style={{ background: c.border, border: `1px solid ${c.borderStrong}`, color: c.textTertiary, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            ⬅️ Powrót
          </button>
        )}
      </div>
      {!selectedPieCat && (
        <div style={{ color: c.textMuted, fontSize: 10, marginBottom: 8, textAlign: "center" }}>
          Kliknij wycinek lub kategorię aby zobaczyć podkategorie
        </div>
      )}
      {drillTotal === 0 ? (
        <div style={{ color: c.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>Brak wydatków</div>
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
}

export function DurationPicker({ startMonth, endMonth, onStartChange, onEndChange, onClear, s }) {
  const [open, setOpen] = React.useState(false);

  // Calculate endMonth string from start + N months
  function calcEndMonth(start, months) {
    if (!start || !months) return "";
    const [y, m] = start.split("-").map(Number);
    const total = m - 1 + parseInt(months);
    const ey = y + Math.floor(total / 12);
    const em = (total % 12) + 1;
    return `${ey}-${String(em).padStart(2, "0")}`;
  }

  // Derive displayed month count from stored start/end
  const durationMonths = endMonth && startMonth
    ? (() => {
        const [sy, sm] = startMonth.split("-").map(Number);
        const [ey, em] = endMonth.split("-").map(Number);
        return (ey - sy) * 12 + (em - sm);
      })()
    : "";

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Collapsible header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: open ? 12 : 0 }}
        onClick={() => setOpen(v => !v)}>
        <label style={{ ...s.label, cursor: "pointer", marginBottom: 0 }}>
          ⏳ Czas trwania{" "}
          {endMonth
            ? <span style={{ color: c.amber, fontWeight: 700 }}>· do {endMonth}</span>
            : <span style={{ color: c.textMuted, fontWeight: 400 }}>(opcjonalnie)</span>}
        </label>
        <span style={{ color: c.textMuted, fontSize: 14, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▾</span>
      </div>

      {open && (
        <div style={{ background: c.border, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...s.label, fontSize: 10, marginBottom: 4 }}>📅 Miesiąc początkowy</label>
              <input style={s.input} type="month" value={startMonth || ""}
                onChange={e => {
                  const start = e.target.value;
                  // Recalculate endMonth preserving duration count
                  const newEnd = durationMonths ? calcEndMonth(start, durationMonths) : endMonth;
                  onStartChange(start, newEnd);
                }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...s.label, fontSize: 10, marginBottom: 4, color: c.amber }}>🔢 Liczba miesięcy</label>
              <input style={s.input} type="number" min="1" max="360" placeholder="np. 10"
                value={durationMonths}
                onChange={e => {
                  const n = parseInt(e.target.value);
                  const start = startMonth || new Date().toISOString().slice(0, 7);
                  onEndChange(start, n > 0 ? calcEndMonth(start, n) : "");
                }} />
            </div>
          </div>
          {endMonth && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ color: c.textSecondary, fontSize: 12 }}>Miesiąc końcowy:</span>
              <span style={{ color: c.amber, fontWeight: 700, fontSize: 14 }}>📅 {endMonth}</span>
            </div>
          )}
          {endMonth && (
            <button onClick={onClear}
              style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 11 }}>
              ✕ Usuń ograniczenie czasu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
