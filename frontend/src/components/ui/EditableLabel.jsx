// ============================================================
// File: src/components/ui/EditableLabel.jsx
// Reusable inline editable label with double-click to edit
// ============================================================

import { useState } from "react";

export function EditableLabel({ value, onSave, disabled = false, fontSize = 13, fontWeight = 600 }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  function handleSave() {
    const clean = editValue.trim();
    if (!clean || clean.length < 2 || clean.length > 50) {
      setEditValue(value);
      setIsEditing(false);
      return;
    }
    if (clean !== value) onSave(clean);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') { setEditValue(value); setIsEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
        style={{
          flex: 1, background: "#0d1424", border: "1px solid #10b981",
          borderRadius: 6, padding: "2px 8px", color: "#e2e8f0",
          fontSize, outline: "none"
        }}
      />
    );
  }

  return (
    <span
      style={{ flex: 1, color: "#e2e8f0", fontSize, fontWeight }}
      onDoubleClick={e => { e.stopPropagation(); if (!disabled) setIsEditing(true); }}
      title={disabled ? "" : "Kliknij dwukrotnie aby edytować"}
    >
      {value}
    </span>
  );
}