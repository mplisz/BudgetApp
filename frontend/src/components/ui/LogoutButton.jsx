// ============================================================
// File: src/components/ui/LogoutButton.jsx
// ============================================================

import { c, alpha } from "../../styles/tokens";
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
        border: `2px solid ${isLoading ? c.textMuted : alpha(c.danger, "66")}`,
        background: isLoading ? c.border : alpha(c.danger, "11"),
        color: isLoading ? c.textMuted : c.danger,
        cursor: isLoading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        fontSize: 16,
      }}
      onMouseEnter={e => {
        if (!isLoading) {
          e.currentTarget.style.background = alpha(c.danger, "22");
          e.currentTarget.style.borderColor = c.danger;
        }
      }}
      onMouseLeave={e => {
        if (!isLoading) {
          e.currentTarget.style.background = alpha(c.danger, "11");
          e.currentTarget.style.borderColor = alpha(c.danger, "66");
        }
      }}
    >
      {isLoading ? "⏳" : "⏻"}
    </button>
  );
};