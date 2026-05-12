// ============================================================
// File: src/hooks/useSettings.js
// ============================================================

import { useState, useEffect } from "react";
import { useAuth }      from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast } from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const DEFAULT_SETTINGS = {
  thresholds: { warningPercent: 80, criticalPercent: 95 },
  targets: {
    maxInsurancePercent:   10,
    maxObligationsPercent: 35,
    minRetirementPercent:  15,
    minSavingsPercent:     20,
  },
};

export function useSettings() {
  const { fetchWithAuth }          = useAuth();
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
        const res = await fetchWithAuth(`${API_URL}/api/settings`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setSettings(data);
      } catch (err) {
        showError("Nie udało się załadować ustawień.");
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [fetchWithAuth, setSettings]);

  // ── Update ──────────────────────────────────────────────────
  async function updateSettings(patch) {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/settings`, {
        method: "PATCH",
        body:   JSON.stringify(patch),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Nie udało się zapisać ustawień.");
      }
      const saved = await res.json();
      setSettings(saved);
      showSuccess("Zapisano! ✅");
    } catch (err) {
      showError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return { settings, isLoading, isSaving, updateSettings };
}