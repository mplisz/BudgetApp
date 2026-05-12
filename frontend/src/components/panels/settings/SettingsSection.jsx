// ============================================================
// File: src/components/panels/settings/SettingsSection.jsx
// ============================================================

import { useState, useEffect } from "react";
import { theme as s }          from "../../../styles/theme";
import { CollapsibleSection }  from "../../ui/index";
import { useSettings }         from "../../../hooks/useSettings";

export function SettingsSection() {
  const { settings, isLoading, isSaving, updateSettings } = useSettings();

  const [warningPercent,  setWarningPercent]  = useState(80);
  const [criticalPercent, setCriticalPercent] = useState(95);
  const [maxInsurance,    setMaxInsurance]    = useState(10);
  const [maxObligations,  setMaxObligations]  = useState(35);
  const [minRetirement,   setMinRetirement]   = useState(15);
  const [minSavings,      setMinSavings]      = useState(20);

  useEffect(() => {
    if (!settings) return;
    setWarningPercent(settings.thresholds?.warningPercent   ?? 80);
    setCriticalPercent(settings.thresholds?.criticalPercent ?? 95);
    setMaxInsurance(settings.targets?.maxInsurancePercent   ?? 10);
    setMaxObligations(settings.targets?.maxObligationsPercent ?? 35);
    setMinRetirement(settings.targets?.minRetirementPercent  ?? 15);
    setMinSavings(settings.targets?.minSavingsPercent        ?? 20);
  }, [settings]);

  const isThresholdsValid = Number(warningPercent) < Number(criticalPercent);
  const isSavingsValid    = Number(minRetirement) <= Number(minSavings);
  const isSumValid        = Number(minSavings) + Number(maxObligations) + Number(maxInsurance) <= 100;
  const isRangesValid     = [warningPercent, criticalPercent, maxInsurance, maxObligations, minRetirement, minSavings].every(v => Number(v) >= 0);

  const validationError = !isThresholdsValid
    ? "Próg ostrzeżenia musi być niższy niż próg krytyczny."
    : !isSavingsValid
    ? "Min emerytura nie może być większa niż min oszczędności łącznie."
    : !isSumValid
    ? "Całkowita wartość progów nie może być większa niż 100%."
    : !isRangesValid
    ? "Wartości nie mogą być ujemne."
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
    });
  }

  const inputStyle = { ...s.input, width: 70, textAlign: "center" };
  const rowStyle   = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e293b" };
  const labelStyle = { color: "#e2e8f0", fontSize: 13 };
  const descStyle  = { color: "#475569", fontSize: 11, marginTop: 2 };

  return (
    <CollapsibleSection title="⚙️ Progi i limity" defaultOpen={false}>
      {/* Validation error stays inline — it's tied to specific fields */}
      {validationError && (
        <div style={{ padding: "10px 14px", background: "#ef444422", borderLeft: "4px solid #ef4444", color: "#f87171", marginBottom: 12, borderRadius: 4, fontSize: 13 }}>
          {validationError}
        </div>
      )}

      {isLoading ? (
        <div style={{ color: "#475569", fontSize: 13 }}>Ładowanie...</div>
      ) : (
        <>
          {/* Progi budżetowe */}
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>
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
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
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
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
            </div>
          </div>

          {/* Cele finansowe */}
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase", marginBottom: 8, marginTop: 20 }}>
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
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
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
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
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
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
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
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
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