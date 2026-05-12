// ============================================================
// File: src/components/ui/PriorityPicker.jsx
// P1-P4 buttons
//
// Modes:
//   compact={false} (default) — full labels "P1 – Krytyczny",
//                                 in PanelExpenses
//   compact={true}             —  "P1"/"P2"/"P3"/"P4",
//                                 in SubcategoryRow (settings)
//).
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";

const PRIORITIES = [
  { value: 1, label: "P1 – Krytyczny", color: "#ef4444" },
  { value: 2, label: "P2 – Ważny",     color: "#f97316" },
  { value: 3, label: "P3 – Normalny",  color: "#eab308" },
  { value: 4, label: "P4 – Niski",     color: "#22c55e" },
];

export const PRIORITY_COLORS = Object.fromEntries(PRIORITIES.map(p => [p.value, p.color]));

export function computeSuggestedPriority(subcategoryId, categories) {
  if (!subcategoryId) return 4;
  for (const cat of categories) {
    const sub = (cat.sub || []).find(s => s.id === subcategoryId);
    if (sub?.priority) return sub.priority;
  }
  return 4;
}

export function PriorityPicker({
  value,
  onChange,
  subcategoryId = "",
  disabled = false,
  compact = false,
}) {
  const { categories } = useAppContext();
  const [locked, setLocked] = useState(false);

  // Auto-suggestion
  useEffect(() => {
    if (compact) return;
    if (!locked) {
      const suggested = computeSuggestedPriority(subcategoryId, categories);
      if (suggested !== value) onChange(suggested);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategoryId, locked, compact]);

  function handlePick(p) {
    if (!compact) setLocked(true);
    onChange(p);
  }

  function handleAuto() {
    setLocked(false);
    const suggested = computeSuggestedPriority(subcategoryId, categories);
    onChange(suggested);
  }

  const lbl = {
    display: "block", fontSize: 11, color: "#64748b",
    textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6,
  };

  // ── Compact ────────
  if (compact) {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {PRIORITIES.map(p => (
          <button
            key={p.value}
            onClick={() => handlePick(p.value)}
            disabled={disabled}
            title={p.label}
            style={{
              flex: 1, textAlign: "center", fontSize: 10, padding: "2px 0", borderRadius: 4,
              border:     `1px solid ${value === p.value ? p.color : "#334155"}`,
              color:      value === p.value ? p.color : "#475569",
              background: value === p.value ? p.color + "22" : "transparent",
              cursor:     disabled ? "not-allowed" : "pointer",
              fontWeight: value === p.value ? 700 : 400,
              transition: "0.15s",
              opacity:    disabled ? 0.4 : 1,
            }}>
            P{p.value}
          </button>
        ))}
      </div>
    );
  }

  // ── Normal  ───────────────────
  return (
    <div>
      <label style={lbl}>
        Priorytet&nbsp;
        <span style={{ color: "#334155", fontWeight: 400 }}>
          {locked ? "(ręczny)" : "(sugerowany z kategorii/tagów)"}
        </span>
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {PRIORITIES.map(p => (
          <button
            key={p.value}
            onClick={() => handlePick(p.value)}
            disabled={disabled}
            style={{
              padding: "6px 14px", borderRadius: 20, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12,
              border:     `1px solid ${value === p.value ? p.color : "#1e293b"}`,
              background: value === p.value ? `${p.color}22` : "transparent",
              color:      value === p.value ? p.color : "#475569",
              fontWeight: value === p.value ? 700 : 400,
              opacity:    disabled ? 0.5 : 1,
            }}>
            {p.label}
          </button>
        ))}
        {locked && !disabled && (
          <button
            onClick={handleAuto}
            style={{ padding: "6px 10px", borderRadius: 20, border: "1px solid #334155", background: "transparent", color: "#475569", cursor: "pointer", fontSize: 11 }}>
            ↺ auto
          </button>
        )}
      </div>
    </div>
  );
}