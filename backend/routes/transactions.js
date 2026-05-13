// ============================================================
// File: backend/routes/transactions.js
// GET    /api/transactions?budgetMonth=YYYY-MM
// POST   /api/transactions
// PATCH  /api/transactions/:id
// DELETE /api/transactions/:id        (soft delete)
// POST   /api/transactions/:id/returns
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { transactionsContainer, vouchersContainer } = require("../cosmos");
const { requireAuth }                               = require("../middleware/auth");
const { generateId, readItem, syncVoucherUsage }    = require("../utils/helpers");

router.use(requireAuth);

const budgetMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

// ── Schemas ───────────────────────────────────────────────────

const TransactionPostSchema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetMonth:      z.string().regex(budgetMonthRegex),
  subcategoryId:    z.string().min(1),
  subcategoryName:  z.string().min(1),
  categoryId:       z.string().min(1),
  categoryName:     z.string().min(1),
  amount:           z.number().positive(),
  originalAmount:   z.number().positive(),
  originalCurrency: z.string().length(3),
  fxRate:           z.number().positive(),
  description:      z.string().max(500).optional().default(""),
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
  budgetMonth:      z.string().regex(budgetMonthRegex).optional(),
  subcategoryId:    z.string().min(1).optional(),
  subcategoryName:  z.string().min(1).optional(),
  categoryId:       z.string().min(1).optional(),
  categoryName:     z.string().min(1).optional(),
  amount:           z.number().positive().optional(),
  originalAmount:   z.number().positive().optional(),
  originalCurrency: z.string().length(3).optional(),
  fxRate:           z.number().positive().optional(),
  description:      z.string().max(500).optional(),
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
    moneyReturnedInMonth: z.string().regex(budgetMonthRegex),
    returnedAt:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason:               z.string().max(500).optional().default(""),
    returnedBy:           z.string().optional().default(""),
    returnedById:         z.string().optional().default(""),
  })).optional(),
}).refine(d => Object.keys(d).length > 0, {
  message: "No fields to update.",
}).refine(d => {
  // useVoucher:true requires a non-empty voucherId
  if (d.useVoucher === true && d.voucherId !== undefined && !d.voucherId) return false;
  return true;
}, { message: "useVoucher:true requires a non-empty voucherId." });

const ReturnSchema = z.object({
  amount:               z.number().positive(),
  voucherAmount:        z.number().min(0).default(0),
  cashAmount:           z.number().min(0),
  moneyReturnedInMonth: z.string().regex(budgetMonthRegex),
  returnedAt:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:               z.string().max(500).optional().default(""),
});

// ── GET ───────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { budgetMonth } = req.query;
    const familyId = req.user.familyId;

    if (!budgetMonth || !budgetMonthRegex.test(budgetMonth)) {
      return res.status(400).json({ error: "budgetMonth parameter is required (format: YYYY-MM)." });
    }

    const { resources } = await transactionsContainer.items.query({
      query: `SELECT * FROM c
              WHERE c.userId      = @userId
                AND c.budgetMonth = @budgetMonth
                AND (c.isDeleted  = false OR NOT IS_DEFINED(c.isDeleted))`,
      parameters: [
        { name: "@userId",      value: familyId   },
        { name: "@budgetMonth", value: budgetMonth },
      ],
    }).fetchAll();

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
      id:          newId,
      userId:      familyId,
      ...data,
      netAmount:   data.useVoucher
        ? Math.max(0, data.amount - (data.voucherAmount || 0))
        : data.amount,
      returns:     [],
      author:      req.user.name  || req.user.email,
      authorId:    req.user.id,
      isDeleted:   false,
      deletedAt:   null,
      deletedBy:   null,
      deletedById: null,
      createdAt:   new Date().toISOString(),
    };

    const { resource } = await transactionsContainer.items.create(newTx);

    // Sync voucher usage — add entry
    if (data.useVoucher && data.voucherId && data.voucherAmount > 0) {
      const voucherResult = await syncVoucherUsage(vouchersContainer, data.voucherId, familyId, {
        type:          "add",
        transactionId: resource.id,
        amount:        data.voucherAmount,
        usedAt:        data.date,
        description:   data.description || "",
      });
      if (!voucherResult) {
        // Rollback: soft-delete the transaction we just created
        await transactionsContainer.items.upsert({ ...resource, isDeleted: true, deletedAt: new Date().toISOString() });
        return res.status(400).json({ error: "Voucher nie istnieje lub jest zarchiwizowany. Transaction was not saved." });
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
  const parsed = TransactionPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const { id }   = req.params;
    const familyId = req.user.familyId;

    const existing = await readItem(transactionsContainer, id, familyId);
    if (!existing)         return res.status(404).json({ error: "Transaction not found." });
    if (existing.isDeleted) return res.status(409).json({ error: "Cannot edit a deleted transaction." });

    const updates = parsed.data;
    const updated = {
      ...existing,
      ...updates,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    // Recompute netAmount
    const useVoucher    = updates.useVoucher    ?? existing.useVoucher;
    const voucherAmount = updates.voucherAmount ?? existing.voucherAmount ?? 0;
    const amount        = updates.amount        ?? existing.amount;
    updated.netAmount   = useVoucher ? Math.max(0, amount - voucherAmount) : amount;

    const { resource } = await transactionsContainer.items.upsert(updated);

    // ── Sync voucher usage after edit ────────────────────────
    const oldVoucherId  = existing.voucherId;
    const newVoucherId  = updated.voucherId;
    const newUseVoucher = updated.useVoucher;
    const newVoucherAmt = updated.voucherAmount || 0;

    if (oldVoucherId && oldVoucherId !== newVoucherId) {
      // Voucher swapped or removed — remove entry from old voucher
      await syncVoucherUsage(vouchersContainer, oldVoucherId, familyId, {
        type: "remove", transactionId: id,
      });
    }

    if (newUseVoucher && newVoucherId && newVoucherAmt > 0) {
      // Add or update entry on new/current voucher
      const opType = (oldVoucherId === newVoucherId) ? "update" : "add";
      await syncVoucherUsage(vouchersContainer, newVoucherId, familyId, {
        type:          opType,
        transactionId: id,
        amount:        newVoucherAmt,
        usedAt:        updated.date,
        description:   updated.description || "",
      });
    } else if (!newUseVoucher && oldVoucherId) {
      // Voucher disabled — remove entry
      await syncVoucherUsage(vouchersContainer, oldVoucherId, familyId, {
        type: "remove", transactionId: id,
      });
    }

    console.log(`[TX PATCH] Updated: ${resource.id}`);
    res.json(resource);
  } catch (err) {
    console.error("[TX PATCH]", err);
    res.status(500).json({ error: "Failed to update transaction." });
  }
});

