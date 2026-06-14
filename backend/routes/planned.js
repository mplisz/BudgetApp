// ============================================================
// File: backend/routes/planned.js
// Single document per planned expense.
//
// mode: "oneoff"   — single purchase, bell 3 days before plannedMonth
// mode: "envelope" — monthly savings with virtualSavings[]
//
// GET    /api/planned              — all docs
// GET    /api/planned?month=YYYY-MM — active for given month
// POST   /api/planned              — create
// PATCH  /api/planned/:id          — update (amount/month/savings)
// DELETE /api/planned/:id          — soft archive
// POST   /api/planned/:id/pay      — mark saving month as paid/dismissed
// POST   /api/planned/:id/purchase — finalize purchase → EXPENSE + TRANSFER
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { plannedContainer, transactionsContainer } = require("../cosmos");
const { requireAuth }        = require("../middleware/auth");
const {
  readItemWithEtag, IdParamSchema, BUDGET_MONTH_REGEX, currentServerMonth,round2
} = require("../utils/helpers");

router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────

// URL rule is shared by POST and PATCH — define it once.
const urlSchema = z.string().max(2000).trim()
  .refine(v => {
    if (v === "") return true;
    const m = v.match(/^([a-z][a-z0-9+.-]*):/i);
    return !m || /^https?$/i.test(m[1]);   // no scheme, or http(s) only
  }, { message: "URL has to start with http(s) or be a bare domain." })
  .optional().default("");

// Shared shape for every patchable field. `mode` lives only on POST —
// the expense type must not change after creation.
const PlannedBaseSchema = z.object({
  description:          z.string().min(1).max(500).transform(v => v.trim()),
  totalAmount:          z.number().positive(),
  originalCurrency:     z.string().length(3).default("PLN"),
  fxRate:               z.number().positive().default(1),
  totalAmountPLN:       z.number().positive(),
  targetCategoryId:     z.string().min(1),
  targetCategoryName:   z.string().min(1),
  targetSubcategoryId:  z.string().min(1),
  targetSubcategoryName:z.string().min(1),
  tags:                 z.array(z.string()).optional().default([]),
  priority:             z.number().int().min(1).max(4).optional().default(2),
  plannedMonth:         z.string().regex(BUDGET_MONTH_REGEX),
  monthlySavingDay:     z.number().int().min(1).max(31).optional().default(1),
  url:                  urlSchema,
  virtualSavings:       z.array(z.object({
    month:            z.string().regex(BUDGET_MONTH_REGEX),
    amount:           z.number().min(0),    // in original currency
    amountPLN:        z.number().min(0),
    fxRate:           z.number().positive().default(1),
    paidByUser:       z.boolean().default(false),
    dismissedByUser:  z.boolean().default(false),
  })).optional().default([]),
});

// POST: base plus the required mode. Defaults fire for omitted fields.
const PlannedPostSchema = PlannedBaseSchema.extend({
  mode: z.enum(["oneoff", "envelope"]),
});

// PATCH: every field optional. Omitted fields resolve to `undefined`
// (not their default), so the route's `v !== undefined` filter skips
// them and never clobbers existing values. At least one field required.
const PlannedPatchSchema = PlannedBaseSchema.partial()
  .refine(d => Object.keys(d).length > 0, { message: "No fields to update." });

// ── Helpers ───────────────────────────────────────────────────

// Sum of paid savings in PLN
function sumPaid(virtualSavings) {
  return (virtualSavings || [])
    .filter(v => v.paidByUser)
    .reduce((s, v) => s + v.amountPLN, 0);
}

// Compute suggestion for a given month
function computeSuggestion(doc, currentMonth) {
  if (doc.mode !== "envelope") return null;
  const paid      = sumPaid(doc.virtualSavings);
  const remaining = doc.totalAmountPLN - paid;
  const future    = (doc.virtualSavings || []).filter(v =>
    v.month >= currentMonth && !v.paidByUser && !v.dismissedByUser
  );
  if (future.length === 0) return Math.max(0, remaining);
    return Math.max(0, round2(remaining / future.length));
}

// Check if purchase is ready (collected >= target)
function isReadyToPurchase(doc) {
  if (doc.isPurchased || doc.isArchived) return false;
  return sumPaid(doc.virtualSavings) >= doc.totalAmountPLN;
}

