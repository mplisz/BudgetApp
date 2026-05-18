// ============================================================
// File: backend/routes/transactions.js
// GET    /api/transactions?budgetMonth=YYYY-MM
// POST   /api/transactions
// PATCH  /api/transactions/:id
// DELETE /api/transactions/:id        (soft archive)
// POST   /api/transactions/:id/returns
//
// Changes vs previous version:
//   - isDeleted → isArchived (unified soft-delete convention)
//   - readItemWithEtag + If-Match for PATCH and DELETE
//   - Voucher sync BEFORE transaction upsert (safer failure mode)
//   - All error messages in English (translateError on frontend)
//   - patchFields strips undefined to avoid overwriting existing fields
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { transactionsContainer, vouchersContainer, monthsContainer } = require("../cosmos");
const { requireAuth }                                                 = require("../middleware/auth");
const {
  generateId, readItem, readItemWithEtag, syncVoucherUsage,
  IdParamSchema, BUDGET_MONTH_REGEX,
  currentServerMonth, prevServerMonth,
} = require('../utils/helpers');

router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────

const TransactionPostSchema = z.object({
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
  useVoucher:       z.boolean().optional().default(false),
  voucherId:        z.string().nullable().optional().default(null),
  voucherAmount:    z.number().min(0).optional().default(0),
  isRecurring:      z.boolean().optional().default(false),
  recurringId:      z.string().nullable().optional().default(null),
});

const TransactionPatchSchema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type:             z.enum(["EXPENSE", "INCOME", "SAVING", "TRANSFER"]).optional(),
  budgetMonth:      z.string().regex(BUDGET_MONTH_REGEX).optional(),
  subcategoryId:    z.string().min(1).optional(),
  subcategoryName:  z.string().min(1).optional(),
  categoryId:       z.string().min(1).optional(),
  categoryName:     z.string().min(1).optional(),
  amount:           z.number().positive().optional(),
  originalAmount:   z.number().positive().optional(),
  originalCurrency: z.string().length(3).optional(),
  fxRate:           z.number().positive().optional(),
  description:      z.string().max(500).optional().transform(v => v?.trim() ?? ""),
  tags:             z.array(z.string()).optional(),
  priority:         z.number().int().min(1).max(4).optional(),
  useVoucher:       z.boolean().optional(),
  voucherId:        z.string().nullable().optional(),
  voucherAmount:    z.number().min(0).optional(),
  returns:          z.array(z.object({
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
}).refine(d => Object.keys(d).length > 0, { message: "No fields to update." })
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

    // isArchived replaces isDeleted — filter out soft-archived transactions
    let query = `SELECT * FROM c
                 WHERE c.userId      = @userId
                   AND c.budgetMonth = @budgetMonth
                   AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))`;

    const parameters = [
      { name: "@userId",      value: familyId    },
      { name: "@budgetMonth", value: budgetMonth },
    ];

    // Optional type filter: ?type=EXPENSE or ?type=EXPENSE,SAVING
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

// ── POST ──────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = TransactionPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const data     = parsed.data;
    const familyId = req.user.familyId;

    const newId = `tx_${familyId}_${data.date.replace(/-/g,"")}_${generateId(data.subcategoryName)}_${Date.now()}`;

    const newTx = {
      id:           newId,
      userId:       familyId,
      ...data,
      netAmount:    data.useVoucher
        ? Math.max(0, data.amount - (data.voucherAmount || 0))
        : data.amount,
      returns:      [],
      author:       req.user.name || req.user.email,
      authorId:     req.user.id,
      // Unified soft-archive convention (isArchived replaces isDeleted)
      isArchived:   false,
      archivedAt:   null,
      archivedBy:   null,
      archivedById: null,
      createdAt:    new Date().toISOString(),
    };

    const { resource } = await transactionsContainer.items.create(newTx);

    // ── Voucher sync BEFORE we consider the TX final ──────────
    if (data.useVoucher && data.voucherId && data.voucherAmount > 0) {
      const voucherResult = await syncVoucherUsage(vouchersContainer, data.voucherId, familyId, {
        type:          "add",
        transactionId: resource.id,
        amount:        data.voucherAmount,
        usedAt:        data.date,
        description:   data.description || "",
      });
      if (!voucherResult) {
        // Rollback — archive the transaction we just created
        await transactionsContainer.items.upsert({
          ...resource,
          isArchived: true,
          archivedAt: new Date().toISOString(),
        });
        return res.status(400).json({ error: "Voucher not found or is archived." });
      }
    }

    console.log(`[TX POST] Created: ${resource.id}`);
    res.status(201).json(resource);
  } catch (err) {
    console.error("[TX POST]", err);
    res.status(500).json({ error: "Failed to create transaction." });
  }
});

