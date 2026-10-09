// ============================================================
// File: src/hooks/useCreditCards.ts
// Credit cards: the shared data (cards, repayments, card purchases) and the
// writes that change it.
//
// The data lives in AppContext so the bell, the expense form and the panels
// all see one copy. Nothing loads it at bootstrap: the always-mounted bell
// calls reload() once, and a panel that shows the debt calls it again on
// mount so its numbers are fresh. Every write reloads — the debt is derived
// from all three lists, so patching one of them locally is not worth being
// wrong about.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import { useApi }        from "./useApi";
import type { CardData, CardInput, CreditCard } from "../types/creditCard";

const EMPTY: CardData = { cards: [], repayments: [], transactions: [] };

export interface RepaymentInput {
  amount:          number;
  date:            string;   // YYYY-MM-DD
  budgetMonth:     string;   // YYYY-MM
  interestAmount?: number;
}

export function useCreditCards() {
  const api                        = useApi();
  const { cardData, setCardData }  = useAppContext();
  const { showError, showSuccess } = useToast();
  const [isSaving, setIsSaving]    = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const res = await api.get<Partial<CardData> | null>("/api/cards", {
        fallback: "Nie udało się pobrać kart kredytowych.",
      });
      setCardData({
        cards:        res?.cards        ?? [],
        repayments:   res?.repayments   ?? [],
        transactions: res?.transactions ?? [],
      });
    } catch (err) {
      showError((err as Error).message);
    }
  }, [api, setCardData, showError]);

  // Every write: send it, reload, say so. Resolves to whether it went through.
  const save = useCallback(async (
    request: () => Promise<unknown>, success: string,
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      await request();
      await reload();
      showSuccess(success);
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [reload, showSuccess, showError]);

  const data        = cardData ?? EMPTY;
  const activeCards = useMemo<CreditCard[]>(() => data.cards.filter(card => !card.isArchived), [data.cards]);

  return {
    data,
    activeCards,
    isLoaded: cardData !== null,
    isSaving,
    reload,

    createCard: (card: CardInput) =>
      save(() => api.post("/api/cards", card, { fallback: "Nie udało się zapisać karty." }), "Karta dodana ✅"),

    updateCard: (id: string, patch: Partial<CardInput> & { isArchived?: boolean }) =>
      save(() => api.patch(`/api/cards/${id}`, patch, { fallback: "Nie udało się zapisać karty." }), "Karta zapisana ✅"),

    addRepayment: (cardId: string, repayment: RepaymentInput) =>
      save(
        () => api.post(`/api/cards/${cardId}/repayments`, repayment, { fallback: "Nie udało się zapisać spłaty." }),
        "Spłata zapisana ✅",
      ),

    updateRepayment: (id: string, patch: { amount?: number; date?: string }) =>
      save(
        () => api.patch(`/api/cards/repayments/${id}`, patch, { fallback: "Nie udało się zapisać spłaty." }),
        "Spłata poprawiona ✅",
      ),

    deleteRepayment: (id: string) =>
      save(
        () => api.del(`/api/cards/repayments/${id}`, undefined, { fallback: "Nie udało się usunąć spłaty." }),
        "Spłata usunięta",
      ),
  };
}
