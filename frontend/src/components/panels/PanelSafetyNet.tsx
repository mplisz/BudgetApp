// ============================================================
// File: src/components/panels/PanelSafetyNet.tsx
// "Poduszka finansowa" — single-page panel (desktop only).
//
//   1) Computes the 4 cost layers (P1..P4 cumulative)
//   2) Simulates income loss via per-source toggles
//   3) Shows deficit / target / runway for each level
//   4) Manages assets portfolio (cushion contents) with FX support
//   5) ETA + what-if simulator for the chosen level
//
// PERSISTENCE MODEL:
//   - Persisted in settings.safetyNet: lookbackMonths, horizonMonths,
//     excludedIncomeKeys, assets.
//   - NOT persisted: selectedLevel (UI preference), what-if sliders.
//   - Saves go through fetchWithAuth directly so there's no toast spam.
//   - Saves skipped when the serialised payload didn't actually change.
//
// FX FRESHNESS:
//   - On panel entry, refresh today's NBP rate for every active asset
//     with originalCurrency != base. Updates `amount` in place.
//   - Cache in useCurrencyConverter dedupes per (currency, date) — 5 USD
//     buckets = 1 NBP fetch.
//
// APP-START FLOOR:
//   - The historical window is clamped to settings.appStartMonth — we
//     never look at months before the budget officially started.
//   - When the floor is in the future (no historical data yet), the
//     panel shows a friendly "brak historii" placeholder instead of
//     computing on an empty window.
// ============================================================

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth }                from "../../context/AuthContext";
import { useAppContext }          from "../../context/AppContext";
import { useTransactionsRange }   from "../../hooks/useTransactionsRange";
import { useSettings }            from "../../hooks/useSettings";
import { usePlanned }             from "../../hooks/usePlanned";
import { fmt }                    from "../../utils/helpers";
import { theme as s }             from "../../styles/theme";
import { Card }                   from "../ui/summaryUi";
import { useCurrencyManager }     from "../../hooks/useCurrencyManager";
import { toYMD, todayLocal }      from "../ui/AppDatePicker";

import {
  lastNMonths,
  isInWindow,
  computeCostLayers,
  computeIncomeSources,
  computeRemainingIncome,
  computeLevelDeficits,
  computeSavingCapability,
  computeUpcomingPlanned,
  sumAssets,
} from "./safetyNetComponents/computations";
import { CostLayersCard }       from "./safetyNetComponents/CostLayersCard";
import { IncomeSourcesToggle }  from "./safetyNetComponents/IncomeSourcesToggle";
import { DeficitTable }         from "./safetyNetComponents/DeficitTable";
import { UpcomingPlannedCard }  from "./safetyNetComponents/UpcomingPlannedCard";
import { AssetsPortfolio }      from "./safetyNetComponents/AssetsPortfolio";
import { SavingAssistant }      from "./safetyNetComponents/SavingAssistant";
import { PillGroup }            from "./safetyNetComponents/uiBits";
import { DEFAULT_SAFETY_NET }   from "./safetyNetComponents/types";
import type {
  AssetBucket, PriorityLevel, SafetyNetSettings, SnTransaction, AppCategory,
} from "./safetyNetComponents/types";
import { SkeletonKpiCard, SkeletonCard, SkeletonChart, SkeletonListRow } from "../ui/Skeleton";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Persisted subset (NO selectedLevel) ──────────────────────

type PersistedSafetyNet = Omit<SafetyNetSettings, "selectedLevel">;

interface AppSettings {
  safetyNet?: Partial<SafetyNetSettings>;
}

interface UseSettingsResult {
  settings: AppSettings | null;
}

// ── Constants ───────────────────────────────────────────────

const LOOKBACK_OPTIONS = [
  { value: 3,  label: "3 mies."  },
  { value: 6,  label: "6 mies."  },
  { value: 12, label: "12 mies." },
  { value: 24, label: "24 mies." },
];

const HORIZON_OPTIONS = [
  { value: 3,  label: "3 mies."  },
  { value: 6,  label: "6 mies."  },
  { value: 12, label: "12 mies." },
];

const SAVE_DEBOUNCE_MS = 800;
const MOBILE_BREAKPOINT_PX = 700;

// ── Component ───────────────────────────────────────────────

