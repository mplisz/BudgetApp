// ============================================================
// File: backend/utils/shoppingPrices.js
// Turning receipt lines into "what this product usually costs".
//
// WHY A MEDIAN AND NOT AN AVERAGE. One promotion is not information
// about what something costs — it is information about what it cost
// once. Over 12,99 / 12,99 / 6,99 / 13,49 / 12,99 the mean says 11,89
// and makes the normal price look expensive; the median says 12,99 and
// is right. The last price is shown beside it precisely so a promotion
// is still visible, just not mistaken for the norm.
//
// TWO TRAPS THE REAL DATA CONTAINS (measured over 1031 exported lines):
//
//   1. Multipacks — 268 lines carry "x2".."x12" and the amount is for
//      the whole pack ("Coca-Cola Zero 1,75 l x3" → 20,97). Recording
//      that as the price of a bottle triples it.
//
//   2. Weighed goods — 133 lines carry a weight ("Cebula 0,262 kg" →
//      1,81) and the amount depends on how much was scooped up, so the
//      raw number says nothing. These are recorded per kilogram, and
//      kept apart from per-item prices: a median mixing zł/kg with
//      zł/szt would be arithmetic with no meaning.
//
// Everything here is pure — see shoppingPrices.test.js.
// ============================================================

/** Max observations kept per product. Enough that one promotion cannot
 *  decide the median, few enough that the catalog stays small — it is
 *  read on every panel open, on a phone, in a shop. */
const MAX_OBSERVATIONS = 6;

/** Prices older than this are dropped: at current food inflation a
 *  median reaching further back describes a different year. */
const WINDOW_DAYS = 90;

/** Below this many observations there is no "usually" to report, only
 *  the last price. A median of two numbers is their average wearing a
 *  disguise. */
const MIN_FOR_MEDIAN = 3;

// ── Parsing what the amount actually covers ──────────────────

// "x2", "x 2", "2x", "Pomidoryx3". Deliberately integer-only: the data
// also contains "Marchewka 0,386 kg x 3,90", where the number after the
// x is a unit PRICE, and "Kapusta czerwona x1,300 kg", where it is a
// weight. A decimal separator is the tell, so anything with one is not
// a pack count.
const PACK_SUFFIX = /x\s?(\d{1,2})(?![\d.,])/i;
const PACK_PREFIX = /^(\d{1,2})\s?x(?![\d.,])/i;

/** How many units one line covers. null when the text says nothing. */
function parsePackCount(description) {
  const text = String(description || "");

  // "15 x 60 sztuk" — packs times contents. The pack count is the first
  // number; the second describes what is inside one pack.
  const nested = text.match(/(\d{1,2})\s?x\s?(\d{2,3})\s?(szt|sztuk)/i);
  if (nested) return Number(nested[1]);

  const prefix = text.match(PACK_PREFIX);
  if (prefix) {
    const n = Number(prefix[1]);
    return n > 1 ? n : null;
  }

  const suffix = text.match(PACK_SUFFIX);
  if (suffix) {
    const n = Number(suffix[1]);
    return n > 1 ? n : null;   // "x1" means one, which is what we assume anyway
  }

  return null;
}

// "0,262 kg", "1,17 kg", "(1,534 kg)", "kg 0,216". Only weights that
// carry a decimal separator count: a bare "2,5 kg" on a frozen-chips bag
// is a package size, not a weighing, but it is also exactly what we want
// to divide by, so the two cases coincide.
const WEIGHT_AFTER  = /(\d+[.,]\d+)\s?kg\b/i;
const WEIGHT_BEFORE = /\bkg\s?(\d+[.,]\d+)/i;

// "280 g", "0,5 l", "1,75 L", "500ml", "10 szt.", "0,25L". Converted to
// the same base units the product catalog uses everywhere (g, ml, szt),
// so the panel can reuse formatSize / computeUnitPrice unchanged.
const SIZE_TOKEN = /(\d+(?:[.,]\d+)?)\s?(kg|dag|g|ml|l|szt)\b/gi;
const TO_BASE = {
  kg:  { factor: 1000, unit: "g"   },
  dag: { factor: 10,   unit: "g"   },
  g:   { factor: 1,    unit: "g"   },
  l:   { factor: 1000, unit: "ml"  },
  ml:  { factor: 1,    unit: "ml"  },
  szt: { factor: 1,    unit: "szt" },
};

/**
 * Size of ONE package, from the description. null when the text says
 * nothing usable.
 *
 * Takes the LAST size in the text, not the first. From the real export:
 * "Pieluszki Pampers 3 Active Baby 6-10 kg 90 szt" — the first size is
 * the baby's weight, the last is the pack. Product names put the package
 * size at the end far more reliably than anywhere else.
 */
function parsePackageSize(description) {
  const text = String(description || "");
  const all = [...text.matchAll(SIZE_TOKEN)];
  if (all.length === 0) return null;

  const [, num, rawUnit] = all[all.length - 1];
  const base = TO_BASE[rawUnit.toLowerCase()];
  const size = Math.round(Number(num.replace(",", ".")) * base.factor);

  // Out-of-range values are misreads, not products: nobody buys a
  // 400-tonne jar, and a zero-gram one would divide by nothing.
  const max = base.unit === "szt" ? 1000 : 100_000;
  return size > 0 && size <= max ? { size, unit: base.unit } : null;
}

