// ============================================================
// File: backend/routes/transactions.js
// GET    /api/transactions?budgetMonth=YYYY-MM
// GET    /api/transactions/range?from=YYYY-MM&to=YYYY-MM
// POST   /api/transactions
// PATCH  /api/transactions/:id
// DELETE /api/transactions/:id              (soft archive)
// POST   /api/transactions/:id/returns
//
// POST   /api/transactions/batch          (OCR / cart — split vouchers across txs)
//
// Changes from previous version:
//   - Multi-voucher per transaction: vouchers live in voucherAllocations[]
//     ([{voucherId, amount}]); voucherAmount/useVoucher/voucherId are kept
//     as derived/legacy mirrors for read-time fallback on old docs.
//   - All voucher operations use compensation (saga pattern) via the
//     batch helpers: if a downstream operation fails, we revert every
//     voucher mutation applied so far.
//   - Store-match rule (a voucher tied to a shop is only usable on a
//     transaction with that merchant) is enforced in resolveAllocations.
//   - All money rounding goes through roundMoney() helper.
//   - DELETE archives transaction first, then attempts side-effects.
//   - POST /returns isolates each side-effect (transfer, voucher)
//     so a failure in one doesn't leave inconsistent state in another.
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { transactionsContainer, vouchersContainer, monthsContainer, receiptsContainer, settingsContainer, productsContainer, categoriesContainer } = require("../cosmos");
const { requireAuth }                                                 = require("../middleware/auth");
const {
  generateId, readItem, readItemWithEtag,
  syncVoucherBatch, revertVoucherBatch,
  getVoucherAllocations, isVoucherUsable, voucherMatchesMerchant,
  roundMoney, sumMoney,
  IdParamSchema, BUDGET_MONTH_REGEX,
  currentServerMonth, prevServerMonth,
} = require('../utils/helpers');
const {
  resolveAllocations, buildAllocationOps, buildRemovalOps,
  diffAllocationOps, splitVouchersAcrossTxs,
} = require("../utils/voucherAllocations");
const { getReceiptBlobContainer, setReceiptRetention } = require("../utils/receiptStorage");
router.use(requireAuth);
const { cleanMerchant, merchantExists, rememberMerchant, rememberMerchantNip } = require("../utils/merchant");
const { rememberProducts } = require("../utils/productCatalog");
const { resolveTransferTarget, buildReturnTransferDoc } = require("../utils/transferCategory");
const { resolveTxType, applyTxType } = require("../utils/categoryType");
const { PRODUCT_UNIT_CODES } = require("../utils/productUnits");


// ── Schemas ───────────────────────────────────────────────────

// Fields shared by POST and PATCH. Required/defaulted here as for POST;
// PATCH derives via .partial(), which turns every field optional.
const TransactionBaseSchema = z.object({
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
  description:      z.string().max(500).optional().default("").transform(v => v?.trim() ?? ""),
  tags:             z.array(z.string()).optional().default([]),
  priority:         z.number().int().min(1).max(4).optional().default(2),
  useVoucher:       z.boolean().optional().default(false), //fallback for old docs
  voucherId:        z.string().nullable().optional().default(null),//fallback for old docs
  voucherAmount:    z.number().min(0).optional().default(0),//fallback for old docs
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
                    })).max(60).optional(),
  voucherAllocations: z.array(z.object({
                      voucherId: z.string().min(1),
                      amount:    z.number().min(0),
                    })).max(20).optional(),

});

// POST = base + create-only fields (receipt/recurring/line items).
const TransactionPostSchema = TransactionBaseSchema.extend({
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

// PATCH = base made fully optional, plus the patch-only `returns` array.
// Omitted fields resolve to `undefined` (defaults don't fire under
// .partial()), so the route's `v !== undefined` filter leaves existing
// values untouched. .extend() must run before the refines — you can't
// .extend() a refined schema.
const TransactionPatchSchema = TransactionBaseSchema.partial()
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

const ReturnSchema = z.object({
  amount:               z.number().positive(),
  voucherAmount:        z.number().min(0).default(0),
  cashAmount:           z.number().min(0),
  // What KIND of return this is: money back from the shop (goods returned)
  // vs someone reimbursing the user (goods kept — e.g. family paying for
  // their part of the groceries) vs a bottle-deposit refund ("deposit",
  // written by the batch endpoint). Only store returns count as shop
  // returns in analytics or knock price points out of the price history.
  kind:                 z.enum(["store", "reimbursement", "deposit"]).optional().default("store"),
  // For reimbursements: WHO paid the user back — a person (family, friends)
  // or a company/institution (employer, LuxMed, an office). Reporting-only
  // dimension; every hard rule keys off `kind` alone.
  source:               z.enum(["person", "company"]).optional(),
  // Money received ABOVE the transaction amount (shop rounded up, receipt
  // was under-priced…). Never enters returns[].amount — the returnUtils
  // math assumes Σ returns ≤ tx.amount — it always materializes as a
  // TRANSFER instead, even for a same-month return.
  surplusAmount:        z.number().min(0).default(0),
  moneyReturnedInMonth: z.string().regex(BUDGET_MONTH_REGEX),
  returnedAt:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:               z.string().max(500).optional().default("").transform(v => v?.trim() ?? ""),
  createVoucher:        z.boolean().optional().default(false),
  voucherCode:          z.string().max(100).optional().default(""),
  voucherExpiresAt:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  returnedLineItems:    z.array(ReturnedLineItemSchema).max(60).optional(),
});

// ── GET ───────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { budgetMonth, type } = req.query;
    const familyId = req.user.familyId;

    if (!budgetMonth || !BUDGET_MONTH_REGEX.test(budgetMonth)) {
      return res.status(400).json({ error: "budgetMonth parameter is required (format: YYYY-MM)." });
    }

    let query = `SELECT * FROM c
                 WHERE c.userId      = @userId
                   AND c.budgetMonth = @budgetMonth
                   AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))`;

    const parameters = [
      { name: "@userId",      value: familyId    },
      { name: "@budgetMonth", value: budgetMonth },
    ];

    if (type) {
      const types = type.split(",").map(t => t.trim()).filter(Boolean);
      if (types.length === 1) {
        query += " AND c.type = @type";
        parameters.push({ name: "@type", value: types[0] });
      } else if (types.length > 1) {
        const typeParams = types.map((_, i) => `@type${i}`);
        query += ` AND c.type IN (${typeParams.join(", ")})`;
        types.forEach((t, i) => parameters.push({ name: `@type${i}`, value: t }));
      }
    }

    const { resources } = await transactionsContainer.items
      .query({ query, parameters })
      .fetchAll();

    res.json(resources.sort((a, b) => b.date.localeCompare(a.date)));
  } catch (err) {
    console.error("[TX GET]", err);
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

// ── GET /range ────────────────────────────────────────────────

router.get("/range", async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to || !BUDGET_MONTH_REGEX.test(from) || !BUDGET_MONTH_REGEX.test(to)) {
    return res.status(400).json({ error: "Invalid range. Use from=YYYY-MM&to=YYYY-MM." });
  }
  if (from > to) {
    return res.status(400).json({ error: "from must be <= to." });
  }

  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const monthsCount = (ty - fy) * 12 + (tm - fm) + 1;
  if (monthsCount > 24) {
    return res.status(400).json({ error: "Range too wide. Maximum is 24 months." });
  }

  try {
    const { resources } = await transactionsContainer.items
      .query({
        query: `SELECT * FROM c
                WHERE c.userId = @userId
                  AND c.budgetMonth >= @from
                  AND c.budgetMonth <= @to
                  AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))
                ORDER BY c.date DESC`,
        parameters: [
          { name: "@userId", value: req.user.familyId },
          { name: "@from",   value: from              },
          { name: "@to",     value: to                },
        ],
      })
      .fetchAll();

    console.log(`[TX RANGE] ${from}..${to}: ${resources.length} transactions for ${req.user.familyId}`);
    res.json(resources);
  } catch (err) {
    console.error("[TX RANGE]", err);
    res.status(500).json({ error: "Failed to fetch transactions range." });
  }
});

