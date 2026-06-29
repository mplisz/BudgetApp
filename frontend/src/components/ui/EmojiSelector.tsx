// ============================================================
// File: src/components/ui/EmojiSelector.jsx
// Reusable dropdown for selecting emojis.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState } from "react";
import { theme as s } from "../../styles/theme";
import { POPULAR_EMOJIS } from "../../data/constants";

/**
 * Props:
 *   currentEmoji – currently selected emoji string
 *   onSelect     – fn(emoji: string)
 *   disabled     – boolean (default: false)
 */
interface EmojiSelectorProps {
  currentEmoji?: string;
  onSelect:      (emoji: string) => void;
  disabled?:     boolean;
}

export function EmojiSelector({ currentEmoji, onSelect, disabled = false }: EmojiSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleToggle() {
    if (disabled) return;
    setIsOpen(prev => !prev);
  }

  return (
    <div style={{ position: "relative", display: "flex" }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          ...s.input,
          width:          45,
          fontSize:       18,
          padding:        0,
          display:        "flex",
          justifyContent: "center",
          alignItems:     "center",
          cursor:         disabled ? "not-allowed" : "pointer",
          border:         isOpen ? `1px solid ${c.success}` : `1px solid ${c.borderStrong}`,
          opacity:        disabled ? 0.5 : 1,
        }}>
        {currentEmoji}
      </button>

      {isOpen && (
        <div style={{
          position:  "absolute",
          top:       "100%",
          left:      0,
          marginTop: 8,
          background: c.surfaceAlt,
          border:    `1px solid ${c.borderStrong}`,
          borderRadius: 8,
          padding:   8,
          width:     220,
          maxHeight: 200,
          overflow:  "auto",
          display:   "flex",
          flexWrap:  "wrap",
          gap:       6,
          zIndex:    50,
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        }}>
          {POPULAR_EMOJIS.map(emoji => (
            <div
              key={emoji}
              onClick={() => { onSelect(emoji); setIsOpen(false); }}
              style={{
                fontSize:   22,
                cursor:     "pointer",
                padding:    "4px 6px",
                borderRadius: 6,
                background: currentEmoji === emoji ? alpha(c.success, "44") : "transparent",
                transition: "background 0.2s",
              }}>
              {emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}