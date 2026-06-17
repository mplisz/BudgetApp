// ============================================================
// File: backend/routes/transactions.js
// GET    /api/transactions?budgetMonth=YYYY-MM
// GET    /api/transactions/range?from=YYYY-MM&to=YYYY-MM
// POST   /api/transactions
// PATCH  /api/transactions/:id
// DELETE /api/transactions/:id              (soft archive)
// POST   /api/transactions/:id/returns
//
// Changes from previous version:
//   - All voucher operations now use compensation (saga pattern):
//     if a downstream operation fails, we revert the voucher mutation.
//   - All money rounding goes through roundMoney() helper.
//   - DELETE archives transaction first, then attempts side-effects.
//   - POST /returns isolates each side-effect (transfer, voucher)
//     so a failure in one doesn't leave inconsistent state in another.
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { transactionsContainer, vouchersContainer, monthsContainer, receiptsContainer, settingsContainer } = require("../cosmos");
const { requireAuth }                                                 = require("../middleware/auth");
const {
  generateId, readItem, readItemWithEtag,
  syncVoucherUsage, revertVoucherSync,
  roundMoney, sumMoney,
  IdParamSchema, BUDGET_MONTH_REGEX,
  currentServerMonth, prevServerMonth,
} = require('../utils/helpers');
const { getReceiptBlobContainer,setReceiptRetention  } = require("../utils/receiptStorage");
router.use(requireAuth);
const { cleanMerchant, merchantExists, rememberMerchant } = require("../utils/merchant");


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
  merchant:         z.string().max(150).optional().nullable(), // future reference, unused for now
  lineItems:        z.array(z.object({
                      description:      z.string().max(200),
                      amount:          z.number(),
                      originalAmount:  z.number().optional(),
                      originalCurrency: z.string().max(5).optional(),
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
      moneyReturnedInMonth: z.string().regex(BUDGET_MONTH_REGEX),
      returnedAt:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason:               z.string().max(500).optional().default("").transform(v => v?.trim() ?? ""),
      returnedBy:           z.string().optional().default(""),
      returnedById:         z.string().optional().default(""),
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
  moneyReturnedInMonth: z.string().regex(BUDGET_MONTH_REGEX),
  returnedAt:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:               z.string().max(500).optional().default("").transform(v => v?.trim() ?? ""),
  createVoucher:        z.boolean().optional().default(false),
  voucherCode:          z.string().max(100).optional().default(""),
  voucherExpiresAt:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
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
async function promoteReceipt(receiptId, familyId, txId, isWarranty = false) {
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
  } catch (err) {
    console.error(`[TX POST] Receipt promote failed for ${receiptId} (non-fatal):`, err.message);
  }
}

router.post("/", async (req, res) => {
  const parsed = TransactionPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const data     = parsed.data;
  const familyId = req.user.familyId;
  let createdTx   = null;   // for rollback if voucher sync fails
  let voucherSnap = null;   // for rollback if anything fails after voucher sync

  try {
    const newId = `tx_${familyId}_${data.date.replace(/-/g,"")}_${generateId(data.subcategoryName)}_${Date.now()}`;
    const useVoucher    = !!data.useVoucher;
    const voucherAmount = roundMoney(data.voucherAmount || 0);
    const amount        = roundMoney(data.amount);

    const newTx = {
      id:           newId,
      userId:       familyId,
      ...data,
      amount,
      voucherAmount,
      netAmount:    useVoucher ? roundMoney(Math.max(0, amount - voucherAmount)) : amount,
      returns:      [],
      author:       req.user.name || req.user.email,
      authorId:     req.user.id,
      isArchived:   false,
      archivedAt:   null,
      archivedBy:   null,
      archivedById: null,
      createdAt:    new Date().toISOString(),
    };

    // ── STEP 1: Create the transaction ────────────────────────
    const { resource } = await transactionsContainer.items.create(newTx);
    createdTx = resource;

    // ── STEP 2: Sync voucher usage (if applicable) ────────────
    if (useVoucher && data.voucherId && voucherAmount > 0) {
      const syncResult = await syncVoucherUsage(vouchersContainer, data.voucherId, familyId, {
        type:          "add",
        transactionId: createdTx.id,
        amount:        voucherAmount,
        usedAt:        data.date,
        description:   data.description || "",
      });

      if (!syncResult) {
        // Voucher missing/archived. Roll the TX back (best effort).
        await transactionsContainer.items.upsert({
          ...createdTx,
          isArchived: true,
          archivedAt: new Date().toISOString(),
          archivedBy: "system_rollback",
        }).catch(rollbackErr => {
          console.error(`[TX POST ROLLBACK FAILED] ${createdTx.id}:`, rollbackErr);
        });
        return res.status(400).json({ error: "Voucher not found or is archived." });
      }

      voucherSnap = syncResult.previousState;
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
      promoteReceipt(createdTx.receiptId, familyId, createdTx.id);
    }
    // Remember the merchant for autocomplete + OCR canonicalization,
    // whether it came from OCR or was typed manually. Fire-and-forget.
    if (createdTx.merchant) {
      rememberMerchant(settingsContainer, familyId, createdTx.merchant);
    }
    
    console.log(`[TX POST] Created: ${createdTx.id}${useVoucher ? ` (voucher: ${data.voucherId})` : ""}`);
    res.status(201).json(createdTx);
  } catch (err) {
    // Full saga rollback — voucher first (more important to keep clean),
    // then the transaction.
    console.error("[TX POST] Saga error:", err);
    await revertVoucherSync(vouchersContainer, voucherSnap);
    if (createdTx) {
      await transactionsContainer.items.upsert({
        ...createdTx,
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: "system_rollback",
      }).catch(rollbackErr => {
        console.error(`[TX POST ROLLBACK FAILED] ${createdTx.id}:`, rollbackErr);
      });
    }
    
    res.status(500).json({ error: "Failed to create transaction." });
  }
});

// ── PATCH ─────────────────────────────────────────────────────
//
// PATCH is the most complex case because we may need to:
//   1. Remove voucher usage from OLD voucher (if voucher changed)
//   2. Add/update voucher usage on NEW voucher
//   3. Save the transaction itself
//
// Order matters: we touch vouchers BEFORE the tx upsert, then if the
// tx upsert fails, we revert both voucher mutations. If only one of
// the two voucher ops succeeds and the other fails, we revert the
// successful one immediately and bail.

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = TransactionPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id       = idParsed.data;
  const familyId = req.user.familyId;

  // Snapshots for rollback — each is non-null only after a successful mutation.
  let oldVoucherSnap = null;
  let newVoucherSnap = null;

  try {
    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)            return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived)  return res.status(409).json({ error: "Cannot edit an archived transaction." });

    // Strip undefined to avoid overwriting existing fields
    const patchFields = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );

    const updated = {
      ...existing,
      ...patchFields,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    // Recompute netAmount with rounded values
    const useVoucher    = patchFields.useVoucher    ?? existing.useVoucher;
    const voucherAmount = roundMoney(patchFields.voucherAmount ?? existing.voucherAmount ?? 0);
    const amount        = roundMoney(patchFields.amount        ?? existing.amount);
    updated.amount       = amount;
    updated.voucherAmount = voucherAmount;
    updated.netAmount    = useVoucher
      ? roundMoney(Math.max(0, amount - voucherAmount))
      : amount;

    const oldVoucherId  = existing.voucherId;
    const newVoucherId  = updated.voucherId;
    const newUseVoucher = updated.useVoucher;
    const newVoucherAmt = updated.voucherAmount || 0;

    // ── STEP 1a: Remove usage from old voucher if it changed ──
    if (oldVoucherId && oldVoucherId !== newVoucherId) {
      const removeResult = await syncVoucherUsage(vouchersContainer, oldVoucherId, familyId, {
        type: "remove", transactionId: id,
      });
      // null is OK here — voucher might have been archived in the meantime
      if (removeResult) oldVoucherSnap = removeResult.previousState;
    }

    // ── STEP 1b: Add/update usage on new voucher ──────────────
    if (newUseVoucher && newVoucherId && newVoucherAmt > 0) {
      const opType = (oldVoucherId === newVoucherId) ? "update" : "add";
      try {
        const addResult = await syncVoucherUsage(vouchersContainer, newVoucherId, familyId, {
          type:          opType,
          transactionId: id,
          amount:        newVoucherAmt,
          usedAt:        updated.date      ?? existing.date,
          description:   updated.description ?? existing.description ?? "",
        });

        if (!addResult) {
          // New voucher missing/archived → roll the old voucher's removal back
          await revertVoucherSync(vouchersContainer, oldVoucherSnap);
          return res.status(400).json({ error: "Voucher not found or is archived." });
        }
        newVoucherSnap = addResult.previousState;
      } catch (voucherErr) {
        // Roll the old voucher removal back, then surface the error
        await revertVoucherSync(vouchersContainer, oldVoucherSnap);
        throw voucherErr;
      }
    } else if (!newUseVoucher && oldVoucherId) {
      // Voucher disabled — clean up the old reference
      const removeResult = await syncVoucherUsage(vouchersContainer, oldVoucherId, familyId, {
        type: "remove", transactionId: id,
      });
      if (removeResult) oldVoucherSnap = removeResult.previousState;
    }
    // EDGE CASE: useVoucher=true && voucherAmount=0 leaves the voucher's
    // usedInTransactions[].amount untouched. This is accepted behaviour —
    // if the user wants to clear the voucher usage they should explicitly
    // set useVoucher=false. Treating 0 amount as "implicit disable" would
    // surprise users who briefly clear the field while editing.

    // ── STEP 2: Update transaction with optimistic lock ───────
    try {
      const { resource } = await transactionsContainer.items.upsert(updated, {
        accessCondition: { type: "IfMatch", condition: etag },
      });
      console.log(`[TX PATCH] Updated: ${resource.id}`);
      res.json(resource);
    } catch (txErr) {
      // Transaction save failed AFTER vouchers were already mutated.
      // Revert both voucher mutations to keep state consistent.
      console.error(`[TX PATCH] Tx save failed for ${id}, rolling back vouchers`);
      await revertVoucherSync(vouchersContainer, oldVoucherSnap);
      await revertVoucherSync(vouchersContainer, newVoucherSnap);
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
  let voucherSnap = null;

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

    // ── STEP 2: Sync voucher usage (free up the spent amount) ─
    if (existing.useVoucher && existing.voucherId) {
      try {
        const syncResult = await syncVoucherUsage(vouchersContainer, existing.voucherId, familyId, {
          type: "remove", transactionId: id,
        });
        if (syncResult) voucherSnap = syncResult.previousState;
      } catch (voucherErr) {
        // Voucher sync failed but tx is already archived — log loudly,
        // user can re-archive via manual cleanup. We do NOT undo the
        // archive because the user's intent was "delete this".
        console.error(
          `[TX DELETE] Voucher sync failed for archived tx ${id}, ` +
          `voucher ${existing.voucherId} may show stale usage. Error:`,
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
    // Outer catch — primary archive failed, voucher untouched
    console.error("[TX DELETE]", err);
    await revertVoucherSync(vouchersContainer, voucherSnap);
    res.status(500).json({ error: "Failed to archive transaction." });
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
    const totalReturnedSoFar = sumMoney((existing.returns || []).map(r => r.amount));
    const newTotal           = roundMoney(totalReturnedSoFar + amount);

    if (newTotal > existing.amount + 0.01) {
      return res.status(400).json({ error: "Return amount exceeds transaction amount." });
    }
    if (Math.abs(cashAmount + voucherAmount - amount) > 0.01) {
      return res.status(400).json({ error: "cashAmount + voucherAmount must equal amount." });
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

    // Resolve transfer target month and validate it BEFORE saving anything
    const isCrossMonth = data.moneyReturnedInMonth !== existing.budgetMonth;
    let transferBudgetMonth = null;

    if (isCrossMonth && cashAmount > 0) {
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
    }

    // ── STEP 1: Save the parent transaction (PRIMARY) ─────────
    const returnEntry = {
      amount,
      cashAmount,
      voucherAmount,
      moneyReturnedInMonth: data.moneyReturnedInMonth,
      returnedAt:           data.returnedAt,
      reason:               data.reason,
      returnedBy:           req.user.name || req.user.email,
      returnedById:         req.user.id,
      createdAt:            new Date().toISOString(),
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
      partialFailure:      false,
    };

    // ── STEP 2: Create TRANSFER (best effort) ─────────────────
    if (isCrossMonth && cashAmount > 0 && transferBudgetMonth) {
      try {
        const transferId  = `tx_${familyId}_${transferBudgetMonth.replace("-","")}_zwrot_${Date.now()}`;
        const transferDoc = {
          id:               transferId,
          userId:           familyId,
          type:             "TRANSFER",
          categoryId:       process.env.RETURN_CATEGORY_ID      || "cat_srodki",
          categoryName:     process.env.RETURN_CATEGORY_NAME    || "Środki własne",
          subcategoryId:    process.env.RETURN_SUBCATEGORY_ID   || "cat_root_srodki_zwroty_MMs",
          subcategoryName:  process.env.RETURN_SUBCATEGORY_NAME || "Zwroty",
          amount:           cashAmount,
          originalAmount:   cashAmount,
          originalCurrency: "PLN",
          fxRate:           1,
          date:             data.returnedAt,
          budgetMonth:      transferBudgetMonth,
          priority:         2,
          tags:             [],
          description:      `Zwrot: ${existing.categoryName} › ${existing.subcategoryName}${data.reason ? ` — ${data.reason}` : ""}${data.moneyReturnedInMonth !== transferBudgetMonth ? ` (faktyczny zwrot: ${data.moneyReturnedInMonth})` : ""}`,
          sourceTransactionId: existing.id,
          useVoucher:       false,
          voucherId:        null,
          voucherAmount:    0,
          isRecurring:      false,
          recurringId:      null,
          netAmount:        cashAmount,
          returns:          [],
          author:           req.user.name || req.user.email,
          authorId:         req.user.id,
          isArchived:       false,
          archivedAt:       null,
          archivedBy:       null,
          archivedById:     null,
          createdAt:        new Date().toISOString(),
        };

        await transactionsContainer.items.upsert(transferDoc);
        sideEffects.transferCreated     = true;
        sideEffects.transferBudgetMonth = transferBudgetMonth;
        console.log(`[TX RETURN] TRANSFER created: ${transferId} → ${transferBudgetMonth}`);
      } catch (transferErr) {
        console.error(
          `[TX RETURN] TRANSFER creation failed for ${existing.id}. ` +
          `Return is saved but cross-month transfer is MISSING. Error:`,
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
          initialValue: voucherAmount,
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
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    download.readableStreamBody.pipe(res);
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "Receipt file not found." });
    console.error("[TX RECEIPT]", err);
    res.status(500).json({ error: "Failed to fetch receipt." });
  }
});
module.exports = router;
