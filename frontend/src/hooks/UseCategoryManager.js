// ============================================================
// File: src/hooks/useCategoryManager.js
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext }   from "../context/AppContext";
import { useAuth }         from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { translateError }  from "../data/constants/errorMessages";

const ENV_API = import.meta.env.VITE_API_URL;
if (!ENV_API && import.meta.env.PROD) {
  console.warn("CRITICAL: VITE_API_URL is missing in production environment!");
}
const API_URL = ENV_API || "http://localhost:5000";

export function useCategoryManager() {
  const { categories, setCategories } = useAppContext();
  const { fetchWithAuth }             = useAuth();
  const { showError, showSuccess }    = useToast();

  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isSavingCat,   setIsSavingCat]   = useState(false);

  // ── Load ────────────────────────────────────────────────────
  useEffect(() => {
    async function loadCategories() {
      // Skip if already loaded by AppContext bootstrap
      if (categories.length > 0) { setIsLoadingCats(false); return; }
      try {
        setIsLoadingCats(true);
        const res = await fetchWithAuth(`${API_URL}/api/categories`);
        if (!res.ok) throw new Error("Failed to fetch");

        const dbCategories = await res.json();
        const parents = dbCategories.filter(c => !c.parentCategoryId).map(parent => ({
          id:         parent.id,
          name:       parent.name,
          icon:       parent.icon || "📦",
          type:       parent.type || "EXPENSE",
          isArchived: parent.isArchived || false,
          sub:        [],
        }));
        dbCategories.filter(c => c.parentCategoryId).forEach(child => {
          const parentObj = parents.find(p => p.id === child.parentCategoryId);
          if (parentObj) {
            parentObj.sub.push({
              id:         child.id,
              name:       child.name,
              priority:   child.priority || 2,
              isArchived: child.isArchived || false,
            });
          }
        });
        setCategories(parents);
      } catch (err) {
        console.error("Fetch error:", err);
        showError("Nie udało się załadować kategorii.");
      } finally {
        setIsLoadingCats(false);
      }
    }
    loadCategories();
  }, [fetchWithAuth, setCategories]);

  // ── Patch ───────────────────────────────────────────────────
  async function executePatch(id, name, parentId, updates) {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/categories/update/${id}`, {
        method: "PATCH",
        body:   JSON.stringify(updates),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się zaktualizować."));
      }

      setCategories(prev => prev.map(cat => {
        if (!parentId && cat.id === id) {
          const newCat = { ...cat, ...updates };
          if (updates.isArchived !== undefined) {
            newCat.sub = cat.sub.map(sub => ({ ...sub, isArchived: updates.isArchived }));
          }
          return newCat;
        }
        if (parentId && cat.id === parentId) {
          return { ...cat, sub: cat.sub.map(sub => sub.id === id ? { ...sub, ...updates } : sub) };
        }
        return cat;
      }));
    } catch (err) {
      showError(err.message);
    }
  }

  // ── Add ─────────────────────────────────────────────────────
  async function addCategoryToDb(cleanName, cleanIcon, type, parentId = null, parentName = null, priority = 2) {
    setIsSavingCat(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/api/categories`, {
        method: "POST",
        body:   JSON.stringify({ name: cleanName, icon: cleanIcon, type, parentCategoryId: parentId, priority }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie można dodać kategorii."));
      }

      const saved = await response.json();

      setCategories(prev => {
        if (!parentId) {
          return [...prev, { id: saved.id, name: saved.name, icon: saved.icon, type: saved.type, isArchived: false, sub: [] }];
        }
        return prev.map(cat => {
          if (cat.id === parentId) {
            return { ...cat, sub: [...cat.sub, { id: saved.id, name: saved.name, priority: saved.priority || priority, isArchived: false }] };
          }
          return cat;
        });
      });

      showSuccess("Dodano! ✅");
      return true;
    } catch (error) {
      showError(error.message);
      return false;
    } finally {
      setIsSavingCat(false);
    }
  }

  return { isLoadingCats, isSavingCat, showError, executePatch, addCategoryToDb };
}