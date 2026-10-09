// ============================================================
// File: backend/routes/cards.js
// Credit cards and their repayments.
//
// GET    /api/cards                    — cards, repayments, card purchases
// POST   /api/cards                    — add a card
// PATCH  /api/cards/:cardId            — edit / archive / restore a card
// POST   /api/cards/:cardId/repayments — register a repayment (+ optional interest)
// PATCH  /api/cards/repayments/:id     — correct a repayment's amount or date
// DELETE /api/cards/repayments/:id     — remove a repayment
//
// The model, and why the debt is not computed here: utils/creditCards.js.
// ============================================================

const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();
const { z }   = require("zod");
const {
  settingsContainer, transactionsContainer, monthsContainer, categoriesContainer,
} = require("../cosmos");
const { requireAuth } = require("../middleware/auth");
const { roundMoney, IdParamSchema, BudgetMonthSchema } = require("../utils/helpers");
const { isMonthClosed } = require("../utils/monthStatus");
const { resolveTransferTarget } = require("../utils/transferCategory");
const { resolveTxType }         = require("../utils/categoryType");
const {
  MAX_CARDS, MAX_REPAYMENTS,
  readCards, findActiveCard, updateCards, buildInterestExpenseDoc,
} = require("../utils/creditCards");

router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────

const MAX_AMOUNT = 1_000_000;

const DateSchema  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");
const MoneySchema = z.number().positive().max(MAX_AMOUNT);

// No .default() anywhere in here: under zod 4 a default still fires through
// .partial(), so the PATCH schema below would reset an omitted field.
const CardSchema = z.object({
  name:           z.string().trim().min(1).max(60),
  // What was already owed on the card when the family started tracking it.
  openingBalance: z.number().min(0).max(MAX_AMOUNT),
  // The statement closes on this day of the month (clamped to the month's
  // length on the client) and is due `graceDays` later.
  statementDay:   z.number().int().min(1).max(31),
  graceDays:      z.number().int().min(0).max(60),
});

const CardPatchSchema = CardSchema.partial()
  .extend({ isArchived: z.boolean().optional() })
  .refine(d => Object.values(d).some(v => v !== undefined), { message: "No fields to update." });

const RepaymentSchema = z.object({
  amount:         MoneySchema,
  date:           DateSchema,
  budgetMonth:    BudgetMonthSchema,
  // Part of `amount` that paid interest and fees rather than purchases —
  // booked as an EXPENSE on the card, see buildInterestExpenseDoc.
  interestAmount: z.number().min(0).max(MAX_AMOUNT).default(0),
}).refine(d => d.interestAmount <= d.amount, { message: "Interest cannot exceed the repayment amount." });

const RepaymentPatchSchema = z.object({
  amount: MoneySchema.optional(),
  date:   DateSchema.optional(),
}).refine(d => d.amount !== undefined || d.date !== undefined, { message: "No fields to update." });

// ── Helpers ───────────────────────────────────────────────────

const newId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

const audit = (user) => ({
  updatedAt:   new Date().toISOString(),
  updatedBy:   user.name || user.email,
  updatedById: user.id,
});

// Parse `:param` as an id, or answer 400. Returns null when it answered.
function idParam(req, res, name) {
  const parsed = IdParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return null;
  }
  return parsed.data;
}

// ── GET /api/cards ────────────────────────────────────────────
//
// Everything the client needs to work out the debt: the cards, the
// repayments, and every live card purchase over ALL history (a debt has no
// 24-month window). Only the fields the arithmetic and the lists read.

