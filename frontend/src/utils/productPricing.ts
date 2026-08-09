// ============================================================
// File: src/utils/productPricing.ts
// Pure logic for the "Ceny produktów" analytics section.
//
// SCOPE — the receipt line must carry the AI-structured `product`, and the
// backend only ever attaches one when the item matched a product the user
// explicitly registered in their "inflation basket" (Admin → Produkty
// śledzone; see backend/utils/productCatalog.resolveTrackedProduct).
// Hand-typed transactions carry no `product` and are out of scope — that
// uniformity is what makes unit prices computable and the catalog key
// match the backend exactly.
//
// buildPriceHistory then groups occurrences by CATALOG identity when a
// resolver is supplied (cross-shop + manual merges), else by name fold.
//
// Everything here is a pure function — see productPricing.test.ts.
// ============================================================

import { PRODUCT_UNITS, type SizeUnit } from "../data/constants/productUnits";

// Re-exported so the many existing `import { SizeUnit } from productPricing`
// call sites keep working; the definition itself lives with the unit table.
export type { SizeUnit };

export interface ParsedName {
  nameKey:  string;          // folded product name (no size token)
  size:     number | null;   // in base unit (g / ml / szt), multipack included
  unit:     SizeUnit | null;
  packSize: number | null;   // single-package size (pre-multipack) — shrink detection
}

/** Structured product fields the OCR AI attaches to new line items.
 *  Older data has only the raw description — the regex path covers it. */
export interface LineItemProduct {
  name:       string;
  size?:      number | null;
  unit?:      SizeUnit | null;
  packCount?: number | null;
}

export interface PriceLineItem {
  description: string;
  amount:      number;       // PLN
  product?:    LineItemProduct | null;
}

/** A return's per-line allocation — only the fields the exclusion needs. */
export interface PricedReturn {
  kind?:              string | null;
  returnedLineItems?: Array<{ index: number; amount: number }> | null;
}

/** Minimal transaction shape the aggregation needs (subset of range docs). */
export interface PricedTransaction {
  type:           string;
  date:           string;
  budgetMonth:    string;
  merchant?:      string | null;
  lineItems?:     PriceLineItem[];
  returns?:       PricedReturn[] | null;
}

/** Distinct tracked-product names present on a set of line items — the one
 *  place that answers "does this transaction/cart item have a tracked
 *  product, and which one(s)". Used both to badge a row and to filter by
 *  it. Structural on purpose (not tied to PriceLineItem/TxLineItem) so any
 *  lineItems-shaped array with a `product` field works without a cast. */
export function trackedProductNames(
  lineItems: Array<{ product?: { name?: string | null } | null }> | undefined | null,
): string[] {
  return [...new Set(
    (lineItems ?? [])
      .map(li => li.product?.name)
      .filter((n): n is string => !!n)
  )];
}

/** Shown as the merchant for a purchase with no recorded shop. */
export const NO_MERCHANT = "(bez sklepu)";

export interface PriceOccurrence {
  date:      string;
  month:     string;
  merchant:  string;
  raw:       string;          // original receipt description (tooltip)
  label:     string;          // clean display name (size/pack stripped)
  price:     number;          // line price in PLN
  size:      number | null;
  unit:      SizeUnit | null;
  unitPrice: number | null;   // zł/kg, zł/l or zł/szt — null when size unknown
}

export interface ShrinkEvent {
  date:     string;
  fromSize: number;
  toSize:   number;
  unit:     SizeUnit;
}

export interface ProductHistory {
  nameKey:     string;             // grouping key (catalog id when catalog-backed)
  catalogId?:  string;             // set when this group maps to a catalog product
  label:       string;             // display name (catalog canonical, else freshest wording)
  merchants:   string[];           // distinct shops, by first purchase
  occurrences: PriceOccurrence[];  // sorted by date, oldest first
  shrink:      ShrinkEvent | null; // latest size decrease, if any
}

/** Catalog identity for a normalized key — supplied by the caller so the
 *  price history can group cross-shop and honour manual merges. */
export interface CatalogIdentity {
  groupId:       string;   // stable catalog product id
  canonicalName: string;
}
export type IdentityResolver = (catalogKey: string) => CatalogIdentity | null;

