// ============================================================
// File: backend/utils/shoppingMatch.js
// Matching a shopping-list entry to the lines of a scanned receipt.
//
// What this is for: a receipt says "Mięso mielone wieprzowo-wołowe 400g"
// and the list says "Mielone". Connecting the two is what lets a scan
// tick items off and record what they cost.
//
// WHY IT IS TEXT MATCHING. Measured over 1031 real line items from this
// family's receipts: only 11.6% carry a structured product name (the
// whitelist behind "Ceny produktów"). The other 88% are description text
// only, so the text path is the main one, not the fallback.
//
// THE SHAPE OF THAT TEXT, from the same sample: sizes appear in 41% of
// descriptions, multipacks are written x2 / x 2 / 2x / glued (Pomidoryx3),
// weighed goods carry their weight ("Cebula 0,262 kg"), and brands sit in
// quotes or brackets, sometimes as OCR noise ("(KuaJabAnMix)").
//
// MATCHING RULE. Every token of the list entry must find a token in the
// description. Tokens of 5+ characters may match on a shared stem, which
// is what carries Polish inflection ("bułki" ~ "bułka"). Tokens of 4 or
// fewer must match exactly — "woda" and "wódka" differ in exactly the
// same way "jaja" and "jajka" do, and no rule can keep one without the
// other. We lose "jaja"→"jajka" and keep vodka out of the water: a miss
// costs one manual pairing, a false hit sends you home without dinner.
//
// Everything here is pure — see shoppingMatch.test.js.
// ============================================================

const { foldProductName } = require("./productCatalog");

// Words that carry no product identity: prepositions, and the packaging
// vocabulary that shows up on nearly every receipt (kg appears on 138 of
// the 1031 sampled lines, luz on 25, puszka on 23).
const STOP_WORDS = new Set([
  "do", "na", "z", "ze", "w", "we", "bez", "i", "oraz", "dla", "od", "po", "pod",
  "kg", "dag", "ml", "szt", "sztuk", "sztuki", "sztuka", "opak", "opakowanie",
  "puszka", "puszce", "butelka", "butelce", "luz", "wazona", "wazone", "ok",
]);

// Below this length a token must match exactly — see the header.
const STEM_MIN_LENGTH = 5;

/**
 * Folded, tokenized, stripped of packaging noise.
 *
 * Numbers are KEPT. They cannot match anything on their own — every
 * token of the list entry has to be found, so the words still gate the
 * match — but they are what separates "Mleko 3,2%" from "Mleko 2%" once
 * somebody keeps both on their list. Dropping them made the two entries
 * identical to this function, and a receipt's milk landed on whichever
 * happened to rank higher.
 */
function matchTokens(text) {
  return foldProductName(text)
    .split(" ")
    .filter(t => t.length > 0 && !STOP_WORDS.has(t))
    .filter(t => t.length > 1 || /^\d$/.test(t));   // keep single digits, drop stray letters
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Do these two tokens plausibly name the same thing? */
function tokensMatch(a, b) {
  if (a === b) return true;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < STEM_MIN_LENGTH) return false;   // exact-only for short words

  const shared = commonPrefix(short, long);
  // Enough of the shorter token has to survive: all but its last letter,
  // or five characters, whichever is the lower bar.
  if (shared < Math.min(short.length - 1, 5)) return false;

  // Past the shared stem the two must diverge by COMPARABLE amounts —
  // that is what separates an inflection from a different word:
  //   pieluchy / pieluszki  →  3 vs 4 letters past "pielu"   → inflection
  //   ser      / serwetki   →  0 vs 5 letters past "ser"     → other word
  //   maslo    / maslanka   →  1 vs 4 letters past "masl"    → other word
  const shortTail = short.length - shared;
  const longTail  = long.length - shared;
  return longTail <= Math.max(3, shortTail + 1);
}

/**
 * Does this line satisfy this item? Returns null when it does not, or a
 * score when it does. Every token of the ITEM must be found; extra words
 * in the description are expected (brand, size, packaging) and cost
 * nothing beyond a small specificity penalty, so that between two
 * candidate lines the tighter description wins.
 */
