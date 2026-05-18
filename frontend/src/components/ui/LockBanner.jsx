// ============================================================
// File: src/components/ui/LockBanner.jsx
// Renders the appropriate lock banner based on usePanelLock state.
// Returns null if no lock is active.
// ============================================================

export function LockBanner({ isPastMonth, isMonthClosed, selectedMonth }) {
  const bannerStyle = {
    display: "flex", alignItems: "center", gap: 10,
    background: "#1e1a0e", border: "1px solid #92400e44", borderRadius: 12,
    padding: "12px 16px", color: "#fbbf24", fontSize: 13, fontWeight: 600,
    marginBottom: 16,
  };

  if (isPastMonth) {
    return (
      <div style={bannerStyle}>
        <span style={{ fontSize: 20 }}>🔒</span>
        <span>
          Miesiąc <strong>{selectedMonth}</strong> jest w przeszłości — dane są tylko do odczytu.
          Edycja dostępna wyłącznie dla bieżącego i przyszłych miesięcy.
        </span>
      </div>
    );
  }

  if (isMonthClosed) {
    return (
      <div style={bannerStyle}>
        <span style={{ fontSize: 20 }}>🔒</span>
        <span>
          Miesiąc <strong>{selectedMonth}</strong> został zamknięty. Aby edytować,
          otwórz go ponownie przyciskiem{" "}
          <strong style={{ color: "#fbbf24" }}>🔒 {selectedMonth}</strong> w nagłówku.
        </span>
      </div>
    );
  }

  return null;
}
