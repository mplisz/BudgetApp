// ============================================================
// File: src/components/ui/EmojiSelector.jsx
// Reusable Dropdown for selecting emojis
// ============================================================

import { useState } from "react";
import { theme as s } from "../../styles/theme";
import { POPULAR_EMOJIS } from "../../data/constants";

export function EmojiSelector({ currentEmoji, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: "relative", display: "flex" }}>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)} 
        style={{ 
          ...s.input, 
          width: 45, 
          fontSize: 18, 
          padding: 0, 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center",
          cursor: "pointer",
          border: isOpen ? "1px solid #10b981" : "1px solid #334155"
        }}
      >
        {currentEmoji}
      </button>

      {isOpen && (
        <div style={{ 
          position: "absolute", 
          top: "100%", 
          left: 0, 
          marginTop: 8, 
          background: "#0f172a", 
          border: "1px solid #334155", 
          borderRadius: 8, 
          padding: 8, 
          width: 220, 
          maxHeight: 200,      
          overflow: "auto",
          display: "flex", 
          flexWrap: "wrap", 
          gap: 6, 
          zIndex: 50, 
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)" 
        }}>
          {POPULAR_EMOJIS.map(emoji => (
            <div 
              key={emoji} 
              onClick={() => { 
                onSelect(emoji); 
                setIsOpen(false); 
              }}
              style={{ 
                fontSize: 22, 
                cursor: "pointer", 
                padding: "4px 6px", 
                borderRadius: 6, 
                background: currentEmoji === emoji ? "#10b98144" : "transparent",
                transition: "background 0.2s"
              }}
            >
              {emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}