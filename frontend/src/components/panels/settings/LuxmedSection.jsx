// ============================================================
// File: src/components/panels/settings/LuxmedSection.jsx
// 2 new fields:
//   maxPercent – max. % of return from single transaction (1–100)
//   maxTotal   – max. amount in the quarter(0–99999)
// Analogically to SettingsSection.jsx
// ============================================================

import { useState, useEffect } from "react";
import { useSettings }         from "../../../hooks/useSettings";
import { CollapsibleSection }  from "../../ui/index";
import { theme as s }          from "../../../styles/theme";

export function LuxmedSection() {
  const { settings, isLoading, isSaving, updateSettings } = useSettings();

  const [maxPercent, setMaxPercent] = useState(90);
  const [maxTotal,   setMaxTotal]   = useState(500);

  // Hydrate ze settings gdy się wczytają
  useEffect(() => {
    if (!settings?.luxmed) return;
    setMaxPercent(settings.luxmed.maxPercent ?? 90);
    setMaxTotal(settings.luxmed.maxTotal   ?? 500);
  }, [settings]);

  const isPercentValid = Number(maxPercent) >= 1 && Number(maxPercent) <= 100;
  const isTotalValid   = Number(maxTotal)   >= 0 && Number(maxTotal)   <= 99999;
  const validationError = !isPercentValid
    ? "Procent musi być między 1 a 100."
    : !isTotalValid
    ? "Limit kwartalny musi być między 0 a 99 999 PLN."
    : "";

  function handleSave() {
    if (validationError) return;
    updateSettings({
      luxmed: {
        maxPercent: Number(maxPercent),
        maxTotal:   Number(maxTotal),
      },
    });
  }

  const rowStyle   = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", borderBottom: "1px solid #1e293b",
  };
  const labelStyle = { color: "#e2e8f0", fontSize: 13 };
  const descStyle  = { color: "#475569", fontSize: 11, marginTop: 2 };
  const inputStyle = { ...s.input, width: 90, textAlign: "center" };

  return (
    <CollapsibleSection title="🏥 Zwroty LuxMed" defaultOpen={false}>
      {validationError && (
        <div style={{
          padding: "10px 14px", background: "#ef444422",
          borderLeft: "4px solid #ef4444", color: "#f87171",
          marginBottom: 12, borderRadius: 4, fontSize: 13,
        }}>
          {validationError}
        </div>
      )}

      {isLoading ? (
        <div style={{ color: "#475569", fontSize: 13 }}>Ładowanie…</div>
      ) : (
        <>
          {/* maxPercent */}
          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>📊 Maks. % zwrotu z transakcji</div>
              <div style={descStyle}>
                Najwyższy dopuszczalny procent kwoty pojedynczej transakcji do zwrotu.
                Np. 90% = transakcja 200 zł → maks. 180 zł zwrotu.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={1}
                max={100}
                value={maxPercent}
                onChange={e => setMaxPercent(e.target.value)}
                style={inputStyle}
              />
              <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
            </div>
          </div>

          {/* maxTotal */}
          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>💰 Limit kwartalny</div>
              <div style={descStyle}>
                Łączna maksymalna kwota zwrotów w obrębie jednego kwartału (Q1–Q4).
                Limit odnawia się automatycznie co kwartał.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={0}
                max={99999}
                step={50}
                value={maxTotal}
                onChange={e => setMaxTotal(e.target.value)}
                style={inputStyle}
              />
              <span style={{ color: "#64748b", fontSize: 13 }}>PLN</span>
            </div>
          </div>

          {/* Overview */}
          {isPercentValid && isTotalValid && (
            <div style={{
              marginTop: 12, padding: "10px 14px",
              background: "#06b6d411", border: "1px solid #06b6d433",
              borderRadius: 8, fontSize: 12, color: "#67e8f9",
            }}>
              Np. wizyta za 300 PLN → zwrot maks.{" "}
              <strong>{Math.min(300 * Number(maxPercent) / 100, Number(maxTotal)).toFixed(2)} PLN</strong>
              {" "}(przy pustym limicie kwartalnym).
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || !!validationError}
            style={{
              ...s.btn(),
              marginTop: 16,
              opacity: (isSaving || !!validationError) ? 0.5 : 1,
              cursor:  validationError ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "⏳ Zapisywanie..." : "💾 Zapisz ustawienia LuxMed"}
          </button>
        </>
      )}
    </CollapsibleSection>
  );
}