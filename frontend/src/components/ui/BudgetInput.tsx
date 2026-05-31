// ============================================================
// File: src/components/ui/BudgetInput.tsx
// Focus-safe numeric input — accepts comma or dot as decimal.
// Defined outside any parent component to prevent remounting.
// ============================================================

import { useState, useEffect, useRef } from "react";

interface BudgetInputProps {
  value:        number | "";
  onChange:     (v: number | "") => void;
  style?:       React.CSSProperties;
  placeholder?: string;
  disabled?:    boolean;
}

export function BudgetInput({ value, onChange, style, placeholder, disabled = false }: BudgetInputProps) {
  const [localVal, setLocalVal] = useState<string>(
    value === 0 || value === "" || value == null
      ? ""
      : String(value).replace(".", ",")
  );
  const focused = useRef(false);

  // Sync from parent only when not currently focused (user not typing)
  useEffect(() => {
    if (!focused.current) {
      setLocalVal(
        value === 0 || value === "" || value == null
          ? ""
          : String(value).replace(".", ",")
      );
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(".", ","); // normalise to comma
    setLocalVal(raw);
    const parsed = parseFloat(raw.replace(",", "."));
    if (!isNaN(parsed)) onChange(parsed);
    else if (raw === "")  onChange("");   // empty = "no value" (parent decides semantics)
    else if (raw === "-") onChange(0);    // user typed just minus — treat as 0
  }

  function handleBlur() {
    focused.current = false;
    const parsed = parseFloat(String(localVal).replace(",", "."));
    if (!isNaN(parsed)) {
      setLocalVal(String(parsed).replace(".", ","));
    } else {
      setLocalVal("");
        onChange("");
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder ?? "0"}
      value={localVal}
      disabled={disabled}
      onFocus={() => { focused.current = true; }}
      onBlur={handleBlur}
      onChange={handleChange}
      style={{
        cursor: disabled ? "not-allowed" : "text",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    />
  );
}
