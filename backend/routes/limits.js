// ============================================================
// File: backend/routes/limits.js
// Single document per category.
// Limit history in limits[] array:
//   { date, amount, type: "base" | "override" }
//
// base     — applies from date onwards until next base
// override — applies only for the exact month
//
// getActiveLimit(doc, month):
//   1. Check override for exact month → return if found
//   2. Find highest base with date <= month → return if found
//   3. Return null
//
// GET    /api/limits                — all docs
// GET    /api/limits?month=YYYY-MM  — resolved active limits for month
// POST   /api/limits                — upsert a limit entry
// DELETE /api/limits/:categoryId    — remove specific entry from limits[]
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { limitsContainer } = require("../cosmos");
const { requireAuth }     = require("../middleware/auth");
const { readItemWithEtag, BUDGET_MONTH_REGEX } = require("../utils/helpers");

router.use(requireAuth);

// ── Schema ────────────────────────────────────────────────────

const LimitEntrySchema = z.object({
  categoryId: z.string().min(1),
  date:       z.string().regex(BUDGET_MONTH_REGEX),
  amount:     z.number().nonnegative(),
  type:       z.enum(["base", "override"]),
});

const BatchLimitEntrySchema = z.object({
  categoryId: z.string().min(1),
  date:       z.string().regex(BUDGET_MONTH_REGEX),
  amount:     z.number().nonnegative(),
  type:       z.enum(["base", "override"]),
  action:     z.enum(["upsert", "delete"]).default("upsert"),
});
 
const BatchLimitSchema = z.object({
  changes: z.array(BatchLimitEntrySchema).min(1).max(100),
});
// ── Pure helper — shared with frontend via copy ───────────────

function getActiveLimit(doc, month) {
  if (!doc?.limits?.length) return null;

  // Override has priority — exact month only
  const override = doc.limits.find(l => l.type === "override" && l.date === month);
  if (override) return { amount: override.amount, type: "override", date: override.date };

  // Base — highest date <= month
  const bases = doc.limits
    .filter(l => l.type === "base" && l.date <= month)
    .sort((a, b) => b.date.localeCompare(a.date));

  return bases.length
    ? { amount: bases[0].amount, type: "base", date: bases[0].date }
    : null;
}

// ── GET /api/limits ───────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const { month } = req.query;

    const { resources } = await limitsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll();

    if (month && BUDGET_MONTH_REGEX.test(month)) {
      // Return resolved limits for the given month
      const resolved = resources
        .map(doc => ({ ...doc, activeLimit: getActiveLimit(doc, month) }))
        .filter(d => d.activeLimit !== null);
      return res.json(resolved);
    }

    res.json(resources);
  } catch (err) {
    console.error("[LIMITS GET]", err);
    res.status(500).json({ error: "Failed to fetch limits." });
  }
});

// ── POST /api/limits — upsert a single limit entry ───────────

router.post("/", async (req, res) => {
  const parsed = LimitEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const familyId  = req.user.familyId;
    const { categoryId, date, amount, type } = parsed.data;

    // Find existing doc for this category
    const { resources } = await limitsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.categoryId = @categoryId",
        parameters: [
          { name: "@userId",     value: familyId  },
          { name: "@categoryId", value: categoryId },
        ],
      })
      .fetchAll();

    if (resources.length > 0) {
      const existing = resources[0];
      const { etag } = await readItemWithEtag(limitsContainer, existing.id, familyId);

      // Upsert semantics — replace entry with same date+type
      const others = (existing.limits || []).filter(
        l => !(l.date === date && l.type === type)
      );
      const updatedLimits = [...others, { date, amount, type }]
        .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

      const { resource } = await limitsContainer.items.upsert(
        { ...existing, limits: updatedLimits, updatedAt: new Date().toISOString(), updatedBy: req.user.name || req.user.email, updatedById: req.user.id },
        { accessCondition: { type: "IfMatch", condition: etag } }
      );

      console.log(`[LIMITS POST] Upserted ${type} ${date} → ${amount} for ${categoryId}`);
      return res.json(resource);
    }

    // Create new doc
    const { resource } = await limitsContainer.items.create({
      id:         `lim_${familyId}_${categoryId}`,
      userId:     familyId,
      categoryId,
      limits:     [{ date, amount, type }],
      createdAt:  new Date().toISOString(),
      createdBy:  req.user.name || req.user.email,
      createdById: req.user.id,
    });

    console.log(`[LIMITS POST] Created doc for ${categoryId}`);
    res.status(201).json(resource);
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[LIMITS POST]", err);
    res.status(500).json({ error: "Failed to save limit." });
  }
});

// ── DELETE /api/limits/:categoryId?date=YYYY-MM&type=base|override

