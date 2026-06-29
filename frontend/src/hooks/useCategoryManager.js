// ============================================================
// File: src/hooks/useCategoryManager.js
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext }   from "../context/AppContext";
import { useToast } from "./useToast";
import { useApi }          from "./useApi";

export function useCategoryManager() {
  const { categories, setCategories } = useAppContext();
  const api                           = useApi();
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
        const dbCategories = await api.get("/api/categories");
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
              id:             child.id,
              name:           child.name,
              priority:       child.priority || 2,
              isArchived:     child.isArchived || false,
              canBeRecurring: child.canBeRecurring ?? false,
              isCritical:     child.isCritical     ?? false,
              canBeLuxmed:    child.canBeLuxmed     ?? false, 
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
  }, [api, setCategories]);

  // ── Patch ───────────────────────────────────────────────────
  async function executePatch(id, name, parentId, updates) {
    try {
      await api.patch(`/api/categories/update/${id}`, updates, { fallback: "Nie udało się zaktualizować." });

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
  // Note: parameter list grew organically; default args keep call sites that
  // don't care about the new flags backwards-compatible.
  async function addCategoryToDb(
    cleanName, cleanIcon, type,
    parentId = null, parentName = null,
    priority = 2,
    canBeRecurring = false,
    isCritical = false,
    canBeLuxmed = false, 
  ) {
    setIsSavingCat(true);
    try {
      const saved = await api.post("/api/categories", {
        name: cleanName, icon: cleanIcon, type, parentCategoryId: parentId,
        priority,
        canBeRecurring: canBeRecurring ?? false,
        isCritical:     isCritical     ?? false,
        canBeLuxmed:    canBeLuxmed     ?? false,
      }, { fallback: "Nie można dodać kategorii." });

      setCategories(prev => {
        if (!parentId) {
          return [...prev, {
            id: saved.id, name: saved.name, icon: saved.icon, type: saved.type,
            isArchived: false,
            canBeRecurring: saved.canBeRecurring ?? false,
            sub: [],
          }];
        }
        return prev.map(cat => {
          if (cat.id === parentId) {
            return {
              ...cat,
              sub: [...cat.sub, {
                id: saved.id, name: saved.name,
                priority: saved.priority || priority,
                isArchived: false,
                canBeRecurring: saved.canBeRecurring ?? false,
                isCritical:     saved.isCritical     ?? false,
                canBeLuxmed:    saved.canBeLuxmed     ?? false, 
              }],
            };
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
