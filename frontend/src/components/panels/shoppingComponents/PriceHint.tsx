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
// SPLIT IN TWO on purpose. The chip belongs in the item's meta line, but
// that line lives inside the name block, which on a phone is squeezed to
// about sixty pixels by the checkbox and four buttons beside it. The
// panel therefore has to be rendered BELOW the row, where the editor
// already sits, and the row owns the open/closed state for both halves.
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
 * everywhere in the app. null when the receipt printed no size.
 */
function describeSize(o: PriceObservation): string | null {
  if (!o.z || !o.zu) return null;
  const unit = o.zu as SizeUnit;
  const size = formatSize(o.z, unit);
  // One piece at a price already IS the unit price — repeating it adds
  // nothing. Anything measured, or a pack of several, gets the per-unit.
  if (unit === "szt" && o.z <= 1) return size;
  const perUnit = computeUnitPrice(o.a, o.z, unit);
  return perUnit != null ? `${size} · ${money(perUnit)} ${unitPriceLabel(unit)}` : size;
}

// ── The chip, inside the item's meta line ────────────────────

export function PriceChip({ price, observations, seen, open, onToggle }: PriceChipProps) {
  // The cheapest shelf price is the whole reason someone walks round two
  // shops writing prices down, so it gets a place on the collapsed chip.
  const cheapestSeen = useMemo(
    () => seen.reduce<SeenPrice | null>((best, o) => (!best || o.a < best.a ? o : best), null),
    [seen],
  );

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

  return (
      <span
        onClick={e => { e.stopPropagation(); onToggle(); }}
        title="Pokaż, z czego wyszła ta cena"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          color: c.textTertiary, cursor: "pointer", whiteSpace: "nowrap",
          padding: "1px 7px", borderRadius: 20,
          background: open ? alpha(c.success, "18") : "transparent",
          border: `1px solid ${open ? alpha(c.success, "55") : "transparent"}`,
        }}
      >
        {price ? "💰" : "👀"}
        {price && (price.median != null
          ? <>zwykle <strong style={{ color: c.successLight }}>{money(price.median)}{suffix(price.unit)}</strong></>
          : <>ost. <strong style={{ color: c.successLight }}>{money(price.last)}{suffix(price.unit)}</strong></>)}
        {price && sizeInfo.common && <span style={{ color: c.textSecondary }}> / {sizeInfo.common}</span>}
        {/* The last price only earns its own slot when it differs from the
            typical one — otherwise it is the same number twice. */}
        {price?.median != null && price.last !== price.median && (
          <> · ost. {money(price.last)}</>
        )}
        {/* The cheapest shelf price, which is what walking round two shops
            with a phone was for. Neutral colour, never green: it is not a
            price anyone has paid. */}
        {cheapestSeen && (
          <span
            // The star, not the condition itself: "64,99 przy zakupie 2 w
            // Biedronce" does not fit a chip, but a bare 64,99 would be a
            // promise the shelf does not keep.
            title={cheapestSeen.n
              ? `${money(cheapestSeen.a)} zł w ${cheapestSeen.s} — ${cheapestSeen.n}`
              : `${money(cheapestSeen.a)} zł w ${cheapestSeen.s}`}
            style={{ color: c.infoLight, fontWeight: 600 }}
          >
            {price ? " · " : ""}widziane od {money(cheapestSeen.a)} zł
            {cheapestSeen.n && <span style={{ color: c.warningLight }}>*</span>}
          </span>
        )}
        {/* Only next to a MEDIAN: a single last price is one purchase of one
            package, so there is nothing mixed about it. */}
        {sizeInfo.mixed && price?.median != null && (
          <span
            title="Mediana liczona z opakowań różnej wielkości — rozwiń, żeby zobaczyć gramatury"
            style={{ color: c.warningLight, fontWeight: 600 }}
          >
            {" · ⚠️ różne gramatury"}
          </span>
        )}
        <span style={{ color: c.textMuted }}>{open ? "▴" : "▾"}</span>
      </span>
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
                  <span style={{ color: c.text, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>
                    {money(o.a)} zł
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{
                      display: "block", color: c.textBody, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      🏪 {o.s}
                    </span>
                    {/* The condition, in the same cell as the shop: a
                        promotional price without it is a trap. */}
                    {o.n && (
                      <span style={{
                        display: "block", marginTop: 1, fontSize: 11, color: c.warningLight,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
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