/** Package size, trusting the AI's structured product over the text —
 *  it had the receipt, the regex only has what got written down. */
function packageSizeFrom(line) {
  const p = line?.product;
  if (p?.size && p?.unit && TO_BASE[p.unit]) return { size: p.size, unit: p.unit };
  return parsePackageSize(line?.description);
}

/** Weight in kilograms when the line was sold by weight, else null. */
function parseWeightKg(description) {
  const text = String(description || "");
  const m = text.match(WEIGHT_AFTER) || text.match(WEIGHT_BEFORE);
  if (!m) return null;
  const kg = Number(m[1].replace(",", "."));
  return Number.isFinite(kg) && kg > 0 && kg < 100 ? kg : null;
}

/**
 * One comparable observation from a receipt line, or null when the line
 * cannot yield one. `unit` says what the number means, and observations
 * of different units must never be averaged together.
 *
 * line: { description, amount, product? } — product.packCount is trusted
 * over anything parsed out of the text, since the AI had the receipt.
 *
 * `shop` is where the purchase happened. Not a field anyone maintains —
 * the list items dropped theirs for that reason — but provenance for a
 * number: "5,20 zł" is hard to judge, "5,20 zł w Żabce" explains itself,
 * and it is what tells a real price from a mis-matched receipt line.
 */
function observationFrom(line, date, shop = null) {
  const amount = Number(line?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Only set when known, so an observation without a shop stays as small
  // as it was — these sit in a document read on every panel open.
  const where = shop ? { s: String(shop).slice(0, 40) } : {};

  const kg = parseWeightKg(line.description);
  if (kg) return { d: date, a: round2(amount / kg), u: "kg", ...where };

  // In order of how much the source knows:
  //   1. the line's own packCount — OCR rule 27, filled for EVERY line
  //      and able to read the receipt's quantity column, which the
  //      description never shows,
  //   2. the tracked product's count — same source, whitelist only, and
  //      what older receipts carry since rule 27 did not exist yet,
  //   3. the text, which is all that is left for anything scanned before
  //      either of those.
  const pack = line.packCount ?? line.product?.packCount ?? parsePackCount(line.description);
  const count = pack && pack > 1 ? pack : 1;

  // What the per-item price actually buys. Without it "5,20 zł" cannot
  // be told apart from a bargain or a rip-off — is that 100 g or 400 g?
  // `z` in base units (g / ml / szt), `zu` the unit; both absent when
  // the receipt did not say.
  const pkg  = packageSizeFrom(line);
  const size = pkg ? { z: pkg.size, zu: pkg.unit } : {};

  return { d: date, a: round2(amount / count), u: "szt", ...where, ...size };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Statistics ───────────────────────────────────────────────

/** Middle value; the average of the two middles for an even count. */
function median(numbers) {
  const sorted = [...numbers].sort((x, y) => x - y);
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : round2((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Drops observations outside the window and keeps only the newest few. */
function pruneObservations(observations, today = new Date()) {
  const cutoff = new Date(today.getTime() - WINDOW_DAYS * 86_400_000)
    .toISOString().slice(0, 10);
  return [...(observations || [])]
    .filter(o => o && typeof o.a === "number" && (o.d ?? "") >= cutoff)
    .sort((a, b) => (b.d ?? "").localeCompare(a.d ?? ""))
    .slice(0, MAX_OBSERVATIONS);
}

/** Records one observation, newest first, pruned. */
function addObservation(observations, observation, today = new Date()) {
  if (!observation) return pruneObservations(observations, today);
  return pruneObservations([observation, ...(observations || [])], today);
}

/**
 * What the panel shows for a product: the typical price, the last one,
 * and what they are measured in. Returns null when there is nothing
 * worth showing.
 *
 * Only the DOMINANT unit is summarized. A product bought loose one week
 * and packaged the next would otherwise average kilograms with pieces.
 */
function summarize(observations, today = new Date()) {
  const kept = pruneObservations(observations, today);
  if (kept.length === 0) return null;

  const counts = kept.reduce((acc, o) => ({ ...acc, [o.u]: (acc[o.u] || 0) + 1 }), {});
  const unit = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const group = kept.filter(o => o.u === unit);

  return {
    unit,
    count:  group.length,
    last:   group[0].a,
    lastAt: group[0].d,
    // Below the threshold "usually" would be a claim the data cannot
    // support, so the panel shows only the last price.
    median: group.length >= MIN_FOR_MEDIAN ? median(group.map(o => o.a)) : null,
  };
}

module.exports = {
  MAX_OBSERVATIONS,
  WINDOW_DAYS,
  MIN_FOR_MEDIAN,
  parsePackCount,
  parsePackageSize,
  parseWeightKg,
  observationFrom,
  median,
  pruneObservations,
  addObservation,
  summarize,
};
