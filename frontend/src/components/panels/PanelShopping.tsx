// ============================================================
// File: src/components/panels/PanelShopping.tsx
// Panel "Lista zakupów" — the permanent list you tick off in the shop.
//
// No month, by design: a shopping list is not a budget period. It sits
// under "Narzędzia" next to the other month-independent tools.
//
// Deliberately NO separate "Dodaj" panel (unlike every other module
// here): adding milk has to cost one tap, and a full-screen form is the
// exact friction that makes people go back to a paper list. Both ways
// in — the frequency pills and the sticky field — live on this screen.
// ============================================================

import { c } from "../../styles/tokens";
import { useEffect, useMemo, useRef, useState } from "react";
import { theme as s } from "../../styles/theme";
import { fmt, plural } from "../../utils/helpers";
import { useShoppingList, type CatalogEntry, type ShoppingItem } from "../../hooks/useShoppingList";
import { sectionMeta, sectionOrder, DEFAULT_SECTION } from "../../data/constants/shoppingSections";
import { FrequentPills } from "./shoppingComponents/FrequentPills";
import { QuickAddBar }   from "./shoppingComponents/QuickAddBar";
import { ShoppingRow }   from "./shoppingComponents/ShoppingRow";
import { SkeletonListRow } from "../ui/Skeleton";
import { CollapsibleSection } from "../ui";
import { StatTile } from "../ui/StatTile";

