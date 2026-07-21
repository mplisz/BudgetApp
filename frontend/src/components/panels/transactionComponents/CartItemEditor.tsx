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
import type { LineItemProduct } from "../../../utils/productPricing";
import type { CartItem } from "./CartPanel";

// The edited payload may carry a cart-only learning opt-out, and the
// tracked-product identity (manually assigned/corrected in the form). Neither
// is a real transaction field on CartItem — CartPanel.toPayload rebuilds
// `lineItems` from `_product` at save time; these only ride back here so
// PanelExpenses can stamp them onto the cart item.
export type CartEditPayload = Omit<TransactionPayload, "lineItems"> & {
  _ocrNoLearn?: boolean;
  _product?:    LineItemProduct | null;
};

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
    product:         item._product ?? null,
  };
}

export function CartItemEditor({ item, budgetMonth, isSaving = false, onSave, onCancel }: CartItemEditorProps) {
  // OCR-originated lines can feed category learning; a one-off edit (e.g.
  // a bottle bought as a gift) can opt out. Defaults false, but preserves
  // the user's prior choice on re-edit (the flag is stamped on the cart
  // item). Manual lines have no _ocrOrigDesc, so the control never renders.
  const isOcrLine = !!item._ocrOrigDesc;
  const [noLearn, setNoLearn] = useState(!!item._ocrNoLearn);

  const handleSubmit = (payload: TransactionPayload) => {
    // TransactionForm carries the product identity as a synthetic single-
    // line `lineItems[0].product` (the shape OCR/API already use) — pull it
    // back out into the cart's own `_product` field and drop the rest of
    // that array, which CartPanel.toPayload rebuilds fresh from `_product`
    // at save time (a stray `.lineItems` here would just be dead weight).
    const { lineItems, ...rest } = payload;
    const out: CartEditPayload = { ...rest, _product: lineItems?.[0]?.product ?? null };
    onSave(isOcrLine ? { ...out, _ocrNoLearn: noLearn } : out);
  };

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