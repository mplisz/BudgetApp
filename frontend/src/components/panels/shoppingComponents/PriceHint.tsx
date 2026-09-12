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
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useMemo } from "react";
import { formatSize, computeUnitPrice, unitPriceLabel, type SizeUnit } from "../../../utils/productPricing";
import type { PriceSummary, PriceObservation } from "../../../hooks/useShoppingList";

interface PriceHintProps {
  price:        PriceSummary | null | undefined;
  observations: PriceObservation[];
  onForget:     (observationId: string) => void;
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

export function PriceHint({ price, observations, onForget }: PriceHintProps) {
  const [open, setOpen] = useState(false);

  const kept = useMemo(
    () => (price ? observations.filter(o => o.u === price.unit) : []),
    [price, observations],
  );

  // When every sized purchase was the SAME package, say so on the
  // collapsed chip too — "zwykle 5,20 zł / 280 g" answers "za ile?"
  // without a tap. Mixed sizes get nothing here: naming one of them
  // would misdescribe a median built from several.
  const commonSize = useMemo(() => {
    const sized = kept.filter(o => o.z && o.zu);
    if (sized.length === 0) return null;
    const first = sized[0];
    const same = sized.every(o => o.z === first.z && o.zu === first.zu);
    return same ? formatSize(first.z!, first.zu as SizeUnit) : null;
  }, [kept]);

  if (!price) return null;

  return (
    <>
      <span
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title="Pokaż, z czego wyszła ta cena"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          color: c.textTertiary, cursor: "pointer", whiteSpace: "nowrap",
          padding: "1px 7px", borderRadius: 20,
          background: open ? alpha(c.success, "18") : "transparent",
          border: `1px solid ${open ? alpha(c.success, "55") : "transparent"}`,
        }}
      >
        💰
        {price.median != null
          ? <>zwykle <strong style={{ color: c.successLight }}>{money(price.median)}{suffix(price.unit)}</strong></>
          : <>ost. <strong style={{ color: c.successLight }}>{money(price.last)}{suffix(price.unit)}</strong></>}
        {commonSize && <span style={{ color: c.textSecondary }}> / {commonSize}</span>}
        {/* The last price only earns its own slot when it differs from the
            typical one — otherwise it is the same number twice. */}
        {price.median != null && price.last !== price.median && (
          <> · ost. {money(price.last)}</>
        )}
        <span style={{ color: c.textMuted }}>{open ? "▴" : "▾"}</span>
      </span>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            flexBasis: "100%", marginTop: 8,
            background: c.bgDeepest, border: `1px solid ${c.borderStrong}`,
            borderRadius: 10, overflow: "hidden",
            // Reset the meta line's 11px — this panel is read, not glanced at.
            fontSize: 13,
          }}
        >
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

          {price.median == null && (
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${c.border}`, color: c.textMuted, fontSize: 11 }}>
              „Zwykle" pojawi się od 3 zakupów — do tego czasu tylko ostatnia cena.
            </div>
          )}
        </div>
      )}
    </>
  );
}
