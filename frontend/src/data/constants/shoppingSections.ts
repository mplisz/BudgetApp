// ============================================================
// File: src/data/constants/shoppingSections.ts
// Shop sections for the shopping list — labels and icons for what the
// API stores as a plain id.
//
// The ORDER of this object is the order the panel renders its groups in,
// and it is meant to read as a walk through the shop rather than an
// alphabet. Reorder it to match how you actually shop; nothing else
// depends on the sequence.
//
// Mirrored in backend/utils/shoppingSections.js, which owns the keyword
// dictionary that guesses a section from a product name. A section added
// here must be added there too, or the API will reject it.
// ============================================================

export interface ShoppingSection {
  label: string;
  icon:  string;
}

export const SHOPPING_SECTIONS = {
  warzywa:  { label: "Warzywa i owoce", icon: "🥬" },
  pieczywo: { label: "Pieczywo",        icon: "🥖" },
  nabial:   { label: "Nabiał",          icon: "🧀" },
  mieso:    { label: "Mięso i wędliny", icon: "🥩" },
  gotowe:   { label: "Dania gotowe",    icon: "🍲" },
  mrozone:  { label: "Mrożonki",        icon: "🧊" },
  suche:    { label: "Sypkie i sosy",   icon: "🍝" },
  przyprawy:{ label: "Przyprawy",       icon: "🧂" },
  kuchnie:  { label: "Kuchnie świata",  icon: "🌏" },
  slodycze: { label: "Słodycze",        icon: "🍫" },
  napoje:   { label: "Napoje",          icon: "🥤" },
  alkohol:  { label: "Alkohol",         icon: "🍷" },
  chemia:   { label: "Chemia",          icon: "🧽" },
  higiena:  { label: "Higiena",         icon: "🧴" },
  apteka:   { label: "Apteka",          icon: "💊" },
  dzieci:   { label: "Dzieci",          icon: "🧸" },
  ubrania:  { label: "Ubrania",         icon: "👕" },
  dom:      { label: "Dom",             icon: "🔌" },
  inne:     { label: "Inne",            icon: "📦" },
} as const satisfies Record<string, ShoppingSection>;

export type SectionId = keyof typeof SHOPPING_SECTIONS;

export const SECTION_IDS = Object.keys(SHOPPING_SECTIONS) as SectionId[];

export const DEFAULT_SECTION: SectionId = "inne";

/** Never throws on an id written by an older/newer version of the API —
 *  an unknown section renders as "Inne" rather than blanking the row. */
export function sectionMeta(id: string | null | undefined): ShoppingSection {
  return SHOPPING_SECTIONS[(id ?? "") as SectionId] ?? SHOPPING_SECTIONS[DEFAULT_SECTION];
}

/** Position in the shop route; unknown ids sort last. */
export function sectionOrder(id: string | null | undefined): number {
  const i = SECTION_IDS.indexOf((id ?? "") as SectionId);
  return i === -1 ? SECTION_IDS.length : i;
}