// ── POST ──────────────────────────────────────────────────────
//
// Saga pattern: voucher mutation BEFORE transaction save is fine because
// if voucher sync fails (returns null) we never created the tx in the
// first place. But if the tx upsert AFTER voucher sync fails, we need
// to roll the voucher back.
//
// We invert the order from before: TX CREATE first → voucher SYNC second.
// If voucher sync fails, we archive the freshly-created TX. If voucher
// sync succeeds but something AFTER it throws, we revert the voucher
// AND archive the TX.



// ── Promote a pending Receipt to committed ───────────────────
// Scan-time createPendingReceipt() left the receipt with ttl=7200
// and empty transactionIds[]. On the first transaction save we append
// the tx id and set ttl=-1 . Subsequent transactions from the
// same receipt just append their id. Idempotent, best-effort: a
// failure here must never break the transaction save.
async function promoteReceipt(receiptId, familyId, txId, isWarranty = false, merchant = null) {
  try {
    const existing = await readItem(receiptsContainer, receiptId, familyId);
    if (!existing) {
      console.warn(`[TX POST] Receipt ${receiptId} not found (expired?) — tx ${txId} keeps the link anyway`);
      return;
    }
    const txIds = new Set(existing.transactionIds || []);
    txIds.add(txId);
    await receiptsContainer.items.upsert({
      ...existing,
      status:         "committed",
      transactionIds: [...txIds],
      isWarranty:     existing.isWarranty || isWarranty,  // once warranty, always warranty
      ttl:            -1,
      committedAt:    existing.committedAt || new Date().toISOString(),
    });
    console.log(`[TX POST] Receipt committed: ${receiptId}${isWarranty ? " 🛡️" : ""} (+tx ${txId})`);

    // Learn NIP → shop-name from this committed receipt. The NIP is exact,
    // so this powers a deterministic merchant override on future scans.
    // Uses the receipt read we already did — no extra I/O. Fire-and-forget.
    if (existing.sellerTaxId && merchant) {
      rememberMerchantNip(settingsContainer, familyId, existing.sellerTaxId, merchant);
    }
  } catch (err) {
    console.error(`[TX POST] Receipt promote failed for ${receiptId} (non-fatal):`, err.message);
  }
}

// ── Shared tx builders (DRY across POST / batch / rollback) ───

// Scaffolding common to every freshly-created transaction.
function scaffoldTx(data, id, familyId, req) {
  return {
    id,
    userId:       familyId,
    ...data,
    returns:      [],
    author:       req.user.name || req.user.email,
    authorId:     req.user.id,
    isArchived:   false,
    archivedAt:   null,
    archivedBy:   null,
    archivedById: null,
    createdAt:    new Date().toISOString(),
  };
}

// Apply resolved voucher allocations to a tx doc: writes the array as the
// source of truth, plus derived aggregates and a legacy scalar mirror
// (voucherId/voucherAmount/useVoucher) so read-time fallback keeps working
// on consumers that haven't moved to voucherAllocations yet.
function withVoucherFields(doc, amount, allocations) {
  const voucherAmount = sumMoney((allocations || []).map(a => a.amount));
  const useVoucher    = (allocations || []).length > 0;
  return {
    ...doc,
    amount,
    voucherAllocations: allocations || [],
    voucherAmount,
    useVoucher,
    voucherId: allocations?.[0]?.voucherId ?? null,
    netAmount: useVoucher ? roundMoney(Math.max(0, amount - voucherAmount)) : amount,
  };
}

// Best-effort archive used by saga rollbacks (voucher sync / tx upsert fail).
async function archiveForRollback(tx) {
  return transactionsContainer.items.upsert({
    ...tx,
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: "system_rollback",
  }).catch(rollbackErr => console.error(`[TX ROLLBACK FAILED] ${tx.id}:`, rollbackErr));
}

