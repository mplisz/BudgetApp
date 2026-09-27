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
//
// THREE TABS, by when the thing is needed (data/constants/shoppingHorizons):
//   Na już        — the list walked in the shop, grouped by aisle
//   Na termin     — fresh food for a given day, grouped by day; each item
//                   moves to "Na już" the day before (utils/shoppingDue)
//   Rozglądam się — no hurry, waiting for a better price
// Always three: days are foldable groups inside "Na termin", never tabs
// of their own — a tab per day would not fit a phone's width.
// ============================================================

import { c } from "../../styles/tokens";
import { useEffect, useMemo, useRef, useState } from "react";
import { theme as s } from "../../styles/theme";
import { fmt, plural, todayYMD } from "../../utils/helpers";
import { useShoppingList, type CatalogEntry, type ShoppingItem } from "../../hooks/useShoppingList";
import { sectionMeta, sectionOrder, DEFAULT_SECTION } from "../../data/constants/shoppingSections";
import { SHOPPING_HORIZONS, HORIZON_IDS, DEFAULT_HORIZON, type HorizonId } from "../../data/constants/shoppingHorizons";
import { tabOf, dayLabel, dueLabel } from "../../utils/shoppingDue";
import { FrequentPills } from "./shoppingComponents/FrequentPills";
import { QuickAddBar }   from "./shoppingComponents/QuickAddBar";
import { ShoppingRow }   from "./shoppingComponents/ShoppingRow";
import { ListGroup }     from "./shoppingComponents/ListGroup";
import { SkeletonListRow } from "../ui/Skeleton";
import { SegmentedTabs } from "../ui/SegmentedTabs";
import { StatTile } from "../ui/StatTile";

interface Group {
  id:    string;
  items: ShoppingItem[];
}

/** Items bucketed by `keyOf`, the buckets in `orderOf` order. */
function groupItems(items: ShoppingItem[], keyOf: (i: ShoppingItem) => string, orderOf: (id: string) => number | string): Group[] {
  const byKey = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const id = keyOf(item);
    const bucket = byKey.get(id);
    if (bucket) bucket.push(item);
    else byKey.set(id, [item]);
  }
  return [...byKey.entries()]
    .sort((a, b) => {
      const oa = orderOf(a[0]), ob = orderOf(b[0]);
      return oa < ob ? -1 : oa > ob ? 1 : 0;
    })
    .map(([id, list]) => ({ id, items: list }));
}

const sectionOf  = (i: ShoppingItem) => i.section || DEFAULT_SECTION;
const byAisle    = (a: ShoppingItem, b: ShoppingItem) => sectionOrder(sectionOf(a)) - sectionOrder(sectionOf(b));

// What a set of items will cost, answered BEFORE leaving the house —
// which is the one thing the rest of this app, all of it built around
// what already happened, cannot do.
//
// Only per-item prices are summed. A product bought by weight has a
// price per kilo, and multiplying that by "2" (two onions) would be
// arithmetic with no meaning, so those are left out and counted as
// unpriced. `median ?? last` because one recorded purchase is still a
// better guess than pretending we know nothing.
function estimate(items: ShoppingItem[], catalogByKey: Map<string, CatalogEntry>) {
  let total = 0, priced = 0;
  for (const item of items) {
    const price = catalogByKey.get(item.key)?.price;
    if (!price || price.unit !== "szt") continue;
    total += (price.median ?? price.last) * item.qty;
    priced++;
  }
  return { total, priced };
}

