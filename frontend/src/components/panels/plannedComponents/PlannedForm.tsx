// ============================================================
// File: src/components/panels/plannedComponents/PlannedForm.tsx
// Form for adding/editing a planned expense.
//
// Key fix vs .jsx:
//   Edit mode (mode="edit") sends PlannedPatchPayload WITHOUT
//   virtualSavings — backend recomputes them from totalAmountPLN
//   and plannedMonth changes, preserving already-paid entries.
//   Old code sent new virtualSavings on every edit, overwriting
//   paid entries and giving each month a brand-new amount.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useCallback, useRef, useMemo } from "react";
import { SubcategorySelect }   from "../../ui/SubcategorySelect";
import { PriorityPicker }      from "../../ui/PriorityPicker";
import { TagMultiSelect }      from "../../ui/TagMultiSelect";
import { CurrencyRateField }   from "../../ui/CurrencyRateField";
import { useToast }            from "../../../hooks/useToast";
import { useCurrencyManager }  from "../../../hooks/useCurrencyManager";
import { generateSavingsMonths } from "../../../hooks/usePlanned";
import { AppDatePicker, fromYM, toYM } from "../../ui/AppDatePicker";
import { theme as s }          from "../../../styles/theme";
import { fmt, round2}                 from "../../../utils/helpers";
import type { PlannedPostPayload, PlannedPatchPayload, PlannedDoc, VirtualSaving } from "../../../hooks/usePlanned";

// ── Types ─────────────────────────────────────────────────────

interface PlannedFormProps {
  initialValues?: Partial<PlannedDoc>;
  startMonth?:    string;
  onSubmit:       (payload: PlannedPostPayload | PlannedPatchPayload) => void;
  onCancel?:      () => void;
  isSaving?:      boolean;
  mode?:          "add" | "edit";
}

interface FormState {
  description:          string;
  totalAmount:          string;
  currency:             string;
  customCurrency:       string;
  fxRate:               number;
  targetSubcategoryId:  string;
  targetSubcategoryName:string;
  targetCategoryId:     string;
  targetCategoryName:   string;
  tags: string[];
  priority:             1 | 2 | 3 | 4;
  mode:                 "oneoff" | "envelope";
  plannedMonth:         Date | null;
  monthlySavingDay:     number | string;
  url: string;
}

interface RateInfo {
  activeRate:       number;
  resolvedCurrency: string;
}

// ── Helpers ───────────────────────────────────────────────────

const frow: React.CSSProperties = { marginBottom: 16 };

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function addOneMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const nm = mo === 12 ? 1 : mo + 1;
  const ny = mo === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

// ── Component ─────────────────────────────────────────────────