// ── PATCH ─────────────────────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = TransactionPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)            return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived)  return res.status(409).json({ error: "Cannot edit an archived transaction." });

    // ── Block edit on recurring transactions ──────────────────
    // Recurring logic is handled separately — direct edit is disabled.
    if (existing.isRecurring) {
      return res.status(409).json({ error: "Cannot edit a recurring transaction directly." });
    }

    const hasReturns = (existing.returns || []).length > 0;
    const { forceArchiveLinked } = req.body;

    // ── If transaction has returns, require explicit confirmation ─
    // Frontend must send forceArchiveLinked: true after user confirms.
    if (hasReturns && !forceArchiveLinked) {
      return res.status(409).json({
        error: "Transaction has returns. Editing will archive all linked transfers and vouchers.",
        requiresConfirmation: true,
        hasReturns: true,
      });
    }

    // ── If confirmed — archive linked TRANSFERs and return vouchers ──
    if (hasReturns && forceArchiveLinked) {
      // Find and archive all cross-month TRANSFER transactions linked to this tx
      const { resources: linkedTransfers } = await transactionsContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.sourceTransactionId = @txId AND c.type = 'TRANSFER' AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))",
          parameters: [
            { name: "@userId", value: familyId },
            { name: "@txId",   value: id        },
          ],
        })
        .fetchAll();

      for (const transfer of linkedTransfers) {
        await transactionsContainer.items.upsert({
          ...transfer,
          isArchived:   true,
          archivedAt:   new Date().toISOString(),
          archivedBy:   req.user.name || req.user.email,
          archivedById: req.user.id,
        });
      }

      // Find and archive vouchers created from returns
      const { resources: linkedVouchers } = await vouchersContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.sourceTransactionId = @txId AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))",
          parameters: [
            { name: "@userId", value: familyId },
            { name: "@txId",   value: id        },
          ],
        })
        .fetchAll();

      for (const voucher of linkedVouchers) {
        await vouchersContainer.items.upsert({
          ...voucher,
          isArchived:   true,
          archivedAt:   new Date().toISOString(),
          archivedBy:   req.user.name || req.user.email,
          archivedById: req.user.id,
        });
      }

      console.log(`[TX PATCH] Archived ${linkedTransfers.length} transfers and ${linkedVouchers.length} vouchers linked to ${id}`);

      // Clear returns[] — linked items are archived, history is no longer valid
      existing.returns = [];
    }

    // Strip undefined to avoid overwriting existing fields with undefined
    const patchFields = Object.fromEntries(
      Object.entries(parsed.data).filter(([k, v]) => v !== undefined && k !== "forceArchiveLinked")
    );

    const updated = {
      ...existing,
      ...patchFields,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    // Recompute netAmount
    const useVoucher    = patchFields.useVoucher    ?? existing.useVoucher;
    const voucherAmount = patchFields.voucherAmount ?? existing.voucherAmount ?? 0;
    const amount        = patchFields.amount        ?? existing.amount;
    updated.netAmount   = useVoucher ? Math.max(0, amount - voucherAmount) : amount;

    const oldVoucherId  = existing.voucherId;
    const newVoucherId  = updated.voucherId;
    const newUseVoucher = updated.useVoucher;
    const newVoucherAmt = updated.voucherAmount || 0;

    // ── STEP 1: Sync voucher BEFORE updating transaction ──────
    if (oldVoucherId && oldVoucherId !== newVoucherId) {
      await syncVoucherUsage(vouchersContainer, oldVoucherId, familyId, {
        type: "remove", transactionId: id,
      });
    }

    if (newUseVoucher && newVoucherId && newVoucherAmt > 0) {
      const opType = (oldVoucherId === newVoucherId) ? "update" : "add";
      await syncVoucherUsage(vouchersContainer, newVoucherId, familyId, {
        type:          opType,
        transactionId: id,
        amount:        newVoucherAmt,
        usedAt:        updated.date      ?? existing.date,
        description:   updated.description ?? existing.description ?? "",
      });
    } else if (!newUseVoucher && oldVoucherId) {
      await syncVoucherUsage(vouchersContainer, oldVoucherId, familyId, {
        type: "remove", transactionId: id,
      });
    }

    // ── STEP 2: Update transaction with optimistic lock ───────
    const { resource } = await transactionsContainer.items.upsert(updated, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[TX PATCH] Updated: ${resource.id}`);
    res.json(resource);
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

router.delete("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived) return res.status(409).json({ error: "Transaction is already archived." });

    const hasReturns = (existing.returns || []).length > 0;
    const { forceArchiveLinked } = req.body || {};

    // ── If transaction has returns, require explicit confirmation ─
    if (hasReturns && !forceArchiveLinked) {
      return res.status(409).json({
        error: "Transaction has returns. Archiving will also archive all linked transfers and vouchers.",
        requiresConfirmation: true,
        hasReturns: true,
      });
    }

    // ── STEP 1: Sync voucher BEFORE archiving transaction ─────
    if (existing.useVoucher && existing.voucherId) {
      await syncVoucherUsage(vouchersContainer, existing.voucherId, familyId, {
        type: "remove", transactionId: id,
      });
    }

    // ── STEP 2: Archive linked TRANSFERs and return vouchers ──
    if (hasReturns && forceArchiveLinked) {
      const { resources: linkedTransfers } = await transactionsContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.sourceTransactionId = @txId AND c.type = 'TRANSFER' AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))",
          parameters: [
            { name: "@userId", value: familyId },
            { name: "@txId",   value: id        },
          ],
        })
        .fetchAll();

      for (const transfer of linkedTransfers) {
        await transactionsContainer.items.upsert({
          ...transfer,
          isArchived:   true,
          archivedAt:   new Date().toISOString(),
          archivedBy:   req.user.name || req.user.email,
          archivedById: req.user.id,
        });
      }

      const { resources: linkedVouchers } = await vouchersContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.sourceTransactionId = @txId AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))",
          parameters: [
            { name: "@userId", value: familyId },
            { name: "@txId",   value: id        },
          ],
        })
        .fetchAll();

      for (const voucher of linkedVouchers) {
        await vouchersContainer.items.upsert({
          ...voucher,
          isArchived:   true,
          archivedAt:   new Date().toISOString(),
          archivedBy:   req.user.name || req.user.email,
          archivedById: req.user.id,
        });
      }

      console.log(`[TX DELETE] Archived ${linkedTransfers.length} transfers and ${linkedVouchers.length} vouchers linked to ${id}`);
    }

    // ── STEP 2: Soft-archive transaction ──────────────────────
    const archived = {
      ...existing,
      isArchived:   true,
      archivedAt:   new Date().toISOString(),
      archivedBy:   req.user.name || req.user.email,
      archivedById: req.user.id,
    };

    const { resource } = await transactionsContainer.items.upsert(archived, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[TX DELETE] Archived: ${resource.id}`);
    res.json({ success: true, id: resource.id });
  } catch (err) {
    if (err.code === 412) {
      return res.status(409).json({
        error: "Data was modified by another user. Please refresh and try again.",
      });
    }
    console.error("[TX DELETE]", err);
    res.status(500).json({ error: "Failed to archive transaction." });
  }
});