router.post("/", async (req, res) => {
  const parsed = TransactionPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const data     = parsed.data;
  const familyId = req.user.familyId;
  let createdTx    = null;   // for rollback if voucher sync fails
  let voucherSnaps = [];     // for rollback if anything fails after voucher sync

  try {
    const newId  = `tx_${familyId}_${data.date.replace(/-/g,"")}_${generateId(data.subcategoryName)}_${Date.now()}`;
    const amount = roundMoney(data.amount);

    // The category owns the type — never store the client's word for it.
    const typed = await applyTxType(categoriesContainer, familyId, data);

    // Resolve voucher allocations: server-trusts amounts, recomputes percent
    // vouchers against the gross amount, and enforces the store-match rule.
    // getVoucherAllocations reads the new array OR falls back to legacy scalars.
    const resolved = await resolveAllocations(
      vouchersContainer, familyId, getVoucherAllocations(data), amount, data.merchant,
    );
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });

    const newTx = withVoucherFields(
      scaffoldTx(typed, newId, familyId, req), amount, resolved.allocations,
    );

    // ── STEP 1: Create the transaction ────────────────────────
    const { resource } = await transactionsContainer.items.create(newTx);
    createdTx = resource;

    // ── STEP 2: Sync voucher usage (batch) ────────────────────
    if (createdTx.useVoucher) {
      const ops = buildAllocationOps(createdTx.voucherAllocations, {
        transactionId: createdTx.id,
        usedAt:        data.date,
        description:   data.description || "",
      });
      const batch = await syncVoucherBatch(vouchersContainer, familyId, ops);

      if (!batch.ok) {
        // A voucher is missing/archived. Roll the TX back (best effort).
        await archiveForRollback(createdTx);
        return res.status(400).json({ error: "Voucher not found or is archived." });
      }
      voucherSnaps = batch.snapshots;
    }
        // ── STEP 3: Commit receipt blob (if linked) ───────────────
    // Promotes the blob from "pending" to "committed" so the daily
    // lifecycle cleanup leaves it alone. Fire-and-forget — a tag
    // update must never delay or fail the transaction save. The
    // startsWith check is defense-in-depth: the path is client-
    // supplied, so we only ever touch blobs in our own family's tree.
    if (createdTx.receiptBlobPath && createdTx.receiptBlobPath.startsWith(`${familyId}/`)) {
      // Warranty receipts get retention=warranty (longer lifecycle);
      // setReceiptRetention also sets status=committed, replacing the
      // plain commitReceipt call.
      setReceiptRetention(createdTx.receiptBlobPath, !!createdTx.isWarranty);
    }
    if (createdTx.receiptId) {
      promoteReceipt(createdTx.receiptId, familyId, createdTx.id, !!createdTx.isWarranty, createdTx.merchant);
    }
    // Remember the merchant for autocomplete + OCR canonicalization,
    // whether it came from OCR or was typed manually. Fire-and-forget.
    if (createdTx.merchant) {
      rememberMerchant(settingsContainer, familyId, createdTx.merchant);
    }
    // Fold any structured line-item products into the family catalog.
    // Fire-and-forget — a catalog failure must never fail the tx save.
    if (Array.isArray(createdTx.lineItems) && createdTx.lineItems.length > 0) {
      rememberProducts(productsContainer, familyId, createdTx);
    }

    console.log(`[TX POST] Created: ${createdTx.id}${createdTx.useVoucher ? ` (${createdTx.voucherAllocations.length} voucher[s])` : ""}`);
    res.status(201).json(createdTx);
  } catch (err) {
    // Full saga rollback — vouchers first (more important to keep clean),
    // then the transaction.
    console.error("[TX POST] Saga error:", err);
    await revertVoucherBatch(vouchersContainer, voucherSnaps);
    if (createdTx) await archiveForRollback(createdTx);

    res.status(500).json({ error: "Failed to create transaction." });
  }
});

// ── POST /batch ───────────────────────────────────────────────
//
// OCR / cart path. The selected vouchers apply to the WHOLE cart gross
// total and are split proportionally across the resulting transactions
// (decyzja 2). The whole thing runs as one saga: create every tx, then
// apply every (voucher × tx) usage op; on any failure we revert the
// voucher batch and archive every created tx.

const TransactionBatchSchema = z.object({
  transactions: z.array(TransactionPostSchema).min(1).max(60),
  voucherIds:   z.array(z.string().min(1)).max(10).optional().default([]),
});