export function PlannedForm({ initialValues, startMonth, onSubmit, onCancel, isSaving = false, mode = "add" }: PlannedFormProps) {
  const { showError }          = useToast();
  const { dropdownCurrencies } = useCurrencyManager();

  function resolveInitialCurrency(stored?: string): { currency: string; customCurrency: string } {
    if (!stored || stored === "PLN") return { currency: "PLN", customCurrency: "" };
    const inDropdown = dropdownCurrencies.some(c => c.code === stored);
    return inDropdown
      ? { currency: stored, customCurrency: "" }
      : { currency: "INNE", customCurrency: stored };
  }

  const initCurrency = resolveInitialCurrency(initialValues?.originalCurrency);
  const cur          = startMonth || currentMonthStr();
  const minPlan      = addOneMonth(cur);

  const [form, setForm] = useState<FormState>(() => ({
    description:           initialValues?.description          ?? "",
    totalAmount:           initialValues?.totalAmount != null  ? String(initialValues.totalAmount) : "",
    currency:              initCurrency.currency,
    customCurrency:        initCurrency.customCurrency,
    fxRate:                initialValues?.fxRate               ?? 1,
    targetSubcategoryId:   initialValues?.targetSubcategoryId  ?? "",
    targetSubcategoryName: initialValues?.targetSubcategoryName ?? "",
    targetCategoryId:      initialValues?.targetCategoryId     ?? "",
    targetCategoryName:    initialValues?.targetCategoryName   ?? "",
    tags:                  initialValues?.tags                 ?? [] as string[],
    priority:              (initialValues?.priority             ?? 2) as 1 | 2 | 3 | 4,
    mode:                  initialValues?.mode                 ?? "oneoff",
    plannedMonth:          initialValues?.plannedMonth ? fromYM(initialValues.plannedMonth) : fromYM(minPlan),
    monthlySavingDay:      initialValues?.monthlySavingDay     ?? 1,
    url: initialValues?.url ?? ""
  }));

  const [rateInfo,  setRateInfo]  = useState<RateInfo>({ activeRate: 1, resolvedCurrency: "PLN" });
  const lastRateRef = useRef<string | null>(null);

  const handleRateReady = useCallback(({ activeRate, resolvedCurrency }: RateInfo) => {
    const key = `${resolvedCurrency}_${activeRate}`;
    if (lastRateRef.current === key) return;
    lastRateRef.current = key;
    setRateInfo({ activeRate, resolvedCurrency });
    setForm(f => ({ ...f, fxRate: activeRate }));
  }, []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  // Live suggestion preview (for display only)
  const suggestion = useMemo<number | null>(() => {
    if (form.mode !== "envelope" || !form.totalAmount || !form.plannedMonth) return null;
    const pm = toYM(form.plannedMonth);
    if (!pm || pm < minPlan) return null;
    const totalPLN = rateInfo.resolvedCurrency !== "PLN"
      ? parseFloat(form.totalAmount) * (form.fxRate || 1)
      : parseFloat(form.totalAmount);
    const months = monthsBetween(cur, pm);
    return round2(totalPLN / months);
  }, [form.totalAmount, form.plannedMonth, form.mode, form.fxRate, rateInfo.resolvedCurrency, cur, minPlan]);

  // ── Submit ────────────────────────────────────────────────

  function handleSubmit() {
    if (!form.description?.trim())                              { showError("Podaj opis wydatku.");           return; }
    if (!form.targetSubcategoryId)                              { showError("Wybierz subkategorię.");         return; }
    if (!form.totalAmount || parseFloat(form.totalAmount) <= 0) { showError("Podaj kwotę > 0.");              return; }
    const plannedMonthStr = form.plannedMonth ? toYM(form.plannedMonth) : "";
    if (!plannedMonthStr)                                        { showError("Podaj planowany miesiąc.");      return; }
    if (plannedMonthStr < minPlan)                               { showError(`Miesiąc musi być po ${cur}.`);   return; }
    if (form.mode === "envelope" && parseInt(String(form.monthlySavingDay)) < 1) {
      showError("Podaj dzień miesiąca."); return;
    }

    const isForeign      = rateInfo.resolvedCurrency !== "PLN";
    const totalAmountPLN = isForeign
      ? Math.round(parseFloat(form.totalAmount) * (form.fxRate || 1) * 100) / 100
      : parseFloat(form.totalAmount);

    if (mode === "edit") {
      // ── EDIT: send only changed fields, NO virtualSavings ──
      // Backend recomputes virtualSavings from totalAmountPLN/plannedMonth.
      // IMPORTANT: only send plannedMonth if it changed — if we always send it,
      // backend enters the "rebuild" path instead of the simpler "recompute amounts"
      // path, and may calculate suggestion incorrectly when no new months are needed.
      const originalPlannedMonth = initialValues?.plannedMonth
        ? (typeof initialValues.plannedMonth === "string"
            ? initialValues.plannedMonth
            : toYM(initialValues.plannedMonth as unknown as Date))
        : null;
      const plannedMonthChanged = plannedMonthStr !== originalPlannedMonth;

      const patch: PlannedPatchPayload = {
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
        monthlySavingDay:     parseInt(String(form.monthlySavingDay)) || 1,
        // Only include plannedMonth if it actually changed.
        // If sent unchanged, backend rebuilds virtualSavings unnecessarily
        // and may compute wrong suggestion when no new months exist.
        ...(plannedMonthChanged ? { plannedMonth: plannedMonthStr } : {}),
        // virtualSavings intentionally omitted — backend recomputes,
        url: form.url.trim()
      };
      onSubmit(patch);
      return;
    }

    // ── ADD: generate virtualSavings for new envelope ──────
    let virtualSavings: VirtualSaving[] = []
    if (form.mode === "envelope") {
      const months   = monthsBetween(cur, plannedMonthStr);
      const suggOrig = Math.round(parseFloat(form.totalAmount) / months * 100) / 100;
      virtualSavings = generateSavingsMonths(cur, plannedMonthStr, suggOrig, form.fxRate || 1);
    }

    const payload: PlannedPostPayload = {
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
      plannedMonth:         plannedMonthStr,
      monthlySavingDay:     parseInt(String(form.monthlySavingDay)) || 1,
      virtualSavings,
      url: form.url.trim()
    };
    onSubmit(payload);
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div>
      {/* Description */}
      <div style={frow}>
        <label style={s.label}>
          Opis *{" "}
          <span style={{ color: c.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            (nazwa planowanego wydatku)
          </span>
        </label>
        <input
          type="text" maxLength={500}
          value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="np. Laptop, wakacje, hulajnoga..."
          style={{ ...s.input, border: `1px solid ${!form.description?.trim() ? alpha(c.danger, "66") : c.border}` }}
        />
      </div>

      {/* Mode toggle (disabled in edit) */}
      <div style={frow}>
        <label style={s.label}>Tryb</label>
        <div style={{ display: "flex", gap: 8 }}>
          {([
            { key: "oneoff",   label: "💳 Jednorazowy",      sub: "płacę w całości"      },
            { key: "envelope", label: "🪙 Wirtualna koperta", sub: "odkładam co miesiąc"  },
          ] as const).map(opt => (
            <button
              key={opt.key}
              disabled={mode === "edit"}
              onClick={() => set("mode", opt.key)}
              style={{
                flex: 1, padding: "10px 8px", borderRadius: 10,
                cursor: mode === "edit" ? "not-allowed" : "pointer",
                background: form.mode === opt.key ? alpha(c.info, "22") : c.border,
                border: `1px solid ${form.mode === opt.key ? c.info : "transparent"}`,
                color: form.mode === opt.key ? c.info : c.textSecondary,
                textAlign: "left", opacity: mode === "edit" ? 0.7 : 1,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: c.textMuted }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Target subcategory */}
      <div style={frow}>
        <label style={s.label}>Kategoria zakupu</label>
        <SubcategorySelect
          value={form.targetSubcategoryId}
          onChange={({ subcategoryId, subcategoryName, categoryId, categoryName }: {
            subcategoryId: string; subcategoryName: string;
            categoryId: string; categoryName: string;
          }) =>
            setForm(f => ({ ...f,
              targetSubcategoryId:   subcategoryId,
              targetSubcategoryName: subcategoryName,
              targetCategoryId:      categoryId,
              targetCategoryName:    categoryName,
            }))
          }
          allowedTypes={["EXPENSE", "SAVING"]}
          placeholder="— Kategoria zakupu - gdzie trafi wydatek? —"
        />
        {form.targetCategoryName && (
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{form.targetCategoryName}</div>
        )}
      </div>
      {/* URL (optional) */}
      <div style={frow}>
        <label style={s.label}>
          Link{" "}
          <span style={{ color: c.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            (opcjonalnie — np. strona produktu)
          </span>
        </label>
        <input
          type="url" maxLength={2000}
          value={form.url}
          onChange={e => set("url", e.target.value)}
          placeholder="https://..."
          style={s.input}
        />
      </div>
      {/* Currency + amount */}
      <div style={frow}>
        <CurrencyRateField
          currency={form.currency}
          customCurrency={form.customCurrency}
          date={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })()}
          onCurrencyChange={(v: string) => set("currency", v)}
          onCustomChange={(v: string) => set("customCurrency", v)}
          onRateReady={handleRateReady}
        />
      </div>

      <div style={frow}>
        <label style={s.label}>Kwota docelowa ({rateInfo.resolvedCurrency || "PLN"})</label>
        <input
          type="number" min={0} step={0.01}
          value={form.totalAmount}
          onChange={e => set("totalAmount", e.target.value)}
          placeholder="0,00"
          style={s.input}
        />
        {rateInfo.resolvedCurrency !== "PLN" && form.totalAmount && (
          <div style={{ fontSize: 12, color: c.success, marginTop: 4 }}>
            = <strong>{fmt(parseFloat(form.totalAmount) * (form.fxRate || 1))}</strong> PLN
          </div>
        )}
      </div>

      {/* Planned month */}
      <div style={frow}>
        <label style={s.label}>
          {form.mode === "envelope" ? "Planowany miesiąc zakupu" : "Kiedy płacę?"}
        </label>
        <AppDatePicker
          value={form.plannedMonth}
          onChange={(d: Date) => set("plannedMonth", d)}
          monthPicker
          minDate={fromYM(minPlan)}
          maxDate={null}
          popperPlacement="bottom-start"
        />
      </div>

      {/* Envelope-specific */}
      {form.mode === "envelope" && (
        <>
          <div style={frow}>
            <label style={s.label}>Dzień odkładania (1–31)</label>
            <input
              type="number" min={1} max={31}
              value={form.monthlySavingDay}
              onChange={e => set("monthlySavingDay", parseInt(e.target.value) || 1)}
              style={{ ...s.input, maxWidth: 100 }}
            />
          </div>

          {suggestion !== null && (
            <div style={{
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 4 }}>
                💡 Sugerowana rata miesięczna
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.success }}>
                {fmt(suggestion)} {rateInfo.resolvedCurrency !== "PLN" ? rateInfo.resolvedCurrency : "PLN/mies."}
              </div>
              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>
                {form.plannedMonth ? `${monthsBetween(cur, toYM(form.plannedMonth))} miesięcy do ${toYM(form.plannedMonth)}` : ""}
              </div>
            </div>
          )}
        </>
      )}

      {/* Priority */}
      <div style={frow}>
        <PriorityPicker
          value={form.priority}
          onChange={(v: 1 | 2 | 3 | 4) => set("priority", v)}
          subcategoryId={form.targetSubcategoryId}
        />
      </div>

      {/* Tags */}
      <div style={frow}>
        <label style={s.label}>Tagi</label>
        <TagMultiSelect value={form.tags} onChange={(v: string[]) => set("tags", v)} />
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        {onCancel && (
          <button onClick={onCancel}
            style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textTertiary, cursor: "pointer", fontWeight: 600 }}>
            Anuluj
          </button>
        )}
        <button onClick={handleSubmit} disabled={isSaving}
          style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: isSaving ? c.border : c.info, color: c.white, cursor: isSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14 }}>
          {isSaving ? "Zapisuję…" : mode === "add" ? "📅 Dodaj planowany" : "💾 Zapisz zmiany"}
        </button>
      </div>
    </div>
  );
}