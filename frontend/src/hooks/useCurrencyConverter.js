// ============================================================
// File: src/hooks/useCurrencyConverter.js
// Fetches historical NBP exchange rates for a given date.
// Strategy: try table A first (major currencies, daily),
//           fall back to table B (exotic currencies, weekly on Wednesdays).
// Uses a 14-day lookback window — handles any holiday streak.
// ============================================================

import { useState, useCallback, useRef } from "react";

const LOOKBACK_DAYS = 14;

// Module-level cache: "EUR_2025-01-15" → { rate, effectiveDate, table }
const rateCache = {};

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch the most recent NBP mid-rate for `currency` on or before `date`.
 * Tries table A first, falls back to table B for exotic currencies.
 * Returns { rate, effectiveDate, table }
 */
async function fetchNbpRate(currency, date) {
  const cacheKey = `${currency}_${date}`;
  if (rateCache[cacheKey]) return rateCache[cacheKey];

  const endDate   = date;
  const startDate = subtractDays(date, LOOKBACK_DAYS);

  // Try table A first (major currencies — EUR, USD, GBP, CHF, etc.)
  for (const table of ["a", "b"]) {
    const url = `https://api.nbp.pl/api/exchangerates/rates/${table}/${currency}/${startDate}/${endDate}/?format=json`;

    try {
      const res = await fetch(url);

      if (res.status === 404) {
        // Currency not in this table — try next
        continue;
      }

      if (!res.ok) {
        throw new Error(`NBP HTTP ${res.status}`);
      }

      const json   = await res.json();
      const latest = json.rates.at(-1);

      const result = {
        rate:          latest.mid,
        effectiveDate: latest.effectiveDate,
        table:         table.toUpperCase(),
      };

      rateCache[cacheKey] = result;
      return result;

    } catch (err) {
      if (err.message.startsWith("NBP HTTP")) throw err; // hard error, don't retry
      // Network error — throw after both tables fail
      if (table === "b") throw err;
    }
  }

  throw new Error(
    `Currency ${currency} not found in NBP tables A or B. Enter rate manually.`
  );
}

/**
 * Hook: useCurrencyConverter
 *
 * Exposed values:
 *   rate            – NBP mid-rate (base currency per 1 unit of foreign), null until loaded
 *   effectiveDate   – actual rate date from NBP (may precede requested date)
 *   table           – "A" or "B" — which NBP table the rate came from
 *   isLoading       – boolean
 *   error           – string | null
 *   manualRate      – user-typed override (string, comma or dot decimal)
 *   setManualRate   – setter
 *   activeRate      – rate to use: manualRate if valid, else rate
 *   loadRate(currency, date) – trigger fetch
 *   convertToPln(amount)     – returns amount in base currency using activeRate
 */
export function useCurrencyConverter() {
  const [rate,          setRate]          = useState(null);
  const [effectiveDate, setEffectiveDate] = useState(null);
  const [table,         setTable]         = useState(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState(null);
  const [manualRate,    setManualRate]    = useState("");

  // Abort token — prevents stale fetch from overwriting newer state
  const fetchId = useRef(0);

  const loadRate = useCallback(async (currency, date) => {
    if (!currency || !date) return;

    const myId = ++fetchId.current;
    setIsLoading(true);
    setError(null);
    setRate(null);
    setEffectiveDate(null);
    setTable(null);
    setManualRate("");

    try {
      const result = await fetchNbpRate(currency, date);
      if (myId !== fetchId.current) return; // stale
      setRate(result.rate);
      setEffectiveDate(result.effectiveDate);
      setTable(result.table);
    } catch (err) {
      if (myId !== fetchId.current) return;
      setError(err.message);
    } finally {
      if (myId === fetchId.current) setIsLoading(false);
    }
  }, []);

  const parsedManual = parseFloat(String(manualRate).replace(",", "."));
  const activeRate   = (!isNaN(parsedManual) && parsedManual > 0) ? parsedManual : rate;

  const convertToPln = useCallback((amount) => {
    if (!activeRate || !amount) return 0;
    return Math.round(parseFloat(amount) * activeRate * 100) / 100;
  }, [activeRate]);

  return {
    rate,
    effectiveDate,
    table,
    isLoading,
    error,
    manualRate,
    setManualRate,
    activeRate,
    loadRate,
    convertToPln,
  };
}