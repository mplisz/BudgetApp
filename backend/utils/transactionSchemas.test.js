// ============================================================
// File: backend/utils/transactionSchemas.test.js
// POST / PATCH body schemas for transactions.
// Run:  node --test
//
// The regression behind this module: the PATCH schema was derived with
// .partial() from a schema whose fields carried .default(). In zod 4 the
// defaults survive .partial(), so a PATCH carrying only { returns } parsed to
// { returns, tags: [], priority: 2, description: "", ... } and the route's
// `{ ...existing, ...patch }` merge wiped the transaction's tags, priority
// and description. These tests pin that an omitted field stays omitted.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");
const { z }              = require("zod");

const { TransactionPostSchema, TransactionPatchSchema } = require("./transactionSchemas");

// The merge PATCH /api/transactions/:id performs on the parsed body.
function applyPatch(existing, body) {
  const data = TransactionPatchSchema.parse(body);
  const patchFields = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );
  return { ...existing, ...patchFields };
}

const EXISTING = {
  id:               "tx_MMs_20260901_biedronka_1",
  date:             "2026-09-01",
  budgetMonth:      "2026-09",
  subcategoryId:    "sub_food",
  subcategoryName:  "Jedzenie",
  categoryId:       "cat_home",
  categoryName:     "Dom",
  amount:           120.5,
  originalAmount:   120.5,
  originalCurrency: "PLN",
  fxRate:           1,
  description:      "Zakupy na wakacje",
  tags:             ["tag_wakacje", "tag_dzieci"],
  priority:         4,
  merchant:         "Biedronka",
  returns:          [],
};

const RETURN_ENTRY = {
  amount:               20,
  cashAmount:           20,
  kind:                 "reimbursement",
  source:               "person",
  moneyReturnedInMonth: "2026-09",
  returnedAt:           "2026-09-05",
};

describe("zod 4 mechanism", () => {
  test(".partial() does NOT switch .default() off", () => {
    // If this ever starts failing, zod changed and the split between
    // TransactionFieldsSchema and TransactionPostSchema can be revisited.
    const S = z.object({
      tags:     z.array(z.string()).optional().default([]),
      priority: z.number().optional().default(2),
      c:        z.string(),
    });
    assert.deepEqual(S.partial().parse({ c: "x" }), { tags: [], priority: 2, c: "x" });
  });
});

describe("TransactionPatchSchema", () => {
  test("a returns-only PATCH parses to returns and nothing else", () => {
    const data = TransactionPatchSchema.parse({ returns: [RETURN_ENTRY] });
    assert.deepEqual(Object.keys(data), ["returns"]);
  });

  test("a returns-only PATCH keeps tags, priority and description", () => {
    // What ReturnEntriesModal sends when the user reclassifies a return.
    const updated = applyPatch(EXISTING, { returns: [RETURN_ENTRY] });

    assert.deepEqual(updated.tags, ["tag_wakacje", "tag_dzieci"]);
    assert.equal(updated.priority, 4);
    assert.equal(updated.description, "Zakupy na wakacje");
    assert.equal(updated.returns.length, 1);
    assert.equal(updated.returns[0].kind, "reimbursement");
    assert.ok(!("useVoucher"    in updated));
    assert.ok(!("voucherId"     in updated));
    assert.ok(!("voucherAmount" in updated));
  });

  test("a PATCH without tags/priority (income edit) keeps them", () => {
    // What EditIncomeModal sends.
    const updated = applyPatch(EXISTING, {
      amount: 200, originalAmount: 200, originalCurrency: "PLN", fxRate: 1,
      date: "2026-09-02", description: "",
    });

    assert.equal(updated.amount, 200);
    assert.equal(updated.description, "", "an explicitly sent empty description still clears it");
    assert.deepEqual(updated.tags, ["tag_wakacje", "tag_dzieci"]);
    assert.equal(updated.priority, 4);
  });

  test("explicitly sent values still apply, including empty ones", () => {
    const updated = applyPatch(EXISTING, { tags: [], priority: 2, description: "  nowy opis  " });

    assert.deepEqual(updated.tags, []);
    assert.equal(updated.priority, 2);
    assert.equal(updated.description, "nowy opis");
    assert.equal(updated.merchant, "Biedronka");
  });

  test("entries inside returns[] still get their own defaults", () => {
    const { returns } = TransactionPatchSchema.parse({ returns: [RETURN_ENTRY] });
    assert.equal(returns[0].currency, "PLN");
    assert.equal(returns[0].voucherAmount, 0);
    assert.equal(returns[0].reason, "");
  });

  test("an empty body is rejected", () => {
    // Used to slip through: the defaults made the parsed object non-empty.
    const parsed = TransactionPatchSchema.safeParse({});
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.issues[0].message, "No fields to update.");
  });

  test("useVoucher:true with an empty voucherId is rejected", () => {
    assert.equal(TransactionPatchSchema.safeParse({ useVoucher: true, voucherId: "" }).success, false);
    assert.equal(TransactionPatchSchema.safeParse({ useVoucher: true, voucherId: "v1" }).success, true);
  });

  test("invalid values are still rejected", () => {
    assert.equal(TransactionPatchSchema.safeParse({ priority: 9 }).success, false);
    assert.equal(TransactionPatchSchema.safeParse({ amount: -1 }).success, false);
  });

  // The credit card follows the same rule: untouched unless sent, and null is
  // a value — it is how un-ticking the card on an edit clears it.
  test("cardId: omitted stays omitted, null clears, a string sets", () => {
    const paid = { ...EXISTING, cardId: "card_1" };

    assert.equal(applyPatch(paid, { returns: [RETURN_ENTRY] }).cardId, "card_1");
    assert.equal(applyPatch(paid, { cardId: null }).cardId, null);
    assert.equal(applyPatch(EXISTING, { cardId: "card_2" }).cardId, "card_2");
  });

  test("cardId must look like an id", () => {
    assert.equal(TransactionPatchSchema.safeParse({ cardId: "card 1; DROP" }).success, false);
    assert.equal(TransactionPatchSchema.safeParse({ cardId: "x".repeat(101) }).success, false);
  });
});

describe("TransactionPostSchema", () => {
  const MINIMAL = {
    date: "2026-09-01", budgetMonth: "2026-09",
    subcategoryId: "sub_food", subcategoryName: "Jedzenie",
    categoryId: "cat_home", categoryName: "Dom",
    amount: 10, originalAmount: 10, originalCurrency: "PLN", fxRate: 1,
  };

  test("create-time defaults still fire for omitted fields", () => {
    const data = TransactionPostSchema.parse(MINIMAL);

    assert.equal(data.description, "");
    assert.deepEqual(data.tags, []);
    assert.equal(data.priority, 2);
    assert.equal(data.useVoucher, false);
    assert.equal(data.voucherId, null);
    assert.equal(data.voucherAmount, 0);
    assert.equal(data.isRecurring, false);
    assert.equal(data.recurringId, null);
    assert.equal(data.isWarranty, false);
  });

  test("required fields stay required", () => {
    const { amount, ...noAmount } = MINIMAL;
    assert.equal(TransactionPostSchema.safeParse(noAmount).success, false);
  });

  test("description is trimmed", () => {
    assert.equal(TransactionPostSchema.parse({ ...MINIMAL, description: "  chleb " }).description, "chleb");
  });
});
