// ============================================================
// File: src/components/panels/safetyNetComponents/uiBits.tsx
// Tiny reusable primitives used across the Safety Net cards.
// Kept co-located — too domain-specific to live in /ui.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
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
  label, value, sub, color = c.text, align = "left", flex = 1,
}: StatTileProps) {
  return (
    <div style={{
      flex,
      background:   c.surface,
      border:       `1px solid ${c.border}`,
      borderRadius: 10,
      padding:      "10px 12px",
      minWidth:     0,
    }}>
      <div style={{
        fontSize: 10, color: c.textMuted, fontWeight: 700,
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
          fontSize: 10, color: c.textMuted, marginTop: 3, textAlign: align,
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
        const activeColor = opt.color ?? c.success;
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
              background: isActive ? activeColor : c.border,
              color:      isActive ? c.white : c.textSecondary,
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
  label, hint, color = c.success,
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
        <div style={{ fontSize: 12, color: c.textTertiary, fontWeight: 600 }}>
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
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>
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
  const accent = checked ? c.success : c.textMuted;

  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px",
      background: c.surface,
      border: `1px solid ${checked ? alpha(c.success, "44") : c.border}`,
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
