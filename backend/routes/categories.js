// ============================================================
// File: backend/routes/categories.js
// Handles all category-related endpoints
// ============================================================

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { categoriesContainer } = require('../cosmos');
const { requireAuth } = require('../middleware/auth');
const { generateId, IdParamSchema } = require('../utils/helpers'); 

router.use(requireAuth);

// ── Zod Schemas ──────────────────────────────────────────────
const CategoryPostSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be at most 50 characters"),
  icon: z.string().max(10).optional(),
  parentCategoryId: z.string().nullable().optional(),
  type: z.enum(['EXPENSE', 'INCOME', 'SAVING', 'TRANSFER']).nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
});

const CategoryPatchSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  icon: z.string().max(10).optional(),
  isArchived: z.boolean().optional(),
  priority: z.number().int().min(1).max(4).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "No valid fields provided for update."
});



// GET
router.get('/', async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.userId = @familyId",
      parameters: [{ name: "@familyId", value: req.user.familyId }]
    };
    const { resources: categories } = await categoriesContainer.items.query(querySpec).fetchAll();
    res.status(200).json(categories);
  } catch (error) {
    console.error("[GET] Failed to fetch data:", error);
    res.status(500).json({ error: "Failed to fetch data from database." });
  }
});

// POST
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

    const namePart = generateId(cleanName);
    const parentPart = parentCategoryId ? generateId(parentCategoryId.replace('cat_', '')) : 'root';
    const newId = `cat_${parentPart}_${namePart}_${familyId}`;
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

// PATCH
router.patch('/update/:id', async (req, res) => {
  // Validate ID
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    return res.status(400).json({ error: idParsed.error.issues[0].message });
  }

  // Validate body
  const parsed = CategoryPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const id = idParsed.data;
    const familyId = req.user.familyId;
    const { name, icon, isArchived, priority } = parsed.data;

    const safeUpdates = {};
    if (name !== undefined)       safeUpdates.name       = name.trim();
    if (icon !== undefined)       safeUpdates.icon       = icon.substring(0, 10);
    if (isArchived !== undefined) safeUpdates.isArchived = isArchived;
    if (priority !== undefined)   safeUpdates.priority   = priority;

    safeUpdates.updatedAt     = new Date().toISOString();
    safeUpdates.updatedBy     = req.user.id;
    safeUpdates.updatedByName = req.user.name;

    const { resources } = await categoriesContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id AND c.userId = @familyId",
        parameters: [
          { name: "@id", value: id },
          { name: "@familyId", value: familyId }
        ]
      })
      .fetchAll();

    if (resources.length === 0) {
      console.warn(`[PATCH] Category not found or unauthorized for ID: ${id}`);
      return res.status(404).json({ error: "Category not found or unauthorized." });
    }

    const updatedCategoryData = { ...resources[0], ...safeUpdates };
    const { resource: updatedCategory } = await categoriesContainer.items.upsert(updatedCategoryData);

    res.json(updatedCategory);

  } catch (error) {
    console.error(`[PATCH] Server error updating category ${req.params?.id}:`, error);
    res.status(500).json({ error: "Failed to update category" });
  }
});

module.exports = router;