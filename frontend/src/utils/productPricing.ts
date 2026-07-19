// ============================================================
// File: src/utils/productPricing.ts
// Pure logic for the "Ceny produktów" analytics section.
//
// Pipeline (phase 1+2 of the product-price feature — deterministic,
// no backend, no Products container yet):
//   1. normalizeProductName: receipt line description → folded name key
//      with the size token ("200G", "1,5L", "2x330ML") extracted into a
//      separate field. The size is deliberately NOT part of the key, so
//      a shrinkflated "MASLO EKST.195G" still matches "MASLO EKST.200G".
//   2. buildPriceHistory: transactions (merchant + lineItems) → products
//      grouped by name key, each with chronological price occurrences and
//      unit prices (zł/kg, zł/l, zł/szt) where the size is known.
//
// Everything here is a pure function — see productPricing.test.ts.
// ============================================================

export type SizeUnit = "g" | "ml" | "szt";

export interface ParsedName {
  nameKey: string;           // folded description without the size token
  size:    number | null;    // in base unit (g / ml / szt), multipack included
  unit:    SizeUnit | null;
}

export interface PriceLineItem {
  description: string;
  amount:      number;       // PLN
}

/** Minimal transaction shape the aggregation needs (subset of range docs). */
export interface PricedTransaction {
  type:        string;
  date:        string;
  budgetMonth: string;
  merchant?:   string | null;
  lineItems?:  PriceLineItem[];
}

export interface PriceOccurrence {
  date:      string;
  month:     string;
  merchant:  string;
  raw:       string;          // original receipt description
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
  nameKey:     string;
  label:       string;             // latest raw description — display name
  merchants:   string[];           // distinct shops, by first purchase
  occurrences: PriceOccurrence[];  // sorted by date, oldest first
  shrink:      ShrinkEvent | null; // latest size decrease, if any
}

export interface PriceHistoryStats {
  txWithItems:     number;  // expense transactions with merchant + line items
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

// "2x200g" / "2 x 200 g" — multipack prefix multiplies the extracted size.
const PACK_RE = /(\d+)\s*[x*]\s*(?=\d)/;
// Longer units first so "kg" isn't consumed as "g" and "ml" as "l".
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|szt)\b/;

const UNIT_BASE: Record<string, { unit: SizeUnit; factor: number }> = {
  kg:  { unit: "g",   factor: 1000 },
  g:   { unit: "g",   factor: 1 },
  l:   { unit: "ml",  factor: 1000 },
  ml:  { unit: "ml",  factor: 1 },
  szt: { unit: "szt", factor: 1 },
};

export function normalizeProductName(raw: string): ParsedName {
  // Keep ",.%" so decimals ("1,5") and fat content ("3,2%") survive folding.
  let s = ` ${foldText(raw)} `.replace(/[^a-z0-9%,.]+/g, " ");

  let pack = 1;
  s = s.replace(PACK_RE, (_m, n: string) => {
    pack = parseInt(n, 10) || 1;
    return " ";
  });

  // Collected via an object — assignments inside the replace() callback
  // don't survive TS control-flow narrowing on plain `let` unions.
  const found: { size: number | null; unit: SizeUnit | null } = { size: null, unit: null };
  s = s.replace(SIZE_RE, (_m, num: string, u: string) => {
    const base = UNIT_BASE[u];
    found.size = parseFloat(num.replace(",", ".")) * base.factor;
    found.unit = base.unit;
    return " ";
  });
  const size = found.size === null ? null : found.size * pack;
  const unit = found.unit;

  // Drop punctuation orphaned by token removal ("ekst." → "ekst"),
  // but keep it inside tokens ("3,2%" stays intact).
  const nameKey = s
    .split(/\s+/)
    .map(tok => tok.replace(/^[.,]+|[.,]+$/g, ""))
    .filter(Boolean)
    .join(" ");

  return { nameKey: nameKey || foldText(raw).trim(), size, unit };
}

// ── Unit price ────────────────────────────────────────────────

