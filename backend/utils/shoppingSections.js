// ============================================================
// File: backend/utils/shoppingSections.js
// Shop sections for the shopping list — what turns a flat list into a
// route through the shop instead of a lap per item.
//
// Assignment is automatic and never asked for: a keyword guess from the
// product name, overridden by whatever section that product was last
// given (remembered per catalog entry, so one correction sticks for
// good). That order matters — a household's "płyn" is whatever they buy,
// not whatever the dictionary guessed first.
//
// Mirrored in frontend/src/data/constants/shoppingSections.ts: two
// runtimes, no shared build. A section added here must be added there
// too, or the UI will have no label for what the API stores.
//
// The keyword lists are matched against the FOLDED name (no diacritics,
// no punctuation), so "Płyn do naczyń" is compared as "plyn do naczyn".
// ============================================================

const { foldProductName } = require("./productCatalog");

/** Section ids in the order a shop is usually walked. The panel renders
 *  its groups in exactly this order, so this array IS the route. */
const SECTION_IDS = [
  "warzywa", "pieczywo", "nabial", "mieso", "gotowe", "mrozone",
  "suche", "slodycze", "napoje", "chemia", "higiena", "apteka",
  "dzieci", "ubrania", "dom", "inne",
];

/** Fallback for anything the dictionary does not recognize. */
const DEFAULT_SECTION = "inne";

// Keywords are substrings of the folded name, deliberately truncated to
// stems ("bulk" catches bułka/bułki/bułeczki). Order within the map does
// not matter because ambiguous single words are avoided: the entry is
// "plyn do naczyn", never a bare "plyn", which would swallow half the
// hygiene aisle.
const SECTION_KEYWORDS = {
  warzywa: [
    "pomidor", "ogorek", "ogork", "cebul", "ziemniak", "marchew", "salat",
    "papryk", "czosnek", "banan", "jabl", "cytryn", "pietrusz", "por ",
    "kapust", "brokul", "pieczark", "winogron", "truskaw", "mandarynk",
    "awokado", "szpinak", "burak", "seler", "cukini", "baklazan", "gruszk",
    "sliwk", "arbuz", "malin", "borowk", "brzoskwin", "kiwi", "warzyw", "owoc",
  ],
  pieczywo: [
    "chleb", "bulk", "buleczk", "bagietk", "rogal", "tortill", "pita",
    "croissant", "drozdzowk", "pieczywo", "chalk", "bulka",
  ],
  nabial: [
    "mleko", "ser ", "serek", "sera", "jogurt", "smietan", "maslo", "twarog",
    "kefir", "jaj", "mozarell", "margaryn", "maslank", "feta", "mascarpone",
    "parmezan", "budyn", "nabial",
  ],
  mieso: [
    "mielone", "kurczak", "schab", "kielbas", "szynk", "boczek", "karkow",
    "filet", "parowk", "indyk", "wolow", "wieprz", "ryba", "losos", "pasztet",
    "salami", "mieso", "wedlin", "zeberk", "kabanos", "tunczyk", "sledz",
  ],
  gotowe: [
    "danie gotowe", "dania gotowe", "gotowiec", "zapiekank", "sushi",
    // "salatk" (sałatka, a ready meal) has to outrank warzywa's "salat"
    // (sałata, a vegetable) — the longer-keyword tie-break does that.
    "salatk", "kanapk", "hot dog", "burger", "zupka", "instant",
    "pizza", "kotlet", "nalesnik", "placki", "obiad",
  ],
  mrozone: ["mrozon", "lody", "pierogi", "frytk", "mrozonk"],
  suche: [
    "makaron", "ryz", "kasz", "maka", "cukier", "sol", "pieprz", "przypraw",
    "olej", "ocet", "ketchup", "majonez", "musztard", "konserw", "platk",
    "musli", "fasol", "soczewic", "herbat", "kawa", "kakao", "dzem", "miod",
    "sos ", "bulion", "puszk", "oliw", "drozdz", "bulk proszek",
  ],
  slodycze: [
    "czekolad", "cukierk", "ciastk", "batonik", "chips", "paluszk", "zelk",
    "wafel", "wafl", "orzech", "guma do zucia", "lizak", "prazynk", "krakers",
    "sniadaniow", "delicj", "ptasie",
  ],
  napoje: [
    "woda", "sok ", "soku", "cola", "pepsi", "napoj", "piwo", "wino",
    "energetyk", "lemoniad", "syrop", "tonic", "mineraln", "gazowan",
  ],
  // Stems, not whole phrases: "Płyn do MYCIA naczyń" must hit the same
  // entry as "płyn do naczyń", so the keyword is the distinctive noun.
  chemia: [
    "naczyn", "do prania", "zmywark", "plukania tkanin", "odplamiacz",
    "smieci", "gabk", "zmywak", "scierk", "domestos", "ajax", "cif",
    "odswiezacz", "do szyb", "wybielacz", "nablyszcz", "chemia", "plyn do wc",
  ],
  // Nappies live in `dzieci`, not here: a household with a small child
  // buys them next to the wipes and the porridge, not next to shampoo.
  higiena: [
    "papier toaletow", "reczniki papierow", "chusteczk", "szampon", "mydlo",
    "pasta do zebow", "szczoteczk", "nitk do zebow", "plyn do plukania ust",
    "dezodorant", "podpask", "tampon", "zel pod prysznic",
    "krem", "maszynk do golenia", "pianka do golenia", "wat", "balsam",
    "patyczk", "plaster", "prezerwatyw", "lakier do wlosow", "odzywk",
  ],
  // Deliberately no bare "tabletk" or "lek": the first would swallow
  // "tabletki do zmywarki", and "lek" is a substring of "mleko".
  apteka: [
    "apteka", "leki", "lekarstw", "paracetamol", "ibuprofen", "ibuprom",
    "apap", "aspiryn", "polopiryn", "gripex", "rutinoscorbin", "witamin",
    "magnez", "probiotyk", "elektrolit", "syrop na kaszel", "tabletki na",
    "masc", "bandaz", "woda utleniona", "octenisept", "termometr",
    "melatonin", "tran", "strepsils", "recept", "no spa", "nospa",
  ],
  dzieci: [
    "pielusz", "pieluch", "pampers", "smoczek", "kaszk", "mleko modyfikowane",
    "butelk do karmienia", "zabawk", "kredk", "plastelin", "zeszyt",
    "blok techniczn", "blok rysunkow", "farbk", "chusteczki nawilzane",
    "mokre chusteczki", "kinder", "sok dla dzieci", "dla dziecka", "dla corki",
    "dla syna",
  ],
  ubrania: [
    "skarpet", "majtk", "bielizn", "koszul", "spodni", "spodenk", "bluz",
    "sukienk", "kurtk", "czapk", "szalik", "rekawiczk", "pizam", "rajstop",
    "legins", "t-shirt", "tshirt", "buty", "trampk", "kapc", "szlafrok",
    "stanik", "sweter", "dres", "getr", "obuwie",
  ],
  dom: [
    "bateri", "zarowk", "swiec", "znicz", "sznurek", "klej", "tasm",
    "zapalk", "folia", "papier do pieczenia", "serwetk", "worek", "doniczk",
    "karma", "zwirek",
  ],
};

