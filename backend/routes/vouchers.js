// ============================================================
// File: backend/routes/vouchers.js
// GET    /api/vouchers
// POST   /api/vouchers
// PATCH  /api/vouchers/:id
// DELETE /api/vouchers/:id   (soft archive)
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { vouchersContainer } = require("../cosmos");
const { requireAuth }       = require("../middleware/auth");
const { readItem, IdParamSchema, BUDGET_MONTH_REGEX } = require('../utils/helpers');

router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────

const VoucherPostSchema = z.object({
  name:         z.string().min(1).max(200).transform(v => v.trim()),
  code:         z.string().min(1, "Kod vouchera jest wymagany.").max(100).transform(v => v.trim()),
  initialValue: z.number().positive("Wartość początkowa musi być > 0"),
  currency:     z.string().length(3).default("PLN"),
  expiresAt:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
  store:        z.string().max(100).optional().default("").transform(v => v.trim()),
  notes:        z.string().max(500).optional().default(""),
});

const VoucherPatchSchema = z.object({
  name:      z.string().min(1).max(200).optional().transform(v => v.trim()),
  code:      z.string().max(100).optional().transform(v => v.trim()),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  store:     z.string().max(100).optional().transform(v => v.trim()),
  notes:     z.string().max(500).optional(),
}).refine(d => Object.keys(d).length > 0, { message: "Brak pól do aktualizacji." });

// ── GET /api/vouchers ─────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const familyId        = req.user.familyId;
    const includeArchived = req.query.includeArchived === "true";

    const query = includeArchived
      ? "SELECT * FROM c WHERE c.userId = @userId"
      : "SELECT * FROM c WHERE c.userId = @userId AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))";

    const { resources } = await vouchersContainer.items
      .query({ query, parameters: [{ name: "@userId", value: familyId }] })
      .fetchAll();

    // Sort: active first, then by expiresAt asc
    const sorted = resources.sort((a, b) => {
      if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return a.expiresAt.localeCompare(b.expiresAt);
    });

    res.json(sorted);
  } catch (err) {
    console.error("[VOUCHERS GET] Failed:", err);
    res.status(500).json({ error: "Nie udało się pobrać voucherów." });
  }
});

// ── POST /api/vouchers ────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = VoucherPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId = req.user.familyId;
    const d        = parsed.data;
    const id       = `voucher_${familyId}_${Date.now()}`;

    const doc = {
      id,
      userId:             familyId,
      name:               d.name,
      code:               d.code,
      initialValue:       d.initialValue,
      currency:           d.currency,
      expiresAt:          d.expiresAt,
      store:              d.store,
      notes:              d.notes,
      isArchived:         false,
      usedInTransactions: [],
      createdAt:          new Date().toISOString(),
      createdBy:          req.user.name || req.user.email,
      createdById:        req.user.id,
    };

    const { resource } = await vouchersContainer.items.create(doc);
    console.log(`[VOUCHERS POST] Created: ${resource.id}`);
    res.status(201).json(resource);
  } catch (err) {
    console.error("[VOUCHERS POST] Failed:", err);
    res.status(500).json({ error: "Nie udało się dodać vouchera." });
  }
});

// ── PATCH /api/vouchers/:id ───────────────────────────────────

router.patch("/:id", async (req, res) => {
  // Validate URL param
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = VoucherPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const existing = await readItem(vouchersContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Voucher nie istnieje." });
    if (existing.isArchived) return res.status(409).json({ error: "Voucher jest zarchiwizowany." });

    const updated = {
      ...existing,
      ...parsed.data,
      updatedAt:   new Date().toISOString(),
      updatedBy:   req.user.name || req.user.email,
      updatedById: req.user.id,
    };

    const { resource } = await vouchersContainer.items.upsert(updated);
    console.log(`[VOUCHERS PATCH] Updated: ${resource.id}`);
    res.json(resource);
  } catch (err) {
    console.error("[VOUCHERS PATCH] Failed:", err);
    res.status(500).json({ error: "Nie udało się zaktualizować vouchera." });
  }
});

// ── DELETE /api/vouchers/:id  (soft archive) ──────────────────

router.delete("/:id", async (req, res) => {
  // Validate URL param
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    const existing = await readItem(vouchersContainer, id, familyId);
    if (!existing)           return res.status(404).json({ error: "Voucher nie istnieje." });
    if (existing.isArchived) return res.status(409).json({ error: "Voucher jest już zarchiwizowany." });

    const archived = {
      ...existing,
      isArchived:   true,
      archivedAt:   new Date().toISOString(),
      archivedBy:   req.user.name || req.user.email,
      archivedById: req.user.id,
    };

    const { resource } = await vouchersContainer.items.upsert(archived);
    console.log(`[VOUCHERS DELETE] Archived: ${resource.id}`);
    res.json({ success: true, id: resource.id });
  } catch (err) {
    console.error("[VOUCHERS DELETE] Failed:", err);
    res.status(500).json({ error: "Nie udało się zarchiwizować vouchera." });
  }
});

module.exports = router;