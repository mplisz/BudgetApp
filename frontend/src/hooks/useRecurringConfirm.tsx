// ============================================================
// File: src/hooks/useRecurringConfirm.tsx
// Shared "confirm a recurring expense" flow (NBP rate + amount +
// PaymentConfirmModal + confirmRecurring call). Used by both the
// NotificationBell and the panels (PanelRecurring) so the action can
// be triggered early — before the bell reminder fires.
// ============================================================

import { useState, useEffect } from "react";
import { c } from "../styles/tokens";
import { useRecurring, getActiveCost } from "./useRecurring";
import { useCurrencyConverter }        from "./useCurrencyConverter";
import { PaymentConfirmModal }         from "../components/ui/PaymentConfirmModal";
import { fmt, fmtAmount }              from "../utils/helpers";
import type { RecurringDoc }           from "../types/appContext";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface UseRecurringConfirm {
  /** Open the confirm modal. */
  open:        () => void;
  /** The modal element — render it once in the consumer's tree. */
  modal:       React.ReactNode;
  /** Human-readable amount string (foreign ≈ PLN, or plain PLN). */
  amountStr:   string;
  /** Resolved PLN amount that will be saved. */
  amountPLN:   number;
  isForeign:   boolean;
  rateLoading: boolean;
}

/**
 * @param doc          recurring document to confirm
 * @param budgetMonth  budget month the confirmation is attributed to
 *                     (cost lookup + recurring.lastConfirmedMonth)
 * @param opts.onDone  called after the confirmation request resolves
 */
export function useRecurringConfirm(
  doc: RecurringDoc,
  budgetMonth: string,
  opts?: { onDone?: () => void },
): UseRecurringConfirm {
  const activeCost = getActiveCost(doc, budgetMonth);
  const isForeign  = !!(activeCost?.originalCurrency && activeCost.originalCurrency !== "PLN");

  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState(todayYMD());

  const { confirmRecurring } = useRecurring();
  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter();

  useEffect(() => {
    if (isForeign && activeCost?.originalCurrency) {
      loadRate(activeCost.originalCurrency, todayYMD());
    }
  }, [activeCost?.originalCurrency, isForeign]);

  const liveRate  = activeRate || activeCost?.fxRate || 1;
  const amountPLN = isForeign
    ? Math.round((activeCost?.amount || 0) * liveRate * 100) / 100
    : (activeCost?.amount || 0);

  const amountStr = activeCost
    ? isForeign
      ? `${fmtAmount(activeCost.amount, activeCost.originalCurrency!)} ${activeCost.originalCurrency} ≈ ${rateLoading ? "…" : fmt(amountPLN)} PLN`
      : fmt(activeCost.amount)
    : "—";

  const modal = (
    <PaymentConfirmModal
      isOpen={showModal}
      title="✅ Potwierdź płatność"
      description={doc.description}
      categoryName={doc.categoryName as string}
      suggestedAmount={amountPLN}
      maxAmount={undefined}
      amountLabel="PLN"
      showRecomputeWarning={false}
      onConfirm={async (amount: number) => {
        setShowModal(false);
        await confirmRecurring(doc.id, modalDate, budgetMonth, liveRate, amount);
        opts?.onDone?.();
      }}
      onCancel={() => setShowModal(false)}
      extraInfo={
        <div>
          {isForeign && activeCost && (
            <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 8 }}>
              Kurs NBP: <strong style={{ color: c.success }}>{liveRate.toFixed(4)}</strong>
              {" · "}{fmtAmount(activeCost.amount, activeCost.originalCurrency!)} {activeCost.originalCurrency}
            </div>
          )}
          <label style={{ display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 }}>
            Data transakcji
          </label>
          <input
            type="date"
            value={modalDate}
            onChange={e => setModalDate(e.target.value)}
            style={{ width: "100%", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme: "dark", boxSizing: "border-box" }}
          />
        </div>
      }
    />
  );

  return { open: () => setShowModal(true), modal, amountStr, amountPLN, isForeign, rateLoading };
}
