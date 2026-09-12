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
import { useState } from "react";
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

export function PriceHint({ price, observations, onForget }: PriceHintProps) {
  const [open, setOpen] = useState(false);
  if (!price) return null;

  const kept = observations.filter(o => o.u === price.unit);

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

          {kept.map((o, idx) => (
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
              <span style={{ color: c.text, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>
                {money(o.a)}{suffix(o.u)}
              </span>
              <span style={{
                color: o.s ? c.textBody : c.textFaint, fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {o.s ? `🏪 ${o.s}` : "sklep nieznany"}
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
          ))}

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
