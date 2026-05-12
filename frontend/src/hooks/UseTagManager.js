// ============================================================
// File: src/hooks/useTagManager.js
// Custom hook to manage tags business logic and API calls
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { translateError } from "../data/constants/errorMessages";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useTagManager() {
  const { tags, setTags } = useAppContext();
  const { fetchWithAuth } = useAuth();

  const [allTags, setAllTags]         = useState([]);
  const [newTagIcon, setNewTagIcon]   = useState("🏷️");
  const [newTagName, setNewTagName]   = useState("");
  const [isLoading, setIsLoading]     = useState(true);
  const [isSaving, setIsSaving]       = useState(false);
  const [errorMsg, setErrorMsg]       = useState("");
  const errorTimerRef = useRef(null);

  function showError(msg) {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(""), 4000);
  }

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    async function loadTags() {
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

  async function handleAddTag() {
    const cleanName = newTagName.trim();
    if (!cleanName || cleanName.length < 2) {
      showError("Nazwa tagu jest za krótka.");
      return;
    }

    // Check if exists and if duplicate
    if (tags.some(t => t.name.toLowerCase() === cleanName.toLowerCase())) {
      showError("Tag o tej nazwie już istnieje.");
      return;
    }

    // Check if that tag is not already archived
    const archivedTag = allTags.find(t =>
      t.name.toLowerCase() === cleanName.toLowerCase() && t.isArchived
    );

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
        body: JSON.stringify({ name: cleanName, icon: newTagIcon })
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
    } catch (err) {
      showError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchiveTag(id) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags/update/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isArchived: true })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się zarchiwizować tagu."));
      }

      setAllTags(prev => prev.map(t => t.id === id ? { ...t, isArchived: true } : t));
      setTags(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleRestoreTag(id) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags/update/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isArchived: false })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się przywrócić tagu."));
      }

      const restored = await res.json();
      setAllTags(prev => prev.map(t => t.id === id ? restored : t));
      setTags(prev => [...prev, restored]);
    } catch (err) {
      showError(err.message);
    }
  }
  async function handleUpdateTag(id, updates) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/tags/update/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(translateError(errData.error, "Nie udało się zaktualizować tagu."));
      }
      const saved = await res.json();
      setAllTags(prev => prev.map(t => t.id === id ? saved : t));
      setTags(prev => prev.map(t => t.id === id ? saved : t));
    } catch (err) {
      showError(err.message);
    }
  }
  return {
    tags,
    allTags,
    newTagIcon,
    setNewTagIcon,
    newTagName,
    setNewTagName,
    isLoading,
    isSaving,
    errorMsg,
    showError,
    handleAddTag,
    handleArchiveTag,
    handleRestoreTag,
    handleUpdateTag
  };
}