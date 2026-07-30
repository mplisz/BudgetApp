// ============================================================
// File: frontend/src/components/panels/settings/SettingsSection.jsx
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useEffect } from "react";
import { theme as s }          from "../../../styles/theme";
import { CollapsibleSection }  from "../../ui";
import { ConfirmModal }        from "../../ui/ConfirmModal";
import { useSettings }         from "../../../hooks/useSettings";
import { AppDatePicker, fromYM, toYM } from "../../ui/AppDatePicker";

export function SettingsSection() {
  const { settings, isLoading, isSaving, updateSettings } = useSettings();

  const [warningPercent,  setWarningPercent]  = useState<number | string>(80);
  const [criticalPercent, setCriticalPercent] = useState<number | string>(95);
  const [maxInsurance,    setMaxInsurance]    = useState<number | string>(10);
  const [maxObligations,  setMaxObligations]  = useState<number | string>(35);
  const [minRetirement,   setMinRetirement]   = useState<number | string>(15);
  const [minSavings,      setMinSavings]      = useState<number | string>(20);

  const [voucherExpiryDays, setVoucherExpiryDays] = useState<number | string>(14);
  const [recurringNotifyDays, setRecurringNotifyDays] = useState<number | string>(3);

  // appStartMonth — null means no restriction
  const [startMonthEnabled, setStartMonthEnabled] = useState(false);
  // Date object for AppDatePicker; defaults to first day of current month
  const [startMonthValue,   setStartMonthValue]   = useState(fromYM(null) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  // Whether the user touched the start-month control in THIS editing session.
  // Saving is a single button for the whole section, so without this a plain
  // threshold edit would rewrite the navigation lock with whatever the form
  // happened to hold — including its "current month" default.
  const [startMonthTouched, setStartMonthTouched] = useState(false);
  const [confirmLockOpen,   setConfirmLockOpen]   = useState(false);

  useEffect(() => {
    if (!settings) return;
    setWarningPercent(settings.thresholds?.warningPercent   ?? 80);
    setCriticalPercent(settings.thresholds?.criticalPercent ?? 95);
    setMaxInsurance(settings.targets?.maxInsurancePercent   ?? 10);
    setMaxObligations(settings.targets?.maxObligationsPercent ?? 35);
    setMinRetirement(settings.targets?.minRetirementPercent  ?? 15);
    setMinSavings(settings.targets?.minSavingsPercent        ?? 20);

    setVoucherExpiryDays(settings.voucherExpiryWarningDays ?? 14);
    setRecurringNotifyDays(settings.notifyDaysBefore  ?? 3);

    // `||` on purpose, not `??`: a stored empty string must count as "not set".
    // With `??` the toggle lit up while the value silently stayed on its
    // current-month default, and the next save persisted that.
    const sm = settings.appStartMonth || null;
    setStartMonthEnabled(sm !== null);
    if (sm) setStartMonthValue(fromYM(sm) ?? new Date());
    // Re-synced from the server (mount, or right after a save) — nothing to send.
    setStartMonthTouched(false);
  }, [settings]);

  const isThresholdsValid = Number(warningPercent) < Number(criticalPercent);
  const isSavingsValid    = Number(minRetirement) <= Number(minSavings);
  const isSumValid        = Number(minSavings) + Number(maxObligations) + Number(maxInsurance) <= 100;
  const isRangesValid     = [warningPercent, criticalPercent, maxInsurance, maxObligations, minRetirement, minSavings].every(v => Number(v) >= 0);
  const isStartMonthValid = !startMonthEnabled || startMonthValue instanceof Date;

  const validationError = !isThresholdsValid
    ? "Próg ostrzeżenia musi być niższy niż próg krytyczny."
    : !isSavingsValid
    ? "Min emerytura nie może być większa niż min oszczędności łącznie."
    : !isSumValid
    ? "Całkowita wartość progów nie może być większa niż 100%."
    : !isRangesValid
    ? "Wartości nie mogą być ujemne."
    : !isStartMonthValid
    ? "Nieprawidłowy format miesiąca (YYYY-MM)."
    : "";

  function handleSave() {
    if (validationError) return;
    updateSettings({
      thresholds: {
        warningPercent:  Number(warningPercent),
        criticalPercent: Number(criticalPercent),
      },
      targets: {
        maxInsurancePercent:   Number(maxInsurance),
        maxObligationsPercent: Number(maxObligations),
        minRetirementPercent:  Number(minRetirement),
        minSavingsPercent:     Number(minSavings),
      },
      // Only sent when actually edited — the backend keeps the stored value for
      // an absent field, so an untouched lock survives a threshold save.
      ...(startMonthTouched
        ? { appStartMonth: startMonthEnabled ? toYM(startMonthValue) : null }
        : {}),
      voucherExpiryWarningDays: Number(voucherExpiryDays),
      notifyDaysBefore: Number(recurringNotifyDays),
    });
  }

  const inputStyle: React.CSSProperties = { ...s.input, width: 70, textAlign: "center" };
  const rowStyle:   React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${c.border}` };
  const labelStyle: React.CSSProperties = { color: c.text, fontSize: 13 };
  const descStyle:  React.CSSProperties = { color: c.textMuted, fontSize: 11, marginTop: 2 };

  return (
    <CollapsibleSection title="⚙️ Progi i limity" defaultOpen={false}>
      {validationError && (
        <div style={{ padding: "10px 14px", background: alpha(c.danger, "22"), borderLeft: `4px solid ${c.danger}`, color: c.dangerLight, marginBottom: 12, borderRadius: 4, fontSize: 13 }}>
          {validationError}
        </div>
      )}

      {isLoading ? (
        <div style={{ color: c.textMuted, fontSize: 13 }}>Ładowanie...</div>
      ) : (
        <>
          {/* Progi budżetowe */}
          <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>
            🚦 Progi alertów
          </div>

          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>⚠️ Próg ostrzeżenia</div>
              <div style={descStyle}>Żółty baner — zbliżasz się do limitu</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} max={99} value={warningPercent}
                onChange={e => setWarningPercent(e.target.value)} style={inputStyle} />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>%</span>
            </div>
          </div>

          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>🔴 Próg krytyczny</div>
              <div style={descStyle}>Czerwony baner — limit prawie wyczerpany</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} max={99} value={criticalPercent}
                onChange={e => setCriticalPercent(e.target.value)} style={inputStyle} />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>%</span>
            </div>
          </div>

          {/* Cele finansowe */}
          <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 8, marginTop: 20 }}>
            🎯 Cele finansowe (do Podsumowania)
          </div>

          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>🛡️ Max ubezpieczenia</div>
              <div style={descStyle}>% budżetu miesięcznego</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={100} value={maxInsurance}
                onChange={e => setMaxInsurance(e.target.value)} style={inputStyle} />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>%</span>
            </div>
          </div>

          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>💳 Max zobowiązania / raty</div>
              <div style={descStyle}>% dochodu miesięcznego</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={100} value={maxObligations}
                onChange={e => setMaxObligations(e.target.value)} style={inputStyle} />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>%</span>
            </div>
          </div>

          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>🧓 Min emerytura</div>
              <div style={descStyle}>% dochodu miesięcznego</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={100} value={minRetirement}
                onChange={e => setMinRetirement(e.target.value)} style={inputStyle} />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>%</span>
            </div>
          </div>

          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>💰 Min oszczędności</div>
              <div style={descStyle}>% dochodu miesięcznego</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={100} value={minSavings}
                onChange={e => setMinSavings(e.target.value)} style={inputStyle} />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>%</span>
            </div>
          </div>

          {/* Nawigacja miesięcy */}
          <div style={{ fontWeight: 700, color: c.textTertiary, fontSize: 11, textTransform: "uppercase", marginBottom: 8, marginTop: 20 }}>
            📅 Nawigacja miesięcy
          </div>

          <div style={{ ...rowStyle, alignItems: "flex-start", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <div>
                <div style={labelStyle}>🔒 Najwcześniejszy dostępny miesiąc</div>
                <div style={descStyle}>
                  Po włączeniu <strong>nikt nie cofnie się przed ten miesiąc</strong> — wcześniejsze
                  miesiące znikają z nawigacji razem z ich danymi. Zostaw wyłączone, jeśli chcesz
                  mieć dostęp do całej historii.
                </div>
              </div>
              {/* Toggle — enabling asks first (it hides data), disabling doesn't */}
              <div
                onClick={() => {
                  if (startMonthEnabled) { setStartMonthEnabled(false); setStartMonthTouched(true); }
                  else                   { setConfirmLockOpen(true); }
                }}
                style={{
                  width: 40, height: 22, borderRadius: 99, cursor: "pointer", position: "relative", flexShrink: 0,
                  background:  startMonthEnabled ? c.success : c.border,
                  border:      `1px solid ${startMonthEnabled ? c.success : c.borderStrong}`,
                  transition:  "background 0.2s",
                }}>
                <div style={{
                  position: "absolute", top: 3,
                  left:       startMonthEnabled ? 20 : 3,
                  width: 14, height: 14, borderRadius: "50%",
                  background: c.white, transition: "left 0.2s",
                }} />
              </div>
            </div>
            {startMonthEnabled && (
              <AppDatePicker
                value={startMonthValue}
                onChange={d => { setStartMonthValue(d); setStartMonthTouched(true); }}
                monthPicker
                maxDate={null}
                style={{ width: "auto", minWidth: 160 }}
              />
            )}
            {!startMonthEnabled && settings?.appStartMonth && (
              <div style={{ fontSize: 11, color: c.textMuted }}>
                Aktualnie: <strong style={{ color: c.textTertiary }}>{settings.appStartMonth}</strong> — zapisz, żeby zdjąć blokadę
              </div>
            )}
          </div>

          <ConfirmModal
            isOpen={confirmLockOpen}
            title="🔒 Zablokować wcześniejsze miesiące?"
            message={
              "Po zapisaniu nikt w rodzinie nie przejdzie do miesięcy wcześniejszych niż wybrany — " +
              "znikną one z nawigacji razem z transakcjami, podsumowaniami i analizą.\n\n" +
              "To ustawienie widoczności, nie usuwanie danych: wyłączenie blokady przywraca wszystko."
            }
            onConfirm={() => { setStartMonthEnabled(true); setStartMonthTouched(true); setConfirmLockOpen(false); }}
            onCancel={() => setConfirmLockOpen(false)}
          />

          {/* Voucher expiry warning window */}
          <div style={{ ...rowStyle, marginTop: 8 }}>
            <div>
              <div style={labelStyle}>🎫 Ostrzeżenie o voucherach</div>
              <div style={descStyle}>Ile dni przed wygaśnięciem pokazywać ostrzeżenie</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min={1} max={90}
                value={voucherExpiryDays}
                onChange={e => setVoucherExpiryDays(e.target.value)}
                style={inputStyle}
              />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>dni</span>
            </div>
          </div>
          {/* Recurring notification window */}
          <div style={{ ...rowStyle, marginTop: 8 }}>
            <div>
              <div style={labelStyle}>🔔 Przypomnienia o płatnościach</div>
              <div style={descStyle}>Ile dni przed terminem (cykliczne i planowane). 📅 W obrębie miesiąca.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min={0} max={14}
                value={recurringNotifyDays}
                onChange={e => setRecurringNotifyDays(e.target.value)}
                style={inputStyle}
              />
              <span style={{ color: c.textSecondary, fontSize: 13 }}>dni</span>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || !!validationError}
            style={{ ...s.btn(), marginTop: 16, opacity: (isSaving || !!validationError) ? 0.5 : 1, cursor: validationError ? "not-allowed" : "pointer" }}>
            {isSaving ? "⏳ Zapisywanie..." : "💾 Zapisz ustawienia"}
          </button>
        </>
      )}
    </CollapsibleSection>
  );
}