router.get("/", async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const [state, { resources: transactions }] = await Promise.all([
      readCards(settingsContainer, familyId),
      transactionsContainer.items
        .query({
          query: `SELECT c.id, c.cardId, c.date, c.budgetMonth, c.amount, c.netAmount, c.returns,
                         c.description, c.merchant, c.categoryName, c.subcategoryName
                  FROM c
                  WHERE c.userId = @userId
                    AND c.type = 'EXPENSE'
                    AND IS_STRING(c.cardId)
                    AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))`,
          parameters: [{ name: "@userId", value: familyId }],
        })
        .fetchAll(),
    ]);

    res.json({ ...state, transactions });
  } catch (err) {
    console.error("[CARDS GET]", err);
    res.status(500).json({ error: "Failed to fetch credit cards." });
  }
});

// ── POST /api/cards ───────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = CardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const card = {
      id:             newId("card"),
      ...parsed.data,
      openingBalance: roundMoney(parsed.data.openingBalance),
      isArchived:     false,
      createdAt:      new Date().toISOString(),
      createdBy:      req.user.name || req.user.email,
      createdById:    req.user.id,
    };

    const outcome = await updateCards(settingsContainer, req.user.familyId, state => {
      if (state.cards.length >= MAX_CARDS) return { status: 400, error: "Too many credit cards." };
      state.cards.push(card);
      return {};
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    console.log(`[CARDS POST] Created: ${card.id} for ${req.user.familyId}`);
    res.status(201).json(card);
  } catch (err) {
    console.error("[CARDS POST]", err);
    res.status(500).json({ error: "Failed to save credit card." });
  }
});

// ── PATCH /api/cards/:cardId ──────────────────────────────────
//
// Archiving goes through here too (isArchived). An archived card keeps its
// purchases and repayments — the debt it carried doesn't disappear with it.

