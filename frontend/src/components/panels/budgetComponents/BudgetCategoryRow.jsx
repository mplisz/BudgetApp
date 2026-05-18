// ============================================================
// File: src/components/panels/budgetComponents/BudgetCategoryRow.jsx
//
// Unified row for Base (variant="base") and Override
// (variant="override") columns in PanelBaseBudget.
//
// variant="base":
//   Controlled numeric input, always has a value.
//   onChange(catId, Number).
//
// variant="override" — Placeholder & Delete pattern:
//   Input value is "" when no override is active.
//   placeholder shows the base amount as a grey hint ("brak bazy" if 0).
//   Active override: accent border + accent text + "×" clear button.
//   Clearing or typing the same value as base → DELETE on save.
//   onChange(catId, string) to allow "".
// ============================================================

import { theme as s } from "../../../styles/theme";

export function BudgetCategoryRow({
  variant = "base",
  category,
  value,
  baseAmount,
  onChange,
  readOnly,
  accent = "#10b981",
}) {
  const isOverride        = variant === "override";
  const hasActiveOverride = isOverride && value !== "" && value !== undefined;

  function handleChange(e) {
    if (isOverride) {
      onChange(category.id, e.target.value);
    } else {
      onChange(category.id, Number(e.target.value));
    }
  }

  // Placeholder: show base amount as grey hint, or "brak bazy" if no base set
  const placeholder = isOverride
    ? (baseAmount !== undefined && baseAmount !== 0 ? String(baseAmount) : "brak bazy")
    : undefined;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid #1e293b",
      opacity: readOnly ? 0.65 : 1,
    }}>
      {/* Category label */}
      <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", fontSize: 14 }}>
        <span style={{ fontSize: 18 }}>{category.icon}</span>
        {category.name}
      </span>

      {/* Input + optional clear button */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          min={0}
          step={50}
          disabled={readOnly}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={handleChange}
          style={{
            ...s.input,
            width: 110,
            textAlign: "right",
            padding: "7px 10px",
            fontSize: 14,
            cursor: readOnly ? "not-allowed" : "text",
            background: readOnly
              ? "#0a0f1e"
              : isOverride && hasActiveOverride ? "#1a1200" : "#1e293b",
            borderColor: readOnly
              ? "#1e293b"
              : isOverride && hasActiveOverride ? accent + "88" : accent + "44",
            color: readOnly
              ? "#475569"
              : isOverride ? (hasActiveOverride ? accent : "#475569") : "#f1f5f9",
          }}
        />

        {/* "×" — only for override variant when a value is actively set */}
        {isOverride && hasActiveOverride && !readOnly && (
          <button
            onClick={() => onChange(category.id, "")}
            title="Usuń nadpisanie — wróć do wartości z bazy"
            style={{
              background: "transparent", border: "none",
              color: "#ef4444", cursor: "pointer",
              fontSize: 16, lineHeight: 1, padding: "2px 4px", borderRadius: 4,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
