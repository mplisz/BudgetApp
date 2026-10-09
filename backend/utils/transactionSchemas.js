// ============================================================
// File: backend/utils/transactionSchemas.js
// Zod schemas for POST / PATCH /api/transactions.
//
// Lives outside routes/transactions.js so it can be required without a
// Cosmos connection (see transactionSchemas.test.js).
//
// The rule this file exists to keep: a PATCH must never invent a value for
// a field the client did not send. In zod 4 `.partial()` does NOT switch
// `.default()` off — an omitted `tags` still parses to `[]` — and the route
// merges the parsed body over the stored document. So the shared field set
// below carries NO defaults; they are added back for POST only.
// ============================================================

const { z } = require("zod");
const { BUDGET_MONTH_REGEX } = require("./helpers");
const { PRODUCT_UNIT_CODES } = require("./productUnits");

// Fields shared by POST and PATCH — validation only, no .default().
const TransactionFieldsSchema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:             z.enum(["EXPENSE", "INCOME", "SAVING", "TRANSFER"]).optional(),
  budgetMonth:      z.string().regex(BUDGET_MONTH_REGEX),
  subcategoryId:    z.string().min(1),
  subcategoryName:  z.string().min(1),
  categoryId:       z.string().min(1),
  categoryName:     z.string().min(1),
  amount:           z.number().positive(),
  originalAmount:   z.number().positive(),
  originalCurrency: z.string().length(3),
  fxRate:           z.number().positive(),
  description:      z.string().max(500).transform(v => v.trim()),
  tags:             z.array(z.string()),
  priority:         z.number().int().min(1).max(4),
  useVoucher:       z.boolean(), //fallback for old docs
  voucherId:        z.string().nullable(),//fallback for old docs
  voucherAmount:    z.number().min(0),//fallback for old docs
  merchant:         z.string().max(150).optional().nullable(), // shop; drives voucher store-match
  lineItems:        z.array(z.object({
                      description:      z.string().max(200),
                      amount:          z.number(),
                      originalAmount:  z.number().optional(),
                      originalCurrency: z.string().max(5).optional(),
                      // Structured product identity from the OCR AI —
                      // consumed by the price-history analytics. Fields are
                      // nullable (the model emits null, not omission) and a
                      // malformed product degrades to none via .catch().
                      product:          z.object({
                        name:      z.string().max(120).nullable().optional(),
                        size:      z.number().nullable().optional(),
                        unit:      z.enum(PRODUCT_UNIT_CODES).nullable().optional(),
                        packCount: z.number().int().positive().max(99).nullable().optional(),
                      }).nullable().optional().catch(undefined),
                      // Units this line's amount covers, filled for EVERY
                      // line (OCR rule 27) — unlike product, which only
                      // exists for whitelisted items. Without it a
                      // multipack's price is a multiple of the real one.
                      packCount:        z.number().int().positive().max(99).nullable().optional().catch(undefined),
                    })).max(60).optional(),
  voucherAllocations: z.array(z.object({
                      voucherId: z.string().min(1),
                      amount:    z.number().min(0),
                    })).max(20).optional(),

});

// POST = shared fields + create-time defaults + create-only fields
// (receipt/recurring/warranty).
const TransactionPostSchema = TransactionFieldsSchema.extend({
  description:     z.string().max(500).optional().default("").transform(v => v?.trim() ?? ""),
  tags:            z.array(z.string()).optional().default([]),
  priority:        z.number().int().min(1).max(4).optional().default(2),
  useVoucher:      z.boolean().optional().default(false), //fallback for old docs
  voucherId:       z.string().nullable().optional().default(null),//fallback for old docs
  voucherAmount:   z.number().min(0).optional().default(0),//fallback for old docs
  isRecurring:     z.boolean().optional().default(false),
  recurringId:     z.string().nullable().optional().default(null),
  receiptBlobPath: z.string().max(300).optional().nullable(),
  receiptId:       z.string().max(120).optional().nullable(),
  isWarranty:      z.boolean().optional().default(false),
});

// A return entry's link to specific receipt lines. `index` points into the
// parent tx's lineItems[]; description + amount are a snapshot used to detect
// a stale client and to audit what exactly was given back.
const ReturnedLineItemSchema = z.object({
  index:       z.number().int().min(0),
  description: z.string().max(200),
  amount:      z.number().positive(),
});

// PATCH = shared fields made optional, plus the patch-only `returns` array.
// Built from TransactionFieldsSchema (no defaults), so an omitted field is
// absent from the parsed output and the route's merge leaves the stored
// value untouched. Defaults INSIDE a returns[] entry are fine: the array is
// replaced as a whole, only ever when the client sends it.
// .extend() must run before the refines — you can't .extend() a refined
// schema.
const TransactionPatchSchema = TransactionFieldsSchema.partial()
  .extend({
    returns: z.array(z.object({
      amount:               z.number().positive(),
      currency:             z.string().length(3).default("PLN"),
      voucherAmount:        z.number().min(0).default(0),
      cashAmount:           z.number().min(0),
      surplusAmount:        z.number().min(0).optional(),
      kind:                 z.enum(["store", "reimbursement", "deposit"]).optional(),
      source:               z.enum(["person", "company"]).optional(),
      moneyReturnedInMonth: z.string().regex(BUDGET_MONTH_REGEX),
      returnedAt:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason:               z.string().max(500).optional().default("").transform(v => v?.trim() ?? ""),
      returnedBy:           z.string().optional().default(""),
      returnedById:         z.string().optional().default(""),
      createdAt:            z.string().optional(),
      returnedLineItems:    z.array(ReturnedLineItemSchema).max(60).optional(),
    })).optional(),
  })
  .refine(d => Object.keys(d).length > 0, { message: "No fields to update." })
  .refine(d => {
    if (d.useVoucher === true && d.voucherId !== undefined && !d.voucherId) return false;
    return true;
  }, { message: "useVoucher:true requires a non-empty voucherId." });

module.exports = {
  TransactionPostSchema,
  TransactionPatchSchema,
  ReturnedLineItemSchema,
};
