// ============================================================
// File: src/components/panels/PanelRecurring.jsx
// Recurring expenses management panel.
// UI: Polish | Comments: English
// ============================================================

import React, { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { MONTHS } from "../../data/constants";
import RecurringRow from "./RecurringRow"; // Standard import

export default function PanelRecurring() {
  const { 
    expenses, setExpenses, categories, subLookup, 
    tags, month, year 
  } = useAppContext();

  const recurring = expenses.filter(e => e.recurring);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ 
    desc: "", amount: "", sub: "", category: "", tags: [], 
    frequency: "monthly", activeMonths: [], currency: "PLN", 
    foreignAmount: "", scheduledDay: 1, scheduledMonth: 1 
  });

  const [fxRate, setFxRate] = useState(null);
  const [fxLoading, setFxLoading] = useState(false);

  const FREQS = [
    { id: "monthly", label: "Co miesiąc" },
    { id: "quarterly", label: "Co kwartał" },
    { id: "yearly", label: "Co rok" },
    { id: "custom", label: "Wybrane miesiące" },
  ];

  async function fetchRate(currency) {
    if (currency === "PLN") { setFxRate(null); return; }
    setFxLoading(true);
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=PLN`);
      const data = await res.json();
      setFxRate(data.rates?.PLN || null);
    } catch { setFxRate(null); }
    setFxLoading(false);
  }

  function onCurrencyChange(currency) {
    setForm(f => ({ ...f, currency, foreignAmount: "", amount: "" }));
    fetchRate(currency);
  }

  function onForeignAmountChange(fa) {
    const numericFa = parseFloat(fa || 0);
    setForm(f => ({ 
      ...f, 
      foreignAmount: fa, 
      amount: fxRate ? (numericFa * fxRate).toFixed(2) : f.amount 
    }));
  }

  function addRecurring() {
    if (!form.sub || !form.amount) return;
    const mapped = subLookup[form.sub];
    
    setExpenses(prev => [...prev, {
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      desc: form.desc,
      amount: parseFloat(form.amount),
      sub: form.sub,
      category: mapped?.category || form.category,
      priority: mapped?.priority || 2,
      tags: form.tags,
      recurring: true,
      frequency: form.frequency,
      activeMonths: form.activeMonths,
      currency: form.currency,
      foreignAmount: form.foreignAmount,
      fxRate,
      scheduledDay: form.scheduledDay,
      scheduledMonth: form.scheduledMonth,
    }]);

    // Reset form
    setForm({ 
      desc: "", amount: "", sub: "", category: "", tags: [], 
      frequency: "monthly", activeMonths: [], currency: "PLN", 
      foreignAmount: "", scheduledDay: 1, scheduledMonth: 1 
    });
    setFxRate(null);
    setShowForm(false);
  }

  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={s.sectionTitle}>Wydatki cykliczne</div>
          <div style={s.sectionSub}>Zarządzaj płatnościami powtarzalnymi</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ ...s.btn(), width: "auto", padding: "9px 18px", marginTop: 0 }}>
          {showForm ? "✕ Anuluj" : "➕ Dodaj cykliczny"}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ ...s.card, border: "1px solid #10b98144", marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={s.label}>Opis</label>
              <input style={s.input} placeholder="np. Czynsz" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Waluta</label>
              <select style={s.select} value={form.currency} onChange={e => onCurrencyChange(e.target.value)}>
                {["PLN", "USD", "EUR", "GBP"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Kwota (PLN)</label>
              <input style={s.input} type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          
          <div style={{ marginBottom: 15 }}>
            <label style={s.label}>Typ wydatku</label>
            <select style={s.select} value={form.sub} onChange={e => {
              const sub = e.target.value;
              const mapped = subLookup[sub];
              setForm(f => ({ ...f, sub, category: mapped?.category || f.category }));
            }}>
              <option value="">Wybierz...</option>
              {Object.entries(categories).map(([cat, { icon, sub }]) => (
                <optgroup key={cat} label={`${icon} ${cat}`}>
                  {Object.keys(sub).map(sn => <option key={sn} value={sn}>{sn}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <button onClick={addRecurring} style={s.btn()}>✅ Dodaj wydatek cykliczny</button>
        </div>
      )}

      {/* List */}
      <div style={{ marginTop: 10 }}>
        {recurring.length === 0 && !showForm ? (
          <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>Brak zaplanowanych wydatków.</div>
        ) : (
          recurring.map(e => <RecurringRow key={e.id} e={e} showMonth />)
        )}
      </div>
    </div>
  );
}