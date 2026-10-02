// ============================================================
// File: backend/utils/ocrLearning.js
// Learns product-description → category/subcategory assignments from
// the user's manual corrections in the OCR cart, so repeat purchases
// get categorized automatically on the next scan.
//
// Storage: ONE Settings doc per family, ocr_corrections_${familyId}:
//   entries: [{ desc, merchant, count, lastAt,
//               categoryName?, subcategoryName?, learnedDesc?, product? }]
// Keyed by (normalized desc, normalized merchant). Merchant scopes the
// key because the same OCR string can mean different products across
// shops; an empty merchant serves as a shop-agnostic fallback.
//
// What an entry teaches is a set of OPTIONAL parts — category pair, the
// description the user typed instead of the AI's, and a tracked product
// (an explicit null means "the user removed it"). A part is only stored
// when the user actually changed it; a later correction overwrites just
// the parts it carries. The same parts shape backs the EAN store
// (utils/ocrEan.js), which keys on the barcode instead of the text.
//
// Two consumers on the scan side:
//   - buildLearnedSection() injects the top entries into the LLM prompt
//     (generalizes to variants).
//   - buildCorrectionLookup() drives a deterministic override in
//     routes/ocr.js mapItemsToCategories (exact repeats, zero tokens).
// ============================================================

const { readSettingsDoc, upsertSettingsDoc } = require("./settingsDoc");

const CORRECTIONS_DOC = (familyId) => `ocr_corrections_${familyId}`;
const MAX_ENTRIES  = 1000;   // count-aware eviction beyond this
const PROMPT_LIMIT = 50;     // top-N entries injected into the prompt
const NAME_MAX     = 100;    // bound on category/subcategory names

// True for characters that could break the prompt layout or inject
// instructions once interpolated into the system prompt: C0/C1 control
// chars (incl. newlines/tabs), zero-width + bidi marks, and line/paragraph
// separators. Kept as a code-point test (no literal control chars in source).
function isUnsafeCodePoint(cp) {
  return cp <= 0x1F                       // C0 controls incl. \n \t
    || (cp >= 0x7F && cp <= 0x9F)         // DEL + C1 controls
    || (cp >= 0x200B && cp <= 0x200F)     // zero-width + LRM/RLM
    || cp === 0x2028 || cp === 0x2029     // line / paragraph separators
    || (cp >= 0x202A && cp <= 0x202E)     // bidi embeddings / overrides
    || (cp >= 0x2066 && cp <= 0x2069);    // bidi isolates
}

