// ============================================================
// File: backend/routes/recurring.js
// Single document per recurring expense.
// Cost history stored in costs[] array — no recurringId grouping.
//
// Schema:
// {
//   id, userId, description, subcategoryId, subcategoryName,
//   categoryId, categoryName, frequency, activeMonths, plannedDay,
//   costs: [{ validFrom, amount, originalCurrency, fxRate, amountPLN }],
//   validTo, isArchived, archivedFrom,
//   lastConfirmedMonth, notifiedAt,
//   tags, priority,
//   createdAt, createdBy, createdById,
//   updatedAt, updatedBy, updatedById,
//   archivedAt, archivedBy, archivedById,
// }
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { recurringContainer, transactionsContainer } = require("../cosmos");
const { requireAuth }        = require("../middleware/auth");
const {
  readItemWithEtag, IdParamSchema, BUDGET_MONTH_REGEX, currentServerMonth,round2
} = require("../utils/helpers");

router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────

const FrequencyEnum = z.enum(["monthly", "quarterly", "biannual", "yearly", "custom"]);

const CostEntrySchema = z.object({
  validFrom:        z.string().regex(BUDGET_MONTH_REGEX),
  amount:           z.number().positive(),
  originalCurrency: z.string().length(3).default("PLN"),
  fxRate:           z.number().positive().default(1),
  amountPLN:        z.number().positive().optional(),
});

const RecurringPostSchema = z.object({
  description:      z.string().min(1).max(500).transform(v => v.trim()),
  subcategoryId:    z.string().min(1),
  subcategoryName:  z.string().min(1),
  categoryId:       z.string().min(1),
  categoryName:     z.string().min(1),
  frequency:        FrequencyEnum,
  activeMonths:     z.array(z.number().int().min(1).max(12)).nullable().optional().default(null),
  plannedDay:       z.number().int().min(1).max(31).default(1),
  tags:             z.array(z.string()).optional().default([]),
  priority:         z.number().int().min(1).max(4).optional().default(2),
  validTo:          z.string().regex(BUDGET_MONTH_REGEX).nullable().optional().default(null),
  costs:            z.array(CostEntrySchema).min(1),
});

const RecurringPatchSchema = z.object({
  description:      z.string().min(1).max(500).optional().transform(v => v?.trim()),
  subcategoryId:    z.string().min(1).optional(),
  subcategoryName:  z.string().min(1).optional(),
  categoryId:       z.string().min(1).optional(),
  categoryName:     z.string().min(1).optional(),
  plannedDay:       z.number().int().min(1).max(31).optional(),
  tags:             z.array(z.string()).optional(),
  priority:         z.number().int().min(1).max(4).optional(),
  validTo:          z.string().regex(BUDGET_MONTH_REGEX).nullable().optional(),
  archivedFrom:     z.string().regex(BUDGET_MONTH_REGEX).nullable().optional(),
  isArchived:       z.boolean().optional(),
  costs:            z.array(CostEntrySchema).optional(),
}).refine(d => Object.keys(d).length > 0, { message: "No fields to update." });

// ── Helper ────────────────────────────────────────────────────

function getActiveCost(doc, month) {
  const eligible = (doc.costs || []).filter(c => c.validFrom <= month);
  if (!eligible.length) return doc.costs?.[0] ?? null;
  return eligible.sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
}

function isActiveInMonth(doc, month) {
  if (doc.isArchived && doc.archivedFrom && doc.archivedFrom <= month) return false;
  if (!doc.costs?.length) return false;
  const firstValidFrom = doc.costs[0].validFrom;
  if (month < firstValidFrom) return false;
  if (doc.validTo && month > doc.validTo) return false;

  const [y, m] = month.split("-").map(Number);
  switch (doc.frequency) {
    case "monthly":   return true;
    case "quarterly": {
      const [fy, fm] = firstValidFrom.split("-").map(Number);
      return (((y - fy) * 12 + (m - fm)) % 3) === 0;
    }
    case "biannual": {
      const [fy, fm] = firstValidFrom.split("-").map(Number);
      return (((y - fy) * 12 + (m - fm)) % 6) === 0;
    }
    case "yearly": {
      const [, fm] = firstValidFrom.split("-").map(Number);
      return m === fm;
    }
    case "custom":
      return (doc.activeMonths || []).includes(m);
    default:
      return false;
  }
}

