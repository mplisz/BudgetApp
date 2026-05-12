// ============================================================
// File: backend/routes/transactions.js
// Handles all transaction-related endpoints
// GET  /api/transactions?budgetMonth=YYYY-MM
// POST /api/transactions
// PATCH /api/transactions/:id
// DELETE /api/transactions/:id  (soft delete)
// ============================================================

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { transactionsContainer } = require('../cosmos');
const { requireAuth }           = require('../middleware/auth');
const { generateId, readItem }  = require('../utils/helpers');

router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────

const budgetMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

// ── Zod Schemas ──────────────────────────────────────────────

const TransactionPostSchema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Nieprawidłowy format daty (YYYY-MM-DD)"),
  budgetMonth:      z.string().regex(budgetMonthRegex, "Nieprawidłowy format budgetMonth (YYYY-MM)"),
  subcategoryId:    z.string().min(1, "Brak subkategorii"),
  subcategoryName:  z.string().min(1),
  categoryId:       z.string().min(1, "Brak kategorii"),
  categoryName:     z.string().min(1),
  amount:           z.number().positive("Kwota musi być większa od 0"),
  originalAmount:   z.number().positive(),
  originalCurrency: z.string().length(3, "Waluta musi mieć 3 znaki"),
  fxRate:           z.number().positive(),
  description:      z.string().max(500).optional().default(""),
  tags:             z.array(z.string()).optional().default([]),
  priority:         z.number().int().min(1).max(4).optional().default(2),
  useVoucher:       z.boolean().optional().default(false),
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
  voucherAmount:    z.number().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "Brak pól do aktualizacji.",
});

// ── GET /api/transactions?budgetMonth=YYYY-MM ────────────────
router.get('/', async (req, res) => {
  try {
    const { budgetMonth } = req.query;
    const familyId = req.user.familyId;

    if (!budgetMonth || !budgetMonthRegex.test(budgetMonth)) {
      return res.status(400).json({ error: "Parametr budgetMonth jest wymagany (format: YYYY-MM)." });
    }

    const { resources } = await transactionsContainer.items
      .query({
        query: `SELECT * FROM c
                WHERE c.userId      = @userId
                  AND c.budgetMonth = @budgetMonth
                  AND (c.isDeleted  = false OR NOT IS_DEFINED(c.isDeleted))`,
        parameters: [
          { name: "@userId",      value: familyId   },
          { name: "@budgetMonth", value: budgetMonth },
        ],
      })
      .fetchAll();

    // Sort by date descending (ORDER BY not supported on emulator cross-partition queries)
    const sorted = resources.sort((a, b) => b.date.localeCompare(a.date));
    res.status(200).json(sorted);
  } catch (error) {
    console.error("[TRANSACTIONS GET] Failed:", error);
    res.status(500).json({ error: "Nie udało się pobrać transakcji." });
  }
});

// ── POST /api/transactions ───────────────────────────────────
router.post('/', async (req, res) => {
  const parsed = TransactionPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const data     = parsed.data;
    const familyId = req.user.familyId;

    const dateSlug = data.date.replace(/-/g, "");
    const newId    = `tx_${familyId}_${dateSlug}_${generateId(data.subcategoryName)}_${Date.now()}`;

    const newTx = {
      id: newId,
      userId: familyId,
      ...data,
      netAmount: data.useVoucher
        ? Math.max(0, data.amount - (data.voucherAmount || 0))
        : data.amount,
      author:      req.user.name  || req.user.email,
      authorId:    req.user.id,
      isDeleted:   false,
      deletedAt:   null,
      deletedBy:   null,
      deletedById: null,
      createdAt:   new Date().toISOString(),
    };

    const { resource } = await transactionsContainer.items.create(newTx);
    console.log(`[TRANSACTIONS POST] Created: ${resource.id} (${resource.amount} PLN)`);
    res.status(201).json(resource);

  } catch (error) {
    console.error("[TRANSACTIONS POST] Failed:", error);
    res.status(500).json({ error: "Nie udało się dodać transakcji." });
  }
});

// ── PATCH /api/transactions/:id ──────────────────────────────
router.patch('/:id', async (req, res) => {
  const parsed = TransactionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const { id }   = req.params;
    const familyId = req.user.familyId;

    const existing = await readItem(transactionsContainer, id, familyId);
    if (!existing) return res.status(404).json({ error: "Transakcja nie istnieje." });

    if (existing.isDeleted) {
      return res.status(409).json({ error: "Nie można edytować usuniętej transakcji." });
    }

    const updates = parsed.data;
    const updated = {
      ...existing,
      ...updates,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    // Recompute netAmount if relevant fields changed
    const useVoucher    = updates.useVoucher    ?? existing.useVoucher;
    const voucherAmount = updates.voucherAmount ?? existing.voucherAmount ?? 0;
    const amount        = updates.amount        ?? existing.amount;
    updated.netAmount   = useVoucher ? Math.max(0, amount - voucherAmount) : amount;

    const { resource } = await transactionsContainer.items.upsert(updated);
    console.log(`[TRANSACTIONS PATCH] Updated: ${resource.id}`);
    res.status(200).json(resource);

  } catch (error) {
    console.error("[TRANSACTIONS PATCH] Failed:", error);
    res.status(500).json({ error: "Nie udało się zaktualizować transakcji." });
  }
});

// ── DELETE /api/transactions/:id  (soft delete) ──────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id }   = req.params;
    const familyId = req.user.familyId;

    const existing = await readItem(transactionsContainer, id, familyId);
    if (!existing) return res.status(404).json({ error: "Transakcja nie istnieje." });

    if (existing.isDeleted) {
      return res.status(409).json({ error: "Transakcja jest już usunięta." });
    }

    const softDeleted = {
      ...existing,
      isDeleted:   true,
      deletedAt:   new Date().toISOString(),
      deletedBy:   req.user.name || req.user.email,
      deletedById: req.user.id,
    };

    const { resource } = await transactionsContainer.items.upsert(softDeleted);
    console.log(`[TRANSACTIONS DELETE] Soft-deleted: ${resource.id}`);
    res.status(200).json({ success: true, id: resource.id });

  } catch (error) {
    console.error("[TRANSACTIONS DELETE] Failed:", error);
    res.status(500).json({ error: "Nie udało się usunąć transakcji." });
  }
});

module.exports = router;