// Generate virtualSavings months from startMonth to plannedMonth
function generateSavingsMonths(startMonth, plannedMonth, suggestion, currency, fxRate) {
  const months = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = plannedMonth.split("-").map(Number);

  while (y < ey || (y === ey && m <= em)) {
    const monthStr = `${y}-${String(m).padStart(2, "0")}`;
    months.push({
      month:           monthStr,
      amount:          suggestion,   // in original currency
      amountPLN:       0,
      fxRate:          fxRate || 1,
      paidByUser:      false,
      dismissedByUser: false,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ── GET /api/planned ──────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const { month } = req.query;

    const { resources } = await plannedContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.userId = @userId
                AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))
                ORDER BY c.plannedMonth ASC`,
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll();

    // Enrich with computed fields
    const enriched = resources.map(doc => ({
      ...doc,
      paidSoFar:        sumPaid(doc.virtualSavings),
      isReadyToPurchase: isReadyToPurchase(doc),
      suggestion:       computeSuggestion(doc, month || currentServerMonth()),
    }));

    // If month filter — return only relevant docs
    if (month && BUDGET_MONTH_REGEX.test(month)) {
      const filtered = enriched.filter(doc => {
        if (doc.isPurchased) return false;
        if (doc.mode === "oneoff") return doc.plannedMonth === month;
        // Envelope: active if has unpaid entry for this month or is ready to purchase
        return (doc.virtualSavings || []).some(v => v.month === month && !v.paidByUser && !v.dismissedByUser)
          || doc.isReadyToPurchase;
      });
      return res.json(filtered);
    }

    res.json(enriched);
  } catch (err) {
    console.error("[PLANNED GET]", err);
    res.status(500).json({ error: "Failed to fetch planned expenses." });
  }
});

// ── POST /api/planned ─────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = PlannedPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId = req.user.familyId;
    const d        = parsed.data;
    const id       = `planned_${familyId}_${Date.now()}`;

    // Generate virtualSavings if envelope and not provided
    let virtualSavings = d.virtualSavings;
    if (d.mode === "envelope" && !virtualSavings.length) {
      const startMonth  = currentServerMonth();
      const monthCount  = (() => {
        const [sy, sm] = startMonth.split("-").map(Number);
        const [ey, em] = d.plannedMonth.split("-").map(Number);
        return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
      })();
      const suggestion = round2(d.totalAmount / monthCount);
      virtualSavings    = generateSavingsMonths(startMonth, d.plannedMonth, suggestion, d.originalCurrency, d.fxRate);
    }

    const doc = {
      id,
      userId:               familyId,
      description:          d.description,
      totalAmount:          d.totalAmount,
      originalCurrency:     d.originalCurrency,
      fxRate:               d.fxRate,
      totalAmountPLN:       d.totalAmountPLN,
      targetCategoryId:     d.targetCategoryId,
      targetCategoryName:   d.targetCategoryName,
      targetSubcategoryId:  d.targetSubcategoryId,
      targetSubcategoryName:d.targetSubcategoryName,
      tags:                 d.tags,
      priority:             d.priority,
      mode:                 d.mode,
      plannedMonth:         d.plannedMonth,
      monthlySavingDay:     d.monthlySavingDay,
      virtualSavings,
      isPurchased:          false,
      purchasedMonth:       null,
      isArchived:           false,
      archivedAt:           null,
      archivedBy:           null,
      archivedById:         null,
      createdAt:            new Date().toISOString(),
      createdBy:            req.user.name || req.user.email,
      createdById:          req.user.id,
      url: d.url || "",

    };

    const { resource } = await plannedContainer.items.create(doc);
    console.log(`[PLANNED POST] Created: ${resource.id}`);
    res.status(201).json(resource);
  } catch (err) {
    console.error("[PLANNED POST]", err);
    res.status(500).json({ error: "Failed to create planned expense." });
  }
});

// ── PATCH /api/planned/:id ────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = PlannedPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(plannedContainer, id, familyId);
    if (!existing)            return res.status(404).json({ error: "Planned expense not found." });
    if (existing.isArchived)  return res.status(409).json({ error: "Planned expense is archived." });
    if (existing.isPurchased) return res.status(409).json({ error: "Planned expense is already purchased." });

    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([_, v]) => v !== undefined)
    );

    // If only totalAmountPLN changed (no plannedMonth change) — recompute amounts
    if (!patch.plannedMonth && patch.totalAmountPLN && existing.mode === "envelope") {
      const totalAmountPLN = patch.totalAmountPLN;
      const paidEntries    = existing.virtualSavings.filter(v => v.paidByUser);
      const paidPLN        = sumPaid(paidEntries);
      const remaining      = totalAmountPLN - paidPLN;
      const unpaid         = existing.virtualSavings.filter(v => !v.paidByUser && !v.dismissedByUser);
      if (unpaid.length > 0) {
        const suggestion = Math.max(0, Math.round(remaining / unpaid.length * 100) / 100);
        patch.virtualSavings = existing.virtualSavings.map(v =>
          (!v.paidByUser && !v.dismissedByUser) ? { ...v, amount: suggestion } : v
        );
      }
    }

    // Handle plannedMonth change — rebuild virtualSavings
    if (patch.plannedMonth && existing.mode === "envelope") {
      const newPlannedMonth = patch.plannedMonth;
      const totalAmountPLN  = patch.totalAmountPLN ?? existing.totalAmountPLN;
      const currency        = patch.originalCurrency ?? existing.originalCurrency;
      const fxRate          = patch.fxRate ?? existing.fxRate;

      // Keep paid entries regardless of month change
      const paidEntries = existing.virtualSavings.filter(v => v.paidByUser);

      // Remove future unpaid entries after new plannedMonth
      const keptUnpaid = existing.virtualSavings.filter(v =>
        !v.paidByUser && v.month <= newPlannedMonth
      );

      // Find highest existing month to continue from
      const allKept      = [...paidEntries, ...keptUnpaid];
      const existingMonths = new Set(allKept.map(v => v.month));
      const lastKeptMonth = allKept.length
        ? allKept.sort((a, b) => b.month.localeCompare(a.month))[0].month
        : null;

      // Add missing months between last kept and new plannedMonth
      const startFill = lastKeptMonth
        ? (() => {
            const [y, m] = lastKeptMonth.split("-").map(Number);
            const nm = m === 12 ? 1 : m + 1;
            const ny = m === 12 ? y + 1 : y;
            return `${ny}-${String(nm).padStart(2, "0")}`;
          })()
        : currentServerMonth();

      // Compute new suggestion for remaining months
      const paidPLN    = sumPaid(paidEntries);
      const remaining  = totalAmountPLN - paidPLN;
      const futureCount = (() => {
        const [sy, sm] = startFill.split("-").map(Number);
        const [ey, em] = newPlannedMonth.split("-").map(Number);
        return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
      })();
      const suggestion = Math.max(0, Math.round((remaining / futureCount) * 100) / 100);
      const newMonths  = generateSavingsMonths(startFill, newPlannedMonth, suggestion, currency, fxRate)
        .filter(v => !existingMonths.has(v.month));

      // Update amount in ALL unpaid kept entries to new suggestion
      const keptUnpaidUpdated = keptUnpaid.map(v => ({ ...v, amount: suggestion }));

      patch.virtualSavings = [...paidEntries, ...keptUnpaidUpdated, ...newMonths]
        .sort((a, b) => a.month.localeCompare(b.month));
    }

    const updated = {
      ...existing,
      ...patch,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    const { resource } = await plannedContainer.items.upsert(updated, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[PLANNED PATCH] Updated: ${resource.id}`);
    res.json(resource);
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED PATCH]", err);
    res.status(500).json({ error: "Failed to update planned expense." });
  }
});

