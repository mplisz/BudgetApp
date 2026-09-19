// ============================================================
// File: src/components/panels/shoppingComponents/PriceHint.tsx
// "zwykle 12,99 zł · ost. 6,99" under a shopping-list item.
//
// The two numbers answer different questions and both are needed at the
// shelf: the median says whether the price in front of you is normal,
// the last one says whether you caught a promotion recently. An average
// would have blurred the two into one misleading figure.
//
// Tapping opens what the figure was built from — price, shop, date, and
// a ✕ per purchase. That exists because receipt matching is right about
// nine times in ten, and the tenth shows up as an absurd number; one tap
// removes it. The panel is deliberately NOT styled like the meta line it
// opens from: it is the one place on this screen where you read numbers
// and decide something, so it gets real type sizes and a table's shape.
//
// SPLIT IN TWO on purpose: the summary box (two lines, receipts and
// shelf) sits under the item's name, the breakdown opens below it, and
// the row owns the open/closed state for both halves. The summary used to
// be a single no-wrap chip in the meta line, which on a phone was squeezed
// between the checkbox and four buttons and spilled underneath them; it
// is now a box of its own that wraps.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo } from "react";
import { formatSize, computeUnitPrice, unitPriceLabel, type SizeUnit } from "../../../utils/productPricing";
import type { PriceSummary, PriceObservation, SeenPrice } from "../../../hooks/useShoppingList";

interface PriceChipProps {
  price:        PriceSummary | null | undefined;
  observations: PriceObservation[];
  seen:         SeenPrice[];
  open:         boolean;
  onToggle:     () => void;
}

interface PricePanelProps {
  price:        PriceSummary | null | undefined;
  observations: PriceObservation[];
  onForget:     (observationId: string) => void;
  seen:         SeenPrice[];
  onForgetSeen: (observationId: string) => void;
}

/** Observations that belong to the summarized unit — mixing zł/kg with
 *  zł/szt in one list would be comparing different things. */
function keptFor(price: PriceSummary | null | undefined, observations: PriceObservation[]) {
  return price ? observations.filter(o => o.u === price.unit) : [];
}

/** True when there is nothing at all to show for this product. */
export function hasPriceInfo(price: PriceSummary | null | undefined, seen: SeenPrice[]): boolean {
  return !!price || seen.length > 0;
}

const money  = (n: number) => n.toFixed(2).replace(".", ",");
const suffix = (unit: string) => (unit === "kg" ? " zł/kg" : " zł");

/** "12.09" — day and month is all the context a price needs here. */
function shortDate(iso: string): string {
  const [, m, d] = (iso || "").split("-");
  return m && d ? `${d}.${m}` : iso;
}

/**
 * "280 g · 13,89 zł/kg" — what the price bought, and that price made
 * comparable across package sizes. Reuses the formatting the "Ceny
 * produktów" analytics already has, so a kilo is written the same way
 * everywhere in the app. null when no size is known. Serves receipt and
 * shelf prices alike — both store the size as `z` / `zu`.
 */
function describeSize(o: { a: number; z?: number; zu?: string }): string | null {
  if (!o.z || !o.zu) return null;
  const unit = o.zu as SizeUnit;
  const size = formatSize(o.z, unit);
  // One piece at a price already IS the unit price — repeating it adds
  // nothing. Anything measured, or a pack of several, gets the per-unit.
  if (unit === "szt" && o.z <= 1) return size;
  const perUnit = computeUnitPrice(o.a, o.z, unit);
  return perUnit != null ? `${size} · ${money(perUnit)} ${unitPriceLabel(unit)}` : size;
}

/**
 * The shelf price worth showing when collapsed. Per kilogram (litre,
 * piece) when EVERY offer has a size in the same unit — 5,49 zł for
 * 250 g beats 4,49 zł for 200 g. Once one offer lacks a size, or units
 * differ, there is no common measure and the plain amount decides.
 * Mirrors cheapestSeen in backend/utils/shoppingPrices.js.
 */
export function cheapestSeen(seen: SeenPrice[]): SeenPrice | null {
  if (seen.length === 0) return null;
  const perUnit = (o: SeenPrice) => (o.z && o.zu ? o.a / o.z : null);
  const units = new Set(seen.map(o => (perUnit(o) != null ? o.zu : null)));
  const byUnit = units.size === 1 && !units.has(null);
  const cost = (o: SeenPrice) => (byUnit ? perUnit(o)! : o.a);
  return seen.reduce((best, o) => (cost(o) < cost(best) ? o : best), seen[0]);
}

// ── The summary box, under the item's name ───────────────────

