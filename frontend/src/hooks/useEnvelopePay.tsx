// ============================================================
// File: src/hooks/useEnvelopePay.tsx
// Shared "set money aside into a virtual envelope" flow
// (NBP rate + progress figures + PaymentConfirmModal + payMonth call).
// Used by both the NotificationBell and PanelPlanned/PlannedCard so the
// monthly contribution can be made early — before the bell reminder fires.
// ============================================================

import { useState, useEffect } from "react";
import { c } from "../styles/tokens";
import { usePlanned, sumPaid, computeSuggestion, isReadyToPurchase } from "./usePlanned";
import { useCurrencyConverter }                   from "./useCurrencyConverter";
import { PaymentConfirmModal }                     from "../components/ui/PaymentConfirmModal";
import { fmt, todayYMD }                            from "../utils/helpers";
import type { PlannedDoc }                         from "./usePlanned";

export interface UseEnvelopePay {
  /** Open the contribution modal. */
  open:        () => void;
  /** Skip this month's rate (marks it dismissed, recomputes the suggestion). */
  dismiss:     () => void;
  /** The modal element — render it once in the consumer's tree. */
  modal:       React.ReactNode;
  /** Suggested monthly contribution (PLN), or null for non-envelope docs. */
  suggestion:  number | null;
  /** Remaining amount to the goal (PLN). */
  remaining:   number;
  /** Whether there's an unpaid, undismissed entry for the current month. */
  canPay:      boolean;
  /** Sum of paid contributions so far (PLN). */
  paid:        number;
  /** Goal amount in PLN (live FX for foreign-currency envelopes). */
  totalPLN:    number;
  /** Progress toward the goal, 0–100. */
  progressPct: number;
  /** Goal fully funded — ready to purchase. */
  ready:       boolean;
  isForeign:   boolean;
  rateLoading: boolean;
}

export function useEnvelopePay(doc: PlannedDoc): UseEnvelopePay {
  const currentMonth = todayYMD().slice(0, 7);
  const paid         = sumPaid(doc.virtualSavings);
  const suggestion   = computeSuggestion(doc, currentMonth);
  const ready        = isReadyToPurchase(doc);
  const isForeign    = !!(doc.originalCurrency && doc.originalCurrency !== "PLN");

  const thisMonthEntry = (doc.virtualSavings || []).find(v => v.month === currentMonth);
  const canPay = doc.mode === "envelope"
    && !ready
    && !!thisMonthEntry
    && !thisMonthEntry.paidByUser
    && !thisMonthEntry.dismissedByUser;

  const [showModal, setShowModal] = useState(false);

  const { payMonth, dismissMonth } = usePlanned();
  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter();

  useEffect(() => {
    if (isForeign) loadRate(doc.originalCurrency, todayYMD());
  }, [doc.originalCurrency, isForeign]);

  const liveRate    = activeRate || doc.fxRate || 1;
  const totalPLN    = isForeign
    ? Math.round(doc.totalAmount * liveRate * 100) / 100
    : doc.totalAmountPLN;
  const remaining   = Math.max(0, totalPLN - paid);
  const progressPct = totalPLN > 0 ? Math.min(100, Math.round(paid / totalPLN * 100)) : 0;

  const modal = (
    <PaymentConfirmModal
      isOpen={showModal}
      title="💰 Potwierdź odkładanie"
      description={doc.description}
      categoryName={doc.targetCategoryName}
      suggestedAmount={suggestion ?? 0}
      maxAmount={remaining}
      amountLabel="PLN"
      onConfirm={(amount: number) => {
        setShowModal(false);
        payMonth(doc.id, currentMonth, amount, amount, 1);
      }}
      onCancel={() => setShowModal(false)}
      extraInfo={
        <div style={{ fontSize: 11, color: c.textMuted }}>
          Pozostało: <strong style={{ color: c.text }}>{fmt(remaining)} PLN</strong>
        </div>
      }
    />
  );

  return {
    open: () => setShowModal(true),
    dismiss: () => { dismissMonth(doc.id, currentMonth); },
    modal, suggestion, remaining, canPay,
    paid, totalPLN, progressPct, ready, isForeign, rateLoading,
  };
}
