// ============================================================
// File: backend/routes/products.js
// The family PRODUCT CATALOG = the user's personal "inflation basket" —
// a whitelist of products they explicitly chose to track, managed here:
//   GET    /api/products          — list the whitelist
//   POST   /api/products          — register a new tracked product
//   PATCH  /api/products/:id      — edit canonical name / default size
//   DELETE /api/products/:id      — stop tracking a product
//
// Purchases are folded in automatically by the transaction-save
// side-effect (utils/productCatalog.rememberProducts) whenever the OCR
// scan recognized a line as one of these tracked names — see
// utils/productCatalog.resolveTrackedProduct for the matching/fallback
// logic, applied in routes/ocr.js.
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { productsContainer } = require("../cosmos");
const { requireAuth }       = require("../middleware/auth");
const { readItemWithEtag, readItem, IdParamSchema } = require("../utils/helpers");
const { productKey, productId, newTrackedProduct } = require("../utils/productCatalog");

router.use(requireAuth);

const UNIT_ENUM = z.enum(["g", "ml", "szt"]);

const CreateSchema = z.object({
  canonicalName: z.string().min(1).max(120),
  unit:          UNIT_ENUM,
  defaultSize:   z.number().positive().max(1_000_000).nullable().optional(),
});

const PatchSchema = z.object({
  canonicalName: z.string().min(1).max(120).optional(),
  defaultSize:   z.number().positive().max(1_000_000).nullable().optional(),
}).refine(d => d.canonicalName !== undefined || d.defaultSize !== undefined, {
  message: "Nothing to update.",
});

// ── GET / — the whole whitelist, alphabetical ─────────────────

router.get("/", async (req, res) => {
  try {
    const { resources } = await productsContainer.items
      .query({
        query: `SELECT * FROM c
                WHERE c.userId = @userId
                ORDER BY c.canonicalName ASC`,
        parameters: [{ name: "@userId", value: req.user.familyId }],
      })
      .fetchAll();
    res.json(resources);
  } catch (err) {
    console.error("[PRODUCTS GET]", err);
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

// ── POST / — register a new tracked product ───────────────────
// Size is expected already in BASE units (g/ml) — the frontend converts
// a user-friendly "1,5 l" to 1500/ml before sending, so the whole stack
// (unit price math, shrink detection, catalog keys) keeps one convention.

router.post("/", async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { canonicalName, unit, defaultSize } = parsed.data;
  const familyId = req.user.familyId;
  const key = productKey(canonicalName, unit);
  if (!key) return res.status(400).json({ error: "Invalid product name." });
  const id = productId(familyId, key);

  try {
    const existing = await readItem(productsContainer, id, familyId);
    if (existing) {
      return res.status(409).json({ error: `„${canonicalName}” (${unit}) jest już śledzone.` });
    }
    const doc = newTrackedProduct(familyId, id, key, canonicalName.trim(), unit, defaultSize ?? null);
    const { resource } = await productsContainer.items.create(doc);
    res.status(201).json(resource);
  } catch (err) {
    console.error("[PRODUCTS POST]", err);
    res.status(500).json({ error: "Failed to add tracked product." });
  }
});

// ── PATCH /:id — edit the canonical name and/or default size ──
// Unit is immutable here — it's part of the identity key, so changing it
// would orphan the doc's own id/key. Delete + re-add for that.

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId = req.user.familyId;
    const { resource: existing, etag } = await readItemWithEtag(productsContainer, idParsed.data, familyId);
    if (!existing) return res.status(404).json({ error: "Product not found." });

    const { resource } = await productsContainer.item(idParsed.data, familyId).replace(
      {
        ...existing,
        ...(parsed.data.canonicalName !== undefined ? { canonicalName: parsed.data.canonicalName.trim() } : {}),
        ...(parsed.data.defaultSize    !== undefined ? { defaultSize: parsed.data.defaultSize } : {}),
        nameLocked: true,   // an explicit edit outranks any future AI wording
        updatedAt:  new Date().toISOString(),
      },
      { accessCondition: { type: "IfMatch", condition: etag } },
    );
    res.json(resource);
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh." });
    console.error("[PRODUCTS PATCH]", err);
    res.status(500).json({ error: "Failed to update product." });
  }
});

// ── DELETE /:id — hard delete (catalog is a rebuildable cache) ─

router.delete("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    await productsContainer.item(idParsed.data, req.user.familyId).delete();
    res.json({ success: true, id: idParsed.data });
  } catch (err) {
    if (err.code === 404) return res.status(404).json({ error: "Product not found." });
    console.error("[PRODUCTS DELETE]", err);
    res.status(500).json({ error: "Failed to delete product." });
  }
});

module.exports = router;
