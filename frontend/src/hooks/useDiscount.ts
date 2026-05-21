// ============================================================
// File: src/hooks/useDiscount.ts
// Manages discount and quantity state for TransactionForm.
//
// Discount modes:
//   per_order — single discount applied to the total (gross × qty)
//   per_unit  — discount per piece, multiplied by qty
//
// Toggle behaviour:
//   Enabling:  pre-fills gross from current amountOrig (no data loss)
//   Disabling: restores amountOrig from gross, clears discount
// ============================================================

import { useState, useMemo } from "react";
import { parseDecimal } from "../utils/helpers";
import type { DiscountSummary, DiscountMode } from "../types/transaction";

interface UseDiscountResult {
  // Quantity
  qty:             number;
  setQty:          (v: number) => void;
  // Discount toggle
  isOpen:          boolean;
  discountAmount:  string;
  discountMode:    DiscountMode;
  amountGross:     string;
  summary:         DiscountSummary | null;
  // Returns the effective net total string to use as the transaction amount
  effectiveAmount: (amountOrig: string) => string;
  toggle:          (currentAmountOrig: string, currentAmountGross: string) => void;
  setGross:        (v: string) => void;
  setDiscount:     (v: string) => void;
  setDiscountMode: (m: DiscountMode) => void;
}

export function useDiscount(): UseDiscountResult {
  const [qty,          setQtyState]          = useState(1);
  const [isOpen,       setIsOpen]            = useState(false);
  const [amountGross,  setAmountGross]        = useState("");
  const [discountAmount, setDiscountAmountState] = useState("");
  const [discountMode, setDiscountMode]       = useState<DiscountMode>("per_order");

  const summary = useMemo<DiscountSummary | null>(() => {
    if (!isOpen) return null;
    const gross    = parseDecimal(amountGross) || 0;
    const discount = parseDecimal(discountAmount) || 0;
    if (!gross) return null;

    const grossTotal = gross * qty;

    let net: number;
    let discountTotal: number;

    if (discountMode === "per_unit") {
      // Discount per piece × qty
      discountTotal = discount * qty;
      net = Math.max(0, grossTotal - discountTotal);
    } else {
      // Single discount off total
      discountTotal = discount;
      net = Math.max(0, grossTotal - discountTotal);
    }

    return {
      gross,
      discount,
      net,
      pct:        grossTotal > 0 ? (discountTotal / grossTotal) * 100 : 0,
      grossTotal,
      qty,
      mode:       discountMode,
    };
  }, [isOpen, amountGross, discountAmount, discountMode, qty]);

  // Effective amount without discount (just gross × qty)
  const grossTotal = useMemo(() => {
    const g = parseDecimal(amountGross) || 0;
    return g * qty;
  }, [amountGross, qty]);

  function effectiveAmount(amountOrig: string): string {
    if (!isOpen) {
      // No discount: total = unit price × qty
      const unit = parseDecimal(amountOrig) || 0;
      const total = unit * qty;
      return total > 0 ? String(Math.round(total * 100) / 100) : "";
    }
    // With discount: use summary net
    if (summary && summary.net > 0) return String(Math.round(summary.net * 100) / 100);
    return "";
  }

  function toggle(currentAmountOrig: string, currentAmountGross: string) {
    if (!isOpen) {
      // Enabling: pre-fill gross from amountOrig if gross is empty
      if (currentAmountOrig && !currentAmountGross) {
        setAmountGross(currentAmountOrig);
      }
      setIsOpen(true);
    } else {
      // Disabling: clear discount, keep gross (caller restores amountOrig from gross)
      setDiscountAmountState("");
      setIsOpen(false);
    }
  }

  function setDiscount(v: string) {
    const gross = parseDecimal(amountGross) || 0;
    const val   = parseDecimal(v) || 0;

    if (discountMode === "per_unit") {
      // Cap: discount per unit < unit gross
      setDiscountAmountState(String(gross > 0 ? Math.min(val, gross - 0.01) : val));
    } else {
      // Cap: discount < gross × qty
      const maxDiscount = gross * qty - 0.01;
      setDiscountAmountState(String(maxDiscount > 0 ? Math.min(val, maxDiscount) : val));
    }
  }

  function setQty(v: number) {
    const clamped = Math.max(1, Math.floor(v));
    setQtyState(clamped);
    // Re-cap discount after qty change
    if (isOpen && discountAmount) {
      const gross    = parseDecimal(amountGross) || 0;
      const discount = parseDecimal(discountAmount) || 0;
      if (discountMode === "per_order") {
        const maxDiscount = gross * clamped - 0.01;
        if (discount > maxDiscount) setDiscountAmountState(String(maxDiscount));
      }
    }
  }

  return {
    qty,
    setQty,
    isOpen,
    discountAmount,
    discountMode,
    amountGross,
    summary,
    effectiveAmount,
    toggle,
    setGross:    setAmountGross,
    setDiscount,
    setDiscountMode,
  };
}