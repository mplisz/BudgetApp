// ============================================================
// File: src/components/panels/transactionComponents/CartItemEditorModal.tsx
// Overlay host for CartItemEditor.
//   Desktop: centered modal (matches EditTransactionModal / txStyles).
//   Mobile : bottom-sheet (matches MoreSheet).
// Pure presentation — owns no tx/cart logic, just frames the editor.
// This is step 2: the editor's PLACEMENT, decoupled from its logic.
// ============================================================

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CartItemEditor } from "./CartItemEditor";
import type { TransactionPayload } from "../../../types/transaction";
import type { CartItem } from "./CartPanel";

interface CartItemEditorModalProps {
  item:        CartItem;
  budgetMonth: string;
  isSaving?:   boolean;
  onSave:      (payload: TransactionPayload) => void;
  onCancel:    () => void;
}

export function CartItemEditorModal({ item, budgetMonth, isSaving = false, onSave, onCancel }: CartItemEditorModalProps) {
  // Escape-to-close + body scroll lock while open (matches MoreSheet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return createPortal(
    <>
      {/* Dim overlay — tap to close. Covers the cart too (standard modal). */}
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(2,6,18,0.7)", zIndex: 1000 }}
      />

      {/* Box — centered (desktop) / bottom-sheet (mobile), switched by CSS */}
      <div
        className="cart-editor-box"
        role="dialog"
        aria-modal="true"
        aria-label="Edytuj pozycję z koszyka"
      >
        {/* Mobile grabber — invisible on desktop */}
        <div className="cart-editor-grabber" />

        <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 16, marginBottom: 16 }}>
          ✏️ Edytuj pozycję z koszyka
        </div>

        <CartItemEditor
          item={item}
          budgetMonth={budgetMonth}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>

      <style>{`
        .cart-editor-box {
          position: fixed; z-index: 1001;
          background: #0d1424; border: 1px solid #1e293b;
          overflow-y: auto;
          /* Desktop: centered modal */
          top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 90vw; max-width: 520px; max-height: 85vh;
          border-radius: 14px; padding: 24px 28px;
        }
        .cart-editor-grabber { display: none; }
        @media (max-width: 700px) {
          .cart-editor-box {
            /* Mobile: bottom-sheet */
            top: auto; left: 0; right: 0; bottom: 0; transform: none;
            width: 100%; max-width: none; max-height: 85vh;
            border-radius: 16px 16px 0 0;
            padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
            animation: cart-editor-up 0.18s ease-out;
          }
          .cart-editor-grabber {
            display: block; width: 36px; height: 4px; border-radius: 99px;
            background: #1e293b; margin: 0 auto 12px;
          }
        }
        @keyframes cart-editor-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>,
    document.body
  );
}
