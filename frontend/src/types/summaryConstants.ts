// ============================================================
// File: src/types/summaryConstants.ts
// Shared constants for the summary panel family.
// ============================================================
import { PRIORITY_LABELS } from "../data/constants";

export interface PrioMeta {
  label: string;
  color: string;
  desc: string;
}

export const PRIO_META = Object.fromEntries(
  Object.entries(PRIORITY_LABELS).map(([k, v]) => [
    Number(k),
    { label: `P${k}`, color: v.color, desc: v.label },
  ])
) as Record<1 | 2 | 3 | 4, PrioMeta>;

export const PRIO_KEYS = [1, 2, 3, 4] as const;
export type PrioKey = typeof PRIO_KEYS[number];

// Structural — deliberately not the full app Transaction type, so this
// works against any caller's own (possibly minimal/local) transaction
// shape without a cast, as long as it has these three fields.
interface PriorityTx {
  type:      string;
  amount:    number;
  priority?: number | null;
}

/** Sum of EXPENSE amounts per priority bucket (1-4, missing → 4/lowest).
 *  Single source of truth for "how do we bucket a transaction by
 *  priority" — used by both the single-month breakdown (PriorityBreakdown)
 *  and the multi-month trend chart (PanelAnalytics). */
export function sumExpensesByPriority(txs: PriorityTx[]): Record<PrioKey, number> {
  const map: Record<PrioKey, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const tx of txs) {
    if (tx.type !== "EXPENSE") continue;
    const p = (tx.priority ?? 4) as PrioKey;
    map[p] += tx.amount;
  }
  return map;
}

export const DEFAULT_TARGETS = {
  maxInsurancePercent:   10,
  maxObligationsPercent: 35,
  minRetirementPercent:  15,
  minSavingsPercent:     20,
} as const;