export default function PanelSafetyNet() {
  // ── Mobile guard ──────────────────────────────────────────
  // This panel is desktop-only by design. Mobile users see a friendly
  // message instead of a broken layout.
  const isMobile = useIsMobile();
  if (isMobile) return <MobileBlocker />;

  return <PanelSafetyNetDesktop />;
}

// ── Desktop body ─────────────────────────────────────────────

function PanelSafetyNetDesktop() {
  const { settings }                            = useSettings()  as UseSettingsResult;
  const { fetchWithAuth }                       = useAuth()      as { fetchWithAuth: typeof fetch };
  const { setSettings, categories, settings: appSettings } = useAppContext() as {
    setSettings: (v: AppSettings) => void;
    categories:  AppCategory[];
    settings:    { appStartMonth?: string } | null;
  };
  const { transactions, isLoading, loadRange }  = useTransactionsRange();
  const { baseCurrency }                        = useCurrencyManager() as { baseCurrency: { code: string } };
  const { planned, loadAll: loadAllPlanned }    = usePlanned();

  // ── State split ───────────────────────────────────────────

  const [snState, setSnState] = useState<PersistedSafetyNet>(stripSelected(DEFAULT_SAFETY_NET));
  const [selectedLevel, setSelectedLevel] = useState<PriorityLevel>(2);
  const [hydrated, setHydrated] = useState(false);
  const [fxRefreshNote, setFxRefreshNote] = useState<string | null>(null);

  // Hydrate once from settings
  useEffect(() => {
    if (!settings || hydrated) return;
    const persisted = settings.safetyNet ?? {};
    setSnState({
      lookbackMonths:         persisted.lookbackMonths         ?? DEFAULT_SAFETY_NET.lookbackMonths,
      horizonMonths:          persisted.horizonMonths          ?? DEFAULT_SAFETY_NET.horizonMonths,
      assets:                 Array.isArray(persisted.assets)             ? persisted.assets             : [],
      excludedIncomeKeys:     Array.isArray(persisted.excludedIncomeKeys) ? persisted.excludedIncomeKeys : [],
      // includePlannedExpenses defaults to TRUE — honest cushion picture
      includePlannedExpenses: persisted.includePlannedExpenses ?? DEFAULT_SAFETY_NET.includePlannedExpenses,
    });
    if (typeof persisted.selectedLevel === "number"
        && persisted.selectedLevel >= 1 && persisted.selectedLevel <= 4) {
      setSelectedLevel(persisted.selectedLevel as PriorityLevel);
    }
    setHydrated(true);
  }, [settings, hydrated]);

  // ── FX auto-refresh on panel entry ────────────────────────
  const fxRefreshDone = useRef(false);
  useEffect(() => {
    if (!hydrated || fxRefreshDone.current) return;
    fxRefreshDone.current = true;

    const today = toYMD(todayLocal());
    const baseCode = baseCurrency.code;
    const staleForeign = snState.assets.filter(a =>
      !a.isArchived
      && a.originalCurrency
      && a.originalCurrency !== baseCode
      && a.originalAmount
      && a.fxRateDate !== today,
    );

    if (staleForeign.length === 0) return;

    refreshAssetRates(staleForeign, today).then(updates => {
      if (updates.length === 0) return;

      setSnState(s => {
        const updateMap = new Map(updates.map(u => [u.id, u]));
        const next = s.assets.map(a => {
          const u = updateMap.get(a.id);
          if (!u) return a;
          return {
            ...a,
            amount:     Math.round((u.newAmount) * 100) / 100,
            fxRate:     u.newRate,
            fxRateDate: u.effectiveDate,
          };
        });
        return { ...s, assets: next };
      });

      setFxRefreshNote(
        `✓ Odświeżono kursy dla ${updates.length} ${updates.length === 1 ? "koszyka" : "koszyków"}`,
      );
      setTimeout(() => setFxRefreshNote(null), 4000);
    }).catch(() => {
      // Stay silent — user can still use the panel with last-known rates
    });
  }, [hydrated, baseCurrency.code]);   // snState.assets intentionally omitted

  // ── Debounced save ────────────────────────────────────────

  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedKey = useRef<string | null>(null);

  useEffect(() => {
    if (hydrated && lastSavedKey.current === null) {
      lastSavedKey.current = JSON.stringify(snState);
    }
  }, [hydrated, snState]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      const key = JSON.stringify(snState);
      if (key === lastSavedKey.current) return;
      try {
        const res = await fetchWithAuth(`${API_URL}/api/settings`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ safetyNet: snState }),
        });
        if ((res as Response).ok) {
          const saved = await (res as Response).json();
          setSettings(saved);
          lastSavedKey.current = key;
        }
      } catch {
        // silent
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snState, hydrated]);

  // ── Setters ───────────────────────────────────────────────

  const setLookback        = useCallback((m: number)              => setSnState(s => ({ ...s, lookbackMonths: m })), []);
  const setHorizon         = useCallback((m: number)              => setSnState(s => ({ ...s, horizonMonths:  m })), []);
  const setExcluded        = useCallback((keys: string[])         => setSnState(s => ({ ...s, excludedIncomeKeys: keys })), []);
  const setAssets          = useCallback((assets: AssetBucket[]) => setSnState(s => ({ ...s, assets })), []);
  const setIncludePlanned  = useCallback((next: boolean)         => setSnState(s => ({ ...s, includePlannedExpenses: next })), []);

  // ── Historical window (clamped to appStartMonth) ──────────

  // Raw window — N months back from today, before any clamping.
  const rawWindow = useMemo(
    () => lastNMonths(snState.lookbackMonths),
    [snState.lookbackMonths],
  );

  // Clamp to appStartMonth — never look at months before the budget started.
  // This affects both the data fetch range AND the per-month aggregations
  // downstream (computeCostLayers, computeIncomeSources, etc.) since they
  // all use windowMonths.length to divide by.
  const floor = appSettings?.appStartMonth;
  const windowMonths = useMemo(
    () => (floor ? rawWindow.filter(m => m >= floor) : rawWindow),
    [rawWindow, floor],
  );

  // hasHistory = there's at least ONE month in the window that's not
  // before the budget start. When floor is in the future (e.g. floor=2026-06
  // and today is 2026-05), windowMonths is empty → no analysis possible.
  const hasHistory = windowMonths.length > 0;

  // fromMonth/toMonth used by header AND by loadRange (only when hasHistory)
  const fromMonth = windowMonths[0];
  const toMonth   = windowMonths[windowMonths.length - 1];

  useEffect(() => {
    // Don't fetch when window is empty — would result in from>to and a 400.
    if (hasHistory && fromMonth && toMonth) loadRange(fromMonth, toMonth);
  }, [hasHistory, fromMonth, toMonth, loadRange]);

  // Load planned expenses once (used for cushion target adjustment)
  useEffect(() => {
    loadAllPlanned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived computations ──────────────────────────────────
  // All useMemo below MUST run on every render (no early returns above).
  // When hasHistory is false, they compute on an empty array and yield
  // safe zero-values — the render branch handles displaying the
  // "no history" placeholder instead.

  const txInWindow = useMemo(
    () => (transactions as unknown as SnTransaction[]).filter(tx => isInWindow(tx, windowMonths)),
    [transactions, windowMonths],
  );

  const monthsWithData = useMemo(() => {
    const months = new Set<string>();
    for (const tx of txInWindow) months.add(tx.budgetMonth);
    return months.size;
  }, [txInWindow]);
  const insufficientHistory = hydrated
    && hasHistory
    && txInWindow.length > 0
    && monthsWithData < windowMonths.length;

  const windowClamped = hydrated && !!floor && rawWindow.length !== windowMonths.length && hasHistory;

  // ── Critical subcategories (Feature #1) ──────────────────
  const criticalSubcategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const cat of (categories || [])) {
      if (cat.isArchived) continue;
      for (const sub of (cat.sub || [])) {
        if (sub.isCritical && !sub.isArchived) set.add(sub.id);
      }
    }
    return set;
  }, [categories]);

  // Divide by the actual window length (not lookbackMonths), so when the
  // window is clamped, averages reflect the real number of months available.
  // effectiveMonths >= 1 guard prevents division-by-zero in computations
  // (the no-history branch handles the user-facing case separately).
  const effectiveMonths = windowMonths.length || 1;

  const layers = useMemo(
    () => computeCostLayers(txInWindow, effectiveMonths, criticalSubcategoryIds),
    [txInWindow, effectiveMonths, criticalSubcategoryIds],
  );

  const incomeSources = useMemo(
    () => computeIncomeSources(txInWindow, effectiveMonths),
    [txInWindow, effectiveMonths],
  );

  useEffect(() => {
    if (!hydrated || incomeSources.length === 0) return;
    const validKeys = new Set(incomeSources.map((src: { key: string }) => src.key));
    const filtered  = snState.excludedIncomeKeys.filter((k: string) => validKeys.has(k));
    if (filtered.length !== snState.excludedIncomeKeys.length) {
      setExcluded(filtered);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeSources, hydrated]);

  const remainingIncome = useMemo(
    () => computeRemainingIncome(incomeSources, snState.excludedIncomeKeys),
    [incomeSources, snState.excludedIncomeKeys],
  );

  // Only ACTIVE (non-archived) assets count toward the cushion
  const activeAssets  = useMemo(
    () => snState.assets.filter(a => !a.isArchived),
    [snState.assets],
  );
  const assetsTotal   = useMemo(() => sumAssets(activeAssets), [activeAssets]);

  // ── Upcoming planned in horizon ───────────────────────────
  const upcomingPlanned = useMemo(
    () => computeUpcomingPlanned(planned, snState.horizonMonths, new Date(), criticalSubcategoryIds),
    [planned, snState.horizonMonths, criticalSubcategoryIds],
  );

  const includePlannedEnabled = snState.includePlannedExpenses ?? true;

  const deficits = useMemo(
    () => computeLevelDeficits(
      layers,
      remainingIncome,
      snState.horizonMonths,
      assetsTotal,
      includePlannedEnabled ? upcomingPlanned : [],
    ),
    [layers, remainingIncome, snState.horizonMonths, assetsTotal, upcomingPlanned, includePlannedEnabled],
  );

  const capability = useMemo(
    () => computeSavingCapability(txInWindow, effectiveMonths),
    [txInWindow, effectiveMonths],
  );

  // ── Render ────────────────────────────────────────────────

  // ── Branch 1: No historical data yet (floor in the future) ──
  // Shown when appStartMonth hasn't been reached yet — the budget
  // officially starts later, so we have nothing to analyse. Friendly
  // placeholder instead of "0 months / 0 zł" everywhere. The user can
  // still pre-populate the assets portfolio so it's ready when analysis
  // kicks in.
  if (hydrated && !hasHistory) {
    return (
      <div style={{ padding: "0 0 60px 0", maxWidth: 1200 }}>
        <div style={{ marginBottom: 20, marginTop: 8 }}>
          <div style={(s as any).sectionTitle}>🛡️ Poduszka finansowa</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Analiza zostanie odblokowana po rozpoczęciu budżetu.
          </div>
        </div>

        <Card>
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
              Brak danych historycznych
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
              Budżet rozpoczyna się od{" "}
              <strong style={{ color: "#10b981" }}>{floor}</strong>.
              Panel poduszki finansowej zacznie pokazywać analizę kosztów,
              dochodów i deficytów po zakończeniu pierwszego pełnego miesiąca
              budżetowego.
            </div>
            <div style={{
              marginTop: 24, padding: "10px 14px",
              background: "#0d1424", border: "1px solid #1e293b",
              borderRadius: 8, fontSize: 12, color: "#64748b",
              maxWidth: 520, margin: "24px auto 0",
            }}>
              💡 Możesz już teraz przygotować portfel aktywów — gdy ruszy
              analiza, te dane będą od razu uwzględnione w wyliczeniach.
            </div>
          </div>
        </Card>

        {/* Even without history, the user can still manage assets ahead of time */}
        <Card title="🪙 Portfel aktywów (Twoja poduszka)" style={{ marginTop: 16 }}>
          <AssetsPortfolio
            assets={snState.assets}
            onChange={setAssets}
          />
        </Card>
      </div>
    );
  }

  // ── Branch 2: Loading skeleton (have history, awaiting fetch) ──
  if (isLoading && transactions.length === 0) {
    return (
      <div style={{ padding: "0 0 40px 0", maxWidth: 1200 }}>
        <div style={{ marginBottom: 20, marginTop: 8 }}>
          <div style={(s as any).sectionTitle}>🛡️ Poduszka finansowa</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Ładowanie danych z ostatnich {snState.lookbackMonths} miesięcy…
          </div>
        </div>

        <SkeletonCard title height={140} style={{ marginBottom: 16 }} />

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <SkeletonKpiCard style={{ flex: 1 }} />
          <SkeletonKpiCard style={{ flex: 1 }} />
          <SkeletonKpiCard style={{ flex: 1 }} />
        </div>

        <SkeletonCard title style={{ marginBottom: 16 }}>
          <SkeletonListRow columns={5} count={4} />
        </SkeletonCard>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <SkeletonCard title style={{ minHeight: 200 }}>
            <SkeletonListRow columns={3} count={3} />
          </SkeletonCard>
          <SkeletonCard title style={{ minHeight: 200 }}>
            <SkeletonChart height={140} legend={false} />
          </SkeletonCard>
        </div>
      </div>
    );
  }

  // ── Branch 3: Full panel with data ──
  return (
    <div style={{ padding: "0 0 60px 0", maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={(s as any).sectionTitle}>🛡️ Poduszka finansowa</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {fromMonth} → {toMonth} · {windowMonths.length}-miesięczna baza ·
          horyzont przetrwania: {snState.horizonMonths} mies. · obecne aktywa:{" "}
          <strong style={{ color: "#10b981" }}>{fmt(assetsTotal)}</strong>
        </div>

        {fxRefreshNote && (
          <div style={{
            marginTop: 8, padding: "6px 10px",
            background: "#10b98111", border: "1px solid #10b98144",
            borderRadius: 6, fontSize: 11, color: "#10b981",
          }}>
            {fxRefreshNote}
          </div>
        )}

        {windowClamped && (
          <div style={{
            marginTop: 8, padding: "6px 10px",
            background: "#3b82f611", border: "1px solid #3b82f644",
            borderRadius: 6, fontSize: 11, color: "#60a5fa",
          }}>
            ℹ️ Okno historyczne przycięte do {fromMonth} (budżet zaczyna się od {floor}).
            Średnie liczone z {windowMonths.length} {windowMonths.length === 1 ? "miesiąca" : "miesięcy"}.
          </div>
        )}

        {insufficientHistory && (
          <div style={{
            marginTop: 8, padding: "6px 10px",
            background: "#f59e0b11", border: "1px solid #f59e0b44",
            borderRadius: 6, fontSize: 11, color: "#f59e0b",
          }}>
            ⚠️ Masz tylko {monthsWithData} {monthsWithData === 1 ? "miesiąc" : "miesięcy"} historii
            w wybranym oknie ({windowMonths.length} mies.). Średnie mogą być zaniżone —
            rozważ krótsze okno historyczne.
          </div>
        )}
      </div>

      {/* Controls */}
      <Card style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{
              fontSize: 11, color: "#475569", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: 8,
            }}>
              Baza historyczna
            </div>
            <PillGroup
              value={snState.lookbackMonths}
              onChange={setLookback}
              options={LOOKBACK_OPTIONS}
            />
            <div style={{ fontSize: 10, color: "#475569", marginTop: 6, lineHeight: 1.5 }}>
              Krótsze okna lepiej oddają obecne koszty po zmianach (np. przeprowadzka),
              dłuższe łapią roczne ubezpieczenia i wyprawki.
            </div>
          </div>

          <div>
            <div style={{
              fontSize: 11, color: "#475569", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: 8,
            }}>
              Horyzont przetrwania
            </div>
            <PillGroup
              value={snState.horizonMonths}
              onChange={setHorizon}
              options={HORIZON_OPTIONS}
            />
            <div style={{ fontSize: 10, color: "#475569", marginTop: 6, lineHeight: 1.5 }}>
              Na ile miesięcy ma starczyć poduszka, gdy zrealizuje się scenariusz utraty wybranych dochodów.
            </div>
          </div>
        </div>
      </Card>

      {/* Row 1: cost layers + income toggles */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        marginBottom: 16,
      }} data-sn-row>
        <Card title="🧮 4 warstwy kosztów (Survival → No Change)">
          <CostLayersCard layers={layers} highlightLevel={selectedLevel} />
        </Card>

        <Card title="💰 Symulator utraty dochodu">
          <IncomeSourcesToggle
            sources={incomeSources}
            excludedKeys={snState.excludedIncomeKeys}
            onChange={setExcluded}
            lookbackMonths={effectiveMonths}
          />
        </Card>
      </div>

      {/* Row 2: deficit table */}
      <Card title="📊 Deficyt, target i runway" style={{ marginBottom: 16 }}>
        <DeficitTable
          deficits={deficits}
          horizonMonths={snState.horizonMonths}
          selectedLevel={selectedLevel}
          onSelectLevel={setSelectedLevel}
        />
        <div style={{
          fontSize: 11, color: "#475569", marginTop: 10,
          padding: "8px 10px", background: "#0d1424",
          border: "1px solid #1e293b", borderRadius: 8, lineHeight: 1.6,
        }}>
          💡 Kliknij wiersz, aby ustawić poziom jako cel asystenta poniżej. Aktywnie wybrany poziom:{" "}
          <strong style={{ color: "#e2e8f0" }}>P1–P{selectedLevel}</strong>{" "}
          <span style={{ color: "#334155" }}>(tylko w bieżącej sesji — nie zapisywane)</span>.
        </div>
      </Card>

      {/* Row 2b: upcoming planned expenses in horizon */}
      <div style={{ marginBottom: 16 }}>
        <UpcomingPlannedCard
          upcoming={upcomingPlanned}
          selectedLevel={selectedLevel}
          horizonMonths={snState.horizonMonths}
          enabled={includePlannedEnabled}
          onToggle={setIncludePlanned}
        />
      </div>

      {/* Row 3: assets portfolio */}
      <Card title="🪙 Portfel aktywów (Twoja poduszka)" style={{ marginBottom: 16 }}>
        <AssetsPortfolio
          assets={snState.assets}
          onChange={setAssets}
        />
      </Card>

      {/* Row 4: saving assistant */}
      <Card title="🚀 Asystent odkładania">
        <SavingAssistant
          deficits={deficits}
          selectedLevel={selectedLevel}
          horizonMonths={snState.horizonMonths}
          assetsTotal={assetsTotal}
          capability={capability}
        />
      </Card>

      <style>{`
        @media (max-width: 900px) {
          [data-sn-row] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Pure helpers ─────────────────────────────────────────────

function stripSelected(full: SafetyNetSettings): PersistedSafetyNet {
  const { selectedLevel: _ignored, ...rest } = full;
  return rest;
}

// ── Mobile detection ────────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX,
  );
  useEffect(() => {
    function handle() { setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX); }
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return isMobile;
}

function MobileBlocker() {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🖥️</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>
        Panel poduszki finansowej dostępny tylko na desktopie
      </div>
      <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
        Ten panel zawiera złożone tabele i wykresy zaprojektowane pod większy ekran.
        Otwórz aplikację na komputerze lub tablecie, aby z niego skorzystać.
      </div>
    </div>
  );
}

// ── FX rate refresher ───────────────────────────────────────

interface FxUpdate {
  id:             string;
  newAmount:      number;     // PLN
  newRate:        number;
  effectiveDate:  string;
}

async function refreshAssetRates(
  assets: AssetBucket[],
  today:  string,
): Promise<FxUpdate[]> {
  const updates: FxUpdate[] = [];

  // Group by currency so we hit NBP once per currency, not per asset
  const byCurrency = new Map<string, AssetBucket[]>();
  for (const a of assets) {
    if (!a.originalCurrency) continue;
    const list = byCurrency.get(a.originalCurrency) ?? [];
    list.push(a);
    byCurrency.set(a.originalCurrency, list);
  }

  for (const [currency, group] of byCurrency) {
    try {
      const rate = await fetchNbpRateInline(currency, today);
      if (!rate) continue;
      for (const a of group) {
        const orig = Number(a.originalAmount) || 0;
        updates.push({
          id:            a.id,
          newAmount:     orig * rate.rate,
          newRate:       rate.rate,
          effectiveDate: rate.effectiveDate,
        });
      }
    } catch {
      // Per-currency failure → skip those, keep others
    }
  }

  return updates;
}

// Minimal inline NBP fetcher mirroring useCurrencyConverter's logic.
async function fetchNbpRateInline(
  currency: string,
  date: string,
): Promise<{ rate: number; effectiveDate: string } | null> {
  const LOOKBACK_DAYS = 14;
  const end = date;
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);
  const start = startDate.toISOString().slice(0, 10);

  for (const table of ["a", "b"]) {
    const url = `https://api.nbp.pl/api/exchangerates/rates/${table}/${currency}/${start}/${end}/?format=json`;
    try {
      const res = await fetch(url);
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const latest = json.rates[json.rates.length - 1];
      return { rate: latest.mid, effectiveDate: latest.effectiveDate };
    } catch {
      // try next table
    }
  }
  return null;
}