export interface PriceHistoryStats {
  txWithItems:     number;  // scanned transactions that contributed a product
  productsTotal:   number;  // distinct name keys before the min-occurrences filter
  productsTracked: number;  // products that passed the filter
  withUnitPrice:   number;  // tracked products charted in zł/kg | zł/l | zł/szt
}

export interface PriceHistoryResult {
  products: ProductHistory[];  // sorted by purchase count desc
  stats:    PriceHistoryStats;
}

/** Products bought fewer times than this are excluded — the long tail of
 *  one-off purchases carries no trend and would drown the picker. */
export const MIN_OCCURRENCES = 3;

// ── Name normalization ────────────────────────────────────────

const POLISH_FOLD: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

/** Lowercase + strip Polish diacritics. Exported so the UI can fold search
 *  input the same way the keys were folded. */
export function foldText(s: string): string {
  return s.toLowerCase().replace(/[ąćęłńóśźż]/g, ch => POLISH_FOLD[ch]);
}

/**
 * Catalog identity key — a FAITHFUL port of the backend's productKey
 * (utils/productCatalog.js): fold diacritics, drop all punctuation, append
 * the unit. Frontend and backend MUST agree so the catalog resolver hits.
 * Returns null for an empty name.
 */
export function catalogKey(name: string, unit: SizeUnit | null): string | null {
  const folded = foldText(name).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (!folded) return null;
  return `${folded}|${unit ?? ""}`;
}

// NOTE: the receipt-text regex parser (normalizeProductName /
// cleanProductLabel) lived here until products became structured-only.
// Sizes, multipacks and clean names now come from the OCR AI, so the
// parser had no callers left. Recover it from git if a text fallback is
// ever needed again.

// ── Unit price ────────────────────────────────────────────────

export function computeUnitPrice(
  price: number,
  size: number | null,
  unit: SizeUnit | null,
): number | null {
  if (!unit || !size || size <= 0) return null;
  const perBase = price / size;
  return perBase * PRODUCT_UNITS[unit].priceFactor;   // zł/kg | zł/l | zł/szt | zł/kWh | zł/m³
}

export function unitPriceLabel(unit: SizeUnit): string {
  return PRODUCT_UNITS[unit].priceLabel;
}

/** "200 g", "1,5 kg", "10 szt", "250 kWh" — human size for tables/badges. */
export function formatSize(size: number, unit: SizeUnit): string {
  const def = PRODUCT_UNITS[unit];
  const scaled = def.bigUnit && size >= def.priceFactor
    ? { value: size / def.priceFactor, label: def.bigUnit }
    : { value: size, label: def.label };
  const num = Number(scaled.value.toFixed(2)).toString().replace(".", ",");
  return `${num} ${scaled.label}`;
}

/** Parses a user-typed size/quantity field (Polish decimal comma allowed). */
export function parseSizeInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Chart metric selection ────────────────────────────────────

export interface ProductMetric {
  useUnitPrice: boolean;
  unit:         SizeUnit | null;   // dominant unit when useUnitPrice
  label:        string;            // axis/tooltip unit
  /** Comparable value per occurrence, or null when it can't share the axis
   *  (different unit, or no size) — the caller drops those from the chart. */
  value:        (o: PriceOccurrence) => number | null;
}

/**
 * The only comparable metric is the UNIT price (zł/kg·l·szt), never the
 * line total (a "2 szt" line total isn't comparable to a "1 szt" one).
 * We pick the DOMINANT unit — the one most occurrences share — and expose
 * unit price for those; occurrences in another unit or with no size return
 * null so they drop off the chart (still listed in the table). Only when
 * NOT ONE occurrence has a size do we fall back to the line price, and the
 * UI then warns that the values aren't comparable.
 */
export function productMetric(p: ProductHistory): ProductMetric {
  const counts = new Map<SizeUnit, number>();
  for (const o of p.occurrences) {
    if (o.unit && o.unitPrice !== null) counts.set(o.unit, (counts.get(o.unit) ?? 0) + 1);
  }
  if (counts.size > 0) {
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return {
      useUnitPrice: true,
      unit:         dominant,
      label:        unitPriceLabel(dominant),
      value:        o => (o.unit === dominant && o.unitPrice !== null ? o.unitPrice : null),
    };
  }
  return { useUnitPrice: false, unit: null, label: "zł", value: o => o.price };
}

