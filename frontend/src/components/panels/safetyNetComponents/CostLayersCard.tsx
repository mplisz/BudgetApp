// ============================================================
// File: src/components/panels/safetyNetComponents/CostLayersCard.tsx
// Visualises the four cumulative cost layers (Survival → No Change).
// Each level shows: cumulative monthly cost, contribution from this
// priority bucket, and a stacked bar so the user sees how each layer
// adds on top of the previous one.
//
// Critical expenses (subcategory.isCritical=true) are shown as a separate
// 🔒 segment in the stacked bar — they are included in EVERY level's
// monthlyCost, so the legend makes it explicit. Without the visual split
// the user would see Survival Mode = 7 000 zł and ask: "why so high?".
// With the split: "ah, 4 000 base + 3 000 critical".
// ============================================================

import { c } from "../../../styles/tokens";
import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import { EmptyState } from "../../ui/summaryUi";
import { LEVEL_META } from "./types";
import type { CostLayer, PriorityLevel } from "./types";

const CRITICAL_COLOR = c.voucher;   // purple — same hue as 🔒 button in Settings

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

  // Critical is the same on every layer — read it from index 0
  const criticalCost = layers.length ? layers[0].criticalCost : 0;
  const hasCritical  = criticalCost > 0;

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
      {/* Stacked bar — shows critical first (always included), then P1..P4 */}
      <StackedLayersBar
        layers={layers}
        total={maxCost}
        criticalCost={criticalCost}
        highlight={highlightLevel}
      />

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
        fontSize: 11, color: c.textMuted, lineHeight: 1.6,
        padding: "8px 10px", background: c.surface,
        border: `1px solid ${c.border}`, borderRadius: 8,
      }}>
        💡 Każdy wyższy poziom zawiera koszty poprzednich (P1 ⊂ P1+P2 ⊂ …). Średnia liczona na bazie wybranego okna historycznego.
        {hasCritical && (
          <>
            {" "}
            <strong style={{ color: CRITICAL_COLOR }}>🔒 Nienaruszalne</strong>{" "}
            (czesne, leki, opłaty dla dzieci) są wliczane na <em>każdym</em> poziomie, niezależnie od priorytetu.
          </>
        )}
      </div>
    </div>
  );
}

// ── Stacked layers bar ──────────────────────────────────────

interface StackedLayersBarProps {
  layers:        CostLayer[];
  total:         number;
  criticalCost:  number;
  highlight?:    PriorityLevel;
}

function StackedLayersBar({ layers, total, criticalCost, highlight }: StackedLayersBarProps) {
  return (
    <div>
      <div style={{
        display: "flex", height: 14,
        borderRadius: 99, overflow: "hidden",
        background: c.surface, border: `1px solid ${c.border}`,
      }}>
        {/* Critical segment first — always present in every level */}
        {criticalCost > 0 && total > 0 && (
          <div
            title={`🔒 Nienaruszalne: ${fmt(criticalCost)} / mies. — wliczane do każdego poziomu`}
            style={{
              width:      `${(criticalCost / total) * 100}%`,
              background: CRITICAL_COLOR,
              // Critical never dims — it's part of every level
              opacity:    1,
              transition: "opacity 0.2s",
            }}
          />
        )}

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
        {criticalCost > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: CRITICAL_COLOR, fontWeight: 700,
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: CRITICAL_COLOR, flexShrink: 0,
            }} />
            🔒 Nienaruszalne · {fmt(criticalCost)}
          </div>
        )}
        {layers.map(layer => (
          <div key={layer.level} style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: c.textTertiary,
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
  // Net of critical = what this priority bucket contributes on top of always-included critical
  const bucketContribution = layer.bucketCost;
  const hasCritical        = layer.criticalCost > 0;

  return (
    <div style={{
      padding: "10px 12px",
      background: isHighlighted ? `${layer.color}11` : c.surface,
      border:    `1px solid ${isHighlighted ? `${layer.color}66` : c.border}`,
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
            fontSize: 11, color: c.textSecondary, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {meta.desc}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: c.text }}>
            {fmt(layer.monthlyCost)}
          </div>
          <div style={{ fontSize: 10, color: c.textMuted }}>
            / mies.
            {layer.level > 1 && bucketContribution > 0 && (
              <> · +{fmt(bucketContribution)} z P{layer.level}</>
            )}
            {hasCritical && (
              <>
                {" · "}
                <span style={{ color: CRITICAL_COLOR }}>
                  🔒 {fmt(layer.criticalCost)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{
        height: 6, background: c.bg, borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${fillPct}%`, background: layer.color,
          borderRadius: 99, transition: "width 0.4s",
        }} />
      </div>
    </div>
  );
}
