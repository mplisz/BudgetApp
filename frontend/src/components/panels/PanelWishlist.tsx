// ============================================================
// File: src/components/panels/PanelWishlist.tsx
// Panel "Potencjalne zakupy" — things you want, with no price and no month yet.
//
// These live in the same Cosmos container as planned expenses but the backend
// filters them out of the default listing, so they never reach the shared
// `planned` state that the forecast, the Baza budżetu column, the safety net
// and the bell all sum over. Consequence: this panel owns its own slice.
//
// Two one-way doors out of here, and the choice between them is the whole
// point: "Zaplanuj" promotes an item into a real plan (through the same form
// used to create one from scratch) when it needs a financial decision, and
// "Na listę" hands it to the shopping list when it just needs buying.
// ============================================================

import { c }              from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { createPortal }   from "react-dom";
import { usePlanned }     from "../../hooks/usePlanned";
import { useApi }         from "../../hooks/useApi";
import { useToast }       from "../../hooks/useToast";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { WishCard }       from "./plannedComponents/WishCard";
import { PlannedForm }    from "./plannedComponents/PlannedForm";
import { theme as s }     from "../../styles/theme";
import { fmt, plural }    from "../../utils/helpers";
import type { PlannedDoc, PlannedPostPayload, PlannedPatchPayload } from "../../hooks/usePlanned";

export default function PanelWishlist() {
  const { loadWishes, promoteWish, archivePlanned, isSaving } = usePlanned();
  const { activeBudgetMonth } = useMonthStatus();
  const api = useApi();
  const { showSuccess, showError } = useToast();

  const [wishes, setWishes] = useState<PlannedDoc[] | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<PlannedDoc | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => { loadWishes().then(setWishes); }, [loadWishes]);

  // Newest first. Not sorted by priority: that field describes how essential
  // a spend is and is derived from the subcategory when the item is promoted,
  // so it says nothing meaningful about an item still on the list.
  const sorted = useMemo(
    () => [...(wishes ?? [])].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [wishes],
  );

  // Informational only — deliberately labelled as a rough total, since items
  // without an estimate contribute nothing and most items have none.
  const estimated = useMemo(
    () => sorted.reduce((sum, w) => sum + (w.estimatedAmount ?? 0), 0),
    [sorted],
  );
  const withEstimate = sorted.filter(w => w.estimatedAmount != null).length;

  async function handlePromote(payload: PlannedPostPayload | PlannedPatchPayload) {
    if (!promoteTarget) return;
    const done = await promoteWish(promoteTarget.id, payload as PlannedPostPayload);
    if (done) setWishes(prev => (prev ?? []).filter(w => w.id !== promoteTarget.id));
    setPromoteTarget(null);
  }

  async function handleArchive(wish: PlannedDoc) {
    const ok = await archivePlanned(wish.id);
    if (ok) setWishes(prev => (prev ?? []).filter(w => w.id !== wish.id));
  }

  // Move to the shopping list. The item is created FIRST and archived only
  // once that succeeded — the other order would lose the item entirely if
  // the second call failed. A leftover duplicate is recoverable; a silently
  // dropped entry is not.
  async function handleToBuy(wish: PlannedDoc) {
    setMovingId(wish.id);
    try {
      await api.post("/api/shopping",
        { name: wish.description, sourceWishId: wish.id },
        { fallback: "Nie udało się przenieść na listę zakupów." });
      const ok = await archivePlanned(wish.id, "przeniesione na listę zakupów");
      if (ok) setWishes(prev => (prev ?? []).filter(w => w.id !== wish.id));
      showSuccess("Przeniesione na listę zakupów 🧺");
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div style={{ padding: "0 0 60px 0" }}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>👀 Potencjalne zakupy</div>
        <div style={s.sectionSub}>
          {wishes === null
            ? "Ładowanie…"
            : sorted.length === 0
              ? "Pusto — dodaj coś przez „Dodaj potencjalny zakup”."
              : <>
                  {sorted.length} {plural(sorted.length, "pozycja", "pozycje", "pozycji")}
                  {withEstimate > 0 && <> · szacunkowo <strong style={{ color: c.textTertiary }}>{fmt(estimated)}</strong>
                    {withEstimate < sorted.length && <> (z {withEstimate} wycenionych)</>}</>}
                </>}
        </div>
      </div>

      {wishes !== null && sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
          Nic tu jeszcze nie ma. Wrzuć pomysł, zanim stanie się planem.
        </div>
      )}

      {sorted.map(wish => (
        <WishCard
          key={wish.id}
          wish={wish}
          onPromote={setPromoteTarget}
          onArchive={handleArchive}
          onToBuy={handleToBuy}
          isBusy={movingId === wish.id}
        />
      ))}

      {/* Promotion — the SAME form used to create a plan from scratch,
          pre-filled from the item. mode="add" on purpose: this is the moment
          the full plan rules (month, positive amount, tryb) must hold. */}
      {promoteTarget && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setPromoteTarget(null)}
        >
          <div
            style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: c.text, marginBottom: 6 }}>
              📅 Zaplanuj zakup
            </div>
            <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 16 }}>
              🛒 {promoteTarget.description}
              {promoteTarget.estimatedAmount != null && <> · szacowano {fmt(promoteTarget.estimatedAmount)}</>}
            </div>
            <PlannedForm
              key={promoteTarget.id}
              initialValues={{
                ...promoteTarget,
                // The estimate seeds the amount; the user confirms or corrects
                // it before this becomes a real commitment.
                totalAmount: promoteTarget.estimatedAmount ?? undefined,
              }}
              startMonth={activeBudgetMonth}
              onSubmit={handlePromote}
              onCancel={() => setPromoteTarget(null)}
              isSaving={isSaving}
              mode="add"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