function scoreLine(itemTokens, lineTokens) {
  if (itemTokens.length === 0 || lineTokens.length === 0) return null;

  let exactHits = 0;
  for (const it of itemTokens) {
    const hit = lineTokens.find(lt => tokensMatch(it, lt));
    if (!hit) return null;
    if (hit === it) exactHits++;
  }

  return {
    // More matched words = a more specific claim. "mleko modyfikowane"
    // has to beat "mleko" when both fit the same line.
    tokens: itemTokens.length,
    exactHits,
    // Fewer unexplained words in the description = a tighter fit.
    extra: Math.max(0, lineTokens.length - itemTokens.length),
  };
}

/** Ordering for candidate pairs: certainty first, then specificity. */
function comparePairs(a, b) {
  const rank = { exact: 0, alias: 1, tokens: 2 };
  if (rank[a.confidence] !== rank[b.confidence]) return rank[a.confidence] - rank[b.confidence];
  if (b.score.tokens !== a.score.tokens)         return b.score.tokens - a.score.tokens;
  if (b.score.exactHits !== a.score.exactHits)   return b.score.exactHits - a.score.exactHits;
  if (a.score.extra !== b.score.extra)           return a.score.extra - b.score.extra;
  return a.lineIndex - b.lineIndex;
}

/**
 * Assign receipt lines to shopping-list items, at most one line per item
 * and one item per line.
 *
 * items:   [{ id, name, key? }]
 * lines:   [{ description, product? }]  — index in this array is reported back
 * aliases: { [foldedDescription]: itemKey } — pairings the user made by hand
 *
 * Returns [{ itemId, lineIndex, confidence }] where confidence is:
 *   "exact"  — the line's structured product name IS this item,
 *   "alias"  — a pairing this household taught us,
 *   "tokens" — every word of the item was found in the description.
 *
 * The caller decides what each level is good for: prices can be recorded
 * on any of them, but ticking an item off on "tokens" alone means the app
 * claims you bought something you might not have.
 */
function matchLines(items, lines, aliases = {}) {
  const preparedItems = items.map(item => ({
    ...item,
    key:    item.key || foldProductName(item.name),
    tokens: matchTokens(item.name),
  }));

  const preparedLines = lines.map((line, lineIndex) => ({
    lineIndex,
    tokens:      matchTokens(line.description),
    productKey:  line.product?.name ? foldProductName(line.product.name) : null,
    aliasKey:    aliases[foldProductName(line.description)] ?? null,
  }));

  const pairs = [];
  for (const item of preparedItems) {
    for (const line of preparedLines) {
      if (line.productKey && line.productKey === item.key) {
        pairs.push({ itemId: item.id, lineIndex: line.lineIndex, confidence: "exact",
                     score: { tokens: item.tokens.length, exactHits: item.tokens.length, extra: 0 } });
        continue;
      }
      if (line.aliasKey && line.aliasKey === item.key) {
        pairs.push({ itemId: item.id, lineIndex: line.lineIndex, confidence: "alias",
                     score: { tokens: item.tokens.length, exactHits: item.tokens.length, extra: 0 } });
        continue;
      }
      const score = scoreLine(item.tokens, line.tokens);
      if (score) pairs.push({ itemId: item.id, lineIndex: line.lineIndex, confidence: "tokens", score });
    }
  }

  pairs.sort(comparePairs);

  const usedItems = new Set();
  const usedLines = new Set();
  const out = [];
  for (const p of pairs) {
    if (usedItems.has(p.itemId) || usedLines.has(p.lineIndex)) continue;
    usedItems.add(p.itemId);
    usedLines.add(p.lineIndex);
    out.push({ itemId: p.itemId, lineIndex: p.lineIndex, confidence: p.confidence });
  }
  return out;
}

module.exports = {
  STOP_WORDS,
  STEM_MIN_LENGTH,
  matchTokens,
  tokensMatch,
  scoreLine,
  matchLines,
};