router.patch("/:cardId", async (req, res) => {
  const cardId = idParam(req, res, "cardId");
  if (!cardId) return;

  const parsed = CardPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    if (patch.openingBalance !== undefined) patch.openingBalance = roundMoney(patch.openingBalance);

    const outcome = await updateCards(settingsContainer, req.user.familyId, state => {
      const index = state.cards.findIndex(c => c.id === cardId);
      if (index < 0) return { status: 404, error: "Credit card not found." };
      const card = { ...state.cards[index], ...patch, ...audit(req.user) };
      state.cards[index] = card;
      return { card };
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    console.log(`[CARDS PATCH] Updated: ${cardId}`);
    res.json(outcome.card);
  } catch (err) {
    console.error("[CARDS PATCH]", err);
    res.status(500).json({ error: "Failed to save credit card." });
  }
});

// ── POST /api/cards/:cardId/repayments ────────────────────────
//
// A repayment may exceed the debt — the client shows that as an overpayment
// and hints at a missing purchase, it is not this route's call to refuse.
//
// With interest, two documents are written: the interest EXPENSE first, the
// repayment second. If the second fails the expense is archived again, so a
// retry can't book the interest twice.

router.post("/:cardId/repayments", async (req, res) => {
  const cardId = idParam(req, res, "cardId");
  if (!cardId) return;

  const parsed = RepaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const familyId = req.user.familyId;
  const { date, budgetMonth } = parsed.data;
  const amount   = roundMoney(parsed.data.amount);
  const interest = roundMoney(parsed.data.interestAmount);
  let interestTx = null;

  try {
    // ── Validation (zero writes) ──────────────────────────────
    const card = findActiveCard(await readCards(settingsContainer, familyId), cardId);
    if (!card) return res.status(404).json({ error: "Credit card not found." });

    if (await isMonthClosed(monthsContainer, familyId, budgetMonth)) {
      return res.status(403).json({ error: "Month is closed." });
    }

    let interestTarget = null;
    if (interest > 0) {
      const resolved = await resolveTransferTarget(familyId, "cardInterestSubcategoryId");
      const type = resolved.ok
        ? await resolveTxType(categoriesContainer, familyId, resolved.target, null)
        : null;
      if (type !== "EXPENSE") {
        return res.status(400).json({ error: "Card interest subcategory is not configured." });
      }
      interestTarget = resolved.target;
    }

    // ── STEP 1: the interest expense ──────────────────────────
    if (interestTarget) {
      const { resource } = await transactionsContainer.items.create(buildInterestExpenseDoc({
        familyId, target: interestTarget, card, amount: interest, date, budgetMonth, user: req.user,
      }));
      interestTx = resource;
    }

    // ── STEP 2: the repayment ─────────────────────────────────
    const repayment = {
      id: newId("rep"),
      cardId, amount, date, budgetMonth,
      ...(interestTx ? { interestTxId: interestTx.id, interestAmount: interest } : {}),
      createdAt:   new Date().toISOString(),
      createdBy:   req.user.name || req.user.email,
      createdById: req.user.id,
    };

    const outcome = await updateCards(settingsContainer, familyId, state => {
      if (!findActiveCard(state, cardId)) return { status: 404, error: "Credit card not found." };
      if (state.repayments.length >= MAX_REPAYMENTS) return { status: 400, error: "Too many repayments." };
      state.repayments.push(repayment);
      return {};
    });
    if (outcome.error) {
      await archiveForRollback(interestTx);
      return res.status(outcome.status).json({ error: outcome.error });
    }

    console.log(`[CARDS REPAYMENT] ${repayment.id} on ${cardId}${interestTx ? ` (+ interest ${interestTx.id})` : ""}`);
    res.status(201).json({ repayment, interestTransaction: interestTx });
  } catch (err) {
    console.error("[CARDS REPAYMENT]", err);
    await archiveForRollback(interestTx);
    res.status(500).json({ error: "Failed to save repayment." });
  }
});

// Best-effort undo of STEP 1 when STEP 2 didn't happen.
async function archiveForRollback(tx) {
  if (!tx) return;
  await transactionsContainer.items.upsert({
    ...tx,
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: "system_rollback",
  }).catch(rollbackErr => console.error(`[CARDS ROLLBACK FAILED] ${tx.id}:`, rollbackErr));
}

// ── PATCH / DELETE /api/cards/repayments/:id ──────────────────
//
// A repayment in a closed month is as frozen as the month. The interest
// expense a repayment booked is an ordinary transaction with its own life:
// correcting or removing the repayment leaves it alone.

async function changeRepayment(req, res, logTag, apply) {
  const id = idParam(req, res, "id");
  if (!id) return;

  try {
    const familyId = req.user.familyId;
    const existing = (await readCards(settingsContainer, familyId)).repayments.find(r => r.id === id);
    if (!existing) return res.status(404).json({ error: "Repayment not found." });

    if (await isMonthClosed(monthsContainer, familyId, existing.budgetMonth)) {
      return res.status(403).json({ error: "Month is closed." });
    }

    const outcome = await updateCards(settingsContainer, familyId, state => {
      const index = state.repayments.findIndex(r => r.id === id);
      if (index < 0) return { status: 404, error: "Repayment not found." };
      return apply(state.repayments, index);
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    console.log(`[${logTag}] ${id}`);
    res.json(outcome);
  } catch (err) {
    console.error(`[${logTag}]`, err);
    res.status(500).json({ error: "Failed to save repayment." });
  }
}

router.patch("/repayments/:id", (req, res) => {
  const parsed = RepaymentPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const patch = {
    ...(parsed.data.amount !== undefined ? { amount: roundMoney(parsed.data.amount) } : {}),
    ...(parsed.data.date   !== undefined ? { date: parsed.data.date } : {}),
  };
  return changeRepayment(req, res, "CARDS REPAYMENT PATCH", (repayments, index) => {
    const repayment = { ...repayments[index], ...patch, ...audit(req.user) };
    repayments[index] = repayment;
    return { repayment };
  });
});

router.delete("/repayments/:id", (req, res) =>
  changeRepayment(req, res, "CARDS REPAYMENT DELETE", (repayments, index) => {
    const [removed] = repayments.splice(index, 1);
    return { success: true, id: removed.id };
  }));

module.exports = router;
