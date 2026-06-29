// ============================================================
// File: src/hooks/useTagManager.js
// ============================================================

import { useState, useEffect } from "react";
import { useAppContext }  from "../context/AppContext";
import { useToast }       from "../hooks/useToast";
import { useApi }         from "./useApi";

export function useTagManager() {
  const { tags, setTags }          = useAppContext();
  const api                        = useApi();
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
        const data = await api.get("/api/tags");
        setAllTags(data);
        setTags(data.filter(t => !t.isArchived));
      } catch (err) {
        showError("Nie udało się załadować tagów.");
      } finally {
        setIsLoading(false);
      }
    }
    loadTags();
  }, [api, setTags]);

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
      const saved = await api.post("/api/tags", { name: cleanName, icon: newTagIcon }, { fallback: "Nie można dodać tagu." });
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
      await api.patch(`/api/tags/update/${id}`, { isArchived: true }, { fallback: "Nie udało się zarchiwizować tagu." });
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
      const restored = await api.patch(`/api/tags/update/${id}`, { isArchived: false }, { fallback: "Nie udało się przywrócić tagu." });
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
      const updated = await api.patch(`/api/tags/update/${id}`, updates, { fallback: "Nie udało się zaktualizować tagu." });
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