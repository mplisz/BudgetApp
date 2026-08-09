// ============================================================
// File: src/data/constants/productUnits.ts
// THE list of units a tracked product can be measured in.
//
// Everything about a unit lives here — its label, how a unit price is
// labelled, and whether it scales to a bigger display unit — so adding one
// means editing this object and nothing else. `SizeUnit` is derived from the
// keys, which is what makes a forgotten switch-case a compile error rather
// than a silent wrong number.
//
// Mirrored in backend/utils/productUnits.js: two runtimes, no shared build.
// A unit added here must be added there too or the API will reject it.
// ============================================================

export interface ProductUnit {
  /** How the unit is written next to a size ("1,5 kg" uses bigUnit instead). */
  label:      string;
  /** Axis/tooltip label for the comparable price. */
  priceLabel: string;
  /** Multiplier from "price per base unit" to the unit price above:
   *  grams → zł/kg is ×1000, kWh → zł/kWh is ×1. */
  priceFactor: number;
  /** Larger display unit and its threshold, when the base is inconveniently
   *  small. null when the base unit is already the natural one. */
  bigUnit:    string | null;
  /** A count rather than a measure. Only for these does a size and a pack
   *  count carry the SAME dimension, which parseItem has to avoid squaring. */
  isCount:    boolean;
}

export const PRODUCT_UNITS = {
  g:   { label: "g",   priceLabel: "zł/kg",  priceFactor: 1000, bigUnit: "kg", isCount: false },
  ml:  { label: "ml",  priceLabel: "zł/l",   priceFactor: 1000, bigUnit: "l",  isCount: false },
  szt: { label: "szt", priceLabel: "zł/szt", priceFactor: 1,    bigUnit: null, isCount: true  },
  // Utilities: the base unit is already the one bills are written in, so
  // there is nothing to scale and the price is simply zł per unit.
  kWh: { label: "kWh", priceLabel: "zł/kWh", priceFactor: 1,    bigUnit: null, isCount: false },
  m3:  { label: "m³",  priceLabel: "zł/m³",  priceFactor: 1,    bigUnit: null, isCount: false },
} as const satisfies Record<string, ProductUnit>;

export type SizeUnit = keyof typeof PRODUCT_UNITS;

export const PRODUCT_UNIT_CODES = Object.keys(PRODUCT_UNITS) as SizeUnit[];

/** Units the user can TYPE when registering a product, each mapped to the
 *  base unit stored everywhere else — so "1,5 l" is saved as 1500 ml and
 *  matches every size parsed off a receipt. */
export const UNIT_ENTRY_OPTIONS = {
  g:   { base: "g",   factor: 1,    label: "g"   },
  kg:  { base: "g",   factor: 1000, label: "kg"  },
  ml:  { base: "ml",  factor: 1,    label: "ml"  },
  l:   { base: "ml",  factor: 1000, label: "l"   },
  szt: { base: "szt", factor: 1,    label: "szt" },
  kWh: { base: "kWh", factor: 1,    label: "kWh" },
  m3:  { base: "m3",  factor: 1,    label: "m³"  },
} as const satisfies Record<string, { base: SizeUnit; factor: number; label: string }>;

export type UnitEntryKey = keyof typeof UNIT_ENTRY_OPTIONS;