export function PriceChip({ price, observations, seen, open, onToggle }: PriceChipProps) {
  // The cheapest shelf price is the whole reason someone walks round two
  // shops writing prices down, so it gets its own line when collapsed.
  const cheapest = useMemo(() => cheapestSeen(seen), [seen]);

  const kept = useMemo(() => keptFor(price, observations), [price, observations]);

  // What the sized purchases say about the package:
  //   one size  → name it on the chip, "zwykle 5,20 zł / 280 g"
  //   several   → warn, because a median over 200 g and 300 g butter
  //               describes neither
  //
  // Warning rather than recomputing per kilogram was a measured choice:
  // over the family's receipts 9 of 27 medians mix sizes, but only 3 of
  // those have enough sized purchases for a per-kg median (sizes are
  // known for a third of lines, and nothing raises that). Detecting the
  // mix needs just two, so the warning reaches all nine.
  const sizeInfo = useMemo(() => {
    const sized = kept.filter(o => o.z && o.zu);
    const distinct = new Set(sized.map(o => `${o.z}|${o.zu}`));
    if (distinct.size === 1) {
      return { common: formatSize(sized[0].z!, sized[0].zu as SizeUnit), mixed: false };
    }
    return { common: null, mixed: distinct.size >= 2 };
  }, [kept]);

  // A product nobody has bought yet can still have shelf prices noted
  // against it — that is the point of noting them.
  if (!hasPriceInfo(price, seen)) return null;

  const cheapestSize = cheapest ? describeSize(cheapest) : null;
  const arrow = <span style={{ color: c.textMuted, flexShrink: 0, marginLeft: 8 }}>{open ? "▴" : "▾"}</span>;

  return (
    <div
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title="Pokaż, z czego wyszła ta cena"
      role="button"
      aria-expanded={open}
      style={{
        marginTop: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
        background: c.bgDeepest,
        border: `1px solid ${open ? alpha(c.success, "55") : c.border}`,
        fontSize: 12, lineHeight: 1.55, color: c.textTertiary,
      }}
    >
      {price && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span>
            💰 {price.median != null
              ? <>zwykle <strong style={{ color: c.successLight }}>{money(price.median)}{suffix(price.unit)}</strong></>
              : <>ost. <strong style={{ color: c.successLight }}>{money(price.last)}{suffix(price.unit)}</strong></>}
            {sizeInfo.common && <> / {sizeInfo.common}</>}
            {/* The last price only earns its own slot when it differs from
                the typical one — otherwise it is the same number twice. */}
            {price.median != null && price.last !== price.median && <> · ost. {money(price.last)}</>}
            {/* Only next to a MEDIAN: a single last price is one purchase
                of one package, so there is nothing mixed about it. */}
            {sizeInfo.mixed && price.median != null && (
              <span
                title="Mediana liczona z opakowań różnej wielkości — rozwiń, żeby zobaczyć gramatury"
                style={{ color: c.warningLight, fontWeight: 600 }}
              >
                {" · ⚠️ różne gramatury"}
              </span>
            )}
          </span>
          {arrow}
        </div>
      )}

      {/* The cheapest shelf price, which is what walking round two shops
          with a phone was for — with the package and the shop, because
          "5,49" alone does not say whether that is a bargain. Neutral
          colour for the amount, never green: nobody has paid it. The rest
          of the shelf prices open with the breakdown. */}
      {cheapest && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span
            // The star, not the comment itself: it does not fit a summary
            // line, but a bare 64,99 could be a promise the shelf does not
            // keep. The comment is in the tooltip and in the breakdown.
            title={cheapest.n
              ? `${money(cheapest.a)} zł w ${cheapest.s} — ${cheapest.n}`
              : `${money(cheapest.a)} zł w ${cheapest.s}`}
          >
            👀 widziane od <strong style={{ color: c.infoLight }}>{money(cheapest.a)} zł</strong>
            {cheapestSize && <> / {cheapestSize}</>}
            {" · "}{cheapest.s}
            {cheapest.n && <span style={{ color: c.warningLight, fontWeight: 700 }}>*</span>}
            {seen.length > 1 && <span style={{ color: c.textMuted }}> (+{seen.length - 1})</span>}
          </span>
          {!price && arrow}
        </div>
      )}
    </div>
  );
}

// ── The breakdown, rendered below the row at full width ──────

