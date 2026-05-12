// ============================================================
// File: src/hooks/useCurrencyManager.js
// Manages currencies stored in settings.currencies.
//
// Currency model:
//   { code, name, isArchived, isBase }
//
// isBase: true  → always first in dropdown, UI hides archive button
// isBase: false → user-managed, max 10 active at a time
//
// No hardcoded currency logic — all behaviour driven by isBase flag.
// ============================================================

import { useCallback } from "react";
import { useAppContext } from "../context/AppContext";
import { useAuth }       from "../context/AuthContext";
import { useToast }      from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const DEFAULT_CURRENCIES = [
  { code: "PLN", name: "Polski złoty",     isArchived: false, isBase: true  },
  { code: "EUR", name: "Euro",             isArchived: false, isBase: false },
  { code: "USD", name: "Dolar amerykański", isArchived: false, isBase: false },
  { code: "GBP", name: "Funt szterling",   isArchived: false, isBase: false },
  { code: "RUB", name: "Rubel rosyjski",   isArchived: false, isBase: false },
  { code: "CZK", name: "Korona czeska",    isArchived: false, isBase: false },
];

export function useCurrencyManager() {
  const { settings, setSettings } = useAppContext();
  const { fetchWithAuth }         = useAuth();
  const { showError, showSuccess } = useToast();

  const allCurrencies = settings?.currencies ?? DEFAULT_CURRENCIES;

  // Derived views
  const baseCurrency       = allCurrencies.find(c => c.isBase) ?? DEFAULT_CURRENCIES[0];
  const activeCurrencies   = allCurrencies.filter(c => !c.isBase && !c.isArchived);
  const archivedCurrencies = allCurrencies.filter(c => !c.isBase && c.isArchived);

  // Dropdown: base first, then active non-base
  const dropdownCurrencies = [baseCurrency, ...activeCurrencies];

  // ── Save helper ──────────────────────────────────────────────
  const saveCurrencies = useCallback(async (newList) => {
    const activeNonBase = newList.filter(c => !c.isBase && !c.isArchived).length;
    if (activeNonBase > 10) {
      showError("Maksymalnie 10 aktywnych walut.");
      return false;
    }

    try {
      const res = await fetchWithAuth(`${API_URL}/api/settings`, {
        method: "PATCH",
        body:   JSON.stringify({ currencies: newList }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nie udało się zapisać walut.");
      }
      const saved = await res.json();
      setSettings(saved);
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    }
  }, [fetchWithAuth, setSettings, showError]);

  // ── Add ──────────────────────────────────────────────────────
  async function addCurrency(code, name) {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    if (cleanCode.length !== 3)             { showError("Kod waluty musi mieć 3 litery."); return false; }
    if (!cleanName || cleanName.length < 2) { showError("Nazwa waluty jest za krótka."); return false; }

    // Block adding a duplicate of the base currency
    if (allCurrencies.find(c => c.code === cleanCode && c.isBase)) {
      showError(`${cleanCode} jest walutą bazową — zawsze jest dostępna.`);
      return false;
    }

    const existing = allCurrencies.find(c => c.code === cleanCode);
    if (existing) {
      if (!existing.isArchived) { showError(`Waluta ${cleanCode} już istnieje.`); return false; }
      // Restore archived
      const restored = allCurrencies.map(c =>
        c.code === cleanCode ? { ...c, isArchived: false } : c
      );
      const ok = await saveCurrencies(restored);
      if (ok) showSuccess(`${cleanCode} przywrócona! ✅`);
      return ok;
    }

    if (activeCurrencies.length >= 10) {
      showError("Osiągnięto limit 10 aktywnych walut.");
      return false;
    }

    const newList = [...allCurrencies, { code: cleanCode, name: cleanName, isArchived: false, isBase: false }];
    const ok = await saveCurrencies(newList);
    if (ok) showSuccess(`${cleanCode} dodana! ✅`);
    return ok;
  }

  // ── Archive ──────────────────────────────────────────────────
  async function archiveCurrency(code) {
    const currency = allCurrencies.find(c => c.code === code);
    if (currency?.isBase) {
      showError("Waluta bazowa nie może być zarchiwizowana.");
      return false;
    }
    const newList = allCurrencies.map(c =>
      c.code === code ? { ...c, isArchived: true } : c
    );
    const ok = await saveCurrencies(newList);
    if (ok) showSuccess(`${code} zarchiwizowana.`);
    return ok;
  }

  // ── Update code or name ─────────────────────────────────────
  async function updateCurrency(code, patch) {
    const newCode = patch.code ? patch.code.trim().toUpperCase() : undefined;
    const newName = patch.name !== undefined ? patch.name.trim() : undefined;

    if (newCode) {
      if (newCode.length !== 3) { showError("Kod waluty musi mieć 3 litery."); return false; }
      if (allCurrencies.find(c => c.code === newCode && c.code !== code)) {
        showError(`Waluta ${newCode} już istnieje.`); return false;
      }
    }
    if (newName !== undefined && newName.length < 2) {
      showError("Nazwa waluty jest za krótka."); return false;
    }
    const newList = allCurrencies.map(c =>
      c.code === code ? {
        ...c,
        ...(newCode ? { code: newCode } : {}),
        ...(newName !== undefined ? { name: newName } : {}),
      } : c
    );
    const ok = await saveCurrencies(newList);
    if (ok) showSuccess("Waluta zaktualizowana. ✅");
    return ok;
  }

  // ── Restore ──────────────────────────────────────────────────
  async function restoreCurrency(code) {
    if (activeCurrencies.length >= 10) {
      showError("Osiągnięto limit 10 aktywnych walut. Zarchiwizuj inną walutę.");
      return false;
    }
    const newList = allCurrencies.map(c =>
      c.code === code ? { ...c, isArchived: false } : c
    );
    const ok = await saveCurrencies(newList);
    if (ok) showSuccess(`${code} przywrócona! ✅`);
    return ok;
  }

  return {
    allCurrencies,
    baseCurrency,
    activeCurrencies,
    archivedCurrencies,
    dropdownCurrencies,
    addCurrency,
    archiveCurrency,
    updateCurrency,
    restoreCurrency,
  };
}