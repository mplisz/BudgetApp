// ============================================================
// File: src/components/panels/safetyNetComponents/AssetsPortfolio.tsx
// Asset buckets management — total in base currency (PLN).
//
// FX handling (reuses the project's existing pipeline):
//   - CurrencyRateField for picker + auto NBP rate (same as TransactionForm,
//     PlannedForm, RecurringForm)
//   - useCurrencyManager for base currency awareness
//   - Standard handleRateReady / rateInfo pattern
//
// Storage model:
//   - `amount` is ALWAYS in base currency (PLN). All sums, pies, totals
//     compute against it — no FX math anywhere outside the editor.
//   - When the user enters a foreign-currency value, we capture the
//     conversion details in originalAmount/originalCurrency/fxRate/fxRateDate
//     for display and re-edit. They're optional.
//
// Deletion:
//   - Soft delete only — sets isArchived + archivedAt. Archived buckets are
//     hidden by default but can be revealed and restored from a collapsible
//     "Archiwum" section. Avoids accidental loss of "Konto PKO 50 000 zł".
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo, useState, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmt } from "../../../utils/helpers";
import { Card, EmptyState } from "../../ui/summaryUi";
import { CurrencyRateField } from "../../ui/CurrencyRateField";
import { useCurrencyManager } from "../../../hooks/useCurrencyManager";
import { toYMD, todayLocal } from "../../ui/AppDatePicker";
import { LIQUIDITY_META } from "./types";
import type { AssetBucket, LiquidityLevel } from "./types";
import { PillGroup } from "./uiBits";

interface AssetsPortfolioProps {
  assets:    AssetBucket[];
  onChange:  (assets: AssetBucket[]) => void;
}

// ── Public component ─────────────────────────────────────────

