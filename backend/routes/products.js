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
const { productsContainer, transactionsContainer, categoriesContainer } = require("../cosmos");
const { requireAuth }       = require("../middleware/auth");
const { readItemWithEtag, readItem, IdParamSchema } = require("../utils/helpers");
const { mergeProducts, rememberProducts } = require("../utils/productCatalog");
const { inferProducts, ProductSchema } = require("../utils/productAi");
const { collectCandidates, applyProducts } = require("../utils/productBackfill");

router.use(requireAuth);

/** Hard cap on how many distinct texts one run sends to the model —
 *  bounds both cost and runtime. Press the button again for the rest. */
const MAX_UNIQUE_PER_RUN = 300;

const RenameSchema = z.object({
  canonicalName: z.string().min(1).max(120),
});

const MergeSchema = z.object({
  sourceId: z.string().min(1).max(200),
  targetId: z.string().min(1).max(200),
});

// Commit payload for /backfill: the exact mapping the user approved in
// the dry run. Sending it back means the model is called ONCE and what
// was previewed is byte-for-byte what gets written (an LLM re-run could
// word things differently). Omit it and the server infers again.
const BackfillSchema = z.object({
  dryRun:   z.boolean().optional(),
  products: z.array(z.object({
    text:    z.string().min(1).max(300),
    product: ProductSchema,
  })).max(MAX_UNIQUE_PER_RUN).optional(),
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

// ── POST /backfill — fill in missing products retroactively ──
//
// Finds transactions in the currently price-tracked subcategories whose
// lines carry no structured product, asks the model to normalize the
// DEDUPLICATED line texts, then writes the answers back and seeds the
// catalog. Self-scoping: flag a new subcategory later and press again —
// only its history is missing, so only that gets processed.
//
// body: { dryRun?: boolean }  → dryRun returns the proposal, writes nothing.

router.post("/backfill", async (req, res) => {
  const parsedBody = BackfillSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.issues[0].message });

  const dryRun   = parsedBody.data.dryRun !== false;   // preview unless told otherwise
  const approved = parsedBody.data.products;
  const familyId = req.user.familyId;

  try {
    // 1. Which subcategories are price-tracked right now?
    const { resources: cats } = await categoriesContainer.items
      .query({
        query: "SELECT c.id FROM c WHERE c.userId = @u AND c.trackPrices = true AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))",
        parameters: [{ name: "@u", value: familyId }],
      })
      .fetchAll();
    const trackedIds = cats.map(c => c.id);
    if (trackedIds.length === 0) {
      return res.status(400).json({ error: "Brak subkategorii oznaczonych do śledzenia cen." });
    }

    // 2. Their expense transactions.
    const idParams = trackedIds.map((_, i) => `@s${i}`);
    const { resources: transactions } = await transactionsContainer.items
      .query({
        query: `SELECT * FROM c
                WHERE c.userId = @u AND c.type = 'EXPENSE'
                  AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))
                  AND c.subcategoryId IN (${idParams.join(", ")})`,
        parameters: [
          { name: "@u", value: familyId },
          ...trackedIds.map((id, i) => ({ name: `@s${i}`, value: id })),
        ],
      })
      .fetchAll();

    // 3. What is missing — deduplicated.
    const { candidates, uniqueDescriptions } = collectCandidates(transactions);
    if (candidates.length === 0) {
      return res.json({
        dryRun, trackedSubcategories: trackedIds.length, scanned: transactions.length,
        missingLines: 0, uniqueTexts: 0, resolved: 0, updatedTransactions: 0,
        message: "Wszystkie pozycje w śledzonych subkategoriach mają już produkty.",
      });
    }
    const batch = uniqueDescriptions.slice(0, MAX_UNIQUE_PER_RUN);

    // 4. Resolve the texts. On commit we reuse the mapping the user
    //    approved in the dry run — one model call per run, and what was
    //    previewed is exactly what lands.
    const productByDesc = approved?.length
      ? new Map(approved.map(({ text, product }) => [text, product]))
      : await inferProducts(batch);

    if (dryRun) {
      return res.json({
        dryRun: true,
        trackedSubcategories: trackedIds.length,
        scanned:      transactions.length,
        missingLines: candidates.length,
        uniqueTexts:  uniqueDescriptions.length,
        queued:       batch.length,
        resolved:     productByDesc.size,
        remaining:    Math.max(0, uniqueDescriptions.length - batch.length),
        // The FULL mapping — the client shows a slice and sends it back
        // on commit, so the approved result is the written result.
        products: [...productByDesc.entries()].map(([text, product]) => ({ text, product })),
      });
    }

    // 5. Write back — only transactions that actually changed.
    let updated = 0, failed = 0;
    for (const tx of transactions) {
      const next = applyProducts(tx, productByDesc);
      if (!next) continue;
      try {
        const { resource: saved } = await transactionsContainer.items.upsert({
          ...next,
          updatedAt:   new Date().toISOString(),
          updatedBy:   req.user.name || req.user.email,
          updatedById: req.user.id,
        });
        updated++;
        // 6. Seed the catalog from the freshly structured lines. Existing
        //    canonical names and merges are preserved by rememberProducts.
        await rememberProducts(productsContainer, familyId, saved);
      } catch (err) {
        failed++;
        console.error(`[PRODUCTS BACKFILL] tx ${tx.id} failed:`, err.message);
      }
    }

    console.log(`[PRODUCTS BACKFILL] ${updated} tx updated, ${productByDesc.size} texts applied${approved?.length ? " (approved)" : ""}, ${failed} failed`);
    res.json({
      dryRun: false,
      trackedSubcategories: trackedIds.length,
      scanned:      transactions.length,
      missingLines: candidates.length,
      uniqueTexts:  uniqueDescriptions.length,
      queued:       batch.length,
      resolved:     productByDesc.size,
      remaining:    Math.max(0, uniqueDescriptions.length - batch.length),
      updatedTransactions: updated,
      failed,
    });
  } catch (err) {
    console.error("[PRODUCTS BACKFILL]", err);
    const msg = /not configured/i.test(err.message)
      ? "Azure OpenAI nie jest skonfigurowane."
      : "Nie udało się uzupełnić produktów.";
    res.status(500).json({ error: msg });
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
      {
        ...existing,
        canonicalName: parsed.data.canonicalName.trim(),
        nameLocked:    true,   // a hand-picked name outranks any future AI wording
        updatedAt:     new Date().toISOString(),
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