// ── Aggregation ───────────────────────────────────────────────

/** One receipt line's package size — the shrink-detection input. */
interface ShrinkLine {
  date:     string;
  packSize: number | null;
  unit:     SizeUnit | null;
}

/**
 * Latest PACKAGE-size decrease. Works on per-line package sizes (never on
 * day-merged totals — buying two packs one day is not shrinkflation) and
 * requires a STABLE baseline: the previous size must repeat at least
 * twice in a row before a smaller one counts. Weighted goods (each line
 * a different random weight) never build a stable run, so they can't
 * false-alarm.
 */
function detectShrink(lines: ShrinkLine[]): ShrinkEvent | null {
  let stable: { size: number; unit: SizeUnit } | null = null;
  let prev:   { size: number; unit: SizeUnit } | null = null;
  let event: ShrinkEvent | null = null;
  for (const line of lines) {
    if (line.packSize === null || line.unit === null) continue;
    const cur = { size: line.packSize, unit: line.unit };
    if (prev && prev.unit === cur.unit && prev.size === cur.size) stable = cur;
    if (stable && stable.unit === cur.unit && cur.size < stable.size) {
      event  = { date: line.date, fromSize: stable.size, toSize: cur.size, unit: cur.unit };
      stable = null;   // a new stable run is required before the next flag
    }
    prev = cur;
  }
  return event;
}

/**
 * ONLY AI-structured line items count as products. A line without
 * `product` has no reliable identity — that is exactly how shop names
 * ("Reserved") and free-text labels leaked in as fake products, and how
 * size-less rows made prices incomparable. Requiring the structured
 * field keeps every entry uniform: clean name + size + unit, so unit
 * prices always compute and the catalog key always matches the backend.
 * Consequence: manually typed transactions never appear here.
 */
function parseItem(item: PriceLineItem): (ParsedName & { label: string }) | null {
  const structured = item.product;
  if (!structured?.name?.trim()) return null;

  const pack = structured.packCount && structured.packCount > 0 ? structured.packCount : 1;
  const unit = structured.unit ?? null;
  const packSize = unit && structured.size && structured.size > 0 ? structured.size : null;

  // For COUNT units both fields carry the same dimension, so a model that
  // echoes "x2" into size AND packCount would square it (2 cans → 4).
  // Collapse only when they match: different values are a real nesting
  // ("Jaja 10szt x2" = 10 per pack × 2 packs = 20), which must still multiply.
  const isCount = !!unit && PRODUCT_UNITS[unit].isCount;
  const countEchoed = isCount && packSize !== null && packSize === pack;
  const size = packSize !== null
    ? (countEchoed ? packSize : packSize * pack)
    : (isCount && pack > 1 ? pack : null);
  const label = structured.name.trim();
  return { nameKey: foldText(label).replace(/\s+/g, " ").trim(), size, unit, packSize, label };
}

/** Same product bought several times on one shopping trip (weighted goods
 *  print one line per piece) → ONE occurrence: summed price and size. */
function mergeSameDay(occurrences: PriceOccurrence[]): PriceOccurrence[] {
  const byVisit = new Map<string, PriceOccurrence[]>();
  for (const o of occurrences) {
    const key = `${o.merchant}|${o.date}`;
    const list = byVisit.get(key);
    if (list) list.push(o); else byVisit.set(key, [o]);
  }
  return [...byVisit.values()].map(parts => {
    if (parts.length === 1) return parts[0];
    const price = parts.reduce((s, o) => s + o.price, 0);
    const uniform = parts.every(o =>
      o.size !== null && o.unit !== null && o.unit === parts[0].unit);
    const size = uniform ? parts.reduce((s, o) => s + (o.size as number), 0) : null;
    const unit = uniform ? parts[0].unit : null;
    return { ...parts[0], price, size, unit, unitPrice: computeUnitPrice(price, size, unit) };
  });
}