// ── POST /returns ─────────────────────────────────────────────

router.post("/:id/returns", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = ReturnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;
    const data     = parsed.data;

    const { resource: existing, etag } = await readItemWithEtag(transactionsContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Transaction not found." });
    if (existing.isArchived) return res.status(409).json({ error: "Transaction is archived." });

    // ── Validate moneyReturnedInMonth window ──────────────────
    const serverNow  = currentServerMonth();
    const serverPrev = prevServerMonth();

    if (data.moneyReturnedInMonth < serverPrev) {
      return res.status(400).json({ error: "Return month is outside the allowed window." });
    }
    if (data.moneyReturnedInMonth < existing.budgetMonth) {
      return res.status(400).json({ error: "Return month cannot be before purchase month." });
    }

    // ── Validate amounts ──────────────────────────────────────
    const totalReturnedSoFar = Math.round(
      (existing.returns || []).reduce((s, r) => s + r.amount, 0) * 100
    ) / 100;
    const newTotal = Math.round((totalReturnedSoFar + data.amount) * 100) / 100;

    if (newTotal > existing.amount + 0.01) {
      return res.status(400).json({ error: "Return amount exceeds transaction amount." });
    }
    if (Math.abs(data.cashAmount + data.voucherAmount - data.amount) > 0.01) {
      return res.status(400).json({ error: "cashAmount + voucherAmount must equal amount." });
    }

    // ── Check target month not closed ─────────────────────────
    const monthDoc = await readItem(
      monthsContainer,
      `month_${familyId}_${data.moneyReturnedInMonth}`,
      familyId
    );
    if (monthDoc?.isClosed) {
      return res.status(403).json({ error: "Target month is closed." });
    }

    // ── Pre-compute TRANSFER target month and validate it ─────
    // CRITICAL: must happen BEFORE upsert to avoid partial state.
    // If transferBudgetMonth is closed, we reject here — not after saving.
    const isCrossMonth = data.moneyReturnedInMonth !== existing.budgetMonth;
    let transferBudgetMonth = null;

    if (isCrossMonth && data.cashAmount > 0) {
      transferBudgetMonth = data.moneyReturnedInMonth < serverNow
        ? serverNow
        : data.moneyReturnedInMonth;

      // Validate transfer target month is not closed BEFORE saving anything
      if (transferBudgetMonth !== data.moneyReturnedInMonth) {
        // Only re-check if different from already-checked moneyReturnedInMonth
        const transferMonthDoc = await readItem(
          monthsContainer,
          `month_${familyId}_${transferBudgetMonth}`,
          familyId
        );
        if (transferMonthDoc?.isClosed) {
          return res.status(403).json({ error: "Target month is closed." });
        }
      }
    }

    // ── Build return entry ────────────────────────────────────
    const returnEntry = {
      amount:               data.amount,
      cashAmount:           data.cashAmount,
      voucherAmount:        data.voucherAmount,
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

    // ── STEP 1: Save transaction (all validations passed) ─────
    const { resource: savedTx } = await transactionsContainer.items.upsert(updatedTx, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    const sideEffects = { transferCreated: false, voucherCreated: false, transferBudgetMonth: null };

    // ── STEP 2: Create TRANSFER if cross-month cash return ────
    if (isCrossMonth && data.cashAmount > 0 && transferBudgetMonth) {
      const transferId  = `tx_${familyId}_${transferBudgetMonth.replace("-","")}_zwrot_${Date.now()}`;
      const transferDoc = {
        id:               transferId,
        userId:           familyId,
        type:             "TRANSFER",
        categoryId:       process.env.RETURN_CATEGORY_ID      || "cat_srodki",
        categoryName:     process.env.RETURN_CATEGORY_NAME    || "Środki własne",
        subcategoryId:    process.env.RETURN_SUBCATEGORY_ID   || "cat_root_srodki_zwroty_MMs",
        subcategoryName:  process.env.RETURN_SUBCATEGORY_NAME || "Zwroty",
        amount:           data.cashAmount,
        originalAmount:   data.cashAmount,
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
        netAmount:        data.cashAmount,
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
    }

    // ── STEP 3: Create voucher if requested ───────────────────
    if (data.voucherAmount > 0 && data.createVoucher) {
      const voucherId  = `vchr_${familyId}_zwrot_${Date.now()}`;
      const voucherDoc = {
        id:           voucherId,
        userId:       familyId,
        code:         data.voucherCode || `ZWROT-${Date.now()}`,
        initialValue: data.voucherAmount,
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
    }

    console.log(`[TX RETURN] ✅ Return added to ${existing.id}`);
    res.json({ transaction: savedTx, sideEffects });

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

module.exports = router;