// ── DELETE (soft) ─────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const { id }   = req.params;
    const familyId = req.user.familyId;

    const existing = await readItem(transactionsContainer, id, familyId);
    if (!existing)          return res.status(404).json({ error: "Transaction not found." });
    if (existing.isDeleted) return res.status(409).json({ error: "Transaction is already deleted." });

    const softDeleted = {
      ...existing,
      isDeleted:   true,
      deletedAt:   new Date().toISOString(),
      deletedBy:   req.user.name || req.user.email,
      deletedById: req.user.id,
    };

    const { resource } = await transactionsContainer.items.upsert(softDeleted);

    // Restore voucher usage — remove entry since transaction no longer exists
    if (existing.useVoucher && existing.voucherId) {
      await syncVoucherUsage(vouchersContainer, existing.voucherId, familyId, {
        type: "remove", transactionId: id,
      });
    }

    console.log(`[TX DELETE] Soft-deleted: ${resource.id}`);
    res.json({ success: true, id: resource.id });
  } catch (err) {
    console.error("[TX DELETE]", err);
    res.status(500).json({ error: "Failed to delete transaction." });
  }
});

// ── POST /returns ─────────────────────────────────────────────
// Return does NOT touch the voucher — user manages it manually.

router.post("/:id/returns", async (req, res) => {
  const parsed = ReturnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const { id }   = req.params;
    const familyId = req.user.familyId;

    const existing = await readItem(transactionsContainer, id, familyId);
    if (!existing)          return res.status(404).json({ error: "Transaction not found." });
    if (existing.isDeleted) return res.status(409).json({ error: "Transaction is deleted." });

    const returnEntry = {
      ...parsed.data,
      returnedBy:   req.user.name  || req.user.email,
      returnedById: req.user.id,
    };

    const totalReturnedSoFar = (existing.returns || []).reduce((s, r) => s + r.amount, 0);
    const newTotal           = totalReturnedSoFar + returnEntry.amount;

    // Validate: moneyReturnedInMonth must not be before transaction's budgetMonth
    if (parsed.data.moneyReturnedInMonth < existing.budgetMonth) {
      return res.status(400).json({
        error: `Return month cannot be earlier than transaction month (${existing.budgetMonth}).`,
      });
    }

    const updated = {
      ...existing,
      returns:     [...(existing.returns || []), returnEntry],
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    const { resource } = await transactionsContainer.items.upsert(updated);

    const warning = newTotal > existing.amount
      ? `Uwaga: łączny zwrot (${newTotal} PLN) przekracza kwotę transakcji (${existing.amount} PLN).`
      : null;

    console.log(`[TX RETURN] Added return to: ${resource.id}`);
    res.json({ transaction: resource, warning });
  } catch (err) {
    console.error("[TX RETURN]", err);
    res.status(500).json({ error: "Failed to add return." });
  }
});

module.exports = router;