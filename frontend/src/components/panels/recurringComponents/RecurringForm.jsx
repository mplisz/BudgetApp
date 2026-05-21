// ============================================================
// File: src/components/panels/recurringComponents/RecurringForm.jsx
// Form for add/edit recurring expense.
// Cost history in costs[] — new cost entry added on edit.
// ============================================================

import { useState, useCallback, useRef, useMemo } from "react";
import { SubcategorySelect }  from "../../ui/SubcategorySelect";
import { PriorityPicker }     from "../../ui/PriorityPicker";
import { TagMultiSelect }     from "../../ui/Tagmultiselect";
import { CurrencyRateField }  from "../../ui/CurrencyRateField";
import { useToast }           from "../../../hooks/useToast";
import { useCurrencyManager } from "../../../hooks/useCurrencyManager";
import { useAppContext }      from "../../../context/AppContext";
import { theme as s }         from "../../../styles/theme";
import {MONTH_NAMES, computeValidTo, getActiveCost,} from "../../../hooks/useRecurring";
import {FREQUENCY_OPTIONS} from  "../../../data/constants";
const frow = { marginBottom: 16 };

function emptyForm(validFrom) {
  return {
    description:     "",
    subcategoryId:   "",
    subcategoryName: "",
    categoryId:      "",
    categoryName:    "",
    categoryType:    null,
    frequency:       "monthly",
    activeMonths:    [],
    plannedDay:      1,
    tags:            [],
    priority:        2,
    // Cost
    amount:          "",
    currency:        "PLN",
    customCurrency:  "",
    fxRate:          1,
    // ValidTo
    validToMode:     "none",
    validToDate:     null,
    monthsCount:     "",
    // Internal
    validFrom:       validFrom || "",
  };
}

