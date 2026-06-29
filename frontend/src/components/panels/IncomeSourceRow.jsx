// ============================================================
// File: src/components/panels/IncomeSourceRow.jsx
// Inline-editable income source row + add form.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { theme as s } from "../../styles/theme";

export function IncomeSourceRow({ src, i }) {
  const { setIncomeSources } = useAppContext();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(src);

  if (editing) return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input style={{ ...s.input, flex: 1 }} value={val} onChange={e => setVal(e.target.value)} autoFocus />
      <button onClick={() => { setIncomeSources(prev => prev.map((src2, j) => j === i ? val : src2)); setEditing(false); }}
        style={{ ...s.btn(), width: "auto", padding: "8px 14px", marginTop: 0, fontSize: 12 }}>✅</button>
      <button onClick={() => setEditing(false)}
        style={{ ...s.btn(c.textMuted), width: "auto", padding: "8px 10px", marginTop: 0, fontSize: 12 }}>✕</button>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${c.border}` }}>
      <span style={{ flex: 1, color: c.text, fontSize: 13 }}>{src}</span>
      <button onClick={() => setEditing(true)}
        style={{ background: c.border, border: `1px solid ${c.borderStrong}`, color: c.textTertiary, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>✏️ Edytuj</button>
      <button onClick={() => setIncomeSources(prev => prev.filter((_, j) => j !== i))}
        style={{ background: alpha(c.danger, "22"), border: `1px solid ${alpha(c.danger, "44")}`, color: c.danger, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>🗑️</button>
    </div>
  );
}

export function IncomeSourceAdd() {
  const { setIncomeSources } = useAppContext();
  const [val, setVal] = useState("");

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <input style={{ ...s.input, flex: 1 }} placeholder="Nowe źródło wpływu..." value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) { setIncomeSources(prev => [...prev, val.trim()]); setVal(""); } }} />
      <button onClick={() => { if (val.trim()) { setIncomeSources(prev => [...prev, val.trim()]); setVal(""); } }}
        style={{ ...s.btn(), width: "auto", padding: "10px 16px", marginTop: 0, fontSize: 13 }}>➕</button>
    </div>
  );
}