export function AssetsPortfolio({ assets, onChange }: AssetsPortfolioProps) {
  // Which bucket is being edited inline (null = none, "new" = add form open).
  const [editingId, setEditingId] = useState<string | null>("new");
  const [showArchive, setShowArchive] = useState(false);

  // Split into active vs archived. Everything visible to the user defaults
  // to "active"; archived ones live behind a toggle.
  const activeAssets   = useMemo(() => assets.filter(a => !a.isArchived), [assets]);
  const archivedAssets = useMemo(() => assets.filter(a =>  a.isArchived), [assets]);

  // ── Mutations ────────────────────────────────────────────

  const handleSave = useCallback((draft: AssetDraft, editId: string | null) => {
    const baseAmount = draft.amountBase;
    if (!Number.isFinite(baseAmount) || baseAmount < 0) return;

    const isForeign = !!draft.originalCurrency
      && draft.originalCurrency !== draft.baseCode
      && Number(draft.originalAmount) > 0;

    const bucket: AssetBucket = {
      id:        editId && editId !== "new" ? editId : `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label:     draft.label.trim(),
      amount:    Math.round(baseAmount * 100) / 100,
      liquidity: draft.liquidity,
      ...(isForeign ? {
        originalAmount:   Math.round(Number(draft.originalAmount) * 100) / 100,
        originalCurrency: draft.originalCurrency,
        fxRate:           draft.fxRate,
        fxRateDate:       draft.fxRateDate,
      } : {}),
    };

    if (editId && editId !== "new") {
      // Preserve archive metadata when editing
      onChange(assets.map(a => a.id === editId
        ? { ...bucket, isArchived: a.isArchived, archivedAt: a.archivedAt }
        : a));
    } else {
      onChange([...assets, bucket]);
    }
    setEditingId("new");   // collapse to the empty "add" form
  }, [assets, onChange]);

  // Soft delete — preserves the bucket so the user can restore it
  const archiveAsset = useCallback((id: string) => {
    onChange(assets.map(a => a.id === id
      ? { ...a, isArchived: true, archivedAt: new Date().toISOString() }
      : a));
    if (editingId === id) setEditingId("new");
  }, [assets, onChange, editingId]);

  const restoreAsset = useCallback((id: string) => {
    onChange(assets.map(a => a.id === id
      ? { ...a, isArchived: false, archivedAt: undefined }
      : a));
  }, [assets, onChange]);

  // ── Derived ──────────────────────────────────────────────

  const total = useMemo(
    () => activeAssets.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [activeAssets],
  );

  const byLiquidity = useMemo(() => {
    const map: Record<LiquidityLevel, number> = { instant: 0, fast: 0, slow: 0 };
    for (const a of activeAssets) map[a.liquidity] += Number(a.amount) || 0;
    return map;
  }, [activeAssets]);

  const slowPct = total > 0 ? (byLiquidity.slow / total) * 100 : 0;
  const liquidityWarning = total > 0 && slowPct > 50;

  // ── Render ───────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Add new asset (or edit existing) */}
      <AssetEditor
        key={editingId ?? "new"}
        initial={editingId && editingId !== "new"
          ? activeAssets.find(a => a.id === editingId) ?? null
          : null}
        onSave={(draft) => handleSave(draft, editingId)}
        onCancel={() => setEditingId("new")}
        mode={editingId && editingId !== "new" ? "edit" : "add"}
      />

      {/* Body: pie + list  */}
      {activeAssets.length === 0 ? (
        <EmptyState
          icon="🪙"
          message="Dodaj koszyki aktywów (gotówka, ROR, lokaty, obligacje, waluty), aby zobaczyć aktualny stan poduszki."
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Left: pie + totals */}
          <Card style={{ padding: 14 }}>
            <AssetsPieChart assets={activeAssets} total={total} />
            <div style={{
              marginTop: 10, paddingTop: 10,
              borderTop: `1px solid ${c.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
            }}>
              <span style={{ color: c.textTertiary, fontSize: 12, fontWeight: 600 }}>
                Aktualny stan poduszki
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: c.success }}>
                {fmt(total)}
              </span>
            </div>
          </Card>

          {/* Right: bucket list */}
          <Card style={{ padding: 14 }}>
            <div style={{
              fontSize: 11, color: c.textMuted, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: 8,
            }}>
              Koszyki ({activeAssets.length})
            </div>
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              maxHeight: 320, overflowY: "auto",
            }}>
              {activeAssets.map(a => (
                <AssetRow
                  key={a.id}
                  asset={a}
                  total={total}
                  isEditing={editingId === a.id}
                  onEdit={() => setEditingId(editingId === a.id ? "new" : a.id)}
                  onArchive={() => archiveAsset(a.id)}
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeAssets.length > 0 && (
        <LiquiditySummary
          byLiquidity={byLiquidity}
          total={total}
          warning={liquidityWarning}
          slowPct={slowPct}
        />
      )}

      {/* Archive — collapsible, hidden by default */}
      {archivedAssets.length > 0 && (
        <ArchiveSection
          assets={archivedAssets}
          expanded={showArchive}
          onToggle={() => setShowArchive(v => !v)}
          onRestore={restoreAsset}
        />
      )}
    </div>
  );
}

// ── AssetEditor — add / edit form with FX support ───────────

interface AssetDraft {
  label:            string;
  liquidity:        LiquidityLevel;
  amountBase:       number;       // computed value in base currency
  originalAmount:   number;       // amount as entered, in originalCurrency (0 if base)
  originalCurrency: string;       // e.g. "USD" or base
  fxRate:           number;       // 1 for base
  fxRateDate:       string;       // YYYY-MM-DD
  baseCode:         string;       // e.g. "PLN"
}

interface AssetEditorProps {
  initial:  AssetBucket | null;
  mode:     "add" | "edit";
  onSave:   (draft: AssetDraft) => void;
  onCancel: () => void;
}

