// ============================================================
// File: src/components/panels/safetyNetComponents/SavingAssistant.tsx
// ETA-to-target widget + "what-if" sliders.
// The cost-cut slider has a DOUBLE effect — it raises the saving pace
// AND lowers the cushion target — which is the satisfying psychological
// payoff described in the spec.
// ============================================================

import { useState, useMemo } from "react";
import { fmt, roundToNearest } from "../../../utils/helpers";
import { Card } from "../../ui/summaryUi";
import { LEVEL_META } from "./types";
import type { LevelDeficit, PriorityLevel, SavingCapability, WhatIfDelta } from "./types";
import { computeEta, formatEtaDate, formatMonthsPretty } from "./computations";
import type { EtaResult } from "./computations";
import { NumberStepper, StatTile } from "./uiBits";

interface SavingAssistantProps {
  deficits:        LevelDeficit[];
  selectedLevel:   PriorityLevel;
  horizonMonths:   number;
  assetsTotal:     number;
  capability:      SavingCapability;
}

export function SavingAssistant({
  deficits, selectedLevel, horizonMonths, assetsTotal, capability,
}: SavingAssistantProps) {
  // What-if state — local; the simulator is exploratory, no persistence.
  const [delta, setDelta] = useState<WhatIfDelta>({
    extraSavingsPerMonth: 0,
    cutCostsPerMonth:     0,
  });

  const target = deficits.find(d => d.level === selectedLevel);
  const meta   = LEVEL_META[selectedLevel];

  // Baseline ETA (no what-if), for "compare" line
  const baseEta = useMemo(() => target ? computeEta(
    target.monthlyDeficit, horizonMonths, assetsTotal,
    capability.avgMonthlySavings,
    { extraSavingsPerMonth: 0, cutCostsPerMonth: 0 },
  ) : null, [target, horizonMonths, assetsTotal, capability.avgMonthlySavings]);

  // Adjusted ETA
  const adjEta = useMemo(() => target ? computeEta(
    target.monthlyDeficit, horizonMonths, assetsTotal,
    capability.avgMonthlySavings,
    delta,
  ) : null, [target, horizonMonths, assetsTotal, capability.avgMonthlySavings, delta]);

  if (!target || !baseEta || !adjEta) {
    return (
      <div style={{ color: "#64748b", fontSize: 13, padding: 20 }}>
        Wybierz poziom w tabeli powyżej, aby zobaczyć asystenta odkładania.
      </div>
    );
  }

  // Slider bounds — bigger if numbers are huge
  const extraMax = Math.max(2000, Math.ceil(capability.avgMonthlyIncome / 100) * 100);
  const cutMax   = Math.max(2000, Math.ceil(target.monthlyCost / 100) * 100);

  const monthsImproved = isFinite(baseEta.monthsToTarget ?? Infinity) && isFinite(adjEta.monthsToTarget ?? Infinity)
    ? (baseEta.monthsToTarget as number) - (adjEta.monthsToTarget as number)
    : null;

  const savingsNegative = capability.avgMonthlySavings <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Selected level header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: `${meta.color}11`,
        border: `1px solid ${meta.color}44`,
        borderRadius: 10,
      }}>
        <span style={{
          padding: "3px 9px", borderRadius: 6,
          background: `${meta.color}22`, border: `1px solid ${meta.color}55`,
          fontSize: 11, fontWeight: 800, color: meta.color,
        }}>
          P1–P{selectedLevel}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: meta.color, fontWeight: 800, fontSize: 14 }}>
            {meta.modeLabel}
          </div>
          <div style={{ color: "#64748b", fontSize: 11 }}>
            Cel: <strong style={{ color: "#e2e8f0" }}>{fmt(roundToNearest(target.targetCushion, 500))}</strong>
            {" "}· obecnie zebrane: <strong style={{ color: "#e2e8f0" }}>{fmt(assetsTotal)}</strong>
          </div>
        </div>
      </div>

      {/* Baseline saving capability */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatTile
          label="Średni dochód"
          value={fmt(capability.avgMonthlyIncome)}
          sub="/ mies."
          color="#10b981"
        />
        <StatTile
          label="Średnie wydatki"
          value={fmt(capability.avgMonthlyExpenses)}
          sub="/ mies."
          color="#ef4444"
        />
        <StatTile
          label="Siła oszczędzania"
          value={fmt(capability.avgMonthlySavings)}
          sub={savingsNegative ? "⚠️ wydajesz więcej niż zarabiasz" : "/ mies. baza"}
          color={savingsNegative ? "#ef4444" : "#10b981"}
        />
      </div>

      {/* What-if sliders */}
      <Card style={{ background: "#0d1424", border: "1px solid #1e293b" }}>
        <div style={{
          fontSize: 11, color: "#475569", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.5px",
          marginBottom: 12,
        }}>
          Symulator „Co jeśli"
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <NumberStepper
            label="📈 Odkładam dodatkowo"
            value={delta.extraSavingsPerMonth}
            onChange={v => setDelta({ ...delta, extraSavingsPerMonth: v })}
            min={0}
            max={extraMax}
            step={50}
            color="#10b981"
            hint="Zwiększa miesięczne tempo oszczędzania."
          />
          <NumberStepper
            label="✂️ Tnę miesięczne koszty o"
            value={delta.cutCostsPerMonth}
            onChange={v => setDelta({ ...delta, cutCostsPerMonth: v })}
            min={0}
            max={cutMax}
            step={50}
            color="#f59e0b"
            hint="Podwójny efekt: ↑ tempo i ↓ cel poduszki!"
          />
        </div>

        {(delta.extraSavingsPerMonth > 0 || delta.cutCostsPerMonth > 0) && (
          <button
            type="button"
            onClick={() => setDelta({ extraSavingsPerMonth: 0, cutCostsPerMonth: 0 })}
            style={{
              marginTop: 10,
              background: "transparent",
              border: "1px solid #1e293b",
              color: "#94a3b8",
              borderRadius: 8,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ↺ Reset suwaków
          </button>
        )}
      </Card>

      {/* ETA cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <EtaCard
          title="📅 Bazowo"
          eta={baseEta}
          color="#94a3b8"
        />
        <EtaCard
          title="🚀 Po zmianach"
          eta={adjEta}
          color={
            adjEta.isAlreadyReached ? "#10b981"
            : adjEta.isUnreachable  ? "#ef4444"
            : "#3b82f6"
          }
          highlight
        />
      </div>

      {/* Improvement summary */}
      {monthsImproved !== null && monthsImproved > 0.05 && (
        <div style={{
          padding: "10px 14px",
          background: "#10b98111",
          border: "1px solid #10b98144",
          borderRadius: 10,
          fontSize: 13, color: "#10b981", fontWeight: 700,
          textAlign: "center",
        }}>
          🎉 Brawo! Z tymi zmianami zbudujesz poduszkę{" "}
          {formatMonthsPretty(monthsImproved)} szybciej.
        </div>
      )}
    </div>
  );
}

// ── ETA card ────────────────────────────────────────────────

interface EtaCardProps {
  title:     string;
  eta:       EtaResult;
  color:     string;
  highlight?: boolean;
}

function EtaCard({ title, eta, color, highlight }: EtaCardProps) {
  return (
    <div style={{
      padding: 14,
      background: highlight ? `${color}11` : "#0d1424",
      border: `1px solid ${highlight ? `${color}44` : "#1e293b"}`,
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 11, color: "#475569", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.5px",
        marginBottom: 8,
      }}>
        {title}
      </div>

      {eta.isAlreadyReached ? (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>
            ✓ Cel osiągnięty
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            Twoje aktywa już pokrywają poduszkę dla tego poziomu.
          </div>
        </>
      ) : eta.isUnreachable ? (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>
            Nieosiągalne
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            Brakuje <strong style={{ color: "#ef4444" }}>{fmt(eta.gapPLN)}</strong>,
            a tempo oszczędzania to <strong>{fmt(eta.adjustedSavingPace)}</strong>/mies.
            Zwiększ wpływy, ogranicz wydatki albo wybierz niższy poziom.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, color }}>
            {formatEtaDate(eta.etaDate)}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            za <strong style={{ color: "#e2e8f0" }}>{formatMonthsPretty(eta.monthsToTarget ?? 0)}</strong>
            {" "}· brakuje <strong style={{ color: "#e2e8f0" }}>{fmt(eta.gapPLN)}</strong>
            {" "}· tempo <strong style={{ color: "#e2e8f0" }}>{fmt(eta.adjustedSavingPace)}</strong>/mies.
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>
            Cel skorygowany: {fmt(roundToNearest(eta.adjustedTarget, 500))}
          </div>
        </>
      )}
    </div>
  );
}
