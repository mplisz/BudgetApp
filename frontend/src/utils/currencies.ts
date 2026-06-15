import { CURRENCY_SYMBOLS } from "../data/constants/currencies";

const SYMBOLS_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENCY_SYMBOLS).map(([k, v]) => [k.toLowerCase(), v]),
);

export function normalizeCurrency(raw?: string | null): string {
  const t = (raw || "").trim();
  if (!t) return "PLN";
  if (CURRENCY_SYMBOLS[t]) return CURRENCY_SYMBOLS[t];
  const lower = t.toLowerCase();
  if (SYMBOLS_LOWER[lower]) return SYMBOLS_LOWER[lower];
  return t.toUpperCase();
}