router.post("/batch", async (req, res) => {
  const parsed = TransactionBatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const familyId = req.user.familyId;
  const { transactions: items, voucherIds } = parsed.data;

  const created = [];
  let voucherSnaps = [];

  try {
    // 1. Validate selected vouchers. A store-tied voucher must match the
    //    merchant of EVERY line it would touch (rule d across the batch).
    const vouchers = [];
    for (const vid of voucherIds) {
      const v = await readItem(vouchersContainer, vid, familyId);
      if (!isVoucherUsable(v)) {
        return res.status(400).json({ error: "Voucher nie istnieje lub jest niedostępny." });
      }
      const mismatch = items.find(t => !voucherMatchesMerchant(v, t.merchant));
      if (mismatch) {
        return res.status(400).json({ error: `Voucher „${v.description}" nie pasuje do sklepu wszystkich pozycji paragonu.` });
      }
      vouchers.push(v);
    }

    // 2. Proportional split across the resulting txs.
    const perTx = splitVouchersAcrossTxs(vouchers, items.map(t => ({ amount: roundMoney(t.amount) })));

    // 3. Build + create tx docs. Types come from the category tree, with one
    //    cache across the batch — a 40-line receipt then costs one read per
    //    DISTINCT subcategory, not one per line.
    const typeCache = new Map();
    const typedItems = [];
    for (const data of items) {
      typedItems.push(await applyTxType(categoriesContainer, familyId, data, typeCache));
    }

    const stamp = Date.now();
    const docs = typedItems.map((data, i) => withVoucherFields(
      scaffoldTx(data, `tx_${familyId}_${data.budgetMonth.replace("-","")}_${stamp}_${i}`, familyId, req),
      roundMoney(data.amount),
      perTx[i] || [],
    ));

    for (const doc of docs) {
      const { resource } = await transactionsContainer.items.create(doc);
      created.push(resource);
    }

    // 4. Apply voucher usage for every (voucher × tx) allocation.
    const ops = created.flatMap((tx, i) => buildAllocationOps(perTx[i] || [], {
      transactionId: tx.id, usedAt: tx.date, description: tx.description || "",
    }));
    const batch = await syncVoucherBatch(vouchersContainer, familyId, ops);
    if (!batch.ok) {
      await Promise.all(created.map(archiveForRollback));
      return res.status(400).json({ error: "Voucher not found or is archived." });
    }
    voucherSnaps = batch.snapshots;

    // 5. Side-effects (receipt commit, merchant memory) — best effort.
    for (const tx of created) {
      if (tx.receiptBlobPath && tx.receiptBlobPath.startsWith(`${familyId}/`)) {
        setReceiptRetention(tx.receiptBlobPath, !!tx.isWarranty);
      }
      if (tx.receiptId) promoteReceipt(tx.receiptId, familyId, tx.id, !!tx.isWarranty, tx.merchant);
      if (tx.merchant)  rememberMerchant(settingsContainer, familyId, tx.merchant);
      if (Array.isArray(tx.lineItems) && tx.lineItems.length > 0) {
        rememberProducts(productsContainer, familyId, tx);
      }
    }

    console.log(`[TX BATCH] Created ${created.length} tx, split ${voucherIds.length} voucher(s).`);
    res.status(201).json(created);
  } catch (err) {
    console.error("[TX BATCH] Saga error:", err);
    await revertVoucherBatch(vouchersContainer, voucherSnaps);
    await Promise.all(created.map(archiveForRollback));
    res.status(500).json({ error: "Failed to create transactions." });
  }
});

// ── PATCH ─────────────────────────────────────────────────────
//
// Voucher handling is a diff: compute the new allocation set (re-resolved
// against the possibly-changed amount/merchant) and emit the minimal
// add/remove/update ops vs the existing set. Vouchers are touched BEFORE
// the tx upsert; if the upsert fails we revert the whole voucher batch.

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = TransactionPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id       = idParsed.data;
  const familyId = req.user.familyId;

  try {
    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)            return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived)  return res.status(409).json({ error: "Cannot edit an archived transaction." });

    // Strip undefined to avoid overwriting existing fields
    const patchFields = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );

    // Returns reference line items BY INDEX (returns[].returnedLineItems),
    // so a lineItems edit that removes/reorders lines would silently point
    // those references at the wrong products. Allow the patch only when
    // every referenced index still holds the same description + amount.
    if (patchFields.lineItems !== undefined) {
      const referenced = new Set();
      for (const ret of existing.returns || []) {
        for (const p of ret.returnedLineItems || []) referenced.add(p.index);
      }
      if (referenced.size > 0) {
        const oldLines = Array.isArray(existing.lineItems) ? existing.lineItems : [];
        const newLines = Array.isArray(patchFields.lineItems) ? patchFields.lineItems : [];
        const intact = newLines.length === oldLines.length &&
          [...referenced].every(i =>
            newLines[i]?.description === oldLines[i]?.description &&
            newLines[i]?.amount      === oldLines[i]?.amount);
        if (!intact) {
          return res.status(409).json({
            error: "Nie można zmienić pozycji paragonu objętych zwrotem. Zostaw zwrócone pozycje bez zmian albo usuń powiązany zwrot.",
          });
        }
      }
    }

    const updated = {
      ...existing,
      ...patchFields,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    // Re-derive the type from the category on EVERY edit, not just when the
    // category changes: that way a record damaged by a client which sent the
    // wrong type repairs itself the next time it is touched.
    updated.type = await resolveTxType(
      categoriesContainer,
      familyId,
      {
        subcategoryId: patchFields.subcategoryId ?? existing.subcategoryId,
        categoryId:    patchFields.categoryId    ?? existing.categoryId,
      },
      patchFields.type ?? existing.type ?? "EXPENSE",
    );

    // ── Voucher allocations (diff) ────────────────────────────
    const amount         = roundMoney(patchFields.amount ?? existing.amount);
    const merchant       = patchFields.merchant ?? existing.merchant;
    const oldAllocations = getVoucherAllocations(existing);

    // New raw set: explicit from the patch, else carry the existing ones.
    // Either way we re-resolve against the (possibly new) amount/merchant,
    // so percent vouchers recompute and the store-match rule re-applies.
    const rawNew = (patchFields.voucherAllocations ?? oldAllocations)
      .map(a => ({ voucherId: a.voucherId, amount: a.amount }));

    const resolved = await resolveAllocations(vouchersContainer, familyId, rawNew, amount, merchant, id);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const newAllocations = resolved.allocations;

    const ops = diffAllocationOps(oldAllocations, newAllocations, {
      transactionId: id,
      usedAt:        patchFields.date        ?? existing.date,
      description:   patchFields.description  ?? existing.description ?? "",
    });
    const batch = await syncVoucherBatch(vouchersContainer, familyId, ops);
    if (!batch.ok) return res.status(400).json({ error: "Voucher not found or is archived." });
    const voucherSnaps = batch.snapshots;

    // Write derived voucher fields + recomputed netAmount onto the doc.
    Object.assign(updated, withVoucherFields({}, amount, newAllocations));

    // ── Update transaction with optimistic lock ───────────────
    try {
      const { resource } = await transactionsContainer.items.upsert(updated, {
        accessCondition: { type: "IfMatch", condition: etag },
      });
      console.log(`[TX PATCH] Updated: ${resource.id}`);

      // Fold any structured line-item products into the family catalog —
      // the POST path already does this; an edit that manually assigns or
      // corrects a tracked product needs the same side effect, or the
      // catalog (purchaseCount, firstSeen/lastSeen, merchants) never
      // reflects it. Fire-and-forget — a catalog failure must never fail
      // the tx save that triggered it.
      if (Array.isArray(resource.lineItems) && resource.lineItems.length > 0) {
        rememberProducts(productsContainer, familyId, resource);
      }

      res.json(resource);
    } catch (txErr) {
      // Tx save failed AFTER vouchers were mutated — revert the batch.
      console.error(`[TX PATCH] Tx save failed for ${id}, rolling back vouchers`);
      await revertVoucherBatch(vouchersContainer, voucherSnaps);
      throw txErr;   // re-throw to outer catch for proper HTTP response
    }
  } catch (err) {
    if (err.code === 412) {
      return res.status(409).json({
        error: "Data was modified by another user. Please refresh and try again.",
      });
    }
    console.error("[TX PATCH]", err);
    res.status(500).json({ error: "Failed to update transaction." });
  }
});