// ── GET /api/recurring?month=YYYY-MM ─────────────────────────

router.get("/", async (req, res) => {
  const { month } = req.query;
  if (!month || !BUDGET_MONTH_REGEX.test(month)) {
    return res.status(400).json({ error: "month parameter required (YYYY-MM)." });
  }
  try {
    const familyId = req.user.familyId;
    const { resources } = await recurringContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))",
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll();

    const active = resources.filter(doc => isActiveInMonth(doc, month)).map(doc => ({
      ...doc,
      activeCost: getActiveCost(doc, month),
    }));
    res.json(active);
  } catch (err) {
    console.error("[RECURRING GET]", err);
    res.status(500).json({ error: "Failed to fetch recurring transactions." });
  }
});

// ── GET /api/recurring/all ────────────────────────────────────

router.get("/all", async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const { resources } = await recurringContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c._ts DESC",
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll();
    res.json(resources);
  } catch (err) {
    console.error("[RECURRING ALL]", err);
    res.status(500).json({ error: "Failed to fetch recurring transactions." });
  }
});

// ── POST /api/recurring ───────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = RecurringPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId = req.user.familyId;
    const d        = parsed.data;
    const id       = `rec_${familyId}_${Date.now()}`;

    // Sort costs by validFrom ascending
    const costs = [...d.costs].sort((a, b) => a.validFrom.localeCompare(b.validFrom));

    const doc = {
      id,
      userId:             familyId,
      description:        d.description,
      subcategoryId:      d.subcategoryId,
      subcategoryName:    d.subcategoryName,
      categoryId:         d.categoryId,
      categoryName:       d.categoryName,
      frequency:          d.frequency,
      activeMonths:       d.activeMonths,
      plannedDay:         d.plannedDay,
      tags:               d.tags,
      priority:           d.priority,
      costs,
      validTo:            d.validTo,
      isArchived:         false,
      archivedFrom:       null,
      lastConfirmedMonth: null,
      notifiedAt:         null,
      createdAt:          new Date().toISOString(),
      createdBy:          req.user.name || req.user.email,
      createdById:        req.user.id,
    };

    const { resource } = await recurringContainer.items.create(doc);
    console.log(`[RECURRING POST] Created: ${resource.id}`);
    res.status(201).json(resource);
  } catch (err) {
    console.error("[RECURRING POST]", err);
    res.status(500).json({ error: "Failed to create recurring transaction." });
  }
});

// ── PATCH /api/recurring/:id ──────────────────────────────────
// For cost change: pass costs[] with new entry appended.
// For meta change: pass individual fields.

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = RecurringPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(recurringContainer, id, familyId);
    if (!existing) return res.status(404).json({ error: "Recurring transaction not found." });

    const patchFields = Object.fromEntries(
      Object.entries(parsed.data).filter(([_, v]) => v !== undefined)
    );

    // If costs updated — sort by validFrom ascending
    if (patchFields.costs) {
      patchFields.costs = [...patchFields.costs].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    }

    const updated = {
      ...existing,
      ...patchFields,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    const { resource } = await recurringContainer.items.upsert(updated, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[RECURRING PATCH] Updated: ${resource.id}`);
    res.json(resource);
  } catch (err) {
    if (err.code === 412) {
      return res.status(409).json({
        error: "Data was modified by another user. Please refresh and try again.",
      });
    }
    console.error("[RECURRING PATCH]", err);
    res.status(500).json({ error: "Failed to update recurring transaction." });
  }
});

// ── DELETE /api/recurring/:id ─────────────────────────────────

router.delete("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id           = idParsed.data;
    const familyId     = req.user.familyId;
    const archivedFrom = req.body?.archivedFrom ?? currentServerMonth();

    const { resource: existing, etag } = await readItemWithEtag(recurringContainer, id, familyId);
    if (!existing) return res.status(404).json({ error: "Recurring transaction not found." });

    const archived = {
      ...existing,
      isArchived:   true,
      archivedFrom,
      archivedAt:   new Date().toISOString(),
      archivedBy:   req.user.name || req.user.email,
      archivedById: req.user.id,
    };

    const { resource } = await recurringContainer.items.upsert(archived, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[RECURRING DELETE] Archived from ${archivedFrom}: ${resource.id}`);
    res.json({ success: true, id: resource.id, archivedFrom });
  } catch (err) {
    if (err.code === 412) {
      return res.status(409).json({
        error: "Data was modified by another user. Please refresh and try again.",
      });
    }
    console.error("[RECURRING DELETE]", err);
    res.status(500).json({ error: "Failed to archive recurring transaction." });
  }
});