// ── DELETE /api/planned/:id ───────────────────────────────────

router.delete("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(plannedContainer, id, familyId);
    if (!existing) return res.status(404).json({ error: "Planned expense not found." });

    const { resource } = await plannedContainer.items.upsert(
      { ...existing, isArchived: true, archivedAt: new Date().toISOString(), archivedBy: req.user.name || req.user.email, archivedById: req.user.id },
      { accessCondition: { type: "IfMatch", condition: etag } }
    );

    console.log(`[PLANNED DELETE] Archived: ${resource.id}`);
    res.json({ success: true, id: resource.id });
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED DELETE]", err);
    res.status(500).json({ error: "Failed to archive planned expense." });
  }
});

// ── POST /api/planned/:id/pay ─────────────────────────────────
// Mark a saving month as paid or dismissed

router.post("/:id/pay", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const { month, amountPLN, amount, fxRate, dismissed } = req.body;
  if (!month) return res.status(400).json({ error: "month is required." });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(plannedContainer, id, familyId);
    if (!existing)            return res.status(404).json({ error: "Planned expense not found." });
    if (existing.isArchived)  return res.status(409).json({ error: "Planned expense is archived." });
    if (existing.isPurchased) return res.status(409).json({ error: "Already purchased." });

    const updatedSavings = (existing.virtualSavings || []).map(v => {
      if (v.month !== month) return v;
      if (dismissed) {
        return { ...v, dismissedByUser: true, paidByUser: false, amountPLN: 0 };
      }
      return {
        ...v,
        paidByUser:      true,
        dismissedByUser: false,
        amount:          amount ?? v.amount,
        amountPLN:       amountPLN ?? v.amountPLN,
        fxRate:          fxRate ?? v.fxRate,
      };
    });

    // Recompute suggestion for all remaining unpaid/undismissed entries
    const paidTotal  = sumPaid(updatedSavings);
    const remaining  = existing.totalAmountPLN - paidTotal;
    const future     = updatedSavings.filter(v => !v.paidByUser && !v.dismissedByUser);

    const newSuggestion = future.length > 0
      ? Math.max(0, round2(remaining / future.length))
      : 0;

    const recomputedSavings = updatedSavings.map(v =>
      (!v.paidByUser && !v.dismissedByUser)
        ? { ...v, amount: newSuggestion }
        : v
    );

    const updated = {
      ...existing,
      virtualSavings: recomputedSavings,
      updatedAt:      new Date().toISOString(),
    };

    const { resource } = await plannedContainer.items.upsert(updated, {
      accessCondition: { type: "IfMatch", condition: etag },
    });

    console.log(`[PLANNED PAY] ${dismissed ? "Dismissed" : "Paid"} ${month} for ${id}`);
    res.json({ ...resource, paidSoFar: sumPaid(resource.virtualSavings), isReadyToPurchase: isReadyToPurchase(resource) });
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED PAY]", err);
    res.status(500).json({ error: "Failed to update payment." });
  }
});

