// ============================================================
// File: backend/routes/tags.js
// Handles all tag-related endpoints
// ============================================================

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { tagsContainer } = require('../cosmos');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../utils/helpers');

router.use(requireAuth);

// ── Zod Schemas ──────────────────────────────────────────────
const TagPostSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(30, "Name must be at most 30 characters"),
  icon: z.string().max(10).optional(),
});

const TagPatchSchema = z.object({
  name: z.string().min(2).max(30).optional(),
  icon: z.string().max(10).optional(),
  isArchived: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "No valid fields provided for update."
});

// GET
router.get('/', async (req, res) => {
  try {
    const { resources: tags } = await tagsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: req.user.familyId }]
      })
      .fetchAll();
    res.status(200).json(tags);
  } catch (error) {
    console.error("[TAGS GET] Failed:", error);
    res.status(500).json({ error: "Failed to fetch tags." });
  }
});

// POST
router.post('/', async (req, res) => {
  const parsed = TagPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const { name, icon } = parsed.data;
    const cleanName = name.trim();
    const familyId = req.user.familyId;
    const newId = `tag_${generateId(cleanName)}_${familyId}`;
    const cleanIcon = (icon && icon.length <= 10) ? icon : "🏷️";

    const newTag = {
      id: newId,
      userId: familyId,
      name: cleanName,
      icon: cleanIcon,
      isArchived: false,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
      createdByName: req.user.name,
    };

    const { resource } = await tagsContainer.items.create(newTag);
    console.log(`[TAGS POST] Created tag: ${resource.name} (${resource.id})`);
    res.status(201).json(resource);

  } catch (error) {
    if (error.code === 409) {
      return res.status(409).json({ error: "Tag with this name already exists." });
    }
    console.error("[TAGS POST] Database error:", error);
    res.status(500).json({ error: "Failed to add tag." });
  }
});

// PATCH
router.patch('/update/:id', async (req, res) => {
  const idParsed = z.string().regex(/^[a-zA-Z0-9_-]+$/).safeParse(req.params.id);
  if (!idParsed.success) {
    return res.status(400).json({ error: "Invalid ID format" });
  }

  const parsed = TagPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const id = idParsed.data;
    const familyId = req.user.familyId;
    const { name, icon, isArchived } = parsed.data;

    const { resources } = await tagsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id AND c.userId = @userId",
        parameters: [
          { name: "@id", value: id },
          { name: "@userId", value: familyId }
        ]
      })
      .fetchAll();

    if (resources.length === 0) {
      return res.status(404).json({ error: "Tag not found or unauthorized." });
    }

    const safeUpdates = {};
    if (name !== undefined)       safeUpdates.name       = name.trim();
    if (icon !== undefined)       safeUpdates.icon       = icon.substring(0, 10);
    if (isArchived !== undefined) safeUpdates.isArchived = isArchived;
    safeUpdates.updatedAt     = new Date().toISOString();
    safeUpdates.updatedBy     = req.user.id;
    safeUpdates.updatedByName = req.user.name;

    const updatedTag = { ...resources[0], ...safeUpdates };
    const { resource } = await tagsContainer.items.upsert(updatedTag);

    res.json(resource);
  } catch (error) {
    console.error(`[TAGS PATCH] Error:`, error);
    res.status(500).json({ error: "Failed to update tag." });
  }
});

module.exports = router;