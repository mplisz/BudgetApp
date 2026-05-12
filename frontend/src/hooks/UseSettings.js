// ============================================================
// File: src/hooks/useSettings.js
// Custom hook to manage family settings
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const DEFAULT_SETTINGS = {
  thresholds: {
    warningPercent: 80,
    criticalPercent: 95,
  },
  targets: {
    maxInsurancePercent:   10,
    maxObligationsPercent: 35,
    minRetirementPercent:  15,
    minSavingsPercent:     20,
  }
};

export function useSettings() {
  const { fetchWithAuth } = useAuth();
  const { settings, setSettings } = useAppContext();

  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const errorTimerRef   = useRef(null);
  const successTimerRef = useRef(null);

  function showError(msg) {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(""), 4000);
  }

  function showSuccess(msg) {
    setSuccessMsg(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMsg(""), 3000);
  }

  useEffect(() => {
    return () => {
      if (errorTimerRef.current)   clearTimeout(errorTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  useEffect(() => {
    async function loadSettings() {
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

  async function updateSettings(patch) {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/settings`, {
        method: "PATCH",
        body: JSON.stringify(patch)
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

  return {
    settings,
    isLoading,
    isSaving,
    errorMsg,
    successMsg,
    updateSettings,
  };
}