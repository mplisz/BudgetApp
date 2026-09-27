// ============================================================
// File: src/utils/textSearch.ts
// Free-text "what did I buy" search over transactions: the description and
// every receipt line (its printed text and the AI's product name).
//
// Matching is forgiving the way a person types: case and Polish diacritics
// are ignored ("zolty ser" finds "ŻÓŁTY SER"), and every word of the query
// has to appear, in any order ("ser zolty" finds it too). A receipt line
// matches on its own — "guanciale 250" must not hit a receipt that merely
// has "guanciale" on one line and "250" on another.
//
// backend/utils/textSearch.js is the server twin (cross-month search) and
// must normalise the same way, or the two scopes would disagree.
// ============================================================

import type { TxLineItem } from "../types/summary";

/** Below this many characters a query is not worth running. */
export const MIN_SEARCH_LENGTH = 2;

/** Lowercase, diacritics folded (ł has no decomposition, so by hand). */
export function normalizeSearch(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

/** The query's words, normalised. Empty when too short to search. */
export function searchTokens(query: string): string[] {
  const q = normalizeSearch(query).trim();
  if (q.length < MIN_SEARCH_LENGTH) return [];
  return q.split(/\s+/).filter(Boolean);
}

function hasAll(text: string, tokens: string[]): boolean {
  const n = normalizeSearch(text);
  return tokens.every(t => n.includes(t));
}

export interface TextMatch {
  /** The receipt lines that matched — what the row shows as the reason. */
  hits: TxLineItem[];
}

/**
 * Null when the transaction does not match; otherwise the matching lines
 * (empty when only the description matched).
 */
export function matchTxText(
  tx: { description?: string | null; lineItems?: TxLineItem[] | null },
  tokens: string[],
): TextMatch | null {
  if (tokens.length === 0) return { hits: [] };
  const hits = (tx.lineItems ?? []).filter(li =>
    hasAll(li.description ?? "", tokens) || hasAll(li.product?.name ?? "", tokens));
  if (hits.length > 0) return { hits };
  return hasAll(tx.description ?? "", tokens) ? { hits: [] } : null;
}
