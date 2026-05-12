// ============================================================
// File: src/hooks/useTagManager.js
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext }  from "../context/AppContext";
import { useAuth }        from "../context/AuthContext";
import { useToast } from "./useToast";
import { translateError } from "../data/constants/errorMessages";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useTagManager() {
  const { tags, setTags }          = useAppContext();
  const { fetchWithAuth }          = useAuth();
  const { showError, showSuccess } = useToast();

  const [allTags,    setAllTags]    = useState([]);
  const [newTagIcon, setNewTagIcon] = useState("🏷️");
  const [newTagName, setNewTagName] = useState("");
  const [isLoading,  setIsLoading]  = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);

  // ── Load ────────────────────────────────────────────────────
  useEffect(() => {
    async function loadTags() {
      // Skip if already loaded by AppContext bootstrap
      if (tags.length > 0) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const res = await fetchWithAuth(`${API_URL}/api/tags`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setAllTags(data);
        setTags(data.filter(t => !t.isArchived));
      } catch (err) {
        showError("Nie udało się załadować tagów.");
      } finally {
        setIsLoading(false);
      }
    }
    loadTags();
  }, [fetchWithAuth, setTags]);

  // Keep allTags in sync with tags from AppContext (includes archived)
  useEffect(() => {
    if (allTags.length === 0 && tags.length > 0) setAllTags(tags);
  }, [tags]);

  // ── Add ─────────────────────────────────────────────────────
  async function handleAddTag() {
    const cleanName = newTagName.trim();
    if (!cleanName || cleanName.length < 2) { showError("Nazwa tagu jest za krótka."); return; }

    if (tags.some(t => t.name.toLowerCase() === cleanName.toLowerCase())) {
      showError("Tag o tej nazwie już istnieje.");
      return;
    }

    const archivedTag = allTags.find(t => t.name.toLowerCase() === cleanName.toLowerCase() && t.isArchived);
    if (archivedTag) {
      await handleRestoreTag(archivedTag.id);
      setNewTagName("");
      setNewTagIcon("🏷️");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags`, {
        method: "POST",
        body:   JSON.stringify({ name: cleanName, icon: newTagIcon }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie można dodać tagu."));
      }
      const saved = await res.json();
      setAllTags(prev => [...prev, saved]);
      setTags(prev => [...prev, saved]);
      setNewTagName("");
      setNewTagIcon("🏷️");
      showSuccess("Tag dodany! ✅");
    } catch (err) {
      showError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Archive ─────────────────────────────────────────────────
  async function handleArchiveTag(id) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags/${id}`, {
        method: "PATCH",
        body:   JSON.stringify({ isArchived: true }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się zarchiwizować tagu."));
      }
      setAllTags(prev => prev.map(t => t.id === id ? { ...t, isArchived: true } : t));
      setTags(prev => prev.filter(t => t.id !== id));
      showSuccess("Tag zarchiwizowany.");
    } catch (err) {
      showError(err.message);
    }
  }

  // ── Restore ─────────────────────────────────────────────────
  async function handleRestoreTag(id) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags/${id}`, {
        method: "PATCH",
        body:   JSON.stringify({ isArchived: false }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się przywrócić tagu."));
      }
      const restored = await res.json();
      setAllTags(prev => prev.map(t => t.id === id ? restored : t));
      setTags(prev => [...prev, restored]);
      showSuccess("Tag przywrócony! ✅");
    } catch (err) {
      showError(err.message);
    }
  }

  // ── Update ──────────────────────────────────────────────────
  async function handleUpdateTag(id, updates) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags/${id}`, {
        method: "PATCH",
        body:   JSON.stringify(updates),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się zaktualizować tagu."));
      }
      const updated = await res.json();
      setAllTags(prev => prev.map(t => t.id === id ? updated : t));
      setTags(prev => prev.map(t => t.id === id ? updated : t));
    } catch (err) {
      showError(err.message);
    }
  }

  return {
    tags,
    allTags,
    newTagIcon, setNewTagIcon,
    newTagName, setNewTagName,
    isLoading,
    isSaving,
    handleAddTag,
    handleArchiveTag,
    handleRestoreTag,
    handleUpdateTag,
  };
}