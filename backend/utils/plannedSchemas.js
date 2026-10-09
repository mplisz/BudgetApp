// ============================================================
// File: backend/utils/plannedSchemas.js
// Zod schemas for /api/planned (plans + wishes).
//
// Lives outside routes/planned.js so it can be required without a Cosmos
// connection (see plannedSchemas.test.js).
//
// Same rule as transactionSchemas.js: in zod 4 `.partial()` does NOT switch
// `.default()` off, so the field set shared with PATCH carries no defaults —
// otherwise an edit that omits `virtualSavings` would parse it to `[]` and
// the route would wipe the saved months. Defaults are added for POST only.
// ============================================================

const { z } = require("zod");
const { BUDGET_MONTH_REGEX } = require("./helpers");

// URL rule is shared by POST and PATCH — define it once.
const urlField = z.string().max(2000).trim()
  .refine(v => {
    if (v === "") return true;
    const m = v.match(/^([a-z][a-z0-9+.-]*):/i);
    return !m || /^https?$/i.test(m[1]);   // no scheme, or http(s) only
  }, { message: "URL has to start with http(s) or be a bare domain." });

// Create-time flavour: an omitted url is stored as "".
const urlSchema = urlField.optional().default("");

const virtualSavingsField = z.array(z.object({
  month:            z.string().regex(BUDGET_MONTH_REGEX),
  amount:           z.number().min(0),    // in original currency
  amountPLN:        z.number().min(0),
  fxRate:           z.number().positive().default(1),
  paidByUser:       z.boolean().default(false),
  dismissedByUser:  z.boolean().default(false),
}));

// Shared shape for every patchable field — validation only, no .default().
// `mode` lives only on POST — the expense type must not change after creation.
const PlannedFieldsSchema = z.object({
  description:          z.string().min(1).max(500).transform(v => v.trim()),
  totalAmount:          z.number().positive(),
  originalCurrency:     z.string().length(3),
  fxRate:               z.number().positive(),
  totalAmountPLN:       z.number().positive(),
  targetCategoryId:     z.string().min(1),
  targetCategoryName:   z.string().min(1),
  targetSubcategoryId:  z.string().min(1),
  targetSubcategoryName:z.string().min(1),
  tags:                 z.array(z.string()),
  priority:             z.number().int().min(1).max(4),
  plannedMonth:         z.string().regex(BUDGET_MONTH_REGEX),
  monthlySavingDay:     z.number().int().min(1).max(31),
  url:                  urlField,
  virtualSavings:       virtualSavingsField,
});

// POST: shared fields + create-time defaults + the required mode.
const PlannedPostSchema = PlannedFieldsSchema.extend({
  originalCurrency:     z.string().length(3).default("PLN"),
  fxRate:               z.number().positive().default(1),
  tags:                 z.array(z.string()).optional().default([]),
  priority:             z.number().int().min(1).max(4).optional().default(2),
  monthlySavingDay:     z.number().int().min(1).max(31).optional().default(1),
  url:                  urlSchema,
  virtualSavings:       virtualSavingsField.optional().default([]),
  mode:                 z.enum(["oneoff", "envelope"]),
});

// PATCH: every field optional. Built from PlannedFieldsSchema (no
// defaults), so an omitted field is absent from the parsed output and the
// route's merge never clobbers the stored value. At least one field required.
const PlannedPatchSchema = PlannedFieldsSchema.partial()
  .refine(d => Object.keys(d).length > 0, { message: "No fields to update." });

// A WISH ("zachcianka") is an undecided plan: no month, no committed price.
// Deliberately its OWN schema rather than a loosened PlannedFieldsSchema — the
// month regex and the positive-amount rule are what keep real plans sane, and
// they must not be weakened just to let an idea through. Everything here
// beyond the description exists only to make the later promotion one click.
const WishPostSchema = z.object({
  description:          z.string().min(1).max(500).transform(v => v.trim()),
  estimatedAmount:      z.number().positive().nullable().optional(),
  originalCurrency:     z.string().length(3).default("PLN"),
  targetCategoryId:     z.string().max(200).optional().default(""),
  targetCategoryName:   z.string().max(200).optional().default(""),
  targetSubcategoryId:  z.string().max(200).optional().default(""),
  targetSubcategoryName:z.string().max(200).optional().default(""),
  tags:                 z.array(z.string()).optional().default([]),
  priority:             z.number().int().min(1).max(4).optional().default(2),
  url:                  urlSchema,
});

module.exports = { PlannedPostSchema, PlannedPatchSchema, WishPostSchema };
