// ============================================================
// File: src/hooks/useCurrencyConverter.js
// Fetches historical NBP exchange rates for a given date.
// Uses date-range query (14-day window) — single request,
// no retry loops, handles any holiday streak correctly.
// ============================================================

import { useState, useCallback, useRef } from "react";

// Currencies served by NBP table A
export const POPULAR_CURRENCIES = [
  { code: "PLN", label: "PLN – Polski złoty" },
  { code: "EUR", label: "EUR – Euro" },
  { code: "USD", label: "USD – Dolar amerykański" },
  { code: "GBP", label: "GBP – Funt szterling" },
  { code: "CHF", label: "CHF – Frank szwajcarski" },
  { code: "CZK", label: "CZK – Korona czeska" },
  { code: "NOK", label: "NOK – Korona norweska" },
  { code: "SEK", label: "SEK – Korona szwedzka" },
  { code: "RUB", label: "RUB – Rubel rosyjski" },
];

// 14-day window — covers any Polish holiday streak with large margin
const LOOKBACK_DAYS = 14;

// Module-level cache: "EUR_2025-01-15" → { rate, effectiveDate }
const rateCache = {};

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch the most recent NBP mid-rate for `currency` on or before `date`.
 * Queries a 14-day window ending on `date` and takes the last available rate.
 *
 * Returns { rate: number, effectiveDate: string }
 * Throws if currency is not in NBP table A or network fails.
 */
async function fetchNbpRate(currency, date) {
  const cacheKey = `${currency}_${date}`;
  if (rateCache[cacheKey]) return rateCache[cacheKey];

  const endDate   = date;
  const startDate = subtractDays(date, LOOKBACK_DAYS);

  const url =
    `https://api.nbp.pl/api/exchangerates/rates/A/${currency}/${startDate}/${endDate}/?format=json`;

  const res = await fetch(url);

  if (res.status === 404) {
    // Currency genuinely not in NBP table A (e.g. exotic or delisted)
    throw new Error(
      `Waluta ${currency} nie jest notowana przez NBP. Wpisz kurs ręcznie.`
    );
  }

  if (!res.ok) {
    throw new Error(`Błąd NBP API (HTTP ${res.status}). Spróbuj ponownie.`);
  }

  const json = await res.json();

  // Last element = closest available rate to the requested date
  const latest = json.rates.at(-1);

  const result = {
    rate:          latest.mid,
    effectiveDate: latest.effectiveDate,
  };

  rateCache[cacheKey] = result;
  return result;
}

/**
 * Hook: useCurrencyConverter
 *
 * Exposed values:
 *   rate            – NBP mid-rate (PLN per 1 unit), null until loaded
 *   effectiveDate   – actual rate date from NBP (may precede requested date)
 *   isLoading       – boolean
 *   error           – string | null  (shown to user; triggers manual input)
 *   manualRate      – user-typed override (string, comma or dot decimal)
 *   setManualRate   – setter
 *   activeRate      – rate to use: manualRate if valid, else rate
 *   loadRate(currency, date) – trigger fetch
 *   convertToPln(amount)     – returns PLN amount using activeRate
 */
export function useCurrencyConverter() {
  const [rate,          setRate]          = useState(null);
  const [effectiveDate, setEffectiveDate] = useState(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState(null);
  const [manualRate,    setManualRate]    = useState("");

  // Abort token — prevents stale fetch from overwriting newer state
  const fetchId = useRef(0);

  const loadRate = useCallback(async (currency, date) => {
    if (!currency || !date) return;

    // PLN needs no conversion
    if (currency === "PLN") {
      setRate(1);
      setEffectiveDate(date);
      setError(null);
      setManualRate("");
      return;
    }

    const myId = ++fetchId.current;
    setIsLoading(true);
    setError(null);
    setRate(null);
    setEffectiveDate(null);
    setManualRate("");

    try {
      const result = await fetchNbpRate(currency, date);
      if (myId !== fetchId.current) return; // stale — newer fetch in flight
      setRate(result.rate);
      setEffectiveDate(result.effectiveDate);
    } catch (err) {
      if (myId !== fetchId.current) return;
      setError(err.message);
    } finally {
      if (myId === fetchId.current) setIsLoading(false);
    }
  }, []);

  // Parse manual input (accepts comma or dot as decimal separator)
  const parsedManual = parseFloat(String(manualRate).replace(",", "."));
  const activeRate   = (!isNaN(parsedManual) && parsedManual > 0)
    ? parsedManual
    : rate;

  const convertToPln = useCallback((amount) => {
    if (!activeRate || !amount) return 0;
    return Math.round(parseFloat(amount) * activeRate * 100) / 100;
  }, [activeRate]);

  return {
    rate,
    effectiveDate,
    isLoading,
    error,
    manualRate,
    setManualRate,
    activeRate,
    loadRate,
    convertToPln,
  };
}