function AssetEditor({ initial, mode, onSave, onCancel }: AssetEditorProps) {
  const { baseCurrency } = useCurrencyManager();
  const baseCode = baseCurrency.code;

  const initialCurrency =
    initial?.originalCurrency && initial.originalCurrency !== baseCode
      ? initial.originalCurrency
      : baseCode;

  const [label, setLabel] = useState(initial?.label ?? "");
  const [liquidity, setLiquidity] = useState<LiquidityLevel>(initial?.liquidity ?? "instant");

  const [currency, setCurrency] = useState<string>(initialCurrency);
  const [customCurrency, setCustomCurrency] = useState<string>("");

  const [amountInput, setAmountInput] = useState<string>(
    initial?.originalAmount != null
      ? String(initial.originalAmount)
      : initial?.amount != null
        ? String(initial.amount)
        : ""
  );

  const [rateInfo, setRateInfo] = useState<{ activeRate: number; resolvedCurrency: string }>({
    activeRate:       1,
    resolvedCurrency: baseCode,
  });
  const lastRateRef = useRef<string | null>(null);

  const handleRateReady = useCallback(({ activeRate, resolvedCurrency }: { activeRate: number; resolvedCurrency: string }) => {
    const key = `${resolvedCurrency}_${activeRate}`;
    if (lastRateRef.current === key) return;
    lastRateRef.current = key;
    setRateInfo({ activeRate, resolvedCurrency });
  }, []);

  const todayYMD = useMemo(() => toYMD(todayLocal()), []);

  const amountNum = parseFloat(String(amountInput).replace(",", ".")) || 0;
  const isForeign = rateInfo.resolvedCurrency && rateInfo.resolvedCurrency !== baseCode;
  const amountBase = isForeign && rateInfo.activeRate
    ? Math.round(amountNum * rateInfo.activeRate * 100) / 100
    : Math.round(amountNum * 100) / 100;

  const canSave = label.trim().length > 0
    && amountNum > 0
    && (!isForeign || (rateInfo.activeRate && rateInfo.activeRate > 0));

  function handleSubmit() {
    if (!canSave) return;
    onSave({
      label,
      liquidity,
      amountBase,
      originalAmount:   isForeign ? amountNum : 0,
      originalCurrency: rateInfo.resolvedCurrency || baseCode,
      fxRate:           isForeign ? rateInfo.activeRate : 1,
      fxRateDate:       todayYMD,
      baseCode,
    });
    if (mode === "add") {
      setLabel("");
      setAmountInput("");
      setCurrency(baseCode);
      setCustomCurrency("");
      setLiquidity("instant");
    }
  }

  return (
    <div style={{
      padding: 14,
      background: c.surface,
      border: `1px solid ${mode === "edit" ? alpha(c.info, "44") : c.border}`,
      borderRadius: 10,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, color: c.textMuted, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.5px",
        marginBottom: 12,
      }}>
        <span>{mode === "edit" ? "✎ Edycja koszyka" : "＋ Nowy koszyk"}</span>
        {mode === "edit" && (
          <button type="button" onClick={onCancel} style={btnGhost(false)}>
            Anuluj
          </button>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1.4fr",
        gap: 10,
        marginBottom: 10,
      }}>
        <div>
          <label style={lblStyle}>Nazwa koszyka</label>
          <input
            type="text"
            placeholder="np. Konto oszczędnościowe ING"
            value={label}
            maxLength={80}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canSave) handleSubmit(); }}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={lblStyle}>Płynność</label>
          <PillGroup<LiquidityLevel>
            value={liquidity}
            onChange={setLiquidity}
            options={[
              { value: "instant", label: "⚡ Płynne",  color: LIQUIDITY_META.instant.color },
              { value: "fast",    label: "⏳ Szybkie", color: LIQUIDITY_META.fast.color    },
              { value: "slow",    label: "🐢 Wolne",   color: LIQUIDITY_META.slow.color    },
            ]}
            size="sm"
          />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={lblStyle}>
          Kwota w wybranej walucie
          {isForeign && (
            <span style={{ color: c.textMuted, fontWeight: 400, marginLeft: 6, textTransform: "none" }}>
              · zostanie przeliczona po kursie NBP
            </span>
          )}
        </label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="np. 100"
          value={amountInput}
          onChange={e => setAmountInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canSave) handleSubmit(); }}
          style={{ ...inputStyle, textAlign: "right", fontSize: 15 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <CurrencyRateField
          currency={currency}
          customCurrency={customCurrency}
          date={todayYMD}
          onCurrencyChange={setCurrency}
          onCustomChange={setCustomCurrency}
          onRateReady={handleRateReady}
        />
      </div>

      {isForeign && amountNum > 0 && (
        <div style={{
          marginBottom: 12,
          padding: "8px 12px",
          background: alpha(c.success, "11"),
          border: `1px solid ${alpha(c.success, "33")}`,
          borderRadius: 8,
          fontSize: 12, color: c.success,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>
            {amountNum.toLocaleString("pl-PL")} {rateInfo.resolvedCurrency}
            {" × "}
            {rateInfo.activeRate ? rateInfo.activeRate.toFixed(4) : "—"}
          </span>
          <strong style={{ fontSize: 14 }}>= {fmt(amountBase)}</strong>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSave}
          style={{
            background: c.success, color: c.white, border: "none",
            borderRadius: 8, padding: "8px 18px",
            fontWeight: 700, fontSize: 13,
            cursor: canSave ? "pointer" : "not-allowed",
            opacity: canSave ? 1 : 0.4,
          }}
        >
          {mode === "edit" ? "✓ Zapisz zmiany" : "＋ Dodaj koszyk"}
        </button>
      </div>
    </div>
  );
}

// ── Pie chart ────────────────────────────────────────────────

interface AssetsPieChartProps {
  assets: AssetBucket[];
  total:  number;
}

function AssetsPieChart({ assets, total }: AssetsPieChartProps) {
  const data = assets.map(a => ({
    name:  a.label,
    value: a.amount,
    color: LIQUIDITY_META[a.liquidity].color,
  }));

  if (total <= 0) {
    return <EmptyState message="Sumaryczna wartość = 0." padding={10} />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          cx="50%" cy="50%"
          outerRadius={80}
          innerRadius={42}
          stroke={c.surface}
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8 }}
          formatter={(v: unknown) => {
              const num = typeof v === "number" ? v : Number(v) || 0;
              return [`${fmt(num)} (${((num / total) * 100).toFixed(1)}%)`, "Wartość"];
            }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(value: string) => <span style={{ color: c.textBody }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Single asset row ─────────────────────────────────────────

interface AssetRowProps {
  asset:     AssetBucket;
  total:     number;
  isEditing: boolean;
  onEdit:    () => void;
  onArchive: () => void;
}

function AssetRow({ asset, total, isEditing, onEdit, onArchive }: AssetRowProps) {
  const meta = LIQUIDITY_META[asset.liquidity];
  const pct  = total > 0 ? (asset.amount / total) * 100 : 0;
  const hasFx = !!asset.originalCurrency
    && !!asset.originalAmount
    && asset.fxRate
    && asset.fxRate !== 1;

  // Visual hint: stale FX rate (> 7 days old)
  const fxIsStale = hasFx && asset.fxRateDate
    && (Date.now() - new Date(asset.fxRateDate).getTime() > 7 * 24 * 60 * 60 * 1000);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto auto auto",
      gap: 8, alignItems: "center",
      padding: "8px 10px",
      background: isEditing ? "#0a1a2e" : c.bgDeepest,
      border: `1px solid ${isEditing ? alpha(c.info, "77") : meta.color + "33"}`,
      borderRadius: 8,
    }}>
      <span style={{
        width: 8, height: 28, borderRadius: 2, background: meta.color,
      }} />

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: c.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {asset.label}
        </div>
        <div style={{
          fontSize: 10, color: c.textMuted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {meta.label} · {pct.toFixed(1)}% poduszki
          {hasFx && (
            <span style={{ color: fxIsStale ? c.warning : c.textTertiary, marginLeft: 6 }}>
              · {asset.originalAmount} {asset.originalCurrency}
              {" @ "}
              {asset.fxRate?.toFixed(4)}
              {fxIsStale && " ⚠"}
            </span>
          )}
        </div>
      </div>

      <div style={{
        fontSize: 13, fontWeight: 800, color: c.text,
        textAlign: "right", minWidth: 80,
      }}>
        {fmt(asset.amount)}
      </div>

      <button
        type="button"
        onClick={onEdit}
        title={isEditing ? "Zwiń edytor" : "Edytuj koszyk"}
        style={{
          background: isEditing ? alpha(c.info, "22") : "transparent",
          border: `1px solid ${isEditing ? alpha(c.info, "77") : c.border}`,
          color: isEditing ? c.info : c.textTertiary,
          borderRadius: 6,
          width: 26, height: 26,
          cursor: "pointer", fontSize: 12,
        }}
      >
        ✎
      </button>

      <button
        type="button"
        onClick={onArchive}
        title="Archiwizuj (można przywrócić)"
        style={{
          background: "transparent",
          border: `1px solid ${c.border}`,
          color: c.textSecondary, borderRadius: 6,
          width: 26, height: 26,
          cursor: "pointer", fontSize: 12,
        }}
      >
        🗄
      </button>
    </div>
  );
}

// ── Archive section ──────────────────────────────────────────

interface ArchiveSectionProps {
  assets:     AssetBucket[];
  expanded:   boolean;
  onToggle:   () => void;
  onRestore:  (id: string) => void;
}

function ArchiveSection({ assets, expanded, onToggle, onRestore }: ArchiveSectionProps) {
  const total = assets.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  return (
    <Card style={{ padding: 14 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          width: "100%",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: 0,
        }}
      >
        <span style={{
          fontSize: 11, color: c.textMuted, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          🗄 Archiwum ({assets.length}) · {fmt(total)}
        </span>
        <span style={{ color: c.textMuted, fontSize: 11 }}>
          {expanded ? "− Zwiń" : "+ Rozwiń"}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {assets.map(a => {
            const meta = LIQUIDITY_META[a.liquidity];
            return (
              <div key={a.id} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: 8, alignItems: "center",
                padding: "8px 10px",
                background: c.bgDeepest,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                opacity: 0.7,
              }}>
                <span style={{
                  width: 8, height: 24, borderRadius: 2, background: meta.color, opacity: 0.5,
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: c.textTertiary,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.label}
                  </div>
                  {a.archivedAt && (
                    <div style={{ fontSize: 10, color: c.textMuted }}>
                      Zarchiwizowano: {a.archivedAt.slice(0, 10)}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: c.textTertiary,
                  textAlign: "right", minWidth: 80,
                }}>
                  {fmt(a.amount)}
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(a.id)}
                  title="Przywróć koszyk"
                  style={{
                    background: "transparent",
                    border: `1px solid ${alpha(c.success, "44")}`,
                    color: c.success, borderRadius: 6,
                    padding: "4px 10px",
                    cursor: "pointer", fontSize: 11, fontWeight: 600,
                  }}
                >
                  ↩ Przywróć
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Liquidity summary ───────────────────────────────────────

interface LiquiditySummaryProps {
  byLiquidity: Record<LiquidityLevel, number>;
  total:       number;
  warning:     boolean;
  slowPct:     number;
}

function LiquiditySummary({
  byLiquidity, total, warning, slowPct,
}: LiquiditySummaryProps) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{
        fontSize: 11, color: c.textMuted, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.5px",
        marginBottom: 10,
      }}>
        Płynność poduszki
      </div>

      <div style={{
        display: "flex", height: 10,
        background: c.surface, borderRadius: 99, overflow: "hidden",
        border: `1px solid ${c.border}`,
      }}>
        {(["instant", "fast", "slow"] as LiquidityLevel[]).map(lvl => {
          const pct = total > 0 ? (byLiquidity[lvl] / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={lvl}
              title={`${LIQUIDITY_META[lvl].label}: ${fmt(byLiquidity[lvl])} (${pct.toFixed(1)}%)`}
              style={{
                width: `${pct}%`, background: LIQUIDITY_META[lvl].color,
              }}
            />
          );
        })}
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 8, fontSize: 11, color: c.textTertiary,
      }}>
        {(["instant", "fast", "slow"] as LiquidityLevel[]).map(lvl => {
          const pct = total > 0 ? (byLiquidity[lvl] / total) * 100 : 0;
          return (
            <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: 2,
                background: LIQUIDITY_META[lvl].color,
              }} />
              {LIQUIDITY_META[lvl].label}: <strong style={{ color: c.text }}>{fmt(byLiquidity[lvl])}</strong>{" "}
              ({pct.toFixed(0)}%)
            </span>
          );
        })}
      </div>

      {warning && (
        <div style={{
          marginTop: 10,
          padding: "8px 12px",
          background: alpha(c.danger, "11"),
          border: `1px solid ${alpha(c.danger, "44")}`,
          borderRadius: 8,
          fontSize: 12, color: c.dangerSoft, lineHeight: 1.5,
        }}>
          ⚠️ <strong>{slowPct.toFixed(0)}%</strong> Twojej poduszki jest w trudno dostępnych aktywach.
          W razie nagłej awarii lub utraty dochodu wyciągnięcie tych środków może zająć tygodnie,
          a sprzedaż w niewłaściwym momencie może wiązać się ze stratą. Rozważ przeniesienie
          części do natychmiastowo dostępnej formy.
        </div>
      )}
    </Card>
  );
}

// ── Local styles / helpers ───────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: 8,
  color: c.text,
  padding: "9px 12px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const lblStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: c.textSecondary,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 6,
};

function btnGhost(disabled: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    background: "transparent",
    border: `1px solid ${c.border}`,
    color: disabled ? c.borderStrong : c.textTertiary,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    textTransform: "none",
    letterSpacing: 0,
  };
}