router.delete("/:categoryId", async (req, res) => {
  try {
    const familyId   = req.user.familyId;
    const categoryId = req.params.categoryId;
    const { date, type } = req.query;

    if (!date || !type) {
      return res.status(400).json({ error: "date and type query params are required." });
    }

    const { resources } = await limitsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.categoryId = @categoryId",
        parameters: [
          { name: "@userId",     value: familyId  },
          { name: "@categoryId", value: categoryId },
        ],
      })
      .fetchAll();

    if (!resources.length) return res.status(404).json({ error: "Limit not found." });

    const existing = resources[0];
    const { etag } = await readItemWithEtag(limitsContainer, existing.id, familyId);

    const updatedLimits = (existing.limits || []).filter(
      l => !(l.date === date && l.type === type)
    );

    const { resource } = await limitsContainer.items.upsert(
      { ...existing, limits: updatedLimits, updatedAt: new Date().toISOString(), updatedBy: req.user.name || req.user.email, updatedById: req.user.id },
      { accessCondition: { type: "IfMatch", condition: etag } }
    );

    console.log(`[LIMITS DELETE] Removed ${type} ${date} for ${categoryId}`);
    res.json(resource);
  } catch (err) {
    if (err.code === 412) return res.status(409).json({ error: "Data was modified by another user. Please refresh and try again." });
    console.error("[LIMITS DELETE]", err);
    res.status(500).json({ error: "Failed to remove limit entry." });
  }
});
// ── POST /api/limits/batch ────────────────────────────────────
 
router.post("/batch", async (req, res) => {
  const parsed = BatchLimitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
 
  const familyId = req.user.familyId;
  const { changes } = parsed.data;
 
  // Group changes by categoryId — one Cosmos read+write per category doc
  const byCategory = new Map();
  for (const change of changes) {
    if (!byCategory.has(change.categoryId)) {
      byCategory.set(change.categoryId, []);
    }
    byCategory.get(change.categoryId).push(change);
  }
 
  const results = [];
  const errors  = [];
 
  for (const [categoryId, categoryChanges] of byCategory) {
    try {
      // Fetch existing doc (one read per category)
      const { resources } = await limitsContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.categoryId = @categoryId",
          parameters: [
            { name: "@userId",     value: familyId   },
            { name: "@categoryId", value: categoryId },
          ],
        })
        .fetchAll();
 
      let existingDoc = resources[0] ?? null;
      let currentLimits = existingDoc ? [...(existingDoc.limits || [])] : [];
 
      // Apply all changes for this category in memory
      for (const change of categoryChanges) {
        if (change.action === "delete") {
          currentLimits = currentLimits.filter(
            l => !(l.date === change.date && l.type === change.type)
          );
        } else {
          // Upsert: remove existing entry with same date+type, add new
          currentLimits = currentLimits.filter(
            l => !(l.date === change.date && l.type === change.type)
          );
          currentLimits.push({ date: change.date, amount: change.amount, type: change.type });
        }
      }
 
      // Sort for readability
      currentLimits.sort(
        (a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type)
      );
 
      let savedDoc;
 
      if (existingDoc) {
        // Update existing doc (one write per category)
        const { etag } = await readItemWithEtag(limitsContainer, existingDoc.id, familyId);
        const { resource } = await limitsContainer.items.upsert(
          {
            ...existingDoc,
            limits:    currentLimits,
            updatedAt: new Date().toISOString(),
            updatedBy:   req.user.name || req.user.email,
            updatedById: req.user.id,
          },
          { accessCondition: { type: "IfMatch", condition: etag } }
        );
        savedDoc = resource;
      } else {
        // Create new doc if none exists and we have entries to save
        if (currentLimits.length === 0) continue;
        const { resource } = await limitsContainer.items.create({
          id:          `lim_${familyId}_${categoryId}`,
          userId:      familyId,
          categoryId,
          limits:      currentLimits,
          createdAt:   new Date().toISOString(),
          createdBy:   req.user.name || req.user.email,
          createdById: req.user.id,
        });
        savedDoc = resource;
      }
 
      console.log(`[LIMITS BATCH] ${categoryChanges.length} change(s) → ${categoryId}`);
      results.push(savedDoc);
 
    } catch (err) {
      if (err.code === 412) {
        errors.push({ categoryId, error: "Concurrent modification — please refresh." });
      } else {
        console.error(`[LIMITS BATCH] Error for ${categoryId}:`, err);
        errors.push({ categoryId, error: "Failed to save." });
      }
    }
  }
 
  if (errors.length > 0 && results.length === 0) {
    return res.status(500).json({ error: "All batch saves failed.", details: errors });
  }
 
  // Partial success — return saved docs and errors
  return res.status(errors.length > 0 ? 207 : 200).json({ saved: results, errors });
});
module.exports = router;