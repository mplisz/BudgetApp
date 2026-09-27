// ============================================================
// File: backend/utils/textSearch.js
// Server twin of frontend/src/utils/textSearch.ts — the cross-month
// "what did I buy" search. Must normalise and match exactly like the client
// (case + Polish diacritics folded, every word on the same line), or the
// "this month" and "all months" scopes would disagree on the same receipt.
//
// Matching runs here in Node rather than as Cosmos CONTAINS(): Cosmos can
// ignore case but not diacritics, and "zolty ser" has to find "ŻÓŁTY SER".
// ============================================================

const MIN_SEARCH_LENGTH = 2;

function normalizeSearch(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

function searchTokens(query) {
  const q = normalizeSearch(query).trim();
  if (q.length < MIN_SEARCH_LENGTH) return [];
  return q.split(/\s+/).filter(Boolean);
}

function hasAll(text, tokens) {
  const n = normalizeSearch(text);
  return tokens.every(t => n.includes(t));
}

/** True when the description or any single receipt line has every token. */
function txMatchesText(tx, tokens) {
  if (tokens.length === 0) return false;
  if (hasAll(tx.description, tokens)) return true;
  return (tx.lineItems || []).some(li =>
    hasAll(li.description, tokens) || hasAll(li.product?.name, tokens));
}

module.exports = { MIN_SEARCH_LENGTH, normalizeSearch, searchTokens, txMatchesText };