export function RecurringForm({ initialValues, validFrom, activeBudgetMonth, onSubmit, onCancel, isSaving, mode = "add" }) {
  const { showError }           = useToast();
  const { dropdownCurrencies }  = useCurrencyManager();
  const { categories }          = useAppContext();

  // Check if any EXPENSE sub has canBeRecurring
  const hasRecurringSubcategories = useMemo(() =>
    categories.some(cat =>
      cat.type === "EXPENSE" && !cat.isArchived &&
      (cat.sub || []).some(s => !s.isArchived && s.canBeRecurring === true)
    ), [categories]
  );

  // Map stored currency → CurrencyRateField props
  function resolveInitialCurrency(stored) {
    if (!stored || stored === "PLN") return { currency: "PLN", customCurrency: "" };
    const inDropdown = dropdownCurrencies.some(c => c.code === stored);
    return inDropdown
      ? { currency: stored, customCurrency: "" }
      : { currency: "INNE", customCurrency: stored };
  }

  const [form, setForm] = useState(() => {
    if (initialValues) {
      // Edit mode — get active cost for current month
      const activeCost = getActiveCost(initialValues, activeBudgetMonth);
      const cur = resolveInitialCurrency(activeCost?.originalCurrency);
      return {
        description:     initialValues.description || "",
        subcategoryId:   initialValues.subcategoryId || "",
        subcategoryName: initialValues.subcategoryName || "",
        categoryId:      initialValues.categoryId || "",
        categoryName:    initialValues.categoryName || "",
        categoryType:    "EXPENSE",
        frequency:       initialValues.frequency || "monthly",
        activeMonths:    initialValues.activeMonths || [],
        plannedDay:      initialValues.plannedDay || 1,
        tags:            initialValues.tags || [],
        priority:        initialValues.priority || 2,
        amount:          String(activeCost?.amount ?? ""),
        currency:        cur.currency,
        customCurrency:  cur.customCurrency,
        fxRate:          activeCost?.fxRate || 1,
        validToMode:     initialValues.validTo ? "month" : "none",
        validToDate:     initialValues.validTo
          ? (() => { const [y, m] = initialValues.validTo.split("-").map(Number); return new Date(y, m - 1, 1); })()
          : null,
        monthsCount:     "",
        validFrom:       activeBudgetMonth || initialValues.costs?.[0]?.validFrom || "",
      };
    }
    return emptyForm(validFrom);
  });

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

  function toggleActiveMonth(m) {
    setForm(p => ({
      ...p,
      activeMonths: p.activeMonths.includes(m)
        ? p.activeMonths.filter(x => x !== m)
        : [...p.activeMonths, m].sort((a, b) => a - b),
    }));
  }

  function resolveValidTo() {
    if (form.validToMode === "none") return null;
    if (form.validToMode === "month" && form.validToDate) {
      const y = form.validToDate.getFullYear();
      const m = String(form.validToDate.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    }
    if (form.validToMode === "count" && form.monthsCount && form.validFrom) {
      return computeValidTo(form.validFrom, parseInt(form.monthsCount), form.frequency, form.activeMonths);

    }
    if (form.validToMode === "yearend") {
      if (!form.validFrom) return null;
      const year = form.validFrom.split("-")[0];
      return `${year}-12`;
    }
    return null;
  }

function handleSubmit() {
  // ── Podstawowa walidacja ──────────────────────────────────
  if (!form.description?.trim())   { showError("Podaj opis wydatku."); return; }
  if (!form.subcategoryId)         { showError("Wybierz subkategorię."); return; }
  if (!form.amount || parseFloat(form.amount) <= 0) { showError("Podaj kwotę > 0."); return; }
  if (!form.validFrom)             { showError("Brak miesiąca startowego."); return; }
  if (parseInt(form.plannedDay) < 1 || parseInt(form.plannedDay) > 31) {
    showError("Dzień miesiąca musi być między 1 a 31."); return;
  }
  if (form.frequency === "custom" && form.activeMonths.length === 0) {
    showError("Wybierz co najmniej jeden miesiąc."); return;
  }
 
  // ── Walidacja "Do końca roku" ─────────────────────────────
  if (form.validToMode === "yearend" && form.validFrom) {
    const startM = Number(form.validFrom.split("-")[1]);
    const monthsLeft = 12 - startM + 1; // np. start w maju → 8 miesięcy do końca roku
 
    if (form.frequency === "custom") {
      const hitsThisYear = (form.activeMonths || []).filter(m => m >= startM);
      if (hitsThisYear.length === 0) {
        showError(
          `⚠️ Żaden z wybranych miesięcy (${form.activeMonths.map(m => MONTH_NAMES[m-1]).join(", ")}) ` +
          `nie wypada między ${MONTH_NAMES[startM-1]} a Grudniem. ` +
          `Zmień aktywne miesiące lub wybierz inny zakres.`
        );
        return;
      }
      const outsideYear = (form.activeMonths || []).filter(m => m < startM);
      if (outsideYear.length > 0) {
        showInfo(
          `ℹ️ Miesiące ${outsideYear.map(m => MONTH_NAMES[m-1]).join(", ")} ` +
          `nie wystąpią w tym roku (zaczynasz od ${MONTH_NAMES[startM-1]}).`
        );
      }
    }
 
    if (form.frequency === "quarterly" && monthsLeft < 3) {
      showError(
        `⚠️ Do końca roku zostało tylko ${monthsLeft} mies. — ` +
        `wydatek kwartalny nie wystąpi ani razu. Wybierz "Bezterminowo" lub "Wybierz miesiąc".`
      );
      return;
    }
    if (form.frequency === "biannual" && monthsLeft < 6) {
      showError(
        `⚠️ Do końca roku zostało tylko ${monthsLeft} mies. — ` +
        `wydatek półroczny nie wystąpi ani razu. Wybierz "Bezterminowo" lub "Wybierz miesiąc".`
      );
      return;
    }
  }
  // ── payload ─────────────────────────────────────────
  const resolvedCurrency = rateInfo.resolvedCurrency !== "PLN"
    ? rateInfo.resolvedCurrency
    : (form.currency === "PLN" ? "PLN" : rateInfo.resolvedCurrency);
 
  const isForeign = resolvedCurrency !== "PLN";
  const amountPLN = isForeign
    ? Math.round(parseFloat(form.amount) * (form.fxRate || 1) * 100) / 100
    : parseFloat(form.amount);
 
  const newCostEntry = {
    validFrom:        form.validFrom,
    amount:           parseFloat(form.amount),
    originalCurrency: resolvedCurrency,
    fxRate:           form.fxRate || 1,
    amountPLN,
  };
 
  onSubmit({
    description:     form.description.trim(),
    subcategoryId:   form.subcategoryId,
    subcategoryName: form.subcategoryName,
    categoryId:      form.categoryId,
    categoryName:    form.categoryName,
    frequency:       form.frequency,
    activeMonths:    form.frequency === "custom" ? form.activeMonths : null,
    plannedDay:      parseInt(form.plannedDay),
    tags:            form.tags,
    priority:        form.priority,
    validTo:         resolveValidTo(),
    newCostEntry,
  });
}

  return (
    <div>
      {/* Description — required */}
      <div style={frow}>
        <label style={s.label}>
          Opis *{" "}
          <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            (nazwa wydatku)
          </span>
        </label>
        <input
          type="text" maxLength={500}
          value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="np. Netflix, rata kredytu, karnet na siłownię..."
          style={{ ...s.input, border: `1px solid ${!form.description?.trim() ? "#ef444466" : "#1e293b"}` }}
        />
      </div>

      {/* Subcategory */}
      <div style={frow}>
        <label style={s.label}>Subkategoria</label>
        <SubcategorySelect
          value={form.subcategoryId}
          onChange={({ subcategoryId, subcategoryName, categoryId, categoryName, categoryType }) =>
            setForm(f => ({ ...f, subcategoryId, subcategoryName, categoryId, categoryName, categoryType }))
          }
          allowedTypes={["EXPENSE", "SAVING"]}
          filter={sub => sub.categoryType === "SAVING" ? true : sub.canBeRecurring === true}
          placeholder="— wybierz subkategorię —"
        />
        {!hasRecurringSubcategories && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>
            ⚠️ Brak subkategorii oznaczonych jako cykliczne. Włącz je w <strong>Ustawienia → Kategorie → 🔄</strong>.
          </div>
        )}
        {form.categoryName && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>{form.categoryName}</div>
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

      {/* Amount + plannedDay */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={s.label}>Kwota ({rateInfo.resolvedCurrency || "PLN"})</label>
          <input
            type="number" min={0} step={0.01}
            value={form.amount}
            onChange={e => set("amount", e.target.value)}
            placeholder="0,00"
            style={s.input}
          />
          {parseFloat(form.amount) > 0 && rateInfo.resolvedCurrency !== "PLN" && (
            <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>
              ≈ {(parseFloat(form.amount) * (form.fxRate || 1)).toFixed(2)} PLN
            </div>
          )}
        </div>
        <div>
          <label style={s.label}>Dzień miesiąca</label>
          <input
            type="number" min={1} max={31}
            value={form.plannedDay}
            onChange={e => {
              const v = parseInt(e.target.value) || 1;
              set("plannedDay", Math.min(31, Math.max(1, v)));
            }}
            style={s.input}
          />
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Kiedy schodzi kasa</div>
        </div>
      </div>

      {/* Priority */}
      <div style={frow}>
        <PriorityPicker value={form.priority} onChange={v => set("priority", v)} subcategoryId={form.subcategoryId} />
      </div>

      {/* Frequency — locked in edit mode */}
      <div style={frow}>
        <label style={s.label}>Cykliczność</label>
        <select
          value={form.frequency}
          onChange={e => set("frequency", e.target.value)}
          disabled={mode === "edit"}
          style={{ ...s.input, cursor: mode === "edit" ? "not-allowed" : "pointer", opacity: mode === "edit" ? 0.6 : 1 }}
        >
          {FREQUENCY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {mode === "edit" && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            Zmiana cykliczności wymaga archiwizacji i dodania nowego wpisu.
          </div>
        )}
      </div>

      {/* Custom months */}
      {form.frequency === "custom" && (
        <div style={frow}>
          <label style={s.label}>Aktywne miesiące</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MONTH_NAMES.map((name, i) => {
              const m = i + 1;
              const active = form.activeMonths.includes(m);
              return (
                <button key={m} onClick={() => toggleActiveMonth(m)}
                  style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${active ? "#10b981" : "#1e293b"}`,
                    background: active ? "#10b98122" : "transparent",
                    color: active ? "#10b981" : "#475569",
                  }}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ValidTo */}
      <div style={frow}>
        <label style={s.label}>Obowiązuje do (opcjonalne)</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {[
            { key: "none",  label: "Bezterminowo" },
            { key: "month", label: "Wybierz miesiąc" },
            { key: "count", label: "Liczba miesięcy" },
            { key: "yearend", label: "Do końca roku"    },
          ].map(opt => (
            <button key={opt.key} onClick={() => set("validToMode", opt.key)}
              style={{
                flex: 1, padding: "6px 4px", borderRadius: 8, border: "none",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: form.validToMode === opt.key ? "#10b981" : "#1e293b",
                color:      form.validToMode === opt.key ? "#fff"    : "#64748b",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        {form.validToMode === "month" && (
          <input type="month" min={form.validFrom}
            value={form.validToDate ? `${form.validToDate.getFullYear()}-${String(form.validToDate.getMonth()+1).padStart(2,"0")}` : ""}
            onChange={e => {
              if (!e.target.value) { set("validToDate", null); return; }
              const [y, m] = e.target.value.split("-").map(Number);
              set("validToDate", new Date(y, m - 1, 1));
            }}
            onClick={e => e.target.showPicker?.()}
            style={{ ...s.input, colorScheme: "dark", cursor: "pointer", WebkitAppearance: "none" }}
          />
        )}
        {form.validToMode === "count" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={1} max={360}
              value={form.monthsCount}
              onChange={e => set("monthsCount", e.target.value)}
              placeholder="np. 12" style={{ ...s.input, width: 100 }}
            />
            <span style={{ color: "#64748b", fontSize: 13 }}>miesięcy</span>
            {form.monthsCount && form.validFrom && (
              <span style={{ color: "#94a3b8", fontSize: 12 }}>
                → do {computeValidTo(form.validFrom, parseInt(form.monthsCount), form.frequency, form.activeMonths)|| "—"}
              </span>
            )}
          </div>
        )}
        {form.validToMode === "yearend" && form.validFrom && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
            Zakres: {form.validFrom} → {form.validFrom.split("-")[0]}-12
            {form.frequency === "custom" && form.activeMonths.length > 0 && (() => {
              const vm = Number(form.validFrom.split("-")[1]);
              const hitsThisYear = form.activeMonths.filter(m => m >= vm);
              const outsideYear  = form.activeMonths.filter(m => m < vm);
              return (
                <>
                  {" · "}{hitsThisYear.length} wystąpień
                  {outsideYear.length > 0 && (
                    <span style={{ color: "#f59e0b", marginLeft: 6 }}>
                      ⚠️ Miesiące {outsideYear.map(m => MONTH_NAMES[m-1]).join(", ")} 
                      {" "}poza zakresem (zaczynasz od {MONTH_NAMES[vm-1]})
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        )}
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
          style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: isSaving ? "#1e293b" : "#10b981", color: "#fff", cursor: isSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14 }}>
          {isSaving ? "Zapisuję…" : mode === "add" ? "➕ Dodaj cykliczny" : "💾 Zapisz zmiany"}
        </button>
      </div>
    </div>
  );
}