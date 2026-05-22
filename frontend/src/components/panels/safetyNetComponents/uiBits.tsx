// ============================================================
// File: src/components/panels/safetyNetComponents/uiBits.tsx
// Tiny reusable primitives used across the Safety Net cards.
// Kept co-located — too domain-specific to live in /ui.
// ============================================================

import React from "react";

// ── StatTile ──────────────────────────────────────────────────
// A compact label / value tile used in dense rows of metrics.

interface StatTileProps {
  label:    string;
  value:    React.ReactNode;
  sub?:     React.ReactNode;
  color?:   string;
  align?:   "left" | "right" | "center";
  flex?:    number;
}

export function StatTile({
  label, value, sub, color = "#e2e8f0", align = "left", flex = 1,
}: StatTileProps) {
  return (
    <div style={{
      flex,
      background:   "#0d1424",
      border:       "1px solid #1e293b",
      borderRadius: 10,
      padding:      "10px 12px",
      minWidth:     0,
    }}>
      <div style={{
        fontSize: 10, color: "#475569", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.5px",
        marginBottom: 4, textAlign: align,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 800, color, textAlign: align,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </div>
      {sub !== undefined && sub !== null && sub !== "" && (
        <div style={{
          fontSize: 10, color: "#475569", marginTop: 3, textAlign: align,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Pill (radio-style, used for window / horizon / level picks) ──

interface PillGroupProps<T extends string | number> {
  value:   T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; color?: string }>;
  size?:   "sm" | "md";
}

export function PillGroup<T extends string | number>({
  value, onChange, options, size = "md",
}: PillGroupProps<T>) {
  const pad   = size === "sm" ? "5px 10px" : "6px 14px";
  const font  = size === "sm" ? 11 : 12;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => {
        const isActive = opt.value === value;
        const activeColor = opt.color ?? "#10b981";
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding:    pad,
              borderRadius: 20,
              border:     "none",
              cursor:     "pointer",
              fontSize:   font,
              fontWeight: 700,
              background: isActive ? activeColor : "#1e293b",
              color:      isActive ? "#fff" : "#64748b",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── NumberStepper — slider + numeric input combo ─────────────

interface NumberStepperProps {
  value:    number;
  onChange: (v: number) => void;
  min:      number;
  max:      number;
  step:     number;
  unit?:    string;
  label:    string;
  hint?:    string;
  color?:   string;
}

export function NumberStepper({
  value, onChange, min, max, step, unit = "zł",
  label, hint, color = "#10b981",
}: NumberStepperProps) {
  // Clamp helper
  function set(v: number) {
    if (Number.isNaN(v)) return;
    const clamped = Math.max(min, Math.min(max, v));
    onChange(clamped);
  }

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 6,
      }}>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, color, fontWeight: 800 }}>
          {value.toLocaleString("pl-PL")} {unit}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => set(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: color,
          cursor: "pointer",
        }}
      />

      {hint && (
        <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ── Toggle row ───────────────────────────────────────────────

interface ToggleRowProps {
  checked:  boolean;
  onChange: (v: boolean) => void;
  label:    React.ReactNode;
  right?:   React.ReactNode;
  disabled?: boolean;
}

export function ToggleRow({
  checked, onChange, label, right, disabled = false,
}: ToggleRowProps) {
  const accent = checked ? "#10b981" : "#475569";

  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px",
      background: "#0d1424",
      border: `1px solid ${checked ? "#10b98144" : "#1e293b"}`,
      borderRadius: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "border-color 0.15s",
    }}>
      {/* Native checkbox, restyled via accent-color */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{
          width: 16, height: 16, accentColor: accent,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {label}
      </div>
      {right}
    </label>
  );
}