// Replace unsafe chars with a space, collapse whitespace, trim, bound length.
// The feedback endpoint accepts free-form strings, so this is the guard that
// keeps a crafted category name out of another scan's prompt.
function sanitizeForPrompt(s, max) {
  let out = "";
  for (const ch of (s == null ? "" : String(s))) {
    out += isUnsafeCodePoint(ch.codePointAt(0)) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}

// Normalize a description into a match key. Sanitizes, lowercases, and
// strips our own merge-count suffix (rule 3 in the OCR prompt appends
// "x2"/"x3" for merged identical lines — the quantity varies per shopping
// trip, so it must not fragment the key).
function normDesc(s) {
  return sanitizeForPrompt(s, 200)
    .toLowerCase()
    .replace(/\s*x\d+$/, "");
}

function normMerchant(s) {
  return sanitizeForPrompt(s, 150).toLowerCase();
}

function entryKey(desc, merchant) {
  return `${desc}|${merchant}`;
}

const DESC_MAX = 200;
const UNIT_MAX = 20;

// A stored description never carries the merge-count suffix: "x2" belongs
// to one shopping trip, not to the product (see normDesc).
function stripCountSuffix(s) {
  return s.replace(/\s*x\d+$/i, "").trim();
}

// Clean the learnable parts of one correction. Free-form strings come from
// the feedback endpoint, so everything is sanitized and bounded here. Returns
// only the parts present; `product` is undefined (not taught), null (user
// removed it) or { name, size, unit }.
function cleanLearnedParts(c) {
  const parts = {};
  const cat = sanitizeForPrompt(c.categoryName, NAME_MAX);
  const sub = sanitizeForPrompt(c.subcategoryName, NAME_MAX);
  if (cat && sub) { parts.categoryName = cat; parts.subcategoryName = sub; }

  const desc = stripCountSuffix(sanitizeForPrompt(c.finalDescription, DESC_MAX));
  if (desc) parts.learnedDesc = desc;

  if (c.product === null) {
    parts.product = null;
  } else if (c.product && typeof c.product === "object") {
    const name = sanitizeForPrompt(c.product.name, NAME_MAX);
    if (name) {
      const size = typeof c.product.size === "number" && c.product.size > 0 ? c.product.size : null;
      const unit = sanitizeForPrompt(c.product.unit, UNIT_MAX) || null;
      parts.product = { name, size, unit };
    }
  }
  return parts;
}

function hasLearnedParts(parts) {
  return !!(parts.categoryName || parts.learnedDesc || parts.product !== undefined);
}

// Fold a correction's parts into an entry, overwriting only what it carries.
function applyLearnedParts(entry, parts) {
  if (parts.categoryName) {
    entry.categoryName    = parts.categoryName;
    entry.subcategoryName = parts.subcategoryName;
  }
  if (parts.learnedDesc)           entry.learnedDesc = parts.learnedDesc;
  if (parts.product !== undefined) entry.product     = parts.product;
}

// The description to show for a line the store recognized: the learned one,
// with the quantity suffix of THIS receipt's line ("x2") carried over.
function withLearnedDescription(learnedDesc, incoming) {
  const suffix = /\s(x\d+)$/i.exec(String(incoming || ""));
  return suffix ? `${learnedDesc} ${suffix[1]}` : learnedDesc;
}

// Point-read the family's corrections. Returns the entries array (or []).
async function fetchCorrections(container, familyId) {
  const { doc } = await readSettingsDoc(container, CORRECTIONS_DOC(familyId), familyId);
  return Array.isArray(doc?.entries) ? doc.entries : [];
}

// Merge a batch of corrections into the store. Dedup by (desc, merchant):
// a repeat bumps count and refreshes the parts it carries (the latest
// correction wins). Caps at MAX_ENTRIES with count-aware eviction — frequently
// confirmed / recent entries survive, one-off OCR typos get dropped.
// Best-effort, never throws.
async function rememberCorrections(container, familyId, corrections) {
  const clean = (corrections || [])
    .map(c => ({
      desc:     normDesc(c.description),
      merchant: normMerchant(c.merchant),
      parts:    cleanLearnedParts(c),
    }))
    .filter(c => c.desc && hasLearnedParts(c.parts));
  if (!clean.length) return;

  await upsertSettingsDoc(container, {
    id: CORRECTIONS_DOC(familyId),
    familyId,
    type:   "OCR_CORRECTIONS",
    logTag: "OCR_LEARN",
    mutate: (doc) => {
      const entries = Array.isArray(doc.entries) ? doc.entries : [];
      const byKey   = new Map(entries.map(e => [entryKey(e.desc, e.merchant), e]));
      const now     = new Date().toISOString();

      for (const c of clean) {
        const k = entryKey(c.desc, c.merchant);
        const existing = byKey.get(k);
        if (existing) {
          applyLearnedParts(existing, c.parts);
          existing.count  = (existing.count || 1) + 1;
          existing.lastAt = now;
        } else {
          const entry = { desc: c.desc, merchant: c.merchant, count: 1, lastAt: now };
          applyLearnedParts(entry, c.parts);
          byKey.set(k, entry);
        }
      }

      let merged = Array.from(byKey.values());
      if (merged.length > MAX_ENTRIES) {
        // Keep the most-confirmed, then most-recent.
        merged.sort((a, b) => (b.count - a.count) || (b.lastAt || "").localeCompare(a.lastAt || ""));
        merged = merged.slice(0, MAX_ENTRIES);
      }
      return { ...doc, entries: merged };
    },
  });
}

// Build an O(1) lookup for the deterministic override. Keyed exactly as
// stored, so the caller probes "desc|merchant" first, then "desc|".
function buildCorrectionLookup(entries) {
  const map = new Map();
  for (const e of (entries || [])) map.set(entryKey(e.desc, e.merchant), e);
  return map;
}

// Render the top entries as a prompt block, or "" when there are none.
// Ordered by count desc so the model sees the user's strongest habits.
function buildLearnedSection(entries) {
  // Entries that only taught a description/product carry no category.
  const withCategory = (entries || []).filter(e => e.categoryName && e.subcategoryName);
  if (!withCategory.length) return "";
  const top = withCategory
    .sort((a, b) => (b.count - a.count) || (b.lastAt || "").localeCompare(a.lastAt || ""))
    .slice(0, PROMPT_LIMIT);
  const lines = top
    .map(e => `- "${e.desc}"${e.merchant ? ` [${e.merchant}]` : ""} → ${e.categoryName} › ${e.subcategoryName}`)
    .join("\n");
  return `\nNAUCZONE PRZYPISANIA UŻYTKOWNIKA (priorytet nad Twoją oceną — te pozycje użytkownik już kategoryzował ręcznie; jeśli pozycja pasuje, użyj tej samej kategorii i podkategorii):\n${lines}\n`;
}

module.exports = {
  sanitizeForPrompt,
  cleanLearnedParts,
  hasLearnedParts,
  applyLearnedParts,
  withLearnedDescription,
  normDesc,
  normMerchant,
  fetchCorrections,
  rememberCorrections,
  buildCorrectionLookup,
  buildLearnedSection,
};