export function computeUnitPrice(
  price: number,
  size: number | null,
  unit: SizeUnit | null,
): number | null {
  if (!unit || !size || size <= 0) return null;
  const perBase = price / size;
  return unit === "szt" ? perBase : perBase * 1000;  // zł/kg | zł/l
}

export function unitPriceLabel(unit: SizeUnit): string {
  return unit === "g" ? "zł/kg" : unit === "ml" ? "zł/l" : "zł/szt";
}

/** "200 g", "1,5 kg", "10 szt" — human size for tables/badges. */
export function formatSize(size: number, unit: SizeUnit): string {
  const scaled = unit !== "szt" && size >= 1000
    ? { value: size / 1000, label: unit === "g" ? "kg" : "l" }
    : { value: size, label: unit };
  const num = Number(scaled.value.toFixed(2)).toString().replace(".", ",");
  return `${num} ${scaled.label}`;
}

// ── Chart metric selection ────────────────────────────────────

export interface ProductMetric {
  useUnitPrice: boolean;
  label:        string;                          // axis/tooltip unit
  value:        (o: PriceOccurrence) => number;
}

/** Unit price is only comparable when EVERY occurrence has it in the same
 *  unit; otherwise fall back to the plain line price. */
export function productMetric(p: ProductHistory): ProductMetric {
  const units = new Set(p.occurrences.map(o => o.unit));
  const complete = p.occurrences.every(o => o.unitPrice !== null);
  if (complete && units.size === 1 && p.occurrences[0].unit) {
    return {
      useUnitPrice: true,
      label: unitPriceLabel(p.occurrences[0].unit),
      value: o => o.unitPrice as number,
    };
  }
  return { useUnitPrice: false, label: "zł", value: o => o.price };
}

// ── Aggregation ───────────────────────────────────────────────

/** Latest size decrease between consecutive sized purchases of one product. */
function detectShrink(occurrences: PriceOccurrence[]): ShrinkEvent | null {
  let prev: PriceOccurrence | null = null;
  let event: ShrinkEvent | null = null;
  for (const o of occurrences) {
    if (o.size === null || o.unit === null) continue;
    if (prev && prev.unit === o.unit && o.size < (prev.size as number)) {
      event = { date: o.date, fromSize: prev.size as number, toSize: o.size, unit: o.unit };
    }
    prev = o;
  }
  return event;
}

export function buildPriceHistory(
  transactions: PricedTransaction[],
  months?: Set<string>,
): PriceHistoryResult {
  const byName = new Map<string, ProductHistory>();
  let txWithItems = 0;

  for (const tx of transactions) {
    if (tx.type !== "EXPENSE") continue;
    if (months && !months.has(tx.budgetMonth)) continue;
    const merchant = (tx.merchant ?? "").trim();
    const items = tx.lineItems ?? [];
    if (!merchant || items.length === 0) continue;
    txWithItems++;

    for (const item of items) {
      if (!item.description?.trim() || !(item.amount > 0)) continue;
      const { nameKey, size, unit } = normalizeProductName(item.description);
      if (!nameKey) continue;

      let product = byName.get(nameKey);
      if (!product) {
        product = { nameKey, label: item.description, merchants: [], occurrences: [], shrink: null };
        byName.set(nameKey, product);
      }
      if (!product.merchants.includes(merchant)) product.merchants.push(merchant);
      product.occurrences.push({
        date:      tx.date,
        month:     tx.budgetMonth,
        merchant,
        raw:       item.description,
        price:     item.amount,
        size,
        unit,
        unitPrice: computeUnitPrice(item.amount, size, unit),
      });
    }
  }

  const products = [...byName.values()]
    .filter(p => p.occurrences.length >= MIN_OCCURRENCES)
    .map(p => {
      const occurrences = [...p.occurrences].sort((a, b) => a.date.localeCompare(b.date));
      return {
        ...p,
        occurrences,
        label:  occurrences[occurrences.length - 1].raw,  // freshest receipt wording
        shrink: detectShrink(occurrences),
      };
    })
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
