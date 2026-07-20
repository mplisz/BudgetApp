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
const { readItemWithEtag, readItem, IdParamSchema } = require("../utils/helpers");
const { mergeProducts } = require("../utils/productCatalog");

router.use(requireAuth);

const RenameSchema = z.object({
  canonicalName: z.string().min(1).max(120),
});

const MergeSchema = z.object({
  sourceId: z.string().min(1).max(200),
  targetId: z.string().min(1).max(200),
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

// ── POST /merge — fold source product INTO target ───────────
// The target survives (keeps id + canonical name) and records source.key
// in mergedKeys[] so future scans of the source name fold back in; the
// source doc is deleted. No transactions are touched — the frontend
// re-groups price history by catalog identity on the next fetch.

router.post("/merge", async (req, res) => {
  const parsed = MergeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) return res.status(400).json({ error: "Cannot merge a product into itself." });

  try {
    const familyId = req.user.familyId;
    const [source, targetRead] = await Promise.all([
      readItem(productsContainer, sourceId, familyId),
      readItemWithEtag(productsContainer, targetId, familyId),
    ]);
    if (!source)            return res.status(404).json({ error: "Source product not found." });
    if (!targetRead.resource) return res.status(404).json({ error: "Target product not found." });

    const merged = mergeProducts(targetRead.resource, source);
    const { resource: saved } = await productsContainer.item(targetId, familyId).replace(merged, {
      accessCondition: { type: "IfMatch", condition: targetRead.etag },
    });
    // Delete the source only after the target absorbed it.
    await productsContainer.item(sourceId, familyId).delete();

    res.json(saved);
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh." });
    console.error("[PRODUCTS MERGE]", err);
    res.status(500).json({ error: "Failed to merge products." });
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
