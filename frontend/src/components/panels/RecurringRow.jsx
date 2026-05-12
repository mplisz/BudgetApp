// ============================================================
// File: src/components/panels/RecurringRow.jsx
// Inline-editable row for a recurring expense entry.
// UI: Polish | Comments: English
// ============================================================

import React, { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { MONTHS, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";

export default function RecurringRow({ e, showMonth }) {
  const { categories, tags, subLookup, setExpenses, month, year, CTX_MONTHS } = useAppContext();
  const _MONTHS = CTX_MONTHS || MONTHS;

  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState({
    desc: e.desc || "",
    amount: e.amount,
    sub: e.sub,
    category: e.category,
    tags: e.tags || [],
    frequency: e.frequency || "monthly",
    activeMonths: e.activeMonths || [],
    currency: e.currency || "PLN",
    foreignAmount: e.foreignAmount || "",
    scheduledDay: e.scheduledDay || 1,
    scheduledMonth: e.scheduledMonth || 1,
  });

  const [fxRate, setFxRate] = useState(e.fxRate || null);
  const [fxLoading, setFxLoading] = useState(false);

  const FREQS = [
    { id: "monthly", label: "Co miesiąc" },
    { id: "quarterly", label: "Co kwartał" },
    { id: "yearly", label: "Co rok" },
    { id: "custom", label: "Wybrane miesiące" },
  ];

  // Fetch exchange rate if currency is not PLN
  async function fetchRate(currency) {
    if (currency === "PLN") { setFxRate(null); return; }
    setFxLoading(true);
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=PLN`);
      const data = await res.json();
      const rate = data.rates?.PLN;
      setFxRate(rate || null);
      if (rate && val.foreignAmount) {
        setVal(v => ({ ...v, amount: (parseFloat(v.foreignAmount) * rate).toFixed(2) }));
      }
    } catch (err) {
      console.error("FX fetch failed", err);
      setFxRate(null);
    }
    setFxLoading(false);
  }

  function onCurrencyChange(currency) {
    setVal(v => ({ ...v, currency }));
    fetchRate(currency);
  }

  function onForeignAmountChange(fa) {
    const numericFa = parseFloat(fa || 0);
    setVal(v => ({
      ...v,
      foreignAmount: fa,
      amount: fxRate ? (numericFa * fxRate).toFixed(2) : v.amount
    }));
  }

  function save() {
    const mapped = subLookup[val.sub];
    setExpenses(prev => prev.map(x => x.id === e.id ? {
      ...x,
      desc: val.desc,
      amount: parseFloat(val.amount),
      sub: val.sub,
      category: mapped?.category || val.category,
      priority: mapped?.priority || x.priority,
      tags: val.tags,
      frequency: val.frequency,
      activeMonths: val.activeMonths,
      currency: val.currency,
      foreignAmount: val.foreignAmount,
      fxRate,
      scheduledDay: val.scheduledDay,
      scheduledMonth: val.scheduledMonth,
    } : x));
    setEditing(false);
  }

  function removeRecurring() {
    setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, recurring: false } : x));
  }

  const freqLabel = FREQS.find(f => f.id === (e.frequency || "monthly"))?.label;
  const hasFx = e.currency && e.currency !== "PLN";

  // ── EDIT MODE ──────────────────────────────────────────────
  if (editing) return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: "14px", marginBottom: 10, border: "1px solid #334155" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={s.label}>Opis</label>
          <input style={s.input} value={val.desc} onChange={ev => setVal(v => ({ ...v, desc: ev.target.value }))} />
        </div>
        <div>
          <label style={s.label}>Waluta</label>
          <select style={s.select} value={val.currency} onChange={ev => onCurrencyChange(ev.target.value)}>
            {["PLN", "USD", "EUR", "GBP", "CHF", "NOK", "SEK", "CZK"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {val.currency !== "PLN" ? (
          <>
            <div>
              <label style={s.label}>Kwota ({val.currency})</label>
              <input style={s.input} type="number" value={val.foreignAmount} onChange={ev => onForeignAmountChange(ev.target.value)} />
            </div>
            <div>
              <label style={s.label}>Kwota (PLN) {fxLoading ? "⏳" : fxRate ? `@ ${fxRate.toFixed(4)}` : ""}</label>
              <input style={{ ...s.input, background: "#0d1424", color: "#10b981", fontWeight: 700 }} type="number" value={val.amount} onChange={ev => setVal(v => ({ ...v, amount: ev.target.value }))} />
            </div>
          </>
        ) : (
          <div style={{ gridColumn: "1/-1" }}>
            <label style={s.label}>Kwota (PLN)</label>
            <input style={s.input} type="number" value={val.amount} onChange={ev => setVal(v => ({ ...v, amount: ev.target.value }))} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={s.label}>Typ wydatku</label>
        <select style={s.select} value={val.sub} onChange={ev => {
          const sub = ev.target.value;
          const mapped = subLookup[sub];
          setVal(v => ({ ...v, sub, category: mapped?.category || v.category }));
        }}>
          {Object.entries(categories).map(([cat, { icon, sub }]) => (
            <optgroup key={cat} label={`${icon} ${cat}`}>
              {Object.keys(sub).map(sn => <option key={sn} value={sn}>{sn}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={s.label}>Częstotliwość</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FREQS.map(f => (
            <button key={f.id} onClick={() => setVal(v => ({ ...v, frequency: f.id, activeMonths: [] }))}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${val.frequency === f.id ? "#10b981" : "#334155"}`,
                background: val.frequency === f.id ? "#10b98122" : "transparent",
                color: val.frequency === f.id ? "#10b981" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={save} style={{ ...s.btn(), width: "auto", padding: "8px 18px", marginTop: 0 }}>✅ Zapisz</button>
        <button onClick={() => setEditing(false)} style={{ ...s.btn("#475569"), width: "auto", padding: "8px 14px", marginTop: 0 }}>Anuluj</button>
        <button onClick={removeRecurring} style={{ ...s.btn("#ef4444"), width: "auto", padding: "8px 14px", marginTop: 0, marginLeft: "auto" }}>🚫 Usuń cykliczność</button>
      </div>
    </div>
  );

  // ── VIEW MODE ──────────────────────────────────────────────
  return (
    <div style={{ ...s.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", marginBottom: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{e.desc || e.sub}</span>
          <span style={{ background: "#3b82f622", color: "#3b82f6", borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>🔄 {freqLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: "#1e293b", color: "#64748b", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>
            {categories[e.category]?.icon} {e.category} · {e.sub}
          </span>
          {e.frequency === "custom" && e.activeMonths?.length > 0 && (
            <span style={{ color: "#475569", fontSize: 10 }}>{e.activeMonths.map(i => _MONTHS[i].slice(0, 3)).join(", ")}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
        <div style={{ textAlign: "right" }}>
          {hasFx && e.foreignAmount && (
            <div style={{ color: "#64748b", fontSize: 11 }}>{e.foreignAmount} {e.currency}</div>
          )}
          <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>{fmt(e.amount)}</span>
        </div>
        <button onClick={() => setEditing(true)} style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>✏️</button>
      </div>
    </div>
  );
}