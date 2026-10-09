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
const { plannedContainer, transactionsContainer } = require("../cosmos");
const { requireAuth }        = require("../middleware/auth");
const {
  readItemWithEtag, IdParamSchema, BUDGET_MONTH_REGEX, currentServerMonth,round2
} = require("../utils/helpers");
const { resolveTransferTarget } = require("../utils/transferCategory");

router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────

// Body schemas live in utils/plannedSchemas.js — importable without Cosmos,
// and the place that keeps create-time defaults out of PATCH.
const { PlannedPostSchema, PlannedPatchSchema, WishPostSchema } = require("../utils/plannedSchemas");

// ── Helpers ───────────────────────────────────────────────────

// virtualSavings[] arithmetic lives in utils/plannedSavings.js (testable).
const { sumPaid, generateSavingsMonths, rebuildSavingsForMonth } = require("../utils/plannedSavings");

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
  // A wish has totalAmountPLN = null, and `0 >= null` is TRUE in JS — without
  // this guard every wish would report itself as ready to buy.
  if (doc.isWish || doc.totalAmountPLN == null) return false;
  return sumPaid(doc.virtualSavings) >= doc.totalAmountPLN;
}

// ── GET /api/planned ──────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const { month } = req.query;

    // includeArchived=true → return archived docs too (PanelPlanned's
    // "pokaż zarchiwizowane" view). Default stays active-only so every
    // other consumer keeps its clean list.
    const archivedFilter = req.query.includeArchived === "true"
      ? ""
      : "AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))";

    // Wishes are undecided ideas — no month, no committed price. They must
    // NEVER reach the shared planned list: the forecast, the Baza budżetu
    // column, the safety net and the bell all sum over it, and an amount-less
    // doc would quietly skew every one of them. Excluding them here, at the
    // query boundary, means no consumer has to remember to do it — the same
    // trick already used for archived docs above.
    const wantWishes = req.query.wishes === "true";
    const wishFilter = wantWishes
      ? "AND c.isWish = true"
      : "AND (c.isWish = false OR NOT IS_DEFINED(c.isWish))";
    // Cosmos DROPS documents from an ORDER BY when the property is undefined,
    // and a wish has no plannedMonth — so the wish listing orders by creation.
    const orderBy = wantWishes ? "ORDER BY c.createdAt DESC" : "ORDER BY c.plannedMonth ASC";

    const { resources } = await plannedContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.userId = @userId
                ${archivedFilter}
                ${wishFilter}
                ${orderBy}`,
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

// ── POST /api/planned/wish ────────────────────────────────────
// Park an idea without committing to a month or a price. Same container and
// same document shape as a real plan — undecided fields are simply null, so
// promoting later fills them in rather than migrating anything.

router.post("/wish", async (req, res) => {
  const parsed = WishPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId = req.user.familyId;
    const d        = parsed.data;

    const doc = {
      id:                   `planned_${familyId}_${Date.now()}`,
      userId:               familyId,
      isWish:               true,
      description:          d.description,
      // Informational only — never summed anywhere. It exists so the promotion
      // form opens with a number already in it.
      estimatedAmount:      d.estimatedAmount ?? null,
      originalCurrency:     d.originalCurrency,
      fxRate:               1,
      totalAmount:          null,
      totalAmountPLN:       null,
      targetCategoryId:     d.targetCategoryId,
      targetCategoryName:   d.targetCategoryName,
      targetSubcategoryId:  d.targetSubcategoryId,
      targetSubcategoryName:d.targetSubcategoryName,
      tags:                 d.tags,
      priority:             d.priority,
      mode:                 null,          // decided at promotion time
      plannedMonth:         null,
      monthlySavingDay:     1,
      virtualSavings:       [],
      isPurchased:          false,
      purchasedMonth:       null,
      isArchived:           false,
      archivedAt:           null,
      archivedBy:           null,
      archivedById:         null,
      createdAt:            new Date().toISOString(),
      createdBy:            req.user.name || req.user.email,
      createdById:          req.user.id,
      url:                  d.url || "",
    };

    const { resource } = await plannedContainer.items.create(doc);
    console.log(`[PLANNED WISH] Created: ${resource.id}`);
    res.status(201).json(resource);
  } catch (err) {
    console.error("[PLANNED WISH]", err);
    res.status(500).json({ error: "Failed to create wish." });
  }
});

// ── POST /api/planned/:id/promote ─────────────────────────────
// Wish → real plan. A dedicated action route rather than a looser PATCH:
// promotion is the one moment the full plan rules (month, positive amount,
// mode) must ALL hold at once, so it validates against PlannedPostSchema
// exactly like a fresh plan would.

router.post("/:id/promote", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = PlannedPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;
    const d        = parsed.data;

    const { resource: existing, etag } = await readItemWithEtag(plannedContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Planned expense not found." });
    if (!existing.isWish)    return res.status(409).json({ error: "To nie jest potencjalny zakup — ten plan jest już zaplanowany." });
    if (existing.isArchived) return res.status(409).json({ error: "Planned expense is archived." });

    let virtualSavings = d.virtualSavings;
    if (d.mode === "envelope" && !virtualSavings.length) {
      const startMonth = currentServerMonth();
      const monthCount = (() => {
        const [sy, sm] = startMonth.split("-").map(Number);
        const [ey, em] = d.plannedMonth.split("-").map(Number);
        return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
      })();
      const suggestion = round2(d.totalAmount / monthCount);
      virtualSavings   = generateSavingsMonths(startMonth, d.plannedMonth, suggestion, d.originalCurrency, d.fxRate);
    }

    const promoted = {
      ...existing,
      isWish:               false,
      estimatedAmount:      null,
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
      url:                  d.url || existing.url || "",
      promotedAt:           new Date().toISOString(),
      updatedAt:            new Date().toISOString(),
      updatedBy:            req.user.name || req.user.email,
    };

    const { resource } = await plannedContainer.items.upsert(promoted, {
      accessCondition: { type: "IfMatch", condition: etag },
    });
    console.log(`[PLANNED PROMOTE] Wish → plan: ${id}`);
    res.json(resource);
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED PROMOTE]", err);
    res.status(500).json({ error: "Failed to promote wish." });
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
      // Paid months stay, months past the new date go, missing ones are
      // added — and the rest is split over every open month.
      patch.virtualSavings = rebuildSavingsForMonth(existing.virtualSavings, {
        plannedMonth:   patch.plannedMonth,
        totalAmountPLN: patch.totalAmountPLN ?? existing.totalAmountPLN,
        currency:       patch.originalCurrency ?? existing.originalCurrency,
        fxRate:         patch.fxRate ?? existing.fxRate,
        currentMonth:   currentServerMonth(),
      });
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

    // Optional free-text note explaining WHY the plan was dropped —
    // shown later in the archived view ("świadomie zrezygnowaliśmy, bo…").
    const reason = typeof req.body?.reason === "string"
      ? req.body.reason.trim().slice(0, 300)
      : "";

    const { resource } = await plannedContainer.items.upsert(
      {
        ...existing,
        isArchived:     true,
        archivedAt:     new Date().toISOString(),
        archivedBy:     req.user.name || req.user.email,
        archivedById:   req.user.id,
        archivedReason: reason || null,
      },
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

  // `override` carries the edited expense-form fields (#2). Every field is
  // optional — anything omitted falls back to the planned doc's own values,
  // so the legacy one-click purchase (no override) behaves exactly as before.
  const { date, budgetMonth, override } = req.body;
  if (!date || !budgetMonth) return res.status(400).json({ error: "date and budgetMonth are required." });
  if (override && typeof override !== "object") return res.status(400).json({ error: "override must be an object." });
  if (override && override.amount != null && !(Number(override.amount) > 0)) {
    return res.status(400).json({ error: "override.amount must be greater than 0." });
  }

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

    // Envelope release spawns a TRANSFER — require the configured envelope
    // transfer subcategory (no env fallback). One-offs create no transfer.
    const needsTransfer = existing.mode === "envelope" && collected > 0;
    let transferTarget = null;
    if (needsTransfer) {
      const t = await resolveTransferTarget(familyId, "envelopeTransferSubcategoryId");
      if (!t.ok) return res.status(400).json({ error: "Wybierz kategorię transferu dla kopert w Ustawieniach → Mapowanie kategorii." });
      transferTarget = t.target;
    }

    // Resolve the expense fields: edited override values win, otherwise the
    // planned doc's defaults. The actual amount paid can differ from the plan.
    const ov          = override || {};
    const expenseAmount   = ov.amount   != null ? round2(Number(ov.amount))         : existing.totalAmountPLN;
    const expenseOrigAmt  = ov.originalAmount != null ? Number(ov.originalAmount)    : (ov.amount != null ? round2(Number(ov.amount)) : existing.totalAmount);
    const expenseCurrency = ov.originalCurrency || existing.originalCurrency;
    const expenseFxRate   = ov.fxRate   != null ? Number(ov.fxRate)                 : existing.fxRate;

    // EXPENSE — target category
    const expense = {
      id:               `tx_${familyId}_${date.replace(/-/g,"")}_planned_exp_${ts}`,
      userId:           familyId,
      type:             "EXPENSE",
      categoryId:       ov.categoryId      || existing.targetCategoryId,
      categoryName:     ov.categoryName    || existing.targetCategoryName,
      subcategoryId:    ov.subcategoryId   || existing.targetSubcategoryId,
      subcategoryName:  ov.subcategoryName || existing.targetSubcategoryName,
      amount:           expenseAmount,
      originalAmount:   expenseOrigAmt,
      originalCurrency: expenseCurrency,
      fxRate:           expenseFxRate,
      date,
      budgetMonth,
      description:      ov.description != null ? ov.description : existing.description,
      tags:             Array.isArray(ov.tags) ? ov.tags : (existing.tags || []),
      priority:         ov.priority != null ? ov.priority : existing.priority,
      isRecurring:      false,
      recurringId:      null,
      plannedExpenseId: existing.id,
      merchant:         ov.merchant ? String(ov.merchant).trim() : null,
      useVoucher:       false,
      voucherId:        null,
      voucherAmount:    0,
      netAmount:        expenseAmount,
      returns:          [],
      author:           req.user.name || req.user.email,
      authorId:         req.user.id,
      isArchived:       false,
      archivedAt:       null,
      archivedBy:       null,
      archivedById:     null,
      createdAt:        new Date().toISOString(),
    };

    // TRANSFER — release collected savings back to budget (envelope only)
    const transfer = needsTransfer ? {
      id:               `tx_${familyId}_${date.replace(/-/g,"")}_planned_tr_${ts}`,
      userId:           familyId,
      type:             "TRANSFER",
      categoryId:       transferTarget.categoryId,
      categoryName:     transferTarget.categoryName,
      subcategoryId:    transferTarget.subcategoryId,
      subcategoryName:  transferTarget.subcategoryName,
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
    } : null;

    // One-offs have no savings — a transfer there would be phantom income
    // cancelling the expense, so it's only built (and created) for envelopes.
    const { resource: savedExpense } = await transactionsContainer.items.create(expense);
    let savedTransfer = null;
    if (transfer) {
      ({ resource: savedTransfer } = await transactionsContainer.items.create(transfer));
    }

    // Mark planned expense as purchased
    const { resource: updatedPlanned } = await plannedContainer.items.upsert(
      { ...existing, isPurchased: true, purchasedMonth: budgetMonth, updatedAt: new Date().toISOString() },
      { accessCondition: { type: "IfMatch", condition: etag } }
    );

    console.log(`[PLANNED PURCHASE] expense: ${savedExpense.id}${savedTransfer ? `, transfer: ${savedTransfer.id}` : " (no transfer)"}`);
    res.status(201).json({ planned: updatedPlanned, expense: savedExpense, transfer: savedTransfer });
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED PURCHASE]", err);
    res.status(500).json({ error: "Failed to finalize purchase." });
  }
});

// ── POST /api/planned/:id/notify ─────────────────────────────
// Dismiss this month's bell reminder (the ✕) without changing the plan.
// Reappears next month. shouldNotifyPlanned suppresses while notifiedAt is
// within the current month.

router.post("/:id/notify", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const { resource: existing, etag } = await readItemWithEtag(plannedContainer, id, familyId);
    if (!existing) return res.status(404).json({ error: "Planned expense not found." });

    await plannedContainer.items.upsert(
      { ...existing, notifiedAt: new Date().toISOString() },
      { accessCondition: { type: "IfMatch", condition: etag } },
    );

    res.json({ success: true });
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[PLANNED NOTIFY]", err);
    res.status(500).json({ error: "Failed to mark notification." });
  }
});

module.exports = router;