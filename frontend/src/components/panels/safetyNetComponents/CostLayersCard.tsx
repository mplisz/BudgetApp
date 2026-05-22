// ============================================================
// File: src/components/panels/safetyNetComponents/CostLayersCard.tsx
// Visualises the four cumulative cost layers (Survival → No Change).
// Each level shows: cumulative monthly cost, contribution from this
// priority bucket, and a stacked bar so the user sees how each layer
// adds on top of the previous one.
// ============================================================

import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { EmptyState } from "../../ui/summaryUi";
import { LEVEL_META } from "./types";
import type { CostLayer, PriorityLevel } from "./types";

interface CostLayersCardProps {
  layers:           CostLayer[];
  /** Highlight the user's chosen level (drives Saving Assistant). */
  highlightLevel?:  PriorityLevel;
}

export function CostLayersCard({ layers, highlightLevel }: CostLayersCardProps) {
  // The maximum cumulative cost (= No Change Mode) defines the bar scale
  const maxCost = useMemo(() => {
    return layers.length ? layers[layers.length - 1].monthlyCost : 0;
  }, [layers]);

  if (maxCost === 0) {
    return (
      <EmptyState
        icon="🧮"
        message="Brak wydatków w wybranym okresie — wybierz dłuższe okno historyczne lub dodaj wydatki."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Stacked bar — shows how P1..P4 stack into No Change */}
      <StackedLayersBar layers={layers} total={maxCost} highlight={highlightLevel} />

      {/* Per-level rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {layers.map(layer => (
          <LevelRow
            key={layer.level}
            layer={layer}
            maxCost={maxCost}
            isHighlighted={layer.level === highlightLevel}
          />
        ))}
      </div>

      {/* Tiny help footer */}
      <div style={{
        fontSize: 11, color: "#475569", lineHeight: 1.6,
        padding: "8px 10px", background: "#0d1424",
        border: "1px solid #1e293b", borderRadius: 8,
      }}>
        💡 Każdy wyższy poziom zawiera koszty poprzednich (P1 ⊂ P1+P2 ⊂ …). Średnia liczona na bazie wybranego okna historycznego.
      </div>
    </div>
  );
}

// ── Stacked layers bar ──────────────────────────────────────

interface StackedLayersBarProps {
  layers:    CostLayer[];
  total:     number;
  highlight?: PriorityLevel;
}

function StackedLayersBar({ layers, total, highlight }: StackedLayersBarProps) {
  return (
    <div>
      <div style={{
        display: "flex", height: 14,
        borderRadius: 99, overflow: "hidden",
        background: "#0d1424", border: "1px solid #1e293b",
      }}>
        {layers.map(layer => {
          const widthPct = total > 0 ? (layer.bucketCost / total) * 100 : 0;
          const isHl = layer.level === highlight;
          if (widthPct <= 0) return null;
          return (
            <div
              key={layer.level}
              title={`${LEVEL_META[layer.level].label} (P${layer.level}): ${fmt(layer.bucketCost)} / mies.`}
              style={{
                width:     `${widthPct}%`,
                background: layer.color,
                opacity:   isHl || !highlight ? 1 : 0.45,
                transition: "opacity 0.2s",
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        {layers.map(layer => (
          <div key={layer.level} style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: "#94a3b8",
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: layer.color, flexShrink: 0,
            }} />
            P{layer.level} · {LEVEL_META[layer.level].label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Per-level row ───────────────────────────────────────────

interface LevelRowProps {
  layer:         CostLayer;
  maxCost:       number;
  isHighlighted: boolean;
}

function LevelRow({ layer, maxCost, isHighlighted }: LevelRowProps) {
  const meta = LEVEL_META[layer.level];
  const fillPct = maxCost > 0 ? Math.min(100, (layer.monthlyCost / maxCost) * 100) : 0;

  return (
    <div style={{
      padding: "10px 12px",
      background: isHighlighted ? `${layer.color}11` : "#0d1424",
      border:    `1px solid ${isHighlighted ? `${layer.color}66` : "#1e293b"}`,
      borderRadius: 10,
      transition: "background 0.2s, border-color 0.2s",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 12, marginBottom: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: layer.color,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              fontSize: 10, padding: "1px 6px",
              background: `${layer.color}22`,
              borderRadius: 4, border: `1px solid ${layer.color}44`,
            }}>
              P1–P{layer.level}
            </span>
            {meta.modeLabel}
          </div>
          <div style={{
            fontSize: 11, color: "#64748b", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {meta.desc}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>
            {fmt(layer.monthlyCost)}
          </div>
          <div style={{ fontSize: 10, color: "#475569" }}>
            / mies.{layer.level > 1 && (
              <> · +{fmt(layer.bucketCost)} z P{layer.level}</>
            )}
          </div>
        </div>
      </div>

      <div style={{
        height: 6, background: "#0a0f1e", borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${fillPct}%`, background: layer.color,
          borderRadius: 99, transition: "width 0.4s",
        }} />
      </div>
    </div>
  );
}