// ── POST /api/recurring/:id/confirm ──────────────────────────

router.post("/:id/confirm", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;
    const { date, budgetMonth, fxRate: clientFxRate, amountPLN: clientAmountPLN } = req.body;

    if (!date || !budgetMonth) {
      return res.status(400).json({ error: "date and budgetMonth are required." });
    }

    const { resource: rec, etag } = await readItemWithEtag(recurringContainer, id, familyId);
    if (!rec)           return res.status(404).json({ error: "Recurring transaction not found." });
    if (rec.isArchived) return res.status(409).json({ error: "Recurring transaction is archived." });

    const activeCost = getActiveCost(rec, budgetMonth);
    if (!activeCost) return res.status(400).json({ error: "No cost entry found for this month." });

    const isForeign = activeCost.originalCurrency && activeCost.originalCurrency !== "PLN";
    const fxRate    = clientFxRate || activeCost.fxRate || 1;
    // Use amount explicitly confirmed by user — fallback to computed value
    const amountPLN = clientAmountPLN != null
      ? clientAmountPLN
      : isForeign
        ? round2(activeCost.amount * fxRate)
        : activeCost.amount;

    const txId = `tx_${familyId}_${date.replace(/-/g, "")}_rec_${Date.now()}`;
    const tx = {
      id:               txId,
      userId:           familyId,
      type:             "EXPENSE",
      subcategoryId:    rec.subcategoryId,
      subcategoryName:  rec.subcategoryName,
      categoryId:       rec.categoryId,
      categoryName:     rec.categoryName,
      amount:           amountPLN,
      originalAmount:   activeCost.amount,
      originalCurrency: activeCost.originalCurrency || "PLN",
      fxRate,
      date,
      budgetMonth,
      description:      rec.description || "",
      tags:             rec.tags || [],
      priority:         rec.priority,
      isRecurring:      true,
      recurringId:      rec.id,
      useVoucher:       false,
      voucherId:        null,
      voucherAmount:    0,
      netAmount:        amountPLN,
      returns:          [],
      author:           req.user.name || req.user.email,
      authorId:         req.user.id,
      isArchived:       false,
      archivedAt:       null,
      archivedBy:       null,
      archivedById:     null,
      createdAt:        new Date().toISOString(),
    };

    const { resource: savedTx } = await transactionsContainer.items.create(tx);

    const updatedRec = {
      ...rec,
      lastConfirmedMonth: budgetMonth,
      notifiedAt:         null,
      updatedAt:          new Date().toISOString(),
    };

    await recurringContainer.items.upsert(updatedRec, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[RECURRING CONFIRM] tx: ${savedTx.id}`);
    res.status(201).json({ transaction: savedTx });
  } catch (err) {
    console.error("[RECURRING CONFIRM]", err);
    res.status(500).json({ error: "Failed to confirm recurring transaction." });
  }
});

// ── POST /api/recurring/:id/notify ───────────────────────────

router.post("/:id/notify", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: rec, etag } = await readItemWithEtag(recurringContainer, id, familyId);
    if (!rec) return res.status(404).json({ error: "Recurring transaction not found." });

    await recurringContainer.items.upsert(
      { ...rec, notifiedAt: new Date().toISOString() },
      { accessCondition: { type: "IfMatch", condition: etag } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[RECURRING NOTIFY]", err);
    res.status(500).json({ error: "Failed to mark notification." });
  }
});

module.exports = router;