// ============================================================
// File: src/components/ui/BudgetInput.jsx
// Focus-safe numeric input that accepts comma or dot as decimal.
// Must be defined outside any parent component to prevent remounting.
// ============================================================

import { useState, useEffect, useRef } from "react";

export function BudgetInput({ value, onChange, style, placeholder }) {
  const [localVal, setLocalVal] = useState(
    value === 0 || value === "" || value == null ? "" : String(value).replace(".", ",")
  );
  const focused = useRef(false);

  // Only sync from parent when not currently focused (user not typing)
  useEffect(() => {
    if (!focused.current) {
      const ext = value === 0 || value === "" || value == null
        ? ""
        : String(value).replace(".", ",");
      setLocalVal(ext);
    }
  }, [value]);

  function handleChange(e) {
    const raw = e.target.value.replace(".", ","); // normalise to comma
    setLocalVal(raw);
    const parsed = parseFloat(raw.replace(",", "."));
    if (!isNaN(parsed)) onChange(parsed);
    else if (raw === "" || raw === "-") onChange(0);
  }

  return (
    <input
      style={style}
      type="text"
      inputMode="decimal"
      placeholder={placeholder || "0"}
      value={localVal}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        const parsed = parseFloat(String(localVal).replace(",", "."));
        if (!isNaN(parsed) && parsed !== 0) {
          setLocalVal(String(parsed).replace(".", ","));
        } else {
          setLocalVal("");
          onChange(0);
        }
      }}
      onChange={handleChange}
    />
  );
}
