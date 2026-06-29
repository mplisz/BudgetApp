// ============================================================
// File: src/components/panels/transactionComponents/CartItemEditor.tsx
// Thin wrapper around TransactionForm for editing one cart line.
// Mirrors EditTransactionModal: map item → initialValues, render the
// form, hand the edited payload back via onSave. Owns NO cart logic —
// the parent rebuilds the cart (merge-collapse + patch-subset).
// Placement-agnostic: can be relocated (inline row / bottom-sheet)
// without touching this file. That's the point of step 1.
// ============================================================

import { c } from "../../../styles/tokens";
import { TransactionForm } from "./TransactionForm";
import type { FormValues, TransactionPayload } from "../../../types/transaction";
import type { CartItem } from "./CartPanel";

interface CartItemEditorProps {
  item:        CartItem;
  budgetMonth: string;
  isSaving?:   boolean;
  onSave:      (payload: TransactionPayload) => void;
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
  return (
    <>
      <TransactionForm
        initialValues={cartItemToFormValues(item)}
        budgetMonth={budgetMonth}
        onSubmit={onSave}
        isSaving={isSaving}
        mode="add"            // preserved from current behavior; mode="edit" is a separate opt-in (button → "Update")
        showVouchers={false}  // vouchers are a cart-level choice, not per-line
        cart={[]}             // editing one line — no merge hints
      />
      <button
        onClick={onCancel}
        style={{ marginTop: 8, background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 12 }}
      >
        ✕ Anuluj edycję koszyka
      </button>
    </>
  );
}