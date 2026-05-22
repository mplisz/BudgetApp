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
  AssetBucket, PriorityLevel, SafetyNetSettings, SnTransaction,
} from "./safetyNetComponents/types";

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
  const { setSettings }                         = useAppContext() as { setSettings: (v: AppSettings) => void };
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
  // Mutates assets in place with today's rate, but only when the cached
  // rate is older than today (avoids needless writes on quick re-entries).
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

    // Dynamic import → only loaded when needed, doesn't bloat first paint
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
    }).catch(err => {
      console.warn("[SafetyNet] FX refresh failed:", err);
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

  // ── Load transactions for the lookback window ─────────────

  const windowMonths = useMemo(() => lastNMonths(snState.lookbackMonths), [snState.lookbackMonths]);
  const fromMonth    = windowMonths[0];
  const toMonth      = windowMonths[windowMonths.length - 1];

  useEffect(() => {
    if (fromMonth && toMonth) loadRange(fromMonth, toMonth);
  }, [fromMonth, toMonth, loadRange]);

  // Load planned expenses once (used for cushion target adjustment)
  useEffect(() => {
    loadAllPlanned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived computations ──────────────────────────────────

  const txInWindow = useMemo(
    // RangeTransaction is a loose superset of SnTransaction (same key fields,
    // looser typing). Go via `unknown` so TS accepts the narrowing.
    () => (transactions as unknown as SnTransaction[]).filter(tx => isInWindow(tx, windowMonths)),
    [transactions, windowMonths],
  );

  // Detect insufficient history — warn the user if they have less than
  // lookbackMonths of data. Average would otherwise be artificially low.
  const monthsWithData = useMemo(() => {
    const months = new Set<string>();
    for (const tx of txInWindow) months.add(tx.budgetMonth);
    return months.size;
  }, [txInWindow]);
  const insufficientHistory = hydrated
    && txInWindow.length > 0
    && monthsWithData < snState.lookbackMonths;

  const layers = useMemo(
    () => computeCostLayers(txInWindow, snState.lookbackMonths),
    [txInWindow, snState.lookbackMonths],
  );

  const incomeSources = useMemo(
    () => computeIncomeSources(txInWindow, snState.lookbackMonths),
    [txInWindow, snState.lookbackMonths],
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
  // Always computed (so the UpcomingPlannedCard can show the list even when
  // toggled off), but only fed into deficits if the toggle is on.
  const upcomingPlanned = useMemo(
    () => computeUpcomingPlanned(planned, snState.horizonMonths),
    [planned, snState.horizonMonths],
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
    () => computeSavingCapability(txInWindow, snState.lookbackMonths),
    [txInWindow, snState.lookbackMonths],
  );

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 60px 0", maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={(s as any).sectionTitle}>🛡️ Poduszka finansowa</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {fromMonth} → {toMonth} · {snState.lookbackMonths}-miesięczna baza ·
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

        {insufficientHistory && (
          <div style={{
            marginTop: 8, padding: "6px 10px",
            background: "#f59e0b11", border: "1px solid #f59e0b44",
            borderRadius: 6, fontSize: 11, color: "#f59e0b",
          }}>
            ⚠️ Masz tylko {monthsWithData} {monthsWithData === 1 ? "miesiąc" : "miesięcy"} historii
            w wybranym oknie ({snState.lookbackMonths} mies.). Średnie mogą być zaniżone —
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

      {isLoading && !hydrated && (
        <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {(!isLoading || hydrated) && (
        <>
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
                lookbackMonths={snState.lookbackMonths}
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
        </>
      )}

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
//
// Lazy-loads useCurrencyConverter's underlying fetch routine. We don't call
// the hook itself (hooks can't be called from effects), so we re-export the
// pure fetch from the hook module (or duplicate the same NBP call here).
//
// To keep this isolated, we use the cached module-level fetchNbpRate from
// the hook by dynamic-importing it. If it isn't exported, we fall back to a
// minimal inline NBP call.

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
    } catch (err) {
      // Per-currency failure → skip those, keep others
      console.warn(`[SafetyNet] NBP fetch failed for ${currency}:`, err);
    }
  }

  return updates;
}

// Minimal inline NBP fetcher mirroring useCurrencyConverter's logic.
// Same 14-day lookback, same table A then B fallback.
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
