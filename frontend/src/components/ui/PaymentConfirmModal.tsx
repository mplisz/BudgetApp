// ============================================================
// File: src/components/ui/PaymentConfirmModal.tsx
// Reusable confirm modal with editable amount.
// Used in NotificationBell for both recurring and planned.
// ============================================================

import { useState, useEffect } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmt } from "../../utils/helpers";

export interface PaymentConfirmModalProps {
  isOpen:         boolean;
  title:          string;
  description:    string;
  /** Optional category badge shown next to description. */
  categoryName?:  string;
  /** Pre-filled, editable amount in the input. */
  suggestedAmount?: number | null;
  /** Currency label shown next to the input (default: "PLN"). */
  amountLabel?:   string;
  /** Optional max cap — entering more shows a warning. */
  maxAmount?:     number | null;
  /** Show a yellow warning when user changes the suggested amount.
   *  Defaults to true. Set false for recurring (no recompute logic). */
  showRecomputeWarning?: boolean;
  /** Called with the final amount. */
  onConfirm:      (amount: number) => void;
  onCancel:       () => void;
  /** Optional JSX rendered below the amount input. */
  extraInfo?:     ReactNode;
}

export function PaymentConfirmModal({
  isOpen,
  title,
  description,
  categoryName,
  suggestedAmount,
  amountLabel = "PLN",
  maxAmount = null,
  showRecomputeWarning = true,
  onConfirm,
  onCancel,
  extraInfo = null,
}: PaymentConfirmModalProps): ReactElement | null {
  const [amount, setAmount] = useState<string>("");

  // Reset amount when modal opens with new suggestion
  useEffect(() => {
    if (isOpen) {
      setAmount(suggestedAmount != null ? String(suggestedAmount) : "");
    }
  }, [isOpen, suggestedAmount]);

  if (!isOpen) return null;

  const parsed  = parseFloat(amount) || 0;
  const isValid = parsed > 0;
  const capped  = maxAmount != null && parsed > maxAmount;

  function handleConfirm(): void {
    if (!isValid) return;
    onConfirm(Math.min(parsed, maxAmount ?? parsed));
  }

  return createPortal(
    <div
      data-modal="true"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        zIndex: 2000, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16,
          padding: 24, width: "100%", maxWidth: 400,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 16, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
          {description}
          {categoryName && (
            <span style={{ color: "#475569", marginLeft: 4 }}>· {categoryName}</span>
          )}
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block", fontSize: 11, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.6px",
            fontWeight: 700, marginBottom: 8,
          }}>
            Kwota ({amountLabel})
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                background: "#0a0f1e",
                border: `1px solid ${capped ? "#ef444466" : "#1e293b"}`,
                borderRadius: 8,
                color: "#e2e8f0",
                padding: "10px 12px",
                fontSize: 16,
                fontWeight: 700,
                outline: "none",
              }}
            />
            {suggestedAmount != null && (
              <button
                onClick={() => setAmount(String(suggestedAmount))}
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid #10b98144",
                  background: "transparent", color: "#10b981",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Sugestia
              </button>
            )}
            {maxAmount != null && (
              <button
                onClick={() => setAmount(String(maxAmount))}
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid #3b82f644",
                  background: "transparent", color: "#3b82f6",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                MAX
              </button>
            )}
          </div>
          {capped && maxAmount != null && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
              Maksymalna kwota: {fmt(maxAmount)} {amountLabel}
            </div>
          )}
          {showRecomputeWarning
            && suggestedAmount != null
            && parsed > 0
            && parsed !== suggestedAmount && (
            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
              ⚠️ Inna kwota niż sugerowana — sugestia dla kolejnych miesięcy zostanie przeliczona
            </div>
          )}
        </div>

        {extraInfo && (
          <div style={{ marginBottom: 16 }}>{extraInfo}</div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px", borderRadius: 8,
              border: "1px solid #1e293b",
              background: "transparent", color: "#94a3b8",
              cursor: "pointer", fontWeight: 600,
            }}
          >
            Anuluj
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              padding: "10px 24px", borderRadius: 8,
              border: "none",
              background: isValid ? "#10b981" : "#1e293b",
              color: isValid ? "#fff" : "#475569",
              cursor: isValid ? "pointer" : "not-allowed",
              fontWeight: 700, fontSize: 14,
            }}
          >
            ✅ Potwierdź
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
