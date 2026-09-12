// ============================================================
// File: src/components/panels/shoppingComponents/PriceHint.tsx
// "zwykle 12,99 zł · ost. 6,99" under a shopping-list item.
//
// The two numbers answer different questions and both are needed at the
// shelf: the median says whether the price in front of you is normal,
// the last one says whether you caught a promotion recently. An average
// would have blurred the two into one misleading figure.
//
// Tapping opens what the figure was built from. That exists because
// receipt matching is right about nine times in ten, and the tenth shows
// up as an absurd number — one tap removes it, which is cheaper than
// chasing the matcher's last ten percent and keeps the whole feature
// trustworthy.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import type { PriceSummary, PriceObservation } from "../../../hooks/useShoppingList";

interface PriceHintProps {
  price:        PriceSummary | null | undefined;
  observations: PriceObservation[];
  onForget:     (observationId: string) => void;
}

const money = (n: number) => n.toFixed(2).replace(".", ",");
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
        title="Z czego to wyszło"
        style={{ color: c.textTertiary, cursor: "pointer", whiteSpace: "nowrap" }}
      >
        {price.median != null
          ? <>zwykle <strong style={{ color: c.textBody }}>{money(price.median)}{suffix(price.unit)}</strong></>
          : <>ost. <strong style={{ color: c.textBody }}>{money(price.last)}{suffix(price.unit)}</strong></>}
        {/* The last price is only worth its own slot when it differs from
            the typical one — otherwise it is the same number twice. */}
        {price.median != null && price.last !== price.median && (
          <> · ost. {money(price.last)}</>
        )}
      </span>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            flexBasis: "100%", marginTop: 6, padding: "6px 8px",
            background: c.bgDeepest, border: `1px solid ${c.border}`, borderRadius: 8,
          }}
        >
          {kept.map(o => (
            <div key={o.i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <span style={{ color: c.textBody, minWidth: 76 }}>{money(o.a)}{suffix(o.u)}</span>
              <span style={{ color: c.textMuted, flex: 1 }}>{shortDate(o.d)}</span>
              <button
                type="button"
                onClick={() => onForget(o.i)}
                title="To nie był ten produkt — usuń z wyliczenia"
                style={{
                  background: "transparent", border: `1px solid ${alpha(c.danger, "55")}`,
                  color: c.dangerLight, borderRadius: 6, cursor: "pointer",
                  fontSize: 11, lineHeight: 1, padding: "3px 7px",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ color: c.textFaint, marginTop: 4 }}>
            z {price.count} {price.count === 1 ? "zakupu" : "zakupów"}, ostatnie 90 dni
          </div>
        </div>
      )}
    </>
  );
}
