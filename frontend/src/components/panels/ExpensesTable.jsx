// ============================================================
// File: src/components/panels/ExpensesTable.jsx
// Collapsible, sortable, editable expenses table with refund support.
// ============================================================

import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";
import { MONTHS, PRIORITY_LABELS } from "../../data/constants";
import { BudgetInput } from "../ui/BudgetInput";

export function ExpensesTable() {
  const { monthExpenses, setExpenses, categories, tags, MONTHS: _MONTHS, month, year, fmt: _fmt } = useAppContext();
  // Use imported MONTHS and fmt (context versions are aliases)
function ExpensesTable() {
  const [catFilter, setCatFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [collapsed, setCollapsed] = useState(false);
  // Refund mode state
  const [refundId, setRefundId] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const displayed = monthExpenses
    .filter(e => catFilter === "all" || e.category === catFilter)
    .sort((a, b) => {
      let av, bv;
      if (sortCol === "date") { av = a.date; bv = b.date; }
      else if (sortCol === "amount") { av = a.amount; bv = b.amount; }
      else if (sortCol === "category") { av = a.category; bv = b.category; }
      else { av = a.desc||""; bv = b.desc||""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  function startEdit(e) {
    setEditingId(e.id);
    setEditForm({ ...e });
    setRefundId(null);
  }

  function saveEdit() {
    setExpenses(prev => prev.map(e => e.id === editingId ? {
      ...editForm,
      amount: parseFloat(editForm.amount),
      // Recalculate voucher cash amount if editing voucher fields
      ...(editForm.useVoucher ? {
        amount: Math.max((parseFloat(editForm.totalAmount)||0) - (parseFloat(editForm.voucherAmount)||0), 0)
      } : {})
    } : e));
    setEditingId(null);
  }

  function deleteExpense(id) {
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  // Apply refund: reduce amount, append note to desc
  function applyRefund(e) {
    const rAmt = parseFloat(String(refundAmount).replace(",", "."));
    if (!rAmt || rAmt <= 0 || rAmt > e.amount) return;
    const noteSuffix = refundNote.trim()
      ? ` [Zwrócono: ${fmt(rAmt)} – ${refundNote.trim()}]`
      : ` [Zwrócono: ${fmt(rAmt)}]`;
    setExpenses(prev => prev.map(x => x.id === e.id
      ? { ...x, amount: parseFloat((x.amount - rAmt).toFixed(2)), desc: (x.desc || "") + noteSuffix }
      : x
    ));
    setRefundId(null);
    setRefundAmount("");
    setRefundNote("");
  }

  return (
    <div style={{ ...s.card, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed ? 0 : 14, cursor: "pointer" }}
        onClick={() => setCollapsed(v => !v)}>
        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          📋 Wydatki – {MONTHS[month]} {year}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!collapsed && (
            <>
              <select style={{ ...s.select, width: "auto", fontSize: 12, padding: "5px 10px" }}
                value={catFilter} onChange={e => { e.stopPropagation(); setCatFilter(e.target.value); }}
                onClick={e => e.stopPropagation()}>
                <option value="all">Wszystkie kategorie</option>
                {Object.keys(categories).map(c => (
                  <option key={c} value={c}>{categories[c].icon} {c}</option>
                ))}
              </select>
              <span style={{ color: "#475569", fontSize: 12, whiteSpace: "nowrap" }}>{displayed.length} · {fmt(displayed.reduce((s,e)=>s+e.amount,0))}</span>
            </>
          )}
          <span style={{ color: "#475569", fontSize: 16, transform: collapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▾</span>
        </div>
      </div>

      {!collapsed && (<>

      {displayed.length === 0 && (
        <div style={{ color: "#475569", textAlign: "center", padding: 24, fontSize: 13 }}>Brak wydatków w tym miesiącu</div>
      )}

      {/* Header */}
      {displayed.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 130px 100px 120px 88px", gap: 8, padding: "6px 8px", borderBottom: "1px solid #334155", marginBottom: 4 }}>
          {[["date","Data"],["desc","Opis / Typ"],["category","Kategoria"],["amount","Kwota"],["","Tagi"],["",""]].map(([col, h], i) => (
            <span key={i} onClick={() => col && toggleSort(col)}
              style={{ color: sortCol === col ? "#10b981" : "#475569", fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.5px", cursor: col ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 3 }}>
              {h}{col && (sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕")}
            </span>
          ))}
        </div>
      )}

      {displayed.map(e => editingId === e.id ? (
        // ── EDIT ROW ──
        <div key={e.id} style={{ background: "#1e293b", borderRadius: 10, padding: "10px 8px", marginBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ ...s.label, marginBottom: 4 }}>Data</label>
              <input style={s.input} type="date" value={editForm.date} onChange={e => setEditForm(f => ({...f, date: e.target.value}))} />
            </div>
            <div>
              <label style={{ ...s.label, marginBottom: 4 }}>
                {editForm.useVoucher ? "Wartość paragonu" : "Kwota (PLN)"}
              </label>
              {editForm.useVoucher ? (
                <BudgetInput style={s.input}
                  value={parseFloat(editForm.totalAmount)||0}
                  onChange={v => {
                    const vAmt = parseFloat(editForm.voucherAmount)||0;
                    setEditForm(f => ({...f, totalAmount: String(v), amount: String(Math.max(v-vAmt,0))}));
                  }} />
              ) : (
                <BudgetInput style={s.input}
                  value={parseFloat(editForm.amount)||0}
                  onChange={v => setEditForm(f => ({...f, amount: String(v)}))} />
              )}
            </div>
            <div>
              <label style={{ ...s.label, marginBottom: 4 }}>Opis</label>
              <input style={s.input} value={editForm.desc || ""} onChange={e => setEditForm(f => ({...f, desc: e.target.value}))} />
            </div>
          </div>
          {/* Voucher toggle in edit */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: editForm.useVoucher ? "#f59e0b" : "#475569", fontSize: 12, fontWeight: 600, marginBottom: editForm.useVoucher ? 8 : 0 }}
              onClick={() => setEditForm(f => ({...f, useVoucher: !f.useVoucher, totalAmount: f.totalAmount || String(f.amount), voucherAmount: f.voucherAmount || ""}))}>
              <div style={{ width: 30, height: 16, background: editForm.useVoucher ? "#f59e0b" : "#1e293b", border: `2px solid ${editForm.useVoucher ? "#f59e0b" : "#334155"}`, borderRadius: 99, position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 1, left: editForm.useVoucher ? 12 : 1, width: 10, height: 10, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
              </div>
              🎟️ Częściowo opłacono bonem
            </div>
            {editForm.useVoucher && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...s.label, marginBottom: 4, color: "#f59e0b" }}>Wartość bonu (PLN)</label>
                  <BudgetInput style={s.input}
                    value={parseFloat(editForm.voucherAmount)||0}
                    onChange={v => {
                      const tAmt = parseFloat(editForm.totalAmount)||0;
                      const capped = Math.min(v, tAmt);
                      setEditForm(f => ({...f, voucherAmount: String(capped), amount: String(Math.max(tAmt-capped,0))}));
                    }} />
                </div>
                <div style={{ flex: 1, textAlign: "center", paddingTop: 20 }}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>Realna gotówka: </span>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>
                    {fmt(Math.max((parseFloat(editForm.totalAmount)||0)-(parseFloat(editForm.voucherAmount)||0),0))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ ...s.label, marginBottom: 4 }}>Typ wydatku</label>
              <select style={s.select} value={editForm.sub} onChange={ev => {
                const sub = ev.target.value;
                const mapped = subLookup[sub];
                setEditForm(f => ({...f, sub, category: mapped?.category || f.category, priority: mapped?.priority }));
              }}>
                {Object.entries(categories).map(([cat, { icon, sub }]) => (
                  <optgroup key={cat} label={`${icon} ${cat}`}>
                    {Object.keys(sub).map(subName => (
                      <option key={subName} value={subName}>{subName}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...s.label, marginBottom: 4 }}>Tagi</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
                {tags.map(tag => {
                  const active = (editForm.tags||[]).includes(tag.id);
                  return (
                    <button key={tag.id} onClick={() => setEditForm(f => ({
                      ...f, tags: active ? (f.tags||[]).filter(t=>t!==tag.id) : [...(f.tags||[]), tag.id]
                    }))} style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${active ? "#10b981" : "#334155"}`,
                      background: active ? "#10b98122" : "transparent", color: active ? "#10b981" : "#64748b",
                      fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      {tag.icon} {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEdit} style={{ ...s.btn(), width: "auto", padding: "8px 20px", marginTop: 0, fontSize: 13 }}>✅ Zapisz</button>
            <button onClick={() => setEditingId(null)} style={{ ...s.btn("#475569"), width: "auto", padding: "8px 16px", marginTop: 0, fontSize: 13 }}>Anuluj</button>
          </div>
        </div>
      ) : refundId === e.id ? (
        // ── REFUND ROW ──
        <div key={e.id} style={{ background: "#f59e0b11", border: "1px solid #f59e0b44", borderRadius: 10, padding: "12px 14px", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, color: "#f59e0b", fontSize: 13, marginBottom: 10 }}>
            ↩️ Rejestruj zwrot – {e.desc || e.sub} ({fmt(e.amount)})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ ...s.label, marginBottom: 4, color: "#f59e0b" }}>Kwota zwrotu (PLN)</label>
              <input
                style={{ ...s.input, borderColor: parseFloat(refundAmount) > e.amount ? "#ef4444" : "#f59e0b44" }}
                type="number"
                placeholder="0,00"
                min="0"
                max={e.amount}
                step="0.01"
                value={refundAmount}
                onChange={ev => {
                  // Allow typing freely but cap at e.amount on blur / during validation
                  setRefundAmount(ev.target.value);
                }}
                onBlur={ev => {
                  const v = parseFloat(ev.target.value);
                  if (!isNaN(v) && v > e.amount) setRefundAmount(String(e.amount));
                  if (!isNaN(v) && v < 0) setRefundAmount("0");
                }}
              />
              <div style={{ color: parseFloat(refundAmount) > e.amount ? "#ef4444" : "#64748b", fontSize: 10, marginTop: 3 }}>
                {parseFloat(refundAmount) > e.amount
                  ? `⚠️ Przekracza max: ${fmt(e.amount)}`
                  : `Max: ${fmt(e.amount)} (realna gotówka)`}
              </div>
            </div>
            <div>
              <label style={{ ...s.label, marginBottom: 4 }}>Notatka do zwrotu (opcjonalnie)</label>
              <input style={s.input} placeholder="np. Oddano za małe buty"
                value={refundNote} onChange={ev => setRefundNote(ev.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(() => {
              const rAmt = parseFloat(String(refundAmount).replace(",", "."));
              const valid = !!refundAmount && !isNaN(rAmt) && rAmt > 0 && rAmt <= e.amount;
              return (
                <button onClick={() => applyRefund(e)} disabled={!valid}
                  style={{ ...s.btn(valid ? "#10b981" : "#334155"), width: "auto", padding: "8px 18px", marginTop: 0, fontSize: 13, cursor: valid ? "pointer" : "not-allowed" }}>
                  ✅ Zatwierdź zwrot
                </button>
              );
            })()}
            <button onClick={() => { setRefundId(null); setRefundAmount(""); setRefundNote(""); }}
              style={{ ...s.btn("#475569"), width: "auto", padding: "8px 14px", marginTop: 0, fontSize: 13 }}>
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        // ── NORMAL ROW ──
        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 130px 100px 120px 88px", gap: 8, alignItems: "center",
          padding: "9px 8px", borderBottom: "1px solid #1e293b",
          transition: "background 0.15s" }}
          onMouseEnter={ev => ev.currentTarget.style.background = "#1e293b44"}
          onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
          <span style={{ color: "#475569", fontSize: 12 }}>{e.date.slice(5)}</span>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>{e.desc || e.sub}</div>
            <div style={{ color: "#475569", fontSize: 11 }}>{e.sub}</div>
          </div>
          <span style={{ fontSize: 11 }}>
            <span style={{ background: "#1e293b", color: "#64748b", borderRadius: 5, padding: "2px 7px" }}>
              {categories[e.category]?.icon} {e.category}
            </span>
          </span>
          {/* Amount: show cash amount prominently; show voucher info below if applicable */}
          <div>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: 14 }}>{fmt(e.amount)}</span>
            {e.voucherAmount > 0 && (
              <div style={{ color: "#f59e0b", fontSize: 9, marginTop: 1 }}>
                🎟️ Wartość: {fmt(e.totalAmount)} (Bon: {fmt(e.voucherAmount)})
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {(e.tags||[]).map(tid => {
              const tag = tags.find(t => t.id === tid);
              return tag ? <span key={tid} style={{ fontSize: 10, background: "#a855f722", color: "#a855f7", borderRadius: 4, padding: "1px 5px" }}>{tag.icon}</span> : null;
            })}
            {e.recurring && <span style={{ fontSize: 10, background: "#3b82f622", color: "#3b82f6", borderRadius: 4, padding: "1px 5px" }}>🔄</span>}
          </div>
          <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
            <button onClick={() => { setRefundId(e.id); setEditingId(null); setRefundAmount(""); setRefundNote(""); }}
              style={{ background: "#f59e0b22", border: "1px solid #f59e0b44", color: "#f59e0b", borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 11 }}
              title="Zarejestruj zwrot">↩️</button>
            <button onClick={() => startEdit(e)}
              style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 12 }}>✏️</button>
            <button onClick={() => deleteExpense(e.id)}
              style={{ background: "#ef444422", border: "1px solid #ef444444", color: "#ef4444", borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
          </div>
        </div>
      ))}
      </>)}
    </div>
  );
}
}
