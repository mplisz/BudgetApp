// ============================================================
// File: src/components/ui/MerchantInput.jsx
// Editable shop-name field with autocomplete from the family's
// known merchants (AppContext). Free text allowed — typing a new
// name is fine; it gets POSTed/remembered on save. Used in the OCR
// review bar and in the manual TransactionForm.
//
// Junk values ("", "nieznany", ...) are filtered by cleanMerchant
// on the consumer side before persisting, so this component stays
// purely about input + suggestions.
// ============================================================

import { useId } from "react";
import { useAppContext } from "../../context/AppContext";

export function MerchantInput({
  value,
  onChange,
  placeholder = "Nazwa sklepu…",
  autoFocus = false,
  style = {},
  onBlur,
  onEnter,
}) {
  const listId = useId();
  const { merchants } = useAppContext();
  const options = Array.isArray(merchants) ? merchants : [];

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value || ""}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
        style={style}
      />
      <datalist id={listId}>
        {options.map(m => <option key={m} value={m} />)}
      </datalist>
    </>
  );
}
