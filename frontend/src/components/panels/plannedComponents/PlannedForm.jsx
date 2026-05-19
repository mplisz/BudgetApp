// ============================================================
// File: src/components/panels/plannedComponents/PlannedForm.jsx
// Form for adding/editing a planned expense.
// Mobile-first — used in PanelAddPlanned.
// ============================================================

import { useState, useCallback, useRef, useMemo } from "react";
import { SubcategorySelect }  from "../../ui/SubcategorySelect";
import { PriorityPicker }     from "../../ui/PriorityPicker";
import { TagMultiSelect }     from "../../ui/TagMultiSelect";
import { CurrencyRateField }  from "../../ui/CurrencyRateField";
import { useToast }           from "../../../hooks/useToast";
import { useCurrencyManager } from "../../../hooks/useCurrencyManager";
import { useAppContext }      from "../../../context/AppContext";
import { generateSavingsMonths, recomputeSavings } from "../../../hooks/usePlanned";
import { theme as s }         from "../../../styles/theme";
import { fmt }                from "../../../utils/helpers";

const frow = { marginBottom: 16 };

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function monthsBetween(from, to) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function PlannedForm({ initialValues, startMonth, onSubmit, onCancel, isSaving, mode = "add" }) {
  const { showError }          = useToast();
  const { dropdownCurrencies } = useCurrencyManager();

  function resolveInitialCurrency(stored) {
    if (!stored || stored === "PLN") return { currency: "PLN", customCurrency: "" };
    const inDropdown = dropdownCurrencies.some(c => c.code === stored);
    return inDropdown
      ? { currency: stored, customCurrency: "" }
      : { currency: "INNE", customCurrency: stored };
  }

  const initCurrency = resolveInitialCurrency(initialValues?.originalCurrency);

  function addOneMonth(m) {
    const [y, mo] = m.split("-").map(Number);
    const nm = mo === 12 ? 1 : mo + 1;
    const ny = mo === 12 ? y + 1 : y;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  }

  const cur     = startMonth || currentMonthStr();
  const minPlan = addOneMonth(cur);

  const [form, setForm] = useState(() => ({
    description:          initialValues?.description          ?? "",
    totalAmount:          initialValues?.totalAmount          ?? "",
    currency:             initCurrency.currency,
    customCurrency:       initCurrency.customCurrency,
    fxRate:               initialValues?.fxRate               ?? 1,
    targetSubcategoryId:  initialValues?.targetSubcategoryId  ?? "",
    targetSubcategoryName:initialValues?.targetSubcategoryName ?? "",
    targetCategoryId:     initialValues?.targetCategoryId     ?? "",
    targetCategoryName:   initialValues?.targetCategoryName   ?? "",
    tags:                 initialValues?.tags                 ?? [],
    priority:             initialValues?.priority             ?? 2,
    mode:                 initialValues?.mode                 ?? "oneoff",
    plannedMonth:         initialValues?.plannedMonth         ?? minPlan,
    monthlySavingDay:     initialValues?.monthlySavingDay     ?? 1,
  }));

  const [rateInfo,    setRateInfo]    = useState({ activeRate: 1, resolvedCurrency: "PLN" });
  const lastRateRef = useRef(null);

  const handleRateReady = useCallback(({ activeRate, resolvedCurrency }) => {
    const key = `${resolvedCurrency}_${activeRate}`;
    if (lastRateRef.current === key) return;
    lastRateRef.current = key;
    setRateInfo({ activeRate, resolvedCurrency });
    setForm(f => ({ ...f, fxRate: activeRate }));
  }, []);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  // Live suggestion preview
  const suggestion = useMemo(() => {
    if (form.mode !== "envelope" || !form.totalAmount || !form.plannedMonth) return null;
    const totalPLN = rateInfo.resolvedCurrency !== "PLN"
      ? parseFloat(form.totalAmount) * (form.fxRate || 1)
      : parseFloat(form.totalAmount);
    const months   = monthsBetween(cur, form.plannedMonth);
    return Math.round(totalPLN / months * 100) / 100;
  }, [form.totalAmount, form.plannedMonth, form.mode, form.fxRate, rateInfo.resolvedCurrency]);

  function handleSubmit() {
    if (!form.description?.trim())   { showError("Podaj opis wydatku."); return; }
    if (!form.targetSubcategoryId)   { showError("Wybierz subkategorię."); return; }
    if (!form.totalAmount || parseFloat(form.totalAmount) <= 0) { showError("Podaj kwotę > 0."); return; }
    if (!form.plannedMonth)              { showError("Podaj planowany miesiąc zakupu."); return; }
    if (form.plannedMonth < minPlan)     { showError(`Miesiąc zakupu musi być po ${cur}.`); return; }
    if (form.mode === "envelope" && parseInt(form.monthlySavingDay) < 1) {
      showError("Podaj dzień miesiąca."); return;
    }

    const isForeign    = rateInfo.resolvedCurrency !== "PLN";
    const totalAmountPLN = isForeign
      ? Math.round(parseFloat(form.totalAmount) * (form.fxRate || 1) * 100) / 100
      : parseFloat(form.totalAmount);

    // Generate virtualSavings for envelope — from current month to plannedMonth
    let virtualSavings = [];
    if (form.mode === "envelope") {
      const startMonth = cur; // always start from current calendar month
      const months     = monthsBetween(startMonth, form.plannedMonth);
      const suggOrig   = Math.round(parseFloat(form.totalAmount) / months * 100) / 100;
      virtualSavings   = generateSavingsMonths(startMonth, form.plannedMonth, suggOrig, form.fxRate || 1);
    }

    onSubmit({
      description:          form.description.trim(),
      totalAmount:          parseFloat(form.totalAmount),
      originalCurrency:     rateInfo.resolvedCurrency || "PLN",
      fxRate:               form.fxRate || 1,
      totalAmountPLN,
      targetCategoryId:     form.targetCategoryId,
      targetCategoryName:   form.targetCategoryName,
      targetSubcategoryId:  form.targetSubcategoryId,
      targetSubcategoryName:form.targetSubcategoryName,
      tags:                 form.tags,
      priority:             form.priority,
      mode:                 form.mode,
      plannedMonth:         form.plannedMonth,
      monthlySavingDay:     parseInt(form.monthlySavingDay) || 1,
      virtualSavings,
    });
  }

  return (
    <div>
      {/* Description */}
      <div style={frow}>
        <label style={s.label}>Opis * <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(nazwa planowanego wydatku)</span></label>
        <input
          type="text" maxLength={500}
          value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="np. Laptop, wakacje, hulajnoga..."
          style={{ ...s.input, border: `1px solid ${!form.description?.trim() ? "#ef444466" : "#1e293b"}` }}
        />
      </div>

      {/* Mode */}
      <div style={frow}>
        <label style={s.label}>Tryb</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { key: "oneoff",   label: "💳 Jednorazowy",     sub: "płacę w całości" },
            { key: "envelope", label: "🪙 Wirtualna koperta", sub: "odkładam co miesiąc" },
          ].map(opt => (
            <button
              key={opt.key}
              disabled={mode === "edit"}
              onClick={() => set("mode", opt.key)}
              style={{
                flex: 1, padding: "10px 8px", borderRadius: 10, border: "none",
                cursor: mode === "edit" ? "not-allowed" : "pointer",
                background: form.mode === opt.key ? "#3b82f622" : "#1e293b",
                border: `1px solid ${form.mode === opt.key ? "#3b82f6" : "transparent"}`,
                color: form.mode === opt.key ? "#3b82f6" : "#64748b",
                textAlign: "left", opacity: mode === "edit" ? 0.7 : 1,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: "#475569" }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Target subcategory */}
      <div style={frow}>
        <label style={s.label}>Subkategoria zakupu</label>
        <SubcategorySelect
          value={form.targetSubcategoryId}
          onChange={({ subcategoryId, subcategoryName, categoryId, categoryName }) =>
            setForm(f => ({ ...f, targetSubcategoryId: subcategoryId, targetSubcategoryName: subcategoryName, targetCategoryId: categoryId, targetCategoryName: categoryName }))
          }
          allowedTypes={["EXPENSE"]}
          placeholder="— gdzie trafi wydatek? —"
        />
        {form.targetCategoryName && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>{form.targetCategoryName}</div>
        )}
      </div>

      {/* Currency */}
      <div style={frow}>
        <CurrencyRateField
          currency={form.currency}
          customCurrency={form.customCurrency}
          date={new Date().toISOString().slice(0, 10)}
          onCurrencyChange={v => set("currency", v)}
          onCustomChange={v => set("customCurrency", v)}
          onRateReady={handleRateReady}
        />
      </div>

      {/* Amount */}
      <div style={frow}>
        <label style={s.label}>Kwota całkowita ({rateInfo.resolvedCurrency || "PLN"})</label>
        <input
          type="number" min={0} step={0.01}
          value={form.totalAmount}
          onChange={e => set("totalAmount", e.target.value)}
          placeholder="0,00"
          style={s.input}
        />
        {parseFloat(form.totalAmount) > 0 && rateInfo.resolvedCurrency !== "PLN" && (
          <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>
            ≈ {fmt(parseFloat(form.totalAmount) * (form.fxRate || 1))} PLN
          </div>
        )}
      </div>

      {/* Planned month */}
      <div style={frow}>
        <label style={s.label}>Planowany miesiąc zakupu</label>
        <input
          type="month"
          value={form.plannedMonth}
          min={minPlan}
          onChange={e => {
            const val = e.target.value;
            if (val && val < minPlan) return; // block past
            set("plannedMonth", val);
          }}
          onClick={e => e.target.showPicker?.()}
          style={{ ...s.input, colorScheme: "dark", cursor: "pointer" }}
        />
        {form.plannedMonth && form.plannedMonth < minPlan && (
          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
            ⚠️ Miesiąc zakupu musi być po {cur}
          </div>
        )}
      </div>

      {/* Envelope extras */}
      {form.mode === "envelope" && (
        <>
          <div style={frow}>
            <label style={s.label}>Dzień miesiąca przypomnienia</label>
            <input
              type="number" min={1} max={31}
              value={form.monthlySavingDay}
              onChange={e => {
                const v = parseInt(e.target.value) || 1;
                set("monthlySavingDay", Math.min(31, Math.max(1, v)));
              }}
              style={s.input}
            />
          </div>

          {/* Suggestion preview */}
          {suggestion !== null && form.plannedMonth && (
            <div style={{
              background: "#0a0f1e", border: "1px solid #10b98133",
              borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                📊 Plan odkładania:
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Miesięcy</div>
                  <div style={{ fontWeight: 700, color: "#e2e8f0" }}>
                    {monthsBetween(cur, form.plannedMonth)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Sugestia/miesiąc</div>
                  <div style={{ fontWeight: 700, color: "#10b981" }}>
                    {fmt(suggestion)} PLN
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Cel</div>
                  <div style={{ fontWeight: 700, color: "#e2e8f0" }}>
                    {fmt(parseFloat(form.totalAmount) * (rateInfo.resolvedCurrency !== "PLN" ? form.fxRate : 1))} PLN
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Priority */}
      <div style={frow}>
        <PriorityPicker value={form.priority} onChange={v => set("priority", v)} subcategoryId={form.targetSubcategoryId} />
      </div>

      {/* Tags */}
      <div style={frow}>
        <label style={s.label}>Tagi</label>
        <TagMultiSelect value={form.tags} onChange={v => set("tags", v)} />
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        {onCancel && (
          <button onClick={onCancel}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}>
            Anuluj
          </button>
        )}
        <button onClick={handleSubmit} disabled={isSaving}
          style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: isSaving ? "#1e293b" : "#3b82f6", color: "#fff", cursor: isSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14 }}>
          {isSaving ? "Zapisuję…" : mode === "add" ? "📅 Dodaj planowany" : "💾 Zapisz zmiany"}
        </button>
      </div>
    </div>
  );
}