// ── POST /api/planned/:id/purchase ───────────────────────────
// Finalize purchase: create EXPENSE + TRANSFER

router.post("/:id/purchase", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const { date, budgetMonth } = req.body;
  if (!date || !budgetMonth) return res.status(400).json({ error: "date and budgetMonth are required." });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(plannedContainer, id, familyId);
    if (!existing)            return res.status(404).json({ error: "Planned expense not found." });
    if (existing.isArchived)  return res.status(409).json({ error: "Planned expense is archived." });
    if (existing.isPurchased) return res.status(409).json({ error: "Already purchased." });

    const collected = existing.mode === "oneoff"
      ? existing.totalAmountPLN
      : sumPaid(existing.virtualSavings);
    const ts        = Date.now();

    // EXPENSE — target category
    const expense = {
      id:               `tx_${familyId}_${date.replace(/-/g,"")}_planned_exp_${ts}`,
      userId:           familyId,
      type:             "EXPENSE",
      categoryId:       existing.targetCategoryId,
      categoryName:     existing.targetCategoryName,
      subcategoryId:    existing.targetSubcategoryId,
      subcategoryName:  existing.targetSubcategoryName,
      amount:           existing.totalAmountPLN,
      originalAmount:   existing.totalAmount,
      originalCurrency: existing.originalCurrency,
      fxRate:           existing.fxRate,
      date,
      budgetMonth,
      description:      existing.description,
      tags:             existing.tags || [],
      priority:         existing.priority,
      isRecurring:      false,
      recurringId:      null,
      plannedExpenseId: existing.id,
      useVoucher:       false,
      voucherId:        null,
      voucherAmount:    0,
      netAmount:        existing.totalAmountPLN,
      returns:          [],
      author:           req.user.name || req.user.email,
      authorId:         req.user.id,
      isArchived:       false,
      archivedAt:       null,
      archivedBy:       null,
      archivedById:     null,
      createdAt:        new Date().toISOString(),
    };

    // TRANSFER — release collected savings back to budget
    const transfer = {
      id:               `tx_${familyId}_${date.replace(/-/g,"")}_planned_tr_${ts}`,
      userId:           familyId,
      type:             "TRANSFER",
      categoryId:       process.env.RETURN_CATEGORY_ID   || "cat_srodki",
      categoryName:     process.env.RETURN_CATEGORY_NAME || "Środki własne",
      subcategoryId:    process.env.RETURN_SUBCATEGORY_ID   || "cat_root_srodki_gotowka_MMs",
      subcategoryName:  process.env.RETURN_SUBCATEGORY_NAME || "Gotówka",
      amount:           collected,
      originalAmount:   collected,
      originalCurrency: "PLN",
      fxRate:           1,
      date,
      budgetMonth,
      description:      `Odblokowanie środków: ${existing.description}`,
      tags:             [],
      priority:         3,
      isRecurring:      false,
      recurringId:      null,
      plannedExpenseId: existing.id,
      useVoucher:       false,
      voucherId:        null,
      voucherAmount:    0,
      netAmount:        collected,
      returns:          [],
      author:           req.user.name || req.user.email,
      authorId:         req.user.id,
      isArchived:       false,
      archivedAt:       null,
      archivedBy:       null,
      archivedById:     null,
      createdAt:        new Date().toISOString(),
    };

    const [{ resource: savedExpense }, { resource: savedTransfer }] = await Promise.all([
      transactionsContainer.items.create(expense),
      transactionsContainer.items.create(transfer),
    ]);

    // Mark planned expense as purchased
    const { resource: updatedPlanned } = await plannedContainer.items.upsert(
      { ...existing, isPurchased: true, purchasedMonth: budgetMonth, updatedAt: new Date().toISOString() },
      { accessCondition: { type: "IfMatch", condition: etag } }
    );

    console.log(`[PLANNED PURCHASE] expense: ${savedExpense.id}, transfer: ${savedTransfer.id}`);
    res.status(201).json({ planned: updatedPlanned, expense: savedExpense, transfer: savedTransfer });
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED PURCHASE]", err);
    res.status(500).json({ error: "Failed to finalize purchase." });
  }
});

module.exports = router;