export function buildPriceHistory(
  transactions: PricedTransaction[],
  months?: Set<string>,
  resolve?: IdentityResolver,
): PriceHistoryResult {
  const byName = new Map<string, ProductHistory>();
  const linesByName = new Map<string, ShrinkLine[]>();       // per-line, pre-merge
  const catalogByGroup = new Map<string, CatalogIdentity>(); // groupKey → catalog identity
  let txWithItems = 0;

  for (const tx of transactions) {
    if (tx.type !== "EXPENSE") continue;
    if (months && !months.has(tx.budgetMonth)) continue;
    const merchant = (tx.merchant ?? "").trim() || NO_MERCHANT;

    // Scanned receipts carry lineItems (a one-line receipt included —
    // singletons keep them when they hold product data). Anything else,
    // e.g. a hand-typed transaction, has no structured product and is
    // deliberately out of scope here.
    const items: PriceLineItem[] = tx.lineItems ?? [];

    // Per-line returned money (returns[].returnedLineItems, summed across
    // returns). A line returned IN FULL is excluded below — the purchase was
    // undone, so its price must feed neither the chart nor shrink detection.
    // A partial return keeps the occurrence: the unit price stayed real.
    // REIMBURSEMENTS don't count: someone paying the user back means the
    // goods were kept, so the purchase (and its price point) still happened.
    const returnedByIndex = new Map<number, number>();
    for (const ret of tx.returns ?? []) {
      if (ret.kind === "reimbursement") continue;
      for (const r of ret.returnedLineItems ?? []) {
        returnedByIndex.set(r.index, (returnedByIndex.get(r.index) ?? 0) + r.amount);
      }
    }

    let contributed = false;
    for (const [index, item] of items.entries()) {
      if (!item.description?.trim() || !(item.amount > 0)) continue;
      if ((returnedByIndex.get(index) ?? 0) >= item.amount - 0.01) continue;
      const parsed = parseItem(item);
      if (!parsed) continue;
      const { nameKey, size, unit, packSize, label } = parsed;

      // Catalog identity: resolve this line's catalog key to a canonical
      // group (honours cross-shop + manual merges). When a resolver IS
      // supplied, a line whose product isn't (or is no longer) in the
      // CURRENT whitelist is out of scope entirely — otherwise a product
      // removed from Settings, or a stale name from before it existed,
      // would keep showing up here forever via old transactions. With no
      // resolver at all (some callers don't have a catalog), fall back to
      // the old name-fold grouping unfiltered.
      const ck       = catalogKey(label, unit);
      const identity = ck && resolve ? resolve(ck) : null;
      if (resolve && !identity) continue;
      const groupKey = identity?.groupId ?? nameKey;

      let product = byName.get(groupKey);
      if (!product) {
        product = {
          nameKey:   groupKey,
          catalogId: identity?.groupId,
          label,
          merchants: [],
          occurrences: [],
          shrink: null,
        };
        byName.set(groupKey, product);
        linesByName.set(groupKey, []);
        if (identity) catalogByGroup.set(groupKey, identity);
      }
      if (!product.merchants.includes(merchant)) product.merchants.push(merchant);
      product.occurrences.push({
        date:      tx.date,
        month:     tx.budgetMonth,
        merchant,
        raw:       item.description,
        label,
        price:     item.amount,
        size,
        unit,
        unitPrice: computeUnitPrice(item.amount, size, unit),
      });
      linesByName.get(groupKey)!.push({ date: tx.date, packSize, unit });
      contributed = true;
    }
    if (contributed) txWithItems++;
  }

  const products = [...byName.values()]
    .map(p => {
      const occurrences = mergeSameDay(p.occurrences)
        .sort((a, b) => a.date.localeCompare(b.date));
      const lines = (linesByName.get(p.nameKey) ?? [])
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        ...p,
        occurrences,
        // Catalog canonical name wins; otherwise the freshest cleaned wording.
        label:  catalogByGroup.get(p.nameKey)?.canonicalName ?? occurrences[occurrences.length - 1].label,
        shrink: detectShrink(lines),
      };
    })
    .filter(p => p.occurrences.length >= MIN_OCCURRENCES)
    .sort((a, b) =>
      b.occurrences.length - a.occurrences.length || a.label.localeCompare(b.label));

  return {
    products,
    stats: {
      txWithItems,
      productsTotal:   byName.size,
      productsTracked: products.length,
      withUnitPrice:   products.filter(p => productMetric(p).useUnitPrice).length,
    },
  };
}