// ── DELETE (soft archive) ─────────────────────────────────────
//
// DELETE flow: archive the transaction FIRST, then deal with side-effects.
// This inverts the previous behaviour (voucher → tx) but is safer here:
// the worst case is a tx archived with vouchers/transfers still active,
// which is fixable by user action. The reverse — vouchers freed and tx
// still active — silently corrupts voucher balance.

router.delete("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const id       = idParsed.data;
  const familyId = req.user.familyId;

  try {
    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived) return res.status(409).json({ error: "Transaction is already archived." });

    const hasReturns = (existing.returns || []).length > 0;
    const { forceArchiveLinked } = req.body || {};

    if (hasReturns && !forceArchiveLinked) {
      return res.status(409).json({
        error: "Transaction has returns. Archiving will also archive all linked transfers and vouchers.",
        requiresConfirmation: true,
        hasReturns: true,
      });
    }

    // ── STEP 1: Archive the transaction (primary intent) ──────
    const archived = {
      ...existing,
      isArchived:   true,
      archivedAt:   new Date().toISOString(),
      archivedBy:   req.user.name || req.user.email,
      archivedById: req.user.id,
    };

    const { resource: savedTx } = await transactionsContainer.items.upsert(archived, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    // ── STEP 2: Free up voucher usage across ALL allocations ──
    const allocations = getVoucherAllocations(existing);
    if (allocations.length > 0) {
      try {
        await syncVoucherBatch(vouchersContainer, familyId, buildRemovalOps(allocations, id));
      } catch (voucherErr) {
        // Tx is already archived — log loudly; the user can re-run cleanup.
        // We do NOT undo the archive: the intent was "delete this".
        console.error(
          `[TX DELETE] Voucher release failed for archived tx ${id}; ` +
          `voucher(s) may show stale usage. Error:`,
          voucherErr,
        );
      }
    }

    // ── STEP 3: Archive linked transfers and return vouchers ──
    if (hasReturns && forceArchiveLinked) {
      try {
        await archiveLinkedItems(transactionsContainer, vouchersContainer, familyId, id, req.user);
      } catch (linkedErr) {
        console.error(
          `[TX DELETE] Failed to archive some linked items for ${id}. ` +
          `Tx is archived; orphans may remain. Error:`,
          linkedErr,
        );
      }
    }

    console.log(`[TX DELETE] Archived: ${savedTx.id}`);
    res.json({ success: true, id: savedTx.id });
  } catch (err) {
    if (err.code === 412) {
      return res.status(409).json({
        error: "Data was modified by another user. Please refresh and try again.",
      });
    }
    // Outer catch — primary archive failed; vouchers untouched.
    console.error("[TX DELETE]", err);
    res.status(500).json({ error: "Failed to archive transaction." });
  }
});

// ── POST /deposit-return ──────────────────────────────────────
// BATCH return with ONE consolidated transfer. Appends a return entry to
// each selected expense WITHOUT the per-transaction cross-month transfer,
// then creates ONE consolidated TRANSFER in the current month =
// (returns applied to past months) + surplus. Current-month returns just
// reduce that month's expense, so they don't feed the transfer.
//
// Consumers: bottle deposits (Zwroty butelek) and LuxMed refunds — any
// flow that refunds several transactions at once and wants a single
// summary transfer instead of one per transaction.
//
// body: { returns: [{ txId, amount }], surplus, budgetMonth, date, reason, kind }
//   kind: "deposit" (bottle deposits, default) | "reimbursement" (LuxMed) |
//         "store" — recorded on every return entry so analytics and the
//         price history can tell these flows apart from real shop returns.

