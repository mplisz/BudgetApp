// ============================================================
// File: src/components/panels/transactionComponents/IncomeForm.jsx
//
// Shared form UI for INCOME / TRANSFER transactions.
// Used by: IncomeEntryCard (add) and EditIncomeModal (edit).
// No API logic here — caller provides onSubmit.
//
// Props:
//   initialValues  — { subcategoryId, subcategoryName, categoryId,
//                      categoryName, categoryType, amount, date: Date }
//   selectedMonth  — "YYYY-MM" — used for minDate and budgetMonth hint
//   onSubmit       — async (formData) => void  — called on valid submit
//   onCancel       — optional, renders Anuluj button when provided
//   submitLabel    — button label (default: "Zapisz")
//   readOnly       — disables all fields
//   showBudgetHint — show budgetMonth hint below date (for edit mode)
// ============================================================

import { useState, useCallback } from "react";
import { SubcategorySelect }     from "../../ui/SubcategorySelect";
import { AppDatePicker }         from "../../ui/AppDatePicker";

export function IncomeForm({
  initialValues,
  selectedMonth,
  onSubmit,
  onCancel,
  submitLabel    = "Zapisz",
  readOnly       = false,
  showBudgetHint = false,
  budgetMonth,
  inputStyle     = {},
  labelStyle     = {},
  btnPrimaryStyle = {},
  btnSecondaryStyle = {},
}) {
  const [form,   setForm]   = useState(initialValues);
  const [error,  setError]  = useState(null);
  const [saving, setSaving] = useState(false);

  // minDate: first day of previous month relative to selectedMonth
  const minDate = (() => {
    if (!selectedMonth) return null;
    const [y, m] = selectedMonth.split("-").map(Number);
    return m === 1 ? new Date(y - 1, 11, 1) : new Date(y, m - 2, 1);
  })();

  const handleSubmit = useCallback(async () => {
    if (!form.subcategoryId || !(Number(form.amount) > 0) || !(form.date instanceof Date)) {
      setError("Wypełnij wszystkie pola.");
      return;
    }
    const resolvedType = form.categoryType;
    if (!resolvedType || !["INCOME", "TRANSFER"].includes(resolvedType)) {
      setError("Nie udało się określić typu kategorii. Wybierz subkategorię ponownie.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [form, onSubmit]);

  const lbl = {
    display: "block", fontSize: 11, color: "#64748b",
    textTransform: "uppercase", letterSpacing: "0.6px",
    fontWeight: 700, marginBottom: 6, ...labelStyle,
  };

  return (
    <div>
      {/* Subcategory */}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Subkategoria</label>
        <SubcategorySelect
          value={form.subcategoryId}
          onChange={({ subcategoryId, subcategoryName, categoryId, categoryName, categoryType }) =>
            setForm(f => ({ ...f, subcategoryId, subcategoryName, categoryId, categoryName, categoryType }))
          }
          allowedTypes={["INCOME", "TRANSFER"]}
          placeholder="— wybierz subkategorię —"
          disabled={readOnly}
          style={inputStyle}
        />
      </div>

      {/* Amount + Date */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Kwota (PLN)</label>
          <input
            type="number" min={0} step={0.01}
            disabled={readOnly}
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            style={{ width: "100%", boxSizing: "border-box", ...inputStyle }}
          />
        </div>
        <div>
          <label style={lbl}>Data</label>
          <AppDatePicker
            value={form.date}
            onChange={date => setForm(f => ({ ...f, date }))}
            maxDate={null}
            minDate={minDate}
            disabled={readOnly}
            style={inputStyle}
          />
          {showBudgetHint && budgetMonth && (
            <div style={{ fontSize: 11, color: "#10b98199", marginTop: 4 }}>
              Miesiąc budżetowy: <strong>{budgetMonth}</strong>
              <span style={{ color: "#475569" }}> (nieedytowalny)</span>
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>⚠️ {error}</div>}

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: onCancel ? "flex-end" : "stretch", flexWrap: "wrap" }}>
        {onCancel && (
          <button onClick={onCancel} disabled={saving} style={btnSecondaryStyle}>
            Anuluj
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={readOnly || saving}
          style={{
            flex: onCancel ? undefined : 1,
            opacity: (readOnly || saving) ? 0.5 : 1,
            cursor:  (readOnly || saving) ? "not-allowed" : "pointer",
            ...btnPrimaryStyle,
          }}
        >
          {saving ? "Zapisywanie…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
