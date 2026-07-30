// ============================================================
// File: src/components/panels/safetyNetComponents/UpcomingPlannedCard.tsx
// Lists planned expenses that fall within the safety-net horizon.
// Shows per-priority breakdown so the user understands why their
// target cushion is bigger than baseDeficit × horizon.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo } from "react";
import { fmt, plural } from "../../../utils/helpers";
import { Card, EmptyState } from "../../ui/summaryUi";
import { LEVEL_META } from "./types";
import type { UpcomingPlanned, PriorityLevel } from "./types";

interface UpcomingPlannedCardProps {
  upcoming:       UpcomingPlanned[];
  selectedLevel:  PriorityLevel;
  horizonMonths:  number;
  /** When false, the panel is collapsed/grayed and explains the toggle is off. */
  enabled:        boolean;
  onToggle:       (next: boolean) => void;
}

export function UpcomingPlannedCard({
  upcoming,
  selectedLevel,
  horizonMonths,
  enabled,
  onToggle,
}: UpcomingPlannedCardProps) {

  const sumAll = useMemo(
    () => upcoming.reduce((s, u) => s + u.amountInHorizon, 0),
    [upcoming],
  );

  const sumAtLevel = useMemo(
    () => upcoming
      .filter(u => u.priority <= selectedLevel)
      .reduce((s, u) => s + u.amountInHorizon, 0),
    [upcoming, selectedLevel],
  );

  return (
    <Card style={{ padding: 14, opacity: enabled ? 1 : 0.6 }}>
      {/* Header with toggle */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 12, gap: 10,
      }}>
        <div>
          <div style={{
            fontSize: 13, fontWeight: 800, color: c.text, marginBottom: 4,
          }}>
            📅 Nadchodzące planowane wydatki
          </div>
          <div style={{ fontSize: 11, color: c.textSecondary, lineHeight: 1.5 }}>
            Zobowiązania z modułu planowanych, które wypadają w Twoim oknie{" "}
            <strong style={{ color: c.textTertiary }}>{horizonMonths} miesięcy</strong>{" "}
            (OC, podatki, obozy, itp.). Są dodawane do celu poduszki dla każdego poziomu —
            filtrowane po priorytecie zgodnie z warstwami kosztów.
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          style={{
            flexShrink: 0,
            padding: "5px 10px",
            border: `1px solid ${enabled ? alpha(c.success, "66") : c.border}`,
            background: enabled ? alpha(c.success, "22") : "transparent",
            color: enabled ? c.success : c.textSecondary,
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {enabled ? "✓ Włączone" : "○ Wyłączone"}
        </button>
      </div>

      {!enabled && (
        <div style={{
          padding: "10px 12px",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          fontSize: 12, color: c.textSecondary, lineHeight: 1.5,
        }}>
          Symulator <strong>nie</strong> uwzględnia planowanych wydatków — poduszka
          pokazuje tylko podstawowy koszt przeżycia. Włącz, aby zobaczyć pełny obraz.
        </div>
      )}

      {enabled && upcoming.length === 0 && (
        <EmptyState
          icon="📭"
          message={`Brak planowanych wydatków w najbliższych ${horizonMonths} miesiącach.`}
        />
      )}

      {enabled && upcoming.length > 0 && (
        <>
          {/* Summary tiles */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 12,
          }}>
            <SummaryTile
              label="Razem w horyzoncie"
              value={sumAll}
              hint={`${upcoming.length} ${plural(upcoming.length, "pozycja", "pozycje", "pozycji")}`}
              color={c.textBody}
            />
            <SummaryTile
              label={`Wlicza się do P1–P${selectedLevel}`}
              value={sumAtLevel}
              hint={`tryb: ${LEVEL_META[selectedLevel].modeLabel}`}
              color={LEVEL_META[selectedLevel].color}
            />
          </div>

          {/* List */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 6,
            maxHeight: 280, overflowY: "auto",
          }}>
            {upcoming.map(u => (
              <PlannedRow
                key={u.id}
                planned={u}
                includedAtLevel={u.priority <= selectedLevel}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Subcomponents ────────────────────────────────────────────

interface SummaryTileProps {
  label: string;
  value: number;
  hint?: string;
  color: string;
}

function SummaryTile({ label, value, hint, color }: SummaryTileProps) {
  return (
    <div style={{
      padding: "10px 12px",
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 10, color: c.textMuted, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.5px",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{fmt(value)}</div>
      {hint && (
        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

interface PlannedRowProps {
  planned:        UpcomingPlanned;
  includedAtLevel: boolean;
}

function PlannedRow({ planned, includedAtLevel }: PlannedRowProps) {
  const meta = LEVEL_META[planned.priority];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto auto",
      gap: 10, alignItems: "center",
      padding: "8px 10px",
      background: includedAtLevel ? c.surface : c.bgDeepest,
      border: `1px solid ${includedAtLevel ? meta.color + "33" : c.border}`,
      borderRadius: 8,
      opacity: includedAtLevel ? 1 : 0.55,
    }}>
      {/* Priority chip */}
      <span style={{
        padding: "2px 6px",
        background: meta.color + "22",
        color: meta.color,
        border: `1px solid ${meta.color}55`,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 800,
        minWidth: 24,
        textAlign: "center",
      }}>
        P{planned.priority}
      </span>

      {/* Label */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: c.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {planned.mode === "envelope" ? "🐷 " : "🎯 "}
          {planned.description}
        </div>
        <div style={{ fontSize: 10, color: c.textMuted }}>
          {planned.plannedMonth} · {planned.categoryName}
          {planned.subcategoryName && ` › ${planned.subcategoryName}`}
          {planned.mode === "envelope" && planned.paidPLN > 0 && (
            <span style={{ color: c.success, marginLeft: 6 }}>
              · zebrane {fmt(planned.paidPLN)} / {fmt(planned.totalAmountPLN)}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div style={{
        fontSize: 13, fontWeight: 800, color: c.text,
        textAlign: "right", minWidth: 80,
      }}>
        {fmt(planned.amountInHorizon)}
      </div>

      {/* Inclusion mark */}
      <span title={includedAtLevel
        ? `Wliczane do P1–P${planned.priority} (na poziomie i wyżej)`
        : `Pomijane na poziomie P${planned.priority - 1} i niżej`
      } style={{
        fontSize: 12,
        color: includedAtLevel ? c.success : c.textMuted,
        width: 18,
        textAlign: "center",
      }}>
        {includedAtLevel ? "✓" : "—"}
      </span>
    </div>
  );
}
