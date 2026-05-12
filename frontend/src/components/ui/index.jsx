// ============================================================
// File: src/components/ui/index.jsx
// Small reusable visual components:
//   PieChart, Gauge, BarChart, Badge, Tag, Toggle, CollapsibleSection
// ============================================================

import { useState } from "react";
import { fmt } from "../../utils/helpers";
import { PIE_COLORS } from "../../data/constants";

// ── PieChart ─────────────────────────────────────────────────
// Solid pie (no donut hole). Legend displayed beside the chart.
// Supports drill-down via onSliceClick prop.
export function PieChart({ data, total, onSliceClick, labelResolver }) {
  const [hovered, setHovered] = useState(null);
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const cx = 80, cy = 80, r = 76;

  const slices = (() => {
    if (entries.length === 1) {
      // Single slice = full circle
      const [cat, val] = entries[0];
      const dFull = `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
      return [{ cat, val, d: dFull, color: PIE_COLORS[0], pct: "100.0" }];
    }
    let cumAngle = -Math.PI / 2;
    return entries.map(([cat, val], i) => {
      const angle = (val / total) * 2 * Math.PI;
      const start = cumAngle;
      cumAngle += angle;
      const end = cumAngle;
      const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end);
      const large = angle > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      return { cat, val, d, color: PIE_COLORS[i % PIE_COLORS.length], pct: ((val / total) * 100).toFixed(1) };
    });
  })();

  const active      = hovered !== null ? slices[hovered] : null;
  const resolve = (cat) => labelResolver ? labelResolver(cat) : cat;


  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <svg width={160} height={160} style={{ flexShrink: 0 }}>
        {slices.map((sl, i) => (
          <path key={i} d={sl.d} fill={sl.color}
            opacity={hovered === null || hovered === i ? 1 : 0.3}
            stroke="#0d1424" strokeWidth={1.5}
            style={{ cursor: onSliceClick ? "pointer" : "default", transition: "opacity 0.15s" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSliceClick && onSliceClick(sl.cat)}
          />
        ))}
      </svg>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center", minWidth: 0 }}>
        {slices.map((sl, i) => {
          const isActive = hovered === i;
          return (
            <div key={i}
              style={{ display: "flex", alignItems: "center", gap: 6,
                cursor: onSliceClick ? "pointer" : "default",
                opacity: hovered === null || isActive ? 1 : 0.35,
                transition: "opacity 0.15s", borderRadius: 6, padding: "3px 5px",
                background: isActive ? sl.color + "18" : "transparent" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSliceClick && onSliceClick(sl.cat)}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: sl.color, flexShrink: 0 }} />
              <span style={{ color: isActive ? "#e2e8f0" : "#94a3b8", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {resolve(sl.cat)}
              </span>
              <span style={{ color: isActive ? sl.color : "#64748b", fontWeight: isActive ? 700 : 500, fontSize: 11, whiteSpace: "nowrap" }}>
                {isActive ? `${sl.pct}% · ${fmt(sl.val)}` : `${sl.pct}%`}
              </span>
            </div>
          );
        })}
        {!active && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#475569", fontSize: 11 }}>Razem</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: 11 }}>{fmt(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gauge (horizontal progress bar) ─────────────────────────
export function Gauge({ value, max, label, color }) {
  const pct   = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const over  = value > max && max > 0;
  const barColor = over ? "#ef4444" : (color || "#10b981");
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>{label}</span>
        <span style={{ color: over ? "#ef4444" : "#e2e8f0", fontSize: 12, fontWeight: 700 }}>
          {fmt(value)} / {fmt(max)}
        </span>
      </div>
      <div style={{ height: 6, background: "#1e293b", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// ── BarChart (mini vertical bar chart) ──────────────────────
export function BarChart({ data, color = "#10b981" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: "100%", background: "#1e293b", borderRadius: 3, height: 46, display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: `${(d.value / max) * 46}px`, background: color, borderRadius: 3, minHeight: d.value > 0 ? 2 : 0 }} />
          </div>
          <div style={{ fontSize: 8, color: "#475569" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Badge (colored pill) ─────────────────────────────────────
export function Badge({ children, color = "#10b981" }) {
  return (
    <span style={{ background: color + "22", color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  );
}

// ── Tag (small expense tag chip) ─────────────────────────────
export function TagChip({ children }) {
  return (
    <span style={{ background: "#a855f722", color: "#a855f7", borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>
      {children}
    </span>
  );
}

// ── Toggle switch ────────────────────────────────────────────
export function Toggle({ value, onChange, label, color = "#10b981" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: value ? color : "#475569", fontSize: 13, fontWeight: 600 }}
      onClick={() => onChange(!value)}>
      <div style={{ width: 36, height: 20, background: value ? color : "#1e293b", border: `2px solid ${value ? color : "#334155"}`, borderRadius: 99, position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: value ? 16 : 2, width: 12, height: 12, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
      </div>
      {label}
    </div>
  );
}

// ── CollapsibleSection ───────────────────────────────────────
export function CollapsibleSection({ title, children, defaultOpen = true, style: extraStyle = {} }) {
  const [open, setOpen] = useState(defaultOpen);
  const cardStyle = { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16, padding: 16, marginBottom: 12 };
  return (
    <div style={{ ...cardStyle, marginTop: 4, ...extraStyle }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: open ? 14 : 0 }}
        onClick={() => setOpen(v => !v)}>
        <span style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</span>
        <span style={{ color: "#475569", fontSize: 16, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▾</span>
      </div>
      {open && children}
    </div>
  );
}