router.post("/deposit-return", async (req, res) => {
  const { returns, surplus, budgetMonth, date, reason, kind, source } = req.body;
  if (!Array.isArray(returns))                               return res.status(400).json({ error: "returns must be an array." });
  if (!budgetMonth || !BUDGET_MONTH_REGEX.test(budgetMonth)) return res.status(400).json({ error: "budgetMonth is required (YYYY-MM)." });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))            return res.status(400).json({ error: "date is required (YYYY-MM-DD)." });
  if (kind !== undefined && !["store", "reimbursement", "deposit"].includes(kind)) {
    return res.status(400).json({ error: "kind must be store | reimbursement | deposit." });
  }
  if (source !== undefined && !["person", "company"].includes(source)) {
    return res.status(400).json({ error: "source must be person | company." });
  }

  const familyId   = req.user.familyId;
  const surplusAmt = Math.max(0, roundMoney(Number(surplus) || 0));
  const desc       = reason || "Zwrot butelek";
  const returnKind = kind ?? "deposit";
  const returnSource = returnKind === "reimbursement" ? (source ?? null) : null;

  // Pure surplus (returned bottles you never logged) is valid — only reject
  // when there's genuinely nothing to do.
  if (returns.length === 0 && surplusAmt <= 0) return res.status(400).json({ error: "Nie ma nic do zwrócenia." });

  try {
    // STEP 1 — read + validate every selected deposit, compute how much feeds
    // the transfer (past-month returns + surplus). No writes yet, so we can
    // gate on config before touching anything.
    const items = [];
    let pastSum = 0;
    let failed  = 0;
    for (const r of returns) {
      const amt = roundMoney(Number(r?.amount));
      if (!r?.txId || !(amt > 0)) { failed++; continue; }
      try {
        const { resource: tx, etag } = await readItemWithEtag(transactionsContainer, r.txId, familyId);
        if (!tx || tx.isArchived) { failed++; continue; }
        const alreadyReturned = (tx.returns || []).reduce((s, x) => s + (x.cashAmount || 0) + (x.voucherAmount || 0), 0);
        if (roundMoney(alreadyReturned + amt) > tx.amount + 0.01) { failed++; continue; }
        items.push({ tx, etag, amt });
        // Past-month returns don't reduce that month (cross-month) — they feed
        // the consolidated transfer instead.
        if (tx.budgetMonth < budgetMonth) pastSum = roundMoney(pastSum + amt);
      } catch { failed++; }
    }

    const transferAmt = roundMoney(pastSum + surplusAmt);

    // A transfer is needed → require the configured return-transfer subcategory.
    let target = null;
    if (transferAmt > 0) {
      const t = await resolveTransferTarget(familyId, "returnTransferSubcategoryId");
      if (!t.ok) return res.status(400).json({ error: "Wybierz kategorię transferu dla zwrotów w Ustawieniach → Mapowanie kategorii." });
      target = t.target;
    }

    // STEP 2 — record the returns.
    const updated = [];
    for (const it of items) {
      const entry = {
        amount: it.amt, cashAmount: it.amt, voucherAmount: 0,
        kind: returnKind,
        ...(returnSource ? { source: returnSource } : {}),
        moneyReturnedInMonth: budgetMonth,   // current month
        returnedAt: date, reason: desc,
        returnedBy: req.user.name || req.user.email, returnedById: req.user.id,
        createdAt: new Date().toISOString(),
      };
      try {
        const { resource } = await transactionsContainer.items.upsert(
          { ...it.tx, returns: [...(it.tx.returns || []), entry], updatedAt: new Date().toISOString() },
          { accessCondition: { type: "IfMatch", condition: it.etag } },
        );
        updated.push(resource);
      } catch { failed++; }
    }

    // STEP 3 — one consolidated transfer for past-month returns + surplus.
    let transfer = null;
    if (transferAmt > 0 && target) {
      const doc = buildReturnTransferDoc({
        familyId,
        target,
        amount:      transferAmt,
        date,
        budgetMonth,
        description: desc,
        user:        req.user,
        // Generic slug — the endpoint serves any batch-return flow now.
        idSlug:      "batchret",
      });
      const { resource } = await transactionsContainer.items.create(doc);
      transfer = resource;
    }

    console.log(`[TX DEPOSIT-RETURN] ${updated.length} returns, transfer ${transferAmt}, ${failed} failed`);
    res.status(201).json({ updated, transfer, failed });
  } catch (err) {
    console.error("[TX DEPOSIT-RETURN]", err);
    res.status(500).json({ error: "Failed to process deposit return." });
  }
});

// ── POST /returns ─────────────────────────────────────────────
//
// The most complex flow: a return can spawn:
//   - A TRANSFER tx in a different month (cross-month cash return)
//   - A new VOUCHER (when user chose store credit)
//
// Order of operations:
//   1. Validate everything (no DB mutations)
//   2. Upsert the parent tx with new returns[] entry (primary intent)
//   3. Create TRANSFER (side-effect, isolated)
//   4. Create VOUCHER (side-effect, isolated)
//
// If step 3 or 4 fails, the parent tx is already saved — we log the
// orphan side-effect and return SUCCESS for the return itself, with
// a `partialFailure` flag so the frontend can warn the user.

