// ============================================================
// File: backend/routes/settings.js
// Handles family settings - thresholds and targets
// ============================================================

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { settingsContainer } = require('../cosmos');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── Zod Schema ───────────────────────────────────────────────
const SettingsSchema = z.object({
  thresholds: z.object({
    warningPercent: z.number().min(1).max(99).optional(),
    criticalPercent: z.number().min(1).max(99).optional(),
  }).optional(),
  targets: z.object({
    maxInsurancePercent:   z.number().min(0).max(100).optional(),
    maxObligationsPercent: z.number().min(0).max(100).optional(),
    minRetirementPercent:  z.number().min(0).max(100).optional(),
    minSavingsPercent:     z.number().min(0).max(100).optional(),
  }).optional(),
}).refine(data => data.thresholds || data.targets, {
  message: "No valid fields provided for update."
});

// Default values for frontend if not in DB
const DEFAULT_SETTINGS = {
  thresholds: {
    warningPercent: 80,
    criticalPercent: 95,
  },
  targets: {
    maxInsurancePercent:   10,
    maxObligationsPercent: 35,
    minRetirementPercent:  15,
    minSavingsPercent:     20,
  }
};

// GET
router.get('/', async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const id = `settings_${familyId}`;

    try {
      const { resource } = await settingsContainer.item(id, familyId).read();
      res.json(resource);
    } catch (err) {
      if (err.code === 404) {
        // Brak ustawień — zwróć domyślne bez zapisywania
        res.json({ id, userId: familyId, ...DEFAULT_SETTINGS });
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.error("[SETTINGS GET] Failed:", error);
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

// PATCH - upsert
router.patch('/', async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const familyId = req.user.familyId;
    const id = `settings_${familyId}`;
    // Fetch existing settings or fall back to defaults if not found
    let existing;
    try {
      const { resource } = await settingsContainer.item(id, familyId).read();
      // Resource can be undefined even without a 404 error in some Cosmos DB edge cases
      existing = resource ?? { id, userId: familyId, ...DEFAULT_SETTINGS };
    } catch (err) {
      if (err.code === 404) {
        // First time setup - no settings document exists yet
        existing = { id, userId: familyId, ...DEFAULT_SETTINGS };
      } else {
        throw err;
      }
    }

    // Merge — deep merge to avoid overwritting the whole document
    const updated = {
      ...existing,
      thresholds: {
        ...existing.thresholds,
        ...(parsed.data.thresholds || {}),
      },
      targets: {
        ...existing.targets,
        ...(parsed.data.targets || {}),
      },
      updatedAt:     new Date().toISOString(),
      updatedBy:     req.user.id,
      updatedByName: req.user.name,
    };

    const { resource } = await settingsContainer.items.upsert(updated);
    console.log(`[SETTINGS PATCH] Updated settings for: ${familyId}`);
    res.json(resource);

  } catch (error) {
    console.error("[SETTINGS PATCH] Failed:", error);
    res.status(500).json({ error: "Failed to update settings." });
  }
});

module.exports = router;