export function PricePanel({ price, observations, onForget, seen, onForgetSeen }: PricePanelProps) {
  const kept = useMemo(() => keptFor(price, observations), [price, observations]);

  if (!hasPriceInfo(price, seen)) return null;

  return (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            marginTop: 10,
            background: c.bgDeepest, border: `1px solid ${c.borderStrong}`,
            borderRadius: 10, overflow: "hidden",
            fontSize: 13,
          }}
        >
          {price && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "8px 12px", borderBottom: `1px solid ${c.border}`,
            }}>
              <span style={{ color: c.textSecondary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Zakupy z ostatnich 90 dni
              </span>
              <span style={{ color: c.textMuted, fontSize: 11 }}>
                {price.count} {price.count === 1 ? "zakup" : price.count < 5 ? "zakupy" : "zakupów"}
              </span>
            </div>
          )}

          {kept.map((o, idx) => {
            const sizeText = describeSize(o);
            return (
            <div
              key={o.i}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                alignItems: "center", columnGap: 12,
                padding: "8px 12px",
                borderTop: idx === 0 ? "none" : `1px solid ${alpha(c.border, "88")}`,
              }}
            >
              {/* Price and what it bought stacked in one cell: on a phone
                  a fifth column would squeeze the shop name to nothing. */}
              <span style={{ whiteSpace: "nowrap" }}>
                <span style={{ display: "block", color: c.text, fontWeight: 800, fontSize: 15 }}>
                  {money(o.a)}{suffix(o.u)}
                </span>
                <span style={{ display: "block", color: sizeText ? c.textTertiary : c.textFaint, fontSize: 11, marginTop: 1 }}>
                  {sizeText ?? "gramatura nieznana"}
                </span>
              </span>
              {/* Shop over the receipt line itself. The line is the part that
                  answers "what is this median actually made of" — Warka in
                  one shop, Harnaś in another — so it gets the full width of
                  the column rather than a tooltip. The transaction id sits in
                  the tooltip: it is for tracing in the database, not reading. */}
              <span
                title={o.x ? `Transakcja: ${o.x}` : undefined}
                style={{ minWidth: 0 }}
              >
                <span style={{
                  display: "block",
                  color: o.s ? c.textBody : c.textFaint, fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {o.s ? `🏪 ${o.s}` : "sklep nieznany"}
                </span>
                <span style={{
                  display: "block", marginTop: 1,
                  color: o.t ? c.infoLight : c.textFaint, fontSize: 11,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {o.t ? `„${o.t}”` : "opis z paragonu nieznany"}
                </span>
              </span>
              <span style={{ color: c.textMuted, whiteSpace: "nowrap" }}>{shortDate(o.d)}</span>
              <button
                type="button"
                onClick={() => onForget(o.i)}
                title="To nie był ten produkt — usuń z wyliczenia"
                aria-label="Usuń tę cenę z wyliczenia"
                style={{
                  background: "transparent", border: `1px solid ${alpha(c.danger, "66")}`,
                  color: c.dangerLight, borderRadius: 8, cursor: "pointer",
                  // A real thumb target: this is the one control here that
                  // changes data, and it gets used in a shop.
                  width: 32, height: 32, fontSize: 14, lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            );
          })}

          {price && price.median == null && (
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${c.border}`, color: c.textMuted, fontSize: 11 }}>
              „Zwykle" pojawi się od 3 zakupów — do tego czasu tylko ostatnia cena.
            </div>
          )}

          {/* Shelf prices, kept visually apart from what was actually paid:
              one per shop, hand-typed, and never part of any median. */}
          {seen.length > 0 && (
            <>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                padding: "8px 12px", borderTop: `1px solid ${c.border}`,
                background: alpha(c.info, "12"),
              }}>
                <span style={{ color: c.infoLight, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  👀 Widziane na półce
                </span>
                <span style={{ color: c.textMuted, fontSize: 11 }}>nie wlicza się do mediany</span>
              </div>

              {seen.map(o => (
                <div
                  key={o.i}
                  style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto auto",
                    alignItems: "center", columnGap: 12,
                    padding: "8px 12px", borderTop: `1px solid ${alpha(c.border, "88")}`,
                  }}
                >
                  {/* Price over what it bought, the same stack as a
                      receipt row above — so 200 g and 250 g compare at a
                      glance by the zł/kg underneath. */}
                  <span style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "block", color: c.text, fontWeight: 800, fontSize: 15 }}>
                      {money(o.a)} zł
                    </span>
                    {describeSize(o) && (
                      <span style={{ display: "block", color: c.textTertiary, fontSize: 11, marginTop: 1 }}>
                        {describeSize(o)}
                      </span>
                    )}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{
                      display: "block", color: c.textBody, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      🏪 {o.s}
                    </span>
                    {/* The comment, in the same cell as the shop and in
                        full: it is often the condition the price needs.
                        Neutral colour — it is not always a warning. */}
                    {o.n && (
                      <span style={{ display: "block", marginTop: 1, fontSize: 11, color: c.textTertiary }}>
                        {o.n}
                      </span>
                    )}
                  </span>
                  <span style={{ color: c.textMuted, whiteSpace: "nowrap" }}>{shortDate(o.d)}</span>
                  <button
                    type="button"
                    onClick={() => onForgetSeen(o.i)}
                    title="Usuń zanotowaną cenę"
                    aria-label="Usuń zanotowaną cenę"
                    style={{
                      background: "transparent", border: `1px solid ${alpha(c.danger, "66")}`,
                      color: c.dangerLight, borderRadius: 8, cursor: "pointer",
                      width: 32, height: 32, fontSize: 14, lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
  );
}
