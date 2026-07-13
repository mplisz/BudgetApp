// ============================================================
// File: src/components/panels/transactionComponents/CartItemEditor.tsx
// Thin wrapper around TransactionForm for editing one cart line.
// Mirrors EditTransactionModal: map item → initialValues, render the
// form, hand the edited payload back via onSave. Owns NO cart logic —
// the parent rebuilds the cart (merge-collapse + patch-subset).
// Placement-agnostic: can be relocated (inline row / bottom-sheet)
// without touching this file. That's the point of step 1.
// ============================================================

import { useState } from "react";
import { c } from "../../../styles/tokens";
import { TransactionForm } from "./TransactionForm";
import type { FormValues, TransactionPayload } from "../../../types/transaction";
import type { CartItem } from "./CartPanel";

// The edited payload may carry a cart-only learning opt-out. It's not a
// real transaction field — CartPanel.toPayload strips it before save; it
// only rides back so PanelExpenses can stamp it on the cart item.
export type CartEditPayload = TransactionPayload & { _ocrNoLearn?: boolean };

interface CartItemEditorProps {
  item:        CartItem;
  budgetMonth: string;
  isSaving?:   boolean;
  onSave:      (payload: CartEditPayload) => void;
  onCancel:    () => void;
}

// Cart item → form values. Deliberately NOT txToFormValues — two
// cart-specific differences must survive:
//   • merchant falls back to _ocrMerchant (OCR provenance)
//   • lineItems forced empty (cart edits one collapsed line)
// Converging the two mappers is a later cleanup, not this step.
function cartItemToFormValues(item: CartItem): FormValues {
  const [y, m, d] = item.date.split("-").map(Number);
  return {
    date:            new Date(y, m - 1, d),
    currency:        item.originalCurrency,
    customCurrency:  "",
    amountOrig:      String(item.originalAmount),
    subcategoryId:   item.subcategoryId,
    subcategoryName: item.subcategoryName,
    categoryId:      item.categoryId,
    categoryName:    item.categoryName,
    categoryType:    null,
    priority:        item.priority,
    description:     item.description,
    tags:            item.tags || [],
    voucherAllocations: item.voucherAllocations ?? [],
    amountGross:     "",
    discountAmount:  "",
    qty:             1,
    merchant:        item.merchant || item._ocrMerchant || "",
    lineItems:       [],
  };
}

export function CartItemEditor({ item, budgetMonth, isSaving = false, onSave, onCancel }: CartItemEditorProps) {
  // OCR-originated lines can feed category learning; a one-off edit (e.g.
  // a bottle bought as a gift) can opt out. Defaults false, but preserves
  // the user's prior choice on re-edit (the flag is stamped on the cart
  // item). Manual lines have no _ocrOrigDesc, so the control never renders.
  const isOcrLine = !!item._ocrOrigDesc;
  const [noLearn, setNoLearn] = useState(!!item._ocrNoLearn);

  const handleSubmit = (payload: TransactionPayload) =>
    onSave(isOcrLine ? { ...payload, _ocrNoLearn: noLearn } : payload);

  return (
    <>
      <TransactionForm
        initialValues={cartItemToFormValues(item)}
        budgetMonth={budgetMonth}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        mode="add"            // preserved from current behavior; mode="edit" is a separate opt-in (button → "Update")
        showVouchers={false}  // vouchers are a cart-level choice, not per-line
        cart={[]}             // editing one line — no merge hints
      />
      {isOcrLine && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", color: c.textSecondary, fontSize: 12 }}>
          <input type="checkbox" checked={noLearn} onChange={e => setNoLearn(e.target.checked)} />
          Nie ucz się z tej zmiany (jednorazowa, np. prezent)
        </label>
      )}
      <button
        onClick={onCancel}
        style={{ marginTop: 8, background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 12 }}
      >
        ✕ Anuluj edycję koszyka
      </button>
    </>
  );
}