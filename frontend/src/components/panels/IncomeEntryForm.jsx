// ============================================================
// File: src/components/panels/IncomeEntryForm.jsx
// Standalone income entry form (outside App to prevent focus loss).
// ============================================================

import { useEffect, useState } from "react";
import { BudgetInput } from "../ui/BudgetInput";

// ─── INCOME ENTRY FORM ────────────────────────────────────────────────────────
// Defined outside App to prevent remounting on App state changes (focus loss fix).
export function IncomeEntryForm({ incomeSources, onAdd, defaultDate, s_input, s_select, s_btn, s_label }) {
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));

  // Sync date when the parent month selector changes
  useEffect(() => {
    if (defaultDate) setDate(defaultDate);
  }, [defaultDate]);

  function add() {
    if (!source || !amount) return;
    onAdd({ source, amount, date });
    setSource(""); setAmount(0);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <label style={s_label}>Źródło wpływu</label>
        <select style={s_select} value={source} onChange={e => setSource(e.target.value)}>
          <option value="">Wybierz źródło...</option>
          {incomeSources.map(src => <option key={src} value={src}>{src}</option>)}
        </select>
      </div>
      <div>
        <label style={s_label}>Kwota (PLN)</label>
        <BudgetInput style={s_input} value={amount} onChange={v => setAmount(v)} placeholder="0,00" />
      </div>
      <div>
        <label style={s_label}>Data</label>
        <input style={s_input} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <button onClick={add}
        style={{ ...s_btn, background: source && amount ? "#10b981" : "#334155", cursor: source && amount ? "pointer" : "not-allowed" }}>
        ➕ Dodaj wpływ
      </button>
    </div>
  );
}