export default function PanelShopping() {
  const {
    items, catalog, isLoading, hasLoaded,
    load, addItem, patchItem, markBought, markMissed, reopenItem, removeItem,
    forgetSuggestion, forgetPrice,
  } = useShoppingList();

  const [historyOpen, setHistoryOpen] = useState(false);
  // Ticking an item off makes its row leave the list, which reads as
  // "it got deleted" the first time it happens. So the history section
  // opens itself on the first tick of a session — ONCE, via a ref rather
  // than on every tick, otherwise it would fight anyone who collapses it
  // while working through a full trolley.
  const historyRevealed = useRef(false);

  useEffect(() => { load(); }, [load]);

  // Open items first — the ones the shop was out of sink to the bottom of
  // the open block rather than out of sight, because we still want them.
  const { open, missed, history } = useMemo(() => {
    const openItems = items.filter(i => i.status === "open" && !i.missedAt);
    const missedItems = items.filter(i => i.status === "open" && !!i.missedAt);
    const resolved = items
      .filter(i => i.status !== "open")
      .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
    return { open: openItems, missed: missedItems, history: resolved };
  }, [items]);

  // Group the open items by shop section, in shop-route order — the point
  // of the whole thing: one pass through the shop instead of a lap per
  // item. Items missed last time keep their own block below; that flag is
  // about attention, not about which aisle to walk to.
  const sections = useMemo(() => {
    const bySection = new Map<string, ShoppingItem[]>();
    for (const item of open) {
      const id = item.section || DEFAULT_SECTION;
      const bucket = bySection.get(id);
      if (bucket) bucket.push(item);
      else bySection.set(id, [item]);
    }
    return [...bySection.entries()]
      .sort((a, b) => sectionOrder(a[0]) - sectionOrder(b[0]))
      .map(([id, list]) => ({ id, meta: sectionMeta(id), items: list }));
  }, [open]);

  // A single section is not a route, it is a list with a redundant
  // heading — so the headings only appear once there is something to
  // navigate between.
  const showSectionHeadings = sections.length > 1;

  const openKeys = useMemo(
    () => new Set(items.filter(i => i.status === "open").map(i => i.key)),
    [items],
  );

  const toBuy = open.length + missed.length;

  function handlePillAdd(entry: CatalogEntry) {
    addItem({ name: entry.name, unit: entry.unit });
  }

  async function handleBought(id: string) {
    await markBought(id);
    if (!historyRevealed.current) {
      historyRevealed.current = true;
      setHistoryOpen(true);
    }
  }

  const rowHandlers = {
    onBought: handleBought,
    onMissed: markMissed,
    onReopen: reopenItem,
    onRemove: removeItem,
    onQty:    (id: string, qty: number) => { patchItem(id, { qty }); },
    // One PATCH for both fields: they are edited together in one little
    // form, and the server teaches the catalog when the section changed.
    onDetails: (id: string, details: { note: string; section: string }) => {
      patchItem(id, details);
    },
    onForgetPrice: forgetPrice,
  };

  // Prices live on the catalog, not on the item — the catalog is what
  // survives an item being ticked off and expiring a week later.
  const catalogByKey = useMemo(
    () => new Map(catalog.map(e => [e.key, e])),
    [catalog],
  );

  // What this trip will cost, answered BEFORE leaving the house — which
  // is the one thing the rest of this app, all of it built around what
  // already happened, cannot do.
  //
  // Only per-item prices are summed. A product bought by weight has a
  // price per kilo, and multiplying that by "2" (two onions) would be
  // arithmetic with no meaning, so those are left out and counted as
  // unpriced. `median ?? last` because one recorded purchase is still a
  // better guess than pretending we know nothing.
  const estimate = useMemo(() => {
    let total = 0, priced = 0;
    for (const item of [...open, ...missed]) {
      const price = catalogByKey.get(item.key)?.price;
      if (!price || price.unit !== "szt") continue;
      total += (price.median ?? price.last) * item.qty;
      priced++;
    }
    return { total, priced };
  }, [open, missed, catalogByKey]);

  const showSkeleton = isLoading && !hasLoaded;

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>🧺 Lista zakupów</div>
        {(showSkeleton || toBuy === 0) && (
          <div style={s.sectionSub}>
            {showSkeleton ? "Ładowanie…" : "Nic do kupienia — dopisz coś poniżej albo tapnij w częsty produkt."}
          </div>
        )}
      </div>

      {/* The two headline numbers as tiles, not a grey sentence. What the
          trip will cost is the most useful figure on this screen and was
          reading like a footnote. Both tiles always render once there is
          anything to buy, so the layout does not jump the moment the first
          price arrives. */}
      {!showSkeleton && toBuy > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <StatTile
            label="Do kupienia"
            value={`${toBuy} ${plural(toBuy, "pozycja", "pozycje", "pozycji")}`}
            sub={missed.length > 0 ? `${missed.length} niedostępne ostatnio` : undefined}
          />
          <StatTile
            label="Szacunkowo"
            value={estimate.priced > 0 ? `≈ ${fmt(estimate.total)}` : "—"}
            color={estimate.priced > 0 ? c.successLight : c.textMuted}
            sub={
              estimate.priced === 0
                ? "brak cen z paragonów"
                : estimate.priced < toBuy
                  ? `wycenione ${estimate.priced} z ${toBuy}`
                  : "wszystkie pozycje wycenione"
            }
          />
        </div>
      )}

      {showSkeleton && (
        <div style={s.card}>
          <SkeletonListRow columns={2} count={6} height={44} />
        </div>
      )}

      {!showSkeleton && (
        <>
          <FrequentPills
            catalog={catalog}
            openKeys={openKeys}
            onAdd={handlePillAdd}
            onForget={forgetSuggestion}
            openCount={toBuy}
          />

          {toBuy === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: c.borderStrong }}>
              Lista jest pusta. Skończyło się coś? Dopisz od razu.
            </div>
          )}

          {/* Each aisle folds away once it is done with — the same shared
              CollapsibleSection as the pills above and the Settings
              cards, stripped of its card chrome so the rows stay the only
              boxes on screen. Open by default: a collapsed aisle you did
              not collapse yourself is a shopping list that hides things.
              Keyed by section id so the open/closed state follows the
              aisle rather than its position in the list. */}
          {sections.map(section => (
            showSectionHeadings ? (
              <CollapsibleSection
                key={section.id}
                title={
                  <span style={{ fontSize: 11, letterSpacing: "0.7px" }}>
                    {section.meta.icon} {section.meta.label}
                    <span style={{ color: c.textMuted, fontWeight: 400 }}> · {section.items.length}</span>
                  </span>
                }
                style={{
                  background: "transparent", border: "none", borderRadius: 0,
                  padding: 0, marginTop: 0, marginBottom: 14,
                }}
              >
                {section.items.map(item => <ShoppingRow key={item.id} item={item} catalogEntry={catalogByKey.get(item.key)} {...rowHandlers} />)}
              </CollapsibleSection>
            ) : (
              <div key={section.id}>
                {section.items.map(item => <ShoppingRow key={item.id} item={item} catalogEntry={catalogByKey.get(item.key)} {...rowHandlers} />)}
              </div>
            )
          ))}

          {missed.length > 0 && (
            <>
              <div style={{
                fontSize: 11, color: c.warningLight, textTransform: "uppercase",
                letterSpacing: "0.7px", fontWeight: 700, margin: "18px 0 8px",
              }}>
                Nie było ostatnio ({missed.length})
              </div>
              {missed.map(item => <ShoppingRow key={item.id} item={item} catalogEntry={catalogByKey.get(item.key)} {...rowHandlers} />)}
            </>
          )}

          {history.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div
                onClick={() => setHistoryOpen(o => !o)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  fontSize: 12, color: c.textSecondary, fontWeight: 600, padding: "8px 0",
                }}
              >
                <span>{historyOpen ? "▼" : "▶"}</span>
                Ostatnio kupione ({history.length})
                {/* Mirrors RESOLVED_TTL_SECONDS in backend/routes/shopping.js. */}
                <span style={{ color: c.textMuted, fontWeight: 400 }}>
                  · znika po 7 dniach
                </span>
              </div>
              {historyOpen && history.map(item => (
                <ShoppingRow key={item.id} item={item} catalogEntry={catalogByKey.get(item.key)} {...rowHandlers} />
              ))}
            </div>
          )}

          <QuickAddBar
            catalog={catalog}
            onAdd={(name, unit, note) => { addItem({ name, unit, note }); }}
          />
        </>
      )}
    </div>
  );
}
