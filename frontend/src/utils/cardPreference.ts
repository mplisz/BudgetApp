// ============================================================
// File: src/utils/cardPreference.ts
// "Was the last purchase paid with the card?" — remembered per device, so
// the next expense starts with the same answer. Someone who pays for nearly
// everything with the card would otherwise tick the box on every entry, and
// forget it on some.
//
// Holds a card id and nothing else. Storage can be unavailable (private
// mode, blocked site data): reads then fall back to "no card", writes are
// dropped.
// ============================================================

import type { CreditCard } from "../types/creditCard";

const KEY = "budget.lastCardId";

/** The remembered card, if it is still one of the active ones. */
export function preferredCardId(activeCards: CreditCard[]): string | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored && activeCards.some(card => card.id === stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Remember how this purchase was paid; null = not with a card. */
export function rememberCardId(cardId: string | null): void {
  try {
    if (cardId) localStorage.setItem(KEY, cardId);
    else        localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the preference is a convenience.
  }
}
