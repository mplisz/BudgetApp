// ============================================================
// File: src/components/ui/TagMultiSelect.tsx
// Multi-selector of tags.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState } from "react";
import type { ReactElement } from "react";
import { useAppContext } from "../../context/AppContext";

export interface TagMultiSelectProps {
  /** Array of selected tag IDs. */
  value:        string[];
  /** Called with the new array of tag IDs when selection changes. */
  onChange:     (next: string[]) => void;
  disabled?:    boolean;
  placeholder?: string;
}

export function TagMultiSelect({
  value = [],
  onChange,
  disabled = false,
  placeholder = "Szukaj tagów…",
}: TagMultiSelectProps): ReactElement {
  const { tags } = useAppContext();
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);

  const activeTags   = tags.filter(t => !t.isArchived);
  const filteredTags = activeTags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedTags = activeTags.filter(t => value.includes(t.id));

  function toggle(id: string): void {
    if (disabled) return;
    onChange(value.includes(id)
      ? value.filter(t => t !== id)
      : [...value, id],
    );
  }

  const inp: React.CSSProperties = {
    width:        "100%",
    background:   c.bg,
    border:       `1px solid ${c.border}`,
    borderRadius: 8,
    color:        c.text,
    padding:      "9px 12px",
    fontSize:     14,
    outline:      "none",
    opacity:      disabled ? 0.5 : 1,
    cursor:       disabled ? "not-allowed" : "text",
  };

  return (
    <div>
      {selectedTags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selectedTags.map(t => (
            <span
              key={t.id}
              onClick={() => toggle(t.id)}
              style={{
                padding: "3px 10px", borderRadius: 20,
                background: alpha(c.success, "22"), border: `1px solid ${c.success}`,
                color: c.successLight, fontSize: 12,
                cursor: disabled ? "default" : "pointer",
              }}>
              {t.icon} {t.name} {!disabled && "✕"}
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown */}
      <div style={{ position: "relative" }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          disabled={disabled}
          style={inp}
        />

        {open && filteredTags.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
            background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8,
            maxHeight: 200, overflowY: "auto", marginTop: 4,
          }}>
            {filteredTags.map(t => {
              const selected = value.includes(t.id);
              return (
                <div
                  key={t.id}
                  onMouseDown={() => { toggle(t.id); setSearch(""); }}
                  style={{
                    padding: "8px 14px", cursor: "pointer", fontSize: 13,
                    color:      selected ? c.success : c.text,
                    background: selected ? alpha(c.success, "11") : "transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                  <span>{t.icon} {t.name}</span>
                  {selected && <span style={{ fontSize: 11 }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}

        {open && filteredTags.length === 0 && search.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
            background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8,
            padding: "10px 14px", marginTop: 4, fontSize: 13, color: c.textMuted,
          }}>
            Brak tagów pasujących do „{search}”
          </div>
        )}
      </div>
    </div>
  );
}