/** Is this a section the API should accept? */
function isSection(id) {
  return SECTION_IDS.includes(id);
}

/**
 * Best-effort section for a product name. Returns DEFAULT_SECTION when
 * nothing matches — a wrong guess is worse than an honest "Inne", and the
 * user's own correction is what the catalog remembers afterwards.
 *
 * Pure function — unit-tested.
 */
function guessSection(name) {
  const folded = ` ${foldProductName(name)} `;   // pad so " por " style stems work
  if (folded.trim() === "") return DEFAULT_SECTION;

  // The EARLIEST match in the string wins, not the first section that
  // matches anything. Polish product names lead with the noun and trail
  // with adjectives — "chipsy paprykowe", "płyn do naczyń cytrynowy" —
  // so position is what separates what the thing IS from what it tastes
  // of. Taking the first matching section instead filed both of those
  // under warzywa, on "papryk" and "cytryn".
  let best = null;

  // Ties on position go to the LONGER keyword, because the longer one is
  // the more specific claim: "mleko modyfikowane" and "sok dla dzieci"
  // both start where plain "mleko" and "sok" do, and both belong in the
  // children's aisle rather than with dairy and drinks. Failing that,
  // SECTION_IDS order (the shop route) decides.
  for (const section of SECTION_IDS) {
    for (const keyword of SECTION_KEYWORDS[section] ?? []) {
      const at = folded.indexOf(keyword);
      if (at === -1) continue;
      const better = best === null
        || at < best.at
        || (at === best.at && keyword.length > best.length);
      if (better) best = { section, at, length: keyword.length };
    }
  }

  return best ? best.section : DEFAULT_SECTION;
}

/** Sort comparator putting items in shop-route order. Unknown sections
 *  sort last, next to "inne", instead of crashing the sort. */
function sectionOrder(id) {
  const i = SECTION_IDS.indexOf(id);
  return i === -1 ? SECTION_IDS.length : i;
}

module.exports = {
  SECTION_IDS,
  DEFAULT_SECTION,
  SECTION_KEYWORDS,
  isSection,
  guessSection,
  sectionOrder,
};
