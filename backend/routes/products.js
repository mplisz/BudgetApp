// ============================================================
// File: backend/routes/products.js
// Read + light-maintenance access to the family PRODUCT CATALOG.
//
// The catalog is WRITTEN by the transaction-save side-effect
// (utils/productCatalog.rememberProducts) — this route only exposes it:
//   GET    /api/products          — list, most-purchased first
//   PATCH  /api/products/:id      — rename the canonical name (correction)
//   DELETE /api/products/:id      — drop a junk/miscaught product
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { productsContainer } = require("../cosmos");
const { requireAuth }       = require("../middleware/auth");
const { readItemWithEtag, IdParamSchema } = require("../utils/helpers");

router.use(requireAuth);

const RenameSchema = z.object({
  canonicalName: z.string().min(1).max(120),
});

// ── GET / — the whole catalog, most-purchased first ──────────

router.get("/", async (req, res) => {
  try {
    const { resources } = await productsContainer.items
      .query({
        query: `SELECT * FROM c
                WHERE c.userId = @userId
                ORDER BY c.purchaseCount DESC`,
        parameters: [{ name: "@userId", value: req.user.familyId }],
      })
      .fetchAll();
    res.json(resources);
  } catch (err) {
    console.error("[PRODUCTS GET]", err);
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

// ── PATCH /:id — user correction of the display name ─────────

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = RenameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId = req.user.familyId;
    const { resource: existing, etag } = await readItemWithEtag(productsContainer, idParsed.data, familyId);
    if (!existing) return res.status(404).json({ error: "Product not found." });

    const { resource } = await productsContainer.item(idParsed.data, familyId).replace(
      { ...existing, canonicalName: parsed.data.canonicalName.trim(), updatedAt: new Date().toISOString() },
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
