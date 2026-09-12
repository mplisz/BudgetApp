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
import { plural } from "../../utils/helpers";
import { useShoppingList, type CatalogEntry } from "../../hooks/useShoppingList";
import { FrequentPills } from "./shoppingComponents/FrequentPills";
import { QuickAddBar }   from "./shoppingComponents/QuickAddBar";
import { ShoppingRow }   from "./shoppingComponents/ShoppingRow";
import { SkeletonListRow } from "../ui/Skeleton";

export default function PanelShopping() {
  const {
    items, catalog, isLoading, hasLoaded,
    load, addItem, patchItem, markBought, markMissed, reopenItem, removeItem,
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
  };

  const showSkeleton = isLoading && !hasLoaded;

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>🧺 Lista zakupów</div>
        <div style={s.sectionSub}>
          {showSkeleton
            ? "Ładowanie…"
            : toBuy === 0
              ? "Nic do kupienia — dopisz coś poniżej albo tapnij w częsty produkt."
              : <>
                  {toBuy} {plural(toBuy, "pozycja", "pozycje", "pozycji")} do kupienia
                  {missed.length > 0 && <> · {missed.length} niedostępne ostatnio</>}
                </>}
        </div>
      </div>

      {showSkeleton && (
        <div style={s.card}>
          <SkeletonListRow columns={2} count={6} height={44} />
        </div>
      )}

      {!showSkeleton && (
        <>
          <FrequentPills catalog={catalog} openKeys={openKeys} onAdd={handlePillAdd} />

          {toBuy === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: c.borderStrong }}>
              Lista jest pusta. Skończyło się coś? Dopisz od razu.
            </div>
          )}

          {open.map(item => <ShoppingRow key={item.id} item={item} {...rowHandlers} />)}

          {missed.length > 0 && (
            <>
              <div style={{
                fontSize: 11, color: c.warningLight, textTransform: "uppercase",
                letterSpacing: "0.7px", fontWeight: 700, margin: "18px 0 8px",
              }}>
                Nie było ostatnio ({missed.length})
              </div>
              {missed.map(item => <ShoppingRow key={item.id} item={item} {...rowHandlers} />)}
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
                <ShoppingRow key={item.id} item={item} {...rowHandlers} />
              ))}
            </div>
          )}

          <QuickAddBar
            catalog={catalog}
            onAdd={(name, unit) => { addItem({ name, unit }); }}
          />
        </>
      )}
    </div>
  );
}