router.post("/:id/returns", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = ReturnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id       = idParsed.data;
  const familyId = req.user.familyId;
  const data     = parsed.data;

  try {
    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived) return res.status(409).json({ error: "Transaction is archived." });

    // ── Validation block (zero mutations) ─────────────────────
    const serverNow  = currentServerMonth();
    const serverPrev = prevServerMonth();

    if (data.moneyReturnedInMonth < serverPrev) {
      return res.status(400).json({ error: "Return month is outside the allowed window." });
    }
    if (data.moneyReturnedInMonth < existing.budgetMonth) {
      return res.status(400).json({ error: "Return month cannot be before purchase month." });
    }

    // Amount checks via roundMoney for consistency
    const amount         = roundMoney(data.amount);
    const cashAmount     = roundMoney(data.cashAmount);
    const voucherAmount  = roundMoney(data.voucherAmount);
    const surplusAmount  = roundMoney(data.surplusAmount);
    const totalReturnedSoFar = sumMoney((existing.returns || []).map(r => r.amount));
    const newTotal           = roundMoney(totalReturnedSoFar + amount);

    if (newTotal > existing.amount + 0.01) {
      return res.status(400).json({ error: "Return amount exceeds transaction amount." });
    }
    if (Math.abs(cashAmount + voucherAmount - amount) > 0.01) {
      return res.status(400).json({ error: "cashAmount + voucherAmount must equal amount." });
    }

    // ── Per-line-item allocation checks ───────────────────────
    // The snapshot (description) must match the CURRENT lineItems — a
    // mismatch means the client selected lines on a stale document.
    // Per-line money is cumulative across every prior return's allocation.
    const returnedLineItems = (data.returnedLineItems ?? []).map(r => ({
      index:       r.index,
      description: r.description,
      amount:      roundMoney(r.amount),
    }));
    if (returnedLineItems.length > 0) {
      const lines = Array.isArray(existing.lineItems) ? existing.lineItems : [];
      if (lines.length === 0) {
        return res.status(400).json({ error: "Transaction has no line items to allocate the return to." });
      }
      const seen = new Set();
      const prevByIndex = new Map();
      for (const ret of existing.returns || []) {
        for (const p of ret.returnedLineItems || []) {
          prevByIndex.set(p.index, roundMoney((prevByIndex.get(p.index) || 0) + p.amount));
        }
      }
      for (const r of returnedLineItems) {
        if (r.index >= lines.length)                return res.status(400).json({ error: "returnedLineItems index out of range." });
        if (seen.has(r.index))                      return res.status(400).json({ error: "Duplicate line item in returnedLineItems." });
        seen.add(r.index);
        if ((lines[r.index].description ?? "") !== r.description) {
          return res.status(409).json({ error: "Line items changed since the return was prepared. Refresh and try again." });
        }
        const cumulative = roundMoney((prevByIndex.get(r.index) || 0) + r.amount);
        if (cumulative > lines[r.index].amount + 0.01) {
          return res.status(400).json({ error: "Returned amount exceeds the line item amount." });
        }
      }
      if (sumMoney(returnedLineItems.map(r => r.amount)) > amount + 0.01) {
        return res.status(400).json({ error: "Line item allocation exceeds the return amount." });
      }
    }

    // Target month closed check
    const monthDoc = await readItem(
      monthsContainer,
      `month_${familyId}_${data.moneyReturnedInMonth}`,
      familyId,
    );
    if (monthDoc?.isClosed) {
      return res.status(403).json({ error: "Target month is closed." });
    }

    // Resolve transfer target month and validate it BEFORE saving anything.
    // A transfer is needed for cross-month cash (as before) and for ANY
    // surplus — surplus can't reduce an expense, it is new money, so it
    // transfers even when the return lands in the purchase month.
    const isCrossMonth   = data.moneyReturnedInMonth !== existing.budgetMonth;
    const transferAmount = roundMoney((isCrossMonth ? cashAmount : 0) + surplusAmount);
    let transferBudgetMonth = null;
    let transferTarget = null;

    if (transferAmount > 0) {
      transferBudgetMonth = data.moneyReturnedInMonth < serverNow
        ? serverNow
        : data.moneyReturnedInMonth;

      if (transferBudgetMonth !== data.moneyReturnedInMonth) {
        const transferMonthDoc = await readItem(
          monthsContainer,
          `month_${familyId}_${transferBudgetMonth}`,
          familyId,
        );
        if (transferMonthDoc?.isClosed) {
          return res.status(403).json({ error: "Target month is closed." });
        }
      }

      // Cross-month cash / surplus spawns a TRANSFER — require the configured
      // return-transfer subcategory (no env fallback).
      const t = await resolveTransferTarget(familyId, "returnTransferSubcategoryId");
      if (!t.ok) {
        return res.status(400).json({ error: "Wybierz kategorię transferu dla zwrotów w Ustawieniach → Mapowanie kategorii." });
      }
      transferTarget = t.target;
    }

    // ── STEP 1: Save the parent transaction (PRIMARY) ─────────
    const returnEntry = {
      amount,
      cashAmount,
      voucherAmount,
      kind:                 data.kind,
      ...(data.kind === "reimbursement" && data.source ? { source: data.source } : {}),
      moneyReturnedInMonth: data.moneyReturnedInMonth,
      returnedAt:           data.returnedAt,
      reason:               data.reason,
      returnedBy:           req.user.name || req.user.email,
      returnedById:         req.user.id,
      createdAt:            new Date().toISOString(),
      // Audit-only mirrors: surplus lives in the TRANSFER, allocations feed
      // the price-history exclusion — neither enters the returnUtils sums.
      ...(surplusAmount > 0 ? { surplusAmount } : {}),
      ...(returnedLineItems.length > 0 ? { returnedLineItems } : {}),
    };

    const updatedTx = {
      ...existing,
      returns:     [...(existing.returns || []), returnEntry],
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    const { resource: savedTx } = await transactionsContainer.items.upsert(updatedTx, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    const sideEffects = {
      transferCreated:     false,
      voucherCreated:      false,
      transferBudgetMonth: null,
      transferAmount:      0,
      partialFailure:      false,
    };

    // ── STEP 2: Create TRANSFER (best effort) ─────────────────
    // One consolidated document: cross-month cash + surplus together.
    if (transferAmount > 0 && transferBudgetMonth && transferTarget) {
      try {
        const transferDoc = buildReturnTransferDoc({
          familyId,
          target:      transferTarget,
          amount:      transferAmount,
          date:        data.returnedAt,
          budgetMonth: transferBudgetMonth,
          description:
            `Zwrot: ${existing.categoryName} › ${existing.subcategoryName}` +
            `${data.reason ? ` — ${data.reason}` : ""}` +
            `${data.moneyReturnedInMonth !== transferBudgetMonth ? ` (faktyczny zwrot: ${data.moneyReturnedInMonth})` : ""}` +
            `${surplusAmount > 0 ? ` (w tym nadwyżka ${surplusAmount.toFixed(2)} PLN)` : ""}`,
          user:                req.user,
          idSlug:              "zwrot",
          sourceTransactionId: existing.id,
        });

        await transactionsContainer.items.upsert(transferDoc);
        sideEffects.transferCreated     = true;
        sideEffects.transferBudgetMonth = transferBudgetMonth;
        sideEffects.transferAmount      = transferAmount;
        console.log(`[TX RETURN] TRANSFER created: ${transferDoc.id} → ${transferBudgetMonth}`);
      } catch (transferErr) {
        console.error(
          `[TX RETURN] TRANSFER creation failed for ${existing.id}. ` +
          `Return is saved but the transfer (cross-month cash / surplus) is MISSING. Error:`,
          transferErr,
        );
        sideEffects.partialFailure = true;
      }
    }

    // ── STEP 3: Create VOUCHER (best effort) ──────────────────
    if (voucherAmount > 0 && data.createVoucher) {
      try {
        const voucherId  = `vchr_${familyId}_zwrot_${Date.now()}`;
        const voucherDoc = {
          id:           voucherId,
          userId:       familyId,
          code:         data.voucherCode || `ZWROT-${Date.now()}`,
          valueType:    "amount",                 // returns always yield a fixed-value voucher
          initialValue: voucherAmount,
          percentValue: null,
          currency:     "PLN",
          // Store credit is tied to the original purchase's shop, so the
          // voucher is usable under the store-match rule. If the source tx
          // had no merchant the store is "" and the voucher won't attach to
          // anything until edited — surfaced to the user as a warning.
          store:        existing.merchant || "",
          usedInTransactions: [],
          isArchived:   false,
          expiresAt:    data.voucherExpiresAt ?? null,
          description:  `Voucher ze zwrotu: ${existing.categoryName} › ${existing.subcategoryName}`,
          sourceTransactionId: existing.id,
          createdAt:    new Date().toISOString(),
          createdBy:    req.user.name,
          createdById:  req.user.id,
        };
        await vouchersContainer.items.upsert(voucherDoc);
        sideEffects.voucherCreated = true;
        console.log(`[TX RETURN] Voucher created: ${voucherId}`);
      } catch (voucherErr) {
        console.error(
          `[TX RETURN] Voucher creation failed for ${existing.id}. ` +
          `Return is saved but voucher is MISSING. Error:`,
          voucherErr,
        );
        sideEffects.partialFailure = true;
      }
    }

    console.log(`[TX RETURN] ✅ Return added to ${existing.id}${sideEffects.partialFailure ? " (with partial side-effect failures)" : ""}`);

    // Add a user-facing warning if any side-effect failed
    const response = { transaction: savedTx, sideEffects };
    if (sideEffects.partialFailure) {
      response.warning = "Zwrot został zapisany, ale powiązane operacje nie powiodły się. Sprawdź miesiąc zwrotu i vouchery.";
    }

    res.json(response);

  } catch (err) {
    if (err.code === 412) {
      return res.status(409).json({
        error: "Data was modified by another user. Please refresh and try again.",
      });
    }
    console.error("[TX RETURN]", err);
    res.status(500).json({ error: "Failed to save return." });
  }
});