export default function PanelShopping() {
  const {
    items, catalog, isLoading, hasLoaded,
    load, addItem, patchItem, markBought, markMissed, reopenItem, setWhen, removeItem,
    forgetSuggestion, forgetPrice, addSeenPrice, forgetSeenPrice,
    setPhoto, removePhoto,
  } = useShoppingList();

  // Always opens on "Na już" — that is the list you open in a shop.
  const [tab, setTab] = useState<HorizonId>(DEFAULT_HORIZON);
  // One clock for the whole panel, so a row and its group never disagree
  // about which day it is.
  const today = todayYMD();

  const [historyOpen, setHistoryOpen] = useState(false);
  // Ticking an item off makes its row leave the list, which reads as
  // "it got deleted" the first time it happens. So the history section
  // opens itself on the first tick of a session — ONCE, via a ref rather
  // than on every tick, otherwise it would fight anyone who collapses it
  // while working through a full trolley.
  const historyRevealed = useRef(false);

  useEffect(() => { load(); }, [load]);

  // "Nie było" is a note about one shop visit, not a change of aisle or
  // tab, so a missed item stays exactly where it was.
  const { byTab, history } = useMemo(() => {
    const buckets = Object.fromEntries(HORIZON_IDS.map(id => [id, [] as ShoppingItem[]])) as Record<HorizonId, ShoppingItem[]>;
    for (const item of items) if (item.status === "open") buckets[tabOf(item, today)].push(item);
    const resolved = items
      .filter(i => i.status !== "open")
      .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
    return { byTab: buckets, history: resolved };
  }, [items, today]);

  // Na już — by aisle, in shop-route order: one pass through the shop
  // instead of a lap per item.
  const aisles = useMemo(() => groupItems(byTab.now, sectionOf, sectionOrder), [byTab.now]);
  // A single aisle is not a route, it is a list with a redundant heading
  // — so the headings only appear once there is something to navigate.
  const showAisleHeadings = aisles.length > 1;

  // Na termin — by day, nearest first; by aisle within a day.
  const days = useMemo(
    () => groupItems(byTab.date, i => i.needBy ?? "", id => id)
      .map(g => ({ ...g, items: [...g.items].sort(byAisle) })),
    [byTab.date],
  );

  // Rozglądam się — longest waiting first: that is the one most likely
  // to run out before the good price turns up.
  const watching = useMemo(
    () => [...byTab.watch].sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
    [byTab.watch],
  );

  const openKeys = useMemo(
    () => new Set(items.filter(i => i.status === "open").map(i => i.key)),
    [items],
  );
  const openCount = openKeys.size;

  // Prices live on the catalog, not on the item — the catalog is what
  // survives an item being ticked off and expiring a week later.
  const catalogByKey = useMemo(
    () => new Map(catalog.map(e => [e.key, e])),
    [catalog],
  );

  const tabItems  = byTab[tab];
  const toBuy     = tabItems.length;
  const missed    = tabItems.filter(i => !!i.missedAt).length;
  const tripCost  = useMemo(() => estimate(tabItems, catalogByKey), [tabItems, catalogByKey]);

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

  function showTab(id: HorizonId) {
    setTab(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    onSeenPrice: addSeenPrice,
    onForgetSeenPrice: forgetSeenPrice,
    onPhoto: setPhoto,
    onRemovePhoto: removePhoto,
    onWhen: setWhen,
    today,
  };

  const row = (item: ShoppingItem, sectionsShown = false) => (
    <ShoppingRow key={item.id} item={item} catalogEntry={catalogByKey.get(item.key)} sectionsShown={sectionsShown} {...rowHandlers} />
  );

  const showSkeleton = isLoading && !hasLoaded;

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      <div style={{ marginBottom: 12, marginTop: 8 }}>
        <div style={s.sectionTitle}>🧺 Lista zakupów</div>
        {showSkeleton && <div style={s.sectionSub}>Ładowanie…</div>}
      </div>

      {!showSkeleton && (
        <SegmentedTabs
          ariaLabel="Kiedy kupić"
          options={HORIZON_IDS.map(id => ({
            id,
            label: SHOPPING_HORIZONS[id].label,
            sub:   `${SHOPPING_HORIZONS[id].icon} ${byTab[id].length}`,
          }))}
          value={tab}
          onChange={showTab}
          style={{ marginBottom: 14 }}
        />
      )}

      {/* The two headline numbers for the open tab. Both tiles always
          render once there is anything to buy, so the layout does not
          jump the moment the first price arrives. */}
      {!showSkeleton && toBuy > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <StatTile
            label="Do kupienia"
            value={`${toBuy} ${plural(toBuy, "pozycja", "pozycje", "pozycji")}`}
            sub={missed > 0 ? `${missed} niedostępne ostatnio` : undefined}
          />
          <StatTile
            label="Szacunkowo"
            value={tripCost.priced > 0 ? `≈ ${fmt(tripCost.total)}` : "—"}
            color={tripCost.priced > 0 ? c.successLight : c.textMuted}
            sub={
              tripCost.priced === 0
                ? "brak cen z paragonów"
                : tripCost.priced < toBuy
                  ? `wycenione ${tripCost.priced} z ${toBuy}`
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
          {tab === "now" && (
            <FrequentPills
              catalog={catalog}
              openKeys={openKeys}
              onAdd={handlePillAdd}
              onForget={forgetSuggestion}
              openCount={openCount}
            />
          )}

          {toBuy === 0 && (
            <div style={{ textAlign: "center", padding: "32px 12px", color: c.textMuted, fontSize: 13, lineHeight: 1.5 }}>
              {SHOPPING_HORIZONS[tab].empty}
            </div>
          )}

          {/* Every tab stays mounted, only hidden: the groups folded and
              the editors opened in one tab are still as they were after a
              look at another. */}
          <div hidden={tab !== "now"}>
            {aisles.map(g => showAisleHeadings ? (
              <ListGroup key={g.id} icon={sectionMeta(g.id).icon} label={sectionMeta(g.id).label} count={g.items.length}>
                {g.items.map(i => row(i, true))}
              </ListGroup>
            ) : (
              <div key={g.id}>{g.items.map(i => row(i))}</div>
            ))}

            {/* On the way through the shop, the "rozglądam się" things are
                worth a glance too — the shop you are in may be the cheap
                one. One line, not the items themselves. */}
            {byTab.watch.length > 0 && (
              <button
                type="button"
                onClick={() => showTab("watch")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  background: "transparent", border: `1px dashed ${c.borderStrong}`, borderRadius: 12,
                  padding: "12px 14px", marginTop: 4, cursor: "pointer",
                  color: c.textTertiary, fontSize: 13, fontWeight: 600, textAlign: "left",
                }}
              >
                <span>{SHOPPING_HORIZONS.watch.icon}</span>
                <span style={{ flex: 1 }}>Przy okazji: {byTab.watch.length} do rozejrzenia się</span>
                <span style={{ color: c.textMuted }}>›</span>
              </button>
            )}
          </div>

          <div hidden={tab !== "date"}>
            {days.map(g => (
              <ListGroup
                key={g.id}
                icon={SHOPPING_HORIZONS.date.icon}
                label={`${dayLabel(g.id)} · ${dueLabel(g.id, today)}`}
                count={g.items.length}
              >
                {g.items.map(i => row(i))}
              </ListGroup>
            ))}
            {days.length > 0 && (
              <div style={{ fontSize: 11, color: c.textMuted, margin: "0 2px 8px" }}>
                Dzień przed terminem pozycja sama przejdzie do „{SHOPPING_HORIZONS.now.label}”.
              </div>
            )}
          </div>

          <div hidden={tab !== "watch"}>
            {watching.map(i => row(i))}
          </div>

          {tab === "now" && history.length > 0 && (
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
              {historyOpen && history.map(i => row(i))}
            </div>
          )}

          <QuickAddBar
            catalog={catalog}
            horizon={tab}
            today={today}
            // The photo goes up once the item exists — through the same
            // endpoint as from the ✎ editor, so an add stays a small
            // request and a failed upload never loses the item itself.
            onAdd={async (name, unit, note, photo, when) => {
              const saved = await addItem({ name, unit, note, ...when });
              if (saved && photo) await setPhoto(saved.id, photo);
            }}
          />
        </>
      )}
    </div>
  );
}
