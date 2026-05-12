// ============================================================
// File: src/components/panels/ExpensesPanel.jsx
// Add-expense form (manual + OCR). Defined outside App for focus stability.
// ============================================================

import { useRef, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { MONTHS, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";
import { Toggle } from "../ui";

function ExpensesPanel() {
  const { form, setForm, ocrMode, setOcrMode, ocrLines, setOcrLines, ocrLoading, fileRef, categories, subLookup, tags, addExpense, simulateOCR, addOcrLines, archivedSubs, fxRate, setFxRate } = useAppContext();
  const [fxLoading, setFxLoading] = useState(false);
  // Only show validation errors after user clicks "Dodaj wydatek" at least once
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Local style aliases – destructured from imported theme for brevity
  const s_input   = s.input;
  const s_select  = s.select;
  const s_label   = s.label;
  const s_card    = s.card;
  const s_btn     = s.btn;
  const s_row     = s.row;
  const s_col     = s.col;
  const s_amount  = s.amount;
  const s_ocrLine = { background: "#1e293b", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" };

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

  const visibleCategories = Object.fromEntries(
    Object.entries(categories).map(([cat, v]) => [cat, {
      ...v,
      sub: Object.fromEntries(Object.entries(v.sub).filter(([subName]) => !archivedSubs?.has(`${cat}::${subName}`)))
    }])
  );

  return (
    <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", marginBottom: 4, marginTop: 20 }}>Dodaj wydatek</div>

      {/* Mode toggle */}
      <div style={{ ...s_card, display: "flex", gap: 8, padding: 8 }}>
        <button onClick={() => setOcrMode(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: !ocrMode ? "#10b981" : "transparent", color: !ocrMode ? "#fff" : "#64748b", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>✏️ Ręcznie</button>
        <button onClick={() => { setOcrMode(true); setOcrLines([]); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: ocrMode ? "#10b981" : "transparent", color: ocrMode ? "#fff" : "#64748b", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>📷 Skan paragonu</button>
      </div>

      {ocrMode ? (
        <div style={s_card}>
          {ocrLines.length === 0 ? (
            <>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                <div style={{ color: "#64748b", marginBottom: 16, fontSize: 14 }}>Zrób zdjęcie paragonu lub wybierz z galerii</div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={simulateOCR} />
                <button onClick={() => { fileRef.current?.click(); simulateOCR(); }} style={s.btn()}>📷 Zrób zdjęcie</button>
                <button onClick={simulateOCR} style={{ ...s.btn("#3b82f6"), marginTop: 8 }}>🖼️ Wybierz z galerii</button>
              </div>
              {ocrLoading && (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
                  <div style={{ color: "#10b981", fontWeight: 700 }}>AI analizuje paragon...</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ color: "#10b981", fontWeight: 700, marginBottom: 12 }}>✅ Znalezione pozycje:</div>
              {ocrLines.map((line, i) => (
                <div key={i} style={s_ocrLine}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="checkbox" checked={line.selected} onChange={e => {
                      const next = [...ocrLines]; next[i].selected = e.target.checked; setOcrLines(next);
                    }} style={{ width: 18, height: 18, accentColor: "#10b981" }} />
                    <div>
                      <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{line.desc}</div>
                      <div style={{ color: "#64748b", fontSize: 11 }}>{line.category} › {line.sub}</div>
                    </div>
                  </div>
                  <div style={s.amount()}>{fmt(line.amount)}</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 4, borderTop: "1px solid #1e293b" }}>
                <span style={{ color: "#64748b" }}>Suma:</span>
                <span style={{ ...s.amount(), fontSize: 18 }}>{fmt(ocrLines.filter(l=>l.selected).reduce((s,l)=>s+l.amount,0))}</span>
              </div>
              {/* Save receipt toggle in OCR mode */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: form.saveReceipt ? "#10b981" : "#475569", fontSize: 13, fontWeight: 600, padding: "8px 0", borderTop: "1px solid #1e293b", marginTop: 4 }}
                onClick={() => setForm(f=>({...f, saveReceipt: !f.saveReceipt}))}>
                <div style={{ width: 36, height: 20, background: form.saveReceipt ? "#10b981" : "#1e293b", border: `2px solid ${form.saveReceipt ? "#10b981" : "#334155"}`, borderRadius: 99, position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: form.saveReceipt ? 16 : 2, width: 12, height: 12, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
                </div>
                📎 Zachowaj skan paragonu w chmurze
              </div>
              <button onClick={addOcrLines} style={s.btn()}>✅ Dodaj zaznaczone</button>
              <button onClick={() => setOcrLines([])} style={{ ...s.btn("#475569"), marginTop: 8 }}>🔄 Skanuj ponownie</button>
            </>
          )}
        </div>
      ) : (
        <div style={s_card}>
          <div style={s.row}>
            <div style={s.col}>
              <label style={s.label}>Data *</label>
              <input style={s.input} type="date" value={form.date} onChange={e => setForm(f=>({...f, date: e.target.value}))} />
            </div>
            <div style={s.col}>
              <label style={s.label}>Waluta</label>
              <select style={s.select} value={form.currency} onChange={e => {
                const currency = e.target.value;
                setForm(f => ({...f, currency, foreignAmount: "", amount: ""}));
                fetchRate(currency);
              }}>
                {["PLN","USD","EUR","GBP","CHF","NOK","SEK","CZK"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            {form.currency !== "PLN" ? (
              <div style={s.row}>
                <div style={s.col}>
                  <label style={s.label}>Kwota ({form.currency}) *</label>
                  <BudgetInput style={s.input} placeholder="0,00"
                    value={parseFloat(String(form.foreignAmount||"").replace(",","."))||0}
                    onChange={v => setForm(f => ({...f, foreignAmount: String(v), amount: fxRate ? (v*fxRate).toFixed(2) : f.amount}))} />
                </div>
                <div style={s.col}>
                  <label style={s.label}>PLN {fxLoading ? "⏳" : fxRate ? `@ ${fxRate.toFixed(4)}` : ""}</label>
                  <BudgetInput style={{ ...s.input, color: "#10b981", fontWeight: 700 }} placeholder="0,00"
                    value={parseFloat(String(form.amount||"").replace(",","."))||0}
                    onChange={v => setForm(f=>({...f, amount: v > 0 ? String(v) : ""}))} />
                </div>
              </div>
            ) : (
              <div>
                {/* Label changes to "Całkowita wartość paragonu" when voucher is active */}
                <label style={{ ...s.label, color: form.useVoucher ? "#f59e0b" : undefined }}>
                  {form.useVoucher ? "🎟️ Całkowita wartość paragonu (PLN) *" : "Kwota (PLN) *"}
                </label>
                <BudgetInput style={{ ...s.input, borderColor: form.useVoucher ? "#f59e0b44" : "#334155" }}
                  placeholder="0,00"
                  value={parseFloat(String(form.amount||"").replace(",","."))||0}
                  onChange={v => {
                    if (form.useVoucher) {
                      // totalAmount = this field; recalculate cash = total - voucher
                      const vAmt = parseFloat(String(form.voucherAmount||"").replace(",",".")) || 0;
                      setForm(f => ({ ...f, totalAmount: String(v), amount: v > 0 ? String(v) : "" }));
                    } else {
                      setForm(f => ({...f, amount: v > 0 ? String(v) : ""}));
                    }
                  }} />
                {form.useVoucher && form.amount && (
                  <div style={{ color: "#64748b", fontSize: 10, marginTop: 3 }}>
                    Wartość paragonu – od niej odejmujemy bon
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={s.label}>Typ wydatku *</label>
            <select style={{ ...s.select, borderColor: form.sub ? "#334155" : "#ef444466" }}
              value={form.sub} onChange={e => {
                const sub = e.target.value;
                const mapped = subLookup[sub];
                setForm(f=>({...f, sub, category: mapped?.category || "", priority: mapped?.priority || 2}));
            }}>
              <option value="">Wybierz typ wydatku...</option>
              {Object.entries(visibleCategories).map(([cat, { icon, sub }]) => (
                <optgroup key={cat} label={`${icon} ${cat}`}>
                  {Object.keys(sub).map(subName => <option key={subName} value={subName}>{subName}</option>)}
                </optgroup>
              ))}
            </select>
            {form.category && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{categories[form.category]?.icon} {form.category}</span>
                  <span style={{ fontSize: 11, color: "#475569" }}>Priorytet:</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1,2,3,4].map(p => (
                    <button key={p} onClick={() => setForm(f=>({...f, priority: p}))}
                      style={{ flex: 1, padding: "6px 4px", borderRadius: 8,
                        border: `1px solid ${form.priority === p ? PRIORITY_LABELS[p].color : "#334155"}`,
                        background: form.priority === p ? PRIORITY_LABELS[p].color + "33" : "transparent",
                        color: form.priority === p ? PRIORITY_LABELS[p].color : "#475569",
                        fontSize: 11, fontWeight: form.priority === p ? 700 : 500, cursor: "pointer" }}>
                      P{p}<br/><span style={{ fontSize: 9 }}>{PRIORITY_LABELS[p].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={s.label}>Opis (opcjonalnie)</label>
            <input style={s.input} type="text" placeholder="np. Biedronka, zakupy tygodniowe..."
              value={form.desc} onChange={e => setForm(f=>({...f, desc: e.target.value}))} />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={s.label}>Tagi (opcjonalnie)</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {tags.map(tag => {
                const active = form.tags.includes(tag.id);
                return (
                  <button key={tag.id} onClick={() => setForm(f => ({
                    ...f, tags: active ? f.tags.filter(t=>t!==tag.id) : [...f.tags, tag.id]
                  }))} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${active ? "#10b981" : "#334155"}`,
                    background: active ? "#10b98122" : "transparent", color: active ? "#10b981" : "#64748b",
                    fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer" }}>
                    {tag.icon} {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Voucher / gift card toggle */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: form.useVoucher ? "#f59e0b" : "#475569", fontSize: 13, fontWeight: 600 }}
                onClick={() => setForm(f => ({ ...f, useVoucher: !f.useVoucher, voucherAmount: "", totalAmount: f.amount }))}>
                <div style={{ width: 36, height: 20, background: form.useVoucher ? "#f59e0b" : "#1e293b", border: `2px solid ${form.useVoucher ? "#f59e0b" : "#334155"}`, borderRadius: 99, position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: form.useVoucher ? 16 : 2, width: 12, height: 12, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
                </div>
                🎟️ Częściowo opłacono bonem / voucherem
              </div>
              {form.useVoucher && (
                <div style={{ marginTop: 10, background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...s.label, color: "#f59e0b" }}>Wartość bonu / vouchera (PLN)</label>
                    <BudgetInput style={s.input} placeholder="0,00"
                      value={parseFloat(String(form.voucherAmount||"").replace(",","."))||0}
                      onChange={v => {
                        // Cap voucher at total (which is stored in form.amount when voucher active)
                        const tAmt = parseFloat(String(form.amount||"").replace(",",".")) || 0;
                        const capped = Math.min(v, tAmt);
                        setForm(f => ({ ...f, voucherAmount: String(capped), totalAmount: f.amount }));
                      }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#64748b", fontSize: 12 }}>💳 Realna gotówka z portfela:</span>
                    <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>
                      {fmt(Math.max(
                        (parseFloat(String(form.amount||"").replace(",",".")) || 0) -
                        (parseFloat(String(form.voucherAmount||"").replace(",",".")) || 0),
                        0
                      ))}
                    </span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: 10, marginTop: 4 }}>
                    Do obliczeń budżetowych używana jest tylko realna gotówka.
                  </div>
                </div>
              )}
            </div>
          </div>

          {submitAttempted && (!form.sub || !form.amount) && (
            <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8, padding: "8px 12px", marginTop: 10, fontSize: 12, color: "#ef4444" }}>
              {!form.sub && <div>⚠️ Wybierz typ wydatku</div>}
              {!form.amount && <div>⚠️ Podaj kwotę</div>}
            </div>
          )}
          <button onClick={() => {
              setSubmitAttempted(true);
              if (form.sub && form.amount) { addExpense(); setSubmitAttempted(false); }
            }}
            style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }}>
            ✅ Dodaj wydatek
          </button>
        </div>
      )}
    </div>
  );
}

export default ExpensesPanel;