// ── Helper: archive linked transfers + return-vouchers ───────
//
// Extracted from DELETE/PATCH handlers. Best-effort: a failure to
// archive one item is logged but doesn't stop the others, so the
// user is left with as few orphans as possible.

async function archiveLinkedItems(transactionsContainer, vouchersContainer, familyId, txId, user) {
  const archiveStamp = {
    isArchived:   true,
    archivedAt:   new Date().toISOString(),
    archivedBy:   user.name || user.email,
    archivedById: user.id,
  };

  // ── Linked TRANSFER transactions ──────────────────────────
  const { resources: linkedTransfers } = await transactionsContainer.items
    .query({
      query: `SELECT * FROM c WHERE c.userId = @userId
              AND c.sourceTransactionId = @txId
              AND c.type = 'TRANSFER'
              AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))`,
      parameters: [
        { name: "@userId", value: familyId },
        { name: "@txId",   value: txId     },
      ],
    })
    .fetchAll();

  const transferResults = await Promise.allSettled(
    linkedTransfers.map(transfer =>
      transactionsContainer.items.upsert({ ...transfer, ...archiveStamp })
    )
  );
  const failedTransfers = transferResults.filter(r => r.status === "rejected").length;

  // ── Linked vouchers (return-generated) ────────────────────
  const { resources: linkedVouchers } = await vouchersContainer.items
    .query({
      query: `SELECT * FROM c WHERE c.userId = @userId
              AND c.sourceTransactionId = @txId
              AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))`,
      parameters: [
        { name: "@userId", value: familyId },
        { name: "@txId",   value: txId     },
      ],
    })
    .fetchAll();

  const voucherResults = await Promise.allSettled(
    linkedVouchers.map(voucher =>
      vouchersContainer.items.upsert({ ...voucher, ...archiveStamp })
    )
  );
  const failedVouchers = voucherResults.filter(r => r.status === "rejected").length;

  if (failedTransfers > 0 || failedVouchers > 0) {
    console.error(`[archiveLinkedItems] ${failedTransfers} transfer(s) and ${failedVouchers} voucher(s) FAILED for ${txId}`);
  }
  console.log(`[archiveLinkedItems] ${linkedTransfers.length - failedTransfers}/${linkedTransfers.length} transfers, ${linkedVouchers.length - failedVouchers}/${linkedVouchers.length} vouchers archived for ${txId}`);
}



// ── GET /:id/receipt ──────────────────────────────────────
// Streams the receipt photo through the backend — the blob
// container is private. familyId scoping comes for free from
// the Point Read (tx must belong to the user's family).
router.get("/:id/receipt", async (req, res) => {
  try {
    const existing = await readItem(transactionsContainer, req.params.id, req.user.familyId);
    if (!existing)                  return res.status(404).json({ error: "Transaction not found." });
    if (!existing.receiptBlobPath) return res.status(404).json({ error: "No receipt attached." });
    // Defense in depth: the path is client-supplied at POST time, so verify
    // it belongs to this family before streaming.
    if (!existing.receiptBlobPath.startsWith(`${req.user.familyId}/`)) {
      return res.status(404).json({ error: "No receipt attached." });
    }
    const container = await getReceiptBlobContainer();
    if (!container) return res.status(503).json({ error: "Receipt storage is not configured." });

    const download = await container.getBlockBlobClient(existing.receiptBlobPath).download();
    // PDF e-receipts are archived as .pdf — the frontend modal picks
    // its viewer (img vs iframe) off this header via blob.type.
    res.setHeader("Content-Type", download.contentType
      || (existing.receiptBlobPath.endsWith(".pdf") ? "application/pdf" : "image/jpeg"));
    res.setHeader("Cache-Control", "private, max-age=86400");
    download.readableStreamBody.pipe(res);
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "Receipt file not found." });
    console.error("[TX RECEIPT]", err);
    res.status(500).json({ error: "Failed to fetch receipt." });
  }
});
module.exports = router;
