// ============================================================
// File: src/components/ui/CurrencyRateField.jsx
// Currency dropdown  (settings/Cosmos DB) +  NBP rate (14-day window)
// + optional manual 
// Base currency(isBase: true) is always first and needs no rate
// ============================================================

import { c } from "../../styles/tokens";
import { useEffect }            from "react";
import { useCurrencyConverter } from "../../hooks/useCurrencyConverter";
import { useCurrencyManager }   from "../../hooks/useCurrencyManager";

/**
 * Props:
 *   currency          – rate code"PLN", "EUR", "INNE")
 *   customCurrency    – field value "inna waluta" (3 letters)
 *   date              – trancation date YYYY-MM-DD
 *   onCurrencyChange  – fn(currency: string)
 *   onCustomChange    – fn(customCurrency: string)
 *   onRateReady       – fn({ activeRate, resolvedCurrency })
 *   disabled          – boolean
 */
interface CurrencyRateFieldProps {
  currency:         string;
  customCurrency?:  string;
  date:             string;
  onCurrencyChange: (currency: string) => void;
  onCustomChange:   (customCurrency: string) => void;
  onRateReady:      (info: { activeRate: number; resolvedCurrency: string }) => void;
  disabled?:        boolean;
}

export function CurrencyRateField({
  currency,
  customCurrency = "",
  date,
  onCurrencyChange,
  onCustomChange,
  onRateReady,
  disabled = false,
}: CurrencyRateFieldProps) {
  const { dropdownCurrencies, baseCurrency } = useCurrencyManager();
  const {
    rate, effectiveDate, table, isLoading, error,
    manualRate, setManualRate, activeRate, loadRate,
  } = useCurrencyConverter();


  const resolvedCurrency = currency === "INNE"
    ? (customCurrency.toUpperCase() || "")
    : currency;

  // Is currency base?
  const isBaseCurrency = resolvedCurrency === baseCurrency.code;

  // Get rate after date's change
  useEffect(() => {
    if (!isBaseCurrency && resolvedCurrency.length === 3 && date) {
      loadRate(resolvedCurrency, date);
    }
  }, [resolvedCurrency, date, loadRate, isBaseCurrency]);


  useEffect(() => {
    if (!onRateReady) return;
    onRateReady({
      // activeRate can be null until the NBP rate loads; report 1 (no
      // conversion) in that window — the effect re-fires with the real rate.
      activeRate:        isBaseCurrency ? 1 : (activeRate ?? 1),
      resolvedCurrency,
    });
  }, [activeRate, resolvedCurrency, isBaseCurrency, onRateReady]);
  
  // For unkown currency encure this is normalized to "Inna waluta" to avoid <select> being reverted back to PLN
  useEffect(() => {
    if (
      currency &&
      currency !== "INNE" &&
      currency.length === 3 &&
      !dropdownCurrencies.some(c => c.code === currency)
    ) {
      onCurrencyChange("INNE");
      onCustomChange(currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currency, dropdownCurrencies]);
  // ── Styles ─────────────────────────────────────────────────────
  const inp = {
    width: "100%", background: c.bg, border: `1px solid ${c.border}`,
    borderRadius: 8, color: c.text, padding: "9px 12px", fontSize: 14,
    outline: "none", opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : undefined,
  };
  const lbl  = { display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 };
  const hint = { fontSize: 11, marginTop: 4 };

  return (
    <div>
      {/* Dropdown waluty */}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Waluta</label>
        <select
          value={currency}
          onChange={e => onCurrencyChange(e.target.value)}
          disabled={disabled}
          style={{ ...inp, cursor: disabled ? "not-allowed" : "pointer" }}>
          {dropdownCurrencies.map(c => (
            <option key={c.code} value={c.code}>
              {c.code} – {c.name}{c.isBase ? "" : ""}
            </option>
          ))}
          <option value="INNE">Inna waluta…</option>
        </select>
      </div>

      {/* Custom currency field */}
      {currency === "INNE" && (
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Kod waluty (3 litery, np. JPY)</label>
          <input
            value={customCurrency}
            onChange={e => onCustomChange(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="np. JPY"
            maxLength={3}
            disabled={disabled}
            style={inp}
          />
        </div>
      )}

      {/* Rate section - only if not base */}
      {!isBaseCurrency && resolvedCurrency.length === 3 && (
        <div>
          <label style={lbl}>Kurs NBP z dnia transakcji</label>

          {isLoading && (
            <div style={{ ...hint, color: c.info }}>⏳ Pobieranie kursu…</div>
          )}

          {!isLoading && rate && !error && (
            <div style={{ ...hint, color: c.success }}>
              1 {resolvedCurrency} = <strong>{rate.toFixed(4)}</strong> {baseCurrency.code}
              {effectiveDate !== date && table !== "B" && (
                <span style={{ color: c.warning }}>
                  {` (kurs z ${effectiveDate} — brak publikacji NBP w dniu ${date})`}
                </span>
              )}
              {table === "B" && (
                <span style={{ color: c.voucher }}>
                  {" · dane aktualizowane przez NBP raz w tygodniu "}
                  {`(ostatni kurs z ${effectiveDate})`}
                </span>
              )}
            </div>
          )}

          {error && (
            <div style={{ ...hint, color: c.dangerLight, marginBottom: 8 }}>⚠️ {error}</div>
          )}

          {!isLoading && (
            <div style={{ marginTop: 8 }}>
              <label style={{ ...lbl, color: error ? c.warning : c.borderStrong }}>
                {error ? "Kurs ręczny (wymagany)" : "Nadpisz kurs ręcznie (opcjonalnie)"}
              </label>
              <input
                type="number" step="0.0001" min="0"
                value={manualRate}
                onChange={e => setManualRate(e.target.value)}
                placeholder={rate ? rate.toFixed(4) : `kurs ${baseCurrency.code}/${resolvedCurrency}`}
                disabled={disabled}
                style={{ ...inp, borderColor: error ? c.warning : c.border }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}