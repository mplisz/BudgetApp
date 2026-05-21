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

export const DEFAULT_TARGETS = {
  maxInsurancePercent:   10,
  maxObligationsPercent: 35,
  minRetirementPercent:  15,
  minSavingsPercent:     20,
} as const;
