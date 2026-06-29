// ============================================================
// File: src/hooks/useSettings.js
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast } from "./useToast";
import { useApi } from "./useApi";
import type { AppSettings } from "../types/appContext";

const DEFAULT_SETTINGS: AppSettings = {
  thresholds: { warningPercent: 80, criticalPercent: 95 },
  targets: {
    maxInsurancePercent:   10,
    maxObligationsPercent: 35,
    minRetirementPercent:  15,
    minSavingsPercent:     20,
  },
};

export function useSettings() {
  const api                        = useApi();
  const { settings, setSettings }  = useAppContext();
  const { showError, showSuccess } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load ────────────────────────────────────────────────────
  useEffect(() => {
    async function loadSettings() {
      // Skip if already loaded by AppContext bootstrap
      if (settings !== null) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const data = await api.get<AppSettings>("/api/settings");
        setSettings(data);
      } catch (err) {
        showError("Nie udało się załadować ustawień.");
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [api, setSettings]);

  // ── Update ──────────────────────────────────────────────────
  async function updateSettings(patch: Partial<AppSettings>) {
    setIsSaving(true);
    try {
      const saved = await api.patch<AppSettings>("/api/settings", patch, { fallback: "Nie udało się zapisać ustawień." });
      setSettings(saved);
      showSuccess("Zapisano! ✅");
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return { settings, isLoading, isSaving, updateSettings };
}