// ============================================================
// File: src/components/panels/transactionComponents/IncomeForm.tsx
// Shared form UI for INCOME / TRANSFER transactions.
// Used by: IncomeEntryCard (add) and EditIncomeModal (edit).
// No API logic here — caller provides onSubmit.
//
// Props:
//   initialValues   — form field defaults
//   selectedMonth   — "YYYY-MM" — used for minDate and budgetMonth hint
//   onSubmit        — async (formData) => void
//   onCancel        — optional, renders Cancel button
//   submitLabel     — button label (default: "Zapisz")
//   readOnly        — disables all fields
//   showBudgetHint  — shows budgetMonth hint below date (for edit mode)
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useCallback } from "react";
import { SubcategorySelect }  from "../../ui/SubcategorySelect";
import { AppDatePicker }      from "../../ui/AppDatePicker";

// ── Types ─────────────────────────────────────────────────────

export interface IncomeFormValues {
  subcategoryId:   string;
  subcategoryName: string;
  categoryId:      string;
  categoryName:    string;
  categoryType:    "INCOME" | "TRANSFER" | null;
  amount:          string | number;
  date:            Date;
  description:     string;
}

interface IncomeFormProps {
  initialValues:      IncomeFormValues;
  selectedMonth:      string;
  onSubmit:           (data: IncomeFormValues) => Promise<void>;
  onCancel?:          () => void;
  submitLabel?:       string;
  readOnly?:          boolean;
  showBudgetHint?:    boolean;
  budgetMonth?:       string;
  inputStyle?:        React.CSSProperties;
  labelStyle?:        React.CSSProperties;
  btnPrimaryStyle?:   React.CSSProperties;
  btnSecondaryStyle?: React.CSSProperties;
}

// ── Styles ─────────────────────────────────────────────────────

const defaultLabel: React.CSSProperties = {
  display:       "block",
  fontSize:      11,
  color:         c.textSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.6px",
  fontWeight:    700,
  marginBottom:  6,
};

const defaultInput: React.CSSProperties = {
  width:        "100%",
  boxSizing:    "border-box",
  background:   c.bg,
  border:       `1px solid ${c.border}`,
  borderRadius: 8,
  color:        c.text,
  padding:      "9px 12px",
  fontSize:     14,
  outline:      "none",
};

// ── Component ─────────────────────────────────────────────────

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
  btnPrimaryStyle   = {},
  btnSecondaryStyle = {},
}: IncomeFormProps) {
  const [form,   setForm]   = useState<IncomeFormValues>(initialValues);
  const [error,  setError]  = useState<string | null>(null);
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
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [form, onSubmit]);

  const lbl: React.CSSProperties = { ...defaultLabel, ...labelStyle };
  const inp: React.CSSProperties = { ...defaultInput, ...inputStyle };

  return (
    <div>
      {/* Subcategory */}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Subkategoria</label>
        <SubcategorySelect
          value={form.subcategoryId}
          onChange={({ subcategoryId, subcategoryName, categoryId, categoryName, categoryType }: {
            subcategoryId:   string;
            subcategoryName: string;
            categoryId:      string;
            categoryName:    string;
            categoryType:    string | null;
          }) =>
            setForm(f => ({ ...f, subcategoryId, subcategoryName, categoryId, categoryName, categoryType: categoryType as "INCOME" | "TRANSFER" | null }))
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
            type="number"
            min={0}
            step={0.01}
            disabled={readOnly}
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            style={inp}
          />
        </div>
        <div>
          <label style={lbl}>Data</label>
          <AppDatePicker
            value={form.date}
            onChange={(date: Date) => setForm(f => ({ ...f, date }))}
            maxDate={null}
            minDate={minDate ?? undefined}
            disabled={readOnly}
            style={inputStyle}
          />
          {showBudgetHint && budgetMonth && (
            <div style={{ fontSize: 11, color: alpha(c.success, "99"), marginTop: 4 }}>
              Miesiąc budżetowy: <strong>{budgetMonth}</strong>
              <span style={{ color: c.textMuted }}> (nieedytowalny)</span>
            </div>
          )}
        </div>
      </div>

      {/* Description — new field */}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Opis (opcjonalny)</label>
        <input
          type="text"
          maxLength={500}
          disabled={readOnly}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="np. wynagrodzenie za maj, zwrot nadpłaty..."
          style={inp}
        />
      </div>

      {error && (
        <div style={{ color: c.dangerLight, fontSize: 12, marginBottom: 8 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: onCancel ? "space-between" : "flex-end" }}>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: "10px 20px", borderRadius: 8,
              border: `1px solid ${c.border}`, background: "transparent",
              color: c.textTertiary, cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600,
              ...btnSecondaryStyle,
            }}
          >
            Anuluj
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={readOnly || saving}
          style={{
            padding: "10px 24px", borderRadius: 8, border: "none",
            background: readOnly || saving ? c.border : c.success,
            color: c.white, fontWeight: 700, fontSize: 14,
            cursor: readOnly || saving ? "not-allowed" : "pointer",
            ...btnPrimaryStyle,
          }}
        >
          {saving ? "Zapisuję…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
