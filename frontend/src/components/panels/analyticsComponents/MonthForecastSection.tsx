// ============================================================
// File: src/components/panels/analyticsComponents/MonthForecastSection.tsx
// End-of-month run-rate forecast for the CURRENT calendar month.
// All math lives in utils/monthForecast.ts (pure, unit-tested); this
// component resolves inputs from app state and renders:
//   - time-elapsed vs budget-used progress bars
//   - spent / projected / limit-total stat row (threshold-coloured)
//   - upcoming recurring + "soft" planned info lines
//   - at-risk categories with the estimated limit-crossing day
// Planned expenses are shown as a separate line, NOT added to the
// projection — they may or may not happen.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useEffect, useMemo } from "react";
import { useAppContext } from "../../../context/AppContext";
import { useRecurring } from "../../../hooks/useRecurring";
import { buildLimitMap } from "../../../hooks/useLimits";
import { ProgressBar } from "../../ui/summaryUi";
import { fmt } from "../../../utils/helpers";
import {
  computeMonthForecast, upcomingRecurringForMonth, plannedTotalForMonth,
  MIN_PACE_DAYS, type ForecastTransaction,
} from "../../../utils/monthForecast";
import { ChartEmpty } from "./chartKit";

interface Props {
  transactions: ForecastTransaction[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

export function MonthForecastSection({ transactions, months }: Props) {
  const { categories, planned, limits, settings } = useAppContext();
  const { recurring, loadAll: loadRecurring } = useRecurring();

  // Recurring definitions may not be loaded yet on a cold navigation to
  // analytics (NotificationBell usually loads them first).
  useEffect(() => {
    if (recurring.length === 0) loadRecurring();
  }, [recurring.length, loadRecurring]);

  // App-wide convention for "today" (see usePlanned/useRecurring).
  const todayStr     = new Date().toISOString().slice(0, 10);
  const currentMonth = todayStr.slice(0, 7);

  const limitByCategory = useMemo<Record<string, number>>(() => {
    const expenseIds = new Set(categories.filter(cat => cat.type === "EXPENSE").map(cat => cat.id));
    return Object.fromEntries(
      Object.entries(buildLimitMap(limits, currentMonth))
        .filter(([categoryId, active]) => expenseIds.has(categoryId) && active.amount > 0)
        .map(([categoryId, active]) => [categoryId, active.amount]),
    );
  }, [limits, categories, currentMonth]);

  const forecast = useMemo(
    () => computeMonthForecast({
      transactions,
      month:    currentMonth,
      todayStr,
      upcoming: upcomingRecurringForMonth(recurring, currentMonth),
      limitByCategory,
    }),
    [transactions, currentMonth, todayStr, recurring, limitByCategory],
  );

  const plannedInfo = useMemo(
    () => plannedTotalForMonth(planned, currentMonth),
    [planned, currentMonth],
  );

  // The pace only exists for the running month — with the range elsewhere,
  // there is no current-month data to extrapolate from.
  if (!months.includes(currentMonth)) {
    return (
      <ChartEmpty message={
        `Prognoza dotyczy bieżącego miesiąca (${currentMonth}), ` +
        "który jest poza wybranym zakresem."
      } />
    );
  }

  const { progress, categories: rows } = forecast;
  const atRisk = rows.filter(r => r.overBy > 0);
  const safeWithLimit = rows.filter(r => r.overBy === 0 && r.limit !== null);

  // Threshold colouring follows the user's own settings, like PanelSummary.
  const warningPct  = settings?.thresholds?.warningPercent  ?? 80;
  const criticalPct = settings?.thresholds?.criticalPercent ?? 95;
  const usagePct    = forecast.limitTotal > 0 ? (forecast.projected / forecast.limitTotal) * 100 : null;
  const usageColor  = usagePct === null ? c.text
    : usagePct >= criticalPct ? c.danger
    : usagePct >= warningPct  ? c.warning
    : c.success;

  const iconOf = (categoryId: string) => categories.find(cat => cat.id === categoryId)?.icon ?? "";
  const label: React.CSSProperties = { fontSize: 11, color: c.textMuted };
  const stat = (title: string, value: string, color: string) => (
    <div>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>{value}</div>
    </div>
  );

  return (
    <div>
      {/* Time vs money progress */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "center", marginBottom: 14 }}>
        <span style={label}>⏱️ Czas: dzień {progress.dayOfMonth}/{progress.daysInMonth}</span>
        <ProgressBar percent={progress.elapsedFraction * 100} color={c.info} />
        {forecast.limitTotal > 0 && (
          <>
            <span style={label}>💸 Budżet: {fmt(forecast.spent)} / {fmt(forecast.limitTotal)} zł</span>
            <ProgressBar percent={(forecast.spent / forecast.limitTotal) * 100} color={usageColor} />
          </>
        )}
      </div>

      {/* Stat row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginBottom: 12 }}>
        {stat("Wydano dotąd", `${fmt(forecast.spent)} zł`, c.text)}
        {stat(
          "Prognoza końca miesiąca",
          `~${fmt(forecast.projected)} zł`,
          usageColor,
        )}
        {forecast.limitTotal > 0 && stat("Suma limitów", `${fmt(forecast.limitTotal)} zł`, c.textSecondary)}
      </div>

      {/* Known / soft additions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        {forecast.upcomingFixedTotal > 0 && (
          <span style={label}>
            🔄 W prognozie: nadchodzące cykliczne <strong style={{ color: c.textTertiary }}>{fmt(forecast.upcomingFixedTotal)} zł</strong>
          </span>
        )}
        {plannedInfo.count > 0 && (
          <span style={label}>
            🛍️ Poza prognozą: planowane zakupy{" "}
            <strong style={{ color: c.textTertiary }}>+{fmt(plannedInfo.total)} zł</strong>{" "}
            ({plannedInfo.count} {plannedInfo.count === 1 ? "pozycja" : "pozycje"}) — mogą, ale nie muszą się wydarzyć
          </span>
        )}
      </div>

      {/* Low-confidence notice */}
      {forecast.lowConfidence && (
        <div style={{
          display: "inline-block", marginBottom: 12, padding: "4px 10px",
          background: alpha(c.info, "11"), border: `1px solid ${alpha(c.info, "44")}`,
          borderRadius: 6, fontSize: 11, color: c.infoSky,
        }}>
          ℹ️ Niska wiarygodność — tempo liczone z {progress.dayOfMonth}{" "}
          {progress.dayOfMonth === 1 ? "dnia" : "dni"} (stabilne od {MIN_PACE_DAYS}).
        </div>
      )}

      {/* At-risk categories */}
      {atRisk.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {atRisk.map(r => {
            const crossed = r.spent >= (r.limit as number);
            return (
              <div key={r.categoryId}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>
                    {iconOf(r.categoryId)} {r.categoryName}
                  </span>
                  <span style={{ fontSize: 12, color: crossed ? c.dangerLight : c.warningLight }}>
                    {crossed
                      ? "🔴 limit już przekroczony"
                      : r.crossingDay !== null && `🟠 przekroczenie ≈ ${r.crossingDay}. dnia`}
                  </span>
                </div>
                <ProgressBar
                  percent={(r.spent / (r.limit as number)) * 100}
                  color={crossed ? c.danger : c.warning}
                />
                <div style={{ ...label, marginTop: 3 }}>
                  wydano {fmt(r.spent)} zł · prognoza <strong style={{ color: c.dangerLight }}>~{fmt(r.projected)} zł</strong>{" "}
                  / limit {fmt(r.limit as number)} zł
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Green summary */}
      <div style={{ ...label, marginTop: atRisk.length > 0 ? 12 : 0 }}>
        {forecast.limitTotal === 0
          ? "Brak limitów kategorii — ustaw je, aby zobaczyć prognozy przekroczeń."
          : atRisk.length === 0
            ? `✅ Wszystkie kategorie z limitem (${safeWithLimit.length}) w normie przy obecnym tempie.`
            : `✅ Pozostałe kategorie z limitem (${safeWithLimit.length}) w normie.`}
      </div>

      {/* Methodology fine print */}
      <div style={{ fontSize: 10, color: c.textFaint, marginTop: 10 }}>
        Prognoza = stałe zapłacone + cykliczne wg harmonogramu + zmienne × tempo z {progress.dayOfMonth}{" "}
        {progress.dayOfMonth === 1 ? "dnia" : "dni"}.
      </div>
    </div>
  );
}
