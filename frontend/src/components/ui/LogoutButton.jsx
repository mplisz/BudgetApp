// ============================================================
// File: src/components/ui/LogoutButton.jsx
// ============================================================

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const LogoutButton = () => {
  const { logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    await logout();
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      title="Wyloguj"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: `2px solid ${isLoading ? "#475569" : "#ef444466"}`,
        background: isLoading ? "#1e293b" : "#ef444411",
        color: isLoading ? "#475569" : "#ef4444",
        cursor: isLoading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        fontSize: 16,
      }}
      onMouseEnter={e => {
        if (!isLoading) {
          e.currentTarget.style.background = "#ef444422";
          e.currentTarget.style.borderColor = "#ef4444";
        }
      }}
      onMouseLeave={e => {
        if (!isLoading) {
          e.currentTarget.style.background = "#ef444411";
          e.currentTarget.style.borderColor = "#ef444466";
        }
      }}
    >
      {isLoading ? "⏳" : "⏻"}
    </button>
  );
};