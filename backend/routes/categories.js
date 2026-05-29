// ============================================================
// File: backend/routes/categories.js
// Handles all category-related endpoints
//
// Cost optimization notes:
//   - PATCH and POST (parent lookup) use Point Reads via
//     `container.item(id, partitionKey).read()` (~1 RU) instead of
//     SQL queries with WHERE c.id = @id (~2.9 RU).
//   - GET stays as a SQL query because it scans all docs in the
//     partition without specific IDs — that's the right tool there.
//
// Bug fixes vs previous version:
//   - PATCH no longer overwrites `canBeRecurring` to `false` on
//     every update. Removed `.default(false)` from PATCH schema
//     so absent fields stay untouched.
//   - PATCH now supports `isCritical` (subcategory flag) which
//     was already in POST schema but missing from PATCH.
// ============================================================

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { categoriesContainer } = require('../cosmos');
const { requireAuth }         = require('../middleware/auth');
const { generateId, readItem, IdParamSchema } = require('../utils/helpers');

router.use(requireAuth);

// ── Zod Schemas ──────────────────────────────────────────────
//
// POST: brand-new category, defaults make sense (caller may omit).
// PATCH: partial update — every field MUST be optional and absent
//         fields must NOT mutate the doc. Therefore no .default() here.

const CategoryPostSchema = z.object({
  name:             z.string().min(2, "Name must be at least 2 characters")
                              .max(50, "Name must be at most 50 characters"),
  icon:             z.string().max(10).optional(),
  parentCategoryId: z.string().nullable().optional(),
  type:             z.enum(['EXPENSE', 'INCOME', 'SAVING', 'TRANSFER']).nullable().optional(),
  priority:         z.number().int().min(1).max(4).optional(),
  canBeRecurring:   z.boolean().optional().default(false),
  isCritical:       z.boolean().optional().default(false),
});

const CategoryPatchSchema = z.object({
  name:             z.string().min(2).max(50).optional(),
  icon:             z.string().max(10).optional(),
  isArchived:       z.boolean().optional(),
  priority:         z.number().int().min(1).max(4).optional(),
  // NOTE: no `.default()` — patch is partial. Missing field == no change.
  canBeRecurring:   z.boolean().optional(),
  isCritical:       z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "No valid fields provided for update.",
});

// ── GET ──────────────────────────────────────────────────────
// Lists all categories for the user's family. SQL query is the right
// tool here — we're scanning the whole partition, not fetching a
// single doc by ID, so Point Read doesn't apply.

router.get('/', async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.userId = @familyId",
      parameters: [{ name: "@familyId", value: req.user.familyId }],
    };
    const { resources: categories } = await categoriesContainer.items.query(querySpec).fetchAll();
    res.status(200).json(categories);
  } catch (error) {
    console.error("[GET] Failed to fetch data:", error);
    res.status(500).json({ error: "Failed to fetch data from database." });
  }
});

// Backend POST /api/categories — ID convention matching seed-categories.js
//
// Format:
//   Root:        cat_<slug>                          (e.g. cat_zakupy)
//   Subcategory: cat_root_<parentSlug>_<slug>_<familyId>
//                                                    (e.g. cat_root_dom_czynsz_MMs)
//
// Parent slug = parent.id stripped of leading "cat_" (since parent IDs
// in the new convention are just `cat_<slug>` for roots; we strip the
// prefix to avoid `cat_cat_dom_...`).

router.post('/', async (req, res) => {
  // Zod validation
  const parsed = CategoryPostSchema.safeParse(req.body);
  if (!parsed.success) {
    console.log("[POST] Zod errors:", JSON.stringify(parsed.error));
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const { name, icon, parentCategoryId, type, priority } = parsed.data;
    const familyId = req.user.familyId;
    const cleanName = name.trim();
    let finalType = type;

    if (parentCategoryId) {
      try {
        const { resource: parent } = await categoriesContainer.item(parentCategoryId, familyId).read();
        if (!parent) return res.status(404).json({ error: "Parent category not found." });
        finalType = parent.type;
      } catch (err) {
        return res.status(404).json({ error: "Parent category not found in your family scope." });
      }
    } else {
      if (!finalType) {
        return res.status(400).json({ error: "Main category must have a valid type (EXPENSE, INCOME, SAVING, TRANSFER)." });
      }
    }

    let finalPriority = null;
    if (parentCategoryId && finalType === 'EXPENSE') {
      finalPriority = priority || 2;
    }

    // ── ID generation (matches seed-categories.js convention) ──
    const nameSlug = generateId(cleanName);
    let newId;
    if (parentCategoryId) {
      // Subcategory: cat_root_<parentSlug>_<nameSlug>_<familyId>
      // Strip "cat_" prefix from parent id, then slugify the rest in case
      // the parent has an old-format id like "cat_root_dom_MMs".
      const parentSlug = generateId(parentCategoryId.replace(/^cat_/, ''));
      newId = `cat_root_${parentSlug}_${nameSlug}_${familyId}`;
    } else {
      // Root: cat_<nameSlug>   (no familyId suffix — matches seed)
      newId = `cat_${nameSlug}`;
    }

    const cleanIcon = (icon && icon.length <= 10) ? icon : "📦";

    const newCategory = {
      id: newId,
      userId: familyId,
      name: cleanName,
      icon: cleanIcon,
      parentCategoryId: parentCategoryId || null,
      type: finalType,
      isArchived: false,
      priority: finalPriority,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
      createdByName: req.user.name,
      canBeRecurring: parsed.data.canBeRecurring ?? false
    };

    const { resource } = await categoriesContainer.items.create(newCategory);
    console.log(`[POST] Created ${resource.type} category: ${resource.name} (${resource.id})`);
    res.status(201).json(resource);

  } catch (error) {
    if (error.code === 409) {
      const msg = req.body.parentCategoryId
        ? "Subcategory with this name already exists in this category."
        : "Category with this name already exists.";
      return res.status(409).json({ error: msg });
    }
    console.error("[POST] Database error:", error);
    res.status(500).json({ error: "Failed to add category to database." });
  }
});

// ── PATCH ────────────────────────────────────────────────────
//
// Uses Point Read via `readItem(container, id, partitionKey)` —
// costs ~1 RU instead of the ~2.9 RU of an SQL query.
// 404 (not found) is handled inside readItem (returns null instead
// of throwing), so no try/catch around the read itself.

router.patch('/update/:id', async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    return res.status(400).json({ error: idParsed.error.issues[0].message });
  }

  const parsed = CategoryPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const id       = idParsed.data;
    const familyId = req.user.familyId;

    // ── Point Read (~1 RU) ──────────────────────────────────
    const existing = await readItem(categoriesContainer, id, familyId);
    if (!existing) {
      console.warn(`[PATCH] Category not found or unauthorized for ID: ${id}`);
      return res.status(404).json({ error: "Category not found or unauthorized." });
    }

    // ── Build safe updates (only fields that were sent) ─────
    const { name, icon, isArchived, priority, canBeRecurring, isCritical } = parsed.data;
    const safeUpdates = {};
    if (name           !== undefined) safeUpdates.name           = name.trim();
    if (icon           !== undefined) safeUpdates.icon           = icon.substring(0, 10);
    if (isArchived     !== undefined) safeUpdates.isArchived     = isArchived;
    if (priority       !== undefined) safeUpdates.priority       = priority;
    if (canBeRecurring !== undefined) safeUpdates.canBeRecurring = canBeRecurring;
    if (isCritical     !== undefined) safeUpdates.isCritical     = isCritical;

    safeUpdates.updatedAt     = new Date().toISOString();
    safeUpdates.updatedBy     = req.user.id;
    safeUpdates.updatedByName = req.user.name;

    // ── Write ───────────────────────────────────────────────
    const updatedCategoryData = { ...existing, ...safeUpdates };
    const { resource: updatedCategory } = await categoriesContainer.items.upsert(updatedCategoryData);

    res.json(updatedCategory);

  } catch (error) {
    console.error(`[PATCH] Server error updating category ${req.params?.id}:`, error);
    res.status(500).json({ error: "Failed to update category" });
  }
});

module.exports = router;
