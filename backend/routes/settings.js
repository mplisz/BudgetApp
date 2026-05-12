// ============================================================
// File: backend/routes/settings.js
// Handles family settings: thresholds, targets, currencies.
//
// Currency model:
//   { code: "PLN", name: "Polski złoty", isArchived: false, isBase: true }
//
// isBase: true  → always first in dropdown, cannot be archived
// isBase: false → user-managed, max 10 active at a time
// ============================================================

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { settingsContainer }  = require('../cosmos');
const { requireAuth }        = require('../middleware/auth');
const { readItem }           = require('../utils/helpers');

router.use(requireAuth);

// ── Zod Schemas ──────────────────────────────────────────────

const CurrencySchema = z.object({
  code:       z.string().length(3, "Kod waluty musi mieć dokładnie 3 znaki.").toUpperCase(),
  name:       z.string().min(2).max(50),
  isArchived: z.boolean().optional().default(false),
  isBase:     z.boolean().optional().default(false),
});

const SettingsSchema = z.object({
  thresholds: z.object({
    warningPercent:  z.number().min(1).max(99).optional(),
    criticalPercent: z.number().min(1).max(99).optional(),
  }).optional(),
  targets: z.object({
    maxInsurancePercent:   z.number().min(0).max(100).optional(),
    maxObligationsPercent: z.number().min(0).max(100).optional(),
    minRetirementPercent:  z.number().min(0).max(100).optional(),
    minSavingsPercent:     z.number().min(0).max(100).optional(),
  }).optional(),
  currencies: z.array(CurrencySchema).max(30).optional(),
}).refine(data => data.thresholds || data.targets || data.currencies, {
  message: "No valid fields provided for update.",
});

// ── Defaults ─────────────────────────────────────────────────

const DEFAULT_CURRENCIES = [
  { code: "PLN", name: "Polski złoty",      isArchived: false, isBase: true  },
  { code: "EUR", name: "Euro",              isArchived: false, isBase: false },
  { code: "USD", name: "Dolar amerykański", isArchived: false, isBase: false },
  { code: "GBP", name: "Funt szterling",   isArchived: false, isBase: false },
  { code: "RUB", name: "Rubel rosyjski",   isArchived: false, isBase: false },
  { code: "CZK", name: "Korona czeska",    isArchived: false, isBase: false },
];

const DEFAULT_SETTINGS = {
  thresholds: { warningPercent: 80, criticalPercent: 95 },
  targets: {
    maxInsurancePercent:   10,
    maxObligationsPercent: 35,
    minRetirementPercent:  15,
    minSavingsPercent:     20,
  },
  currencies: DEFAULT_CURRENCIES,
};

// ── Helpers ───────────────────────────────────────────────────

/**
 * Ensure every settings document has currencies with a base currency.
 * Backfills old documents that predate the currencies feature.
 */
function backfillCurrencies(doc) {
  if (!doc) return;
  if (!doc.currencies || doc.currencies.length === 0) {
    doc.currencies = DEFAULT_CURRENCIES;
    return;
  }
  const hasBase = doc.currencies.some(c => c.isBase);
  if (!hasBase) {
    const pln = doc.currencies.find(c => c.code === "PLN");
    if (pln) {
      pln.isBase = true;
    } else {
      doc.currencies.unshift(DEFAULT_CURRENCIES[0]);
    }
  }
}

// ── GET ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const id       = `settings_${familyId}`;

    const doc = await readItem(settingsContainer, id, familyId);
    if (!doc) {
      return res.json({ id, userId: familyId, ...DEFAULT_SETTINGS });
    }

    backfillCurrencies(doc);
    res.json(doc);
  } catch (error) {
    console.error("[SETTINGS GET] Failed:", error);
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

// ── PATCH ────────────────────────────────────────────────────
router.patch('/', async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const familyId = req.user.familyId;
    const id       = `settings_${familyId}`;

    const existing = await readItem(settingsContainer, id, familyId)
      ?? { id, userId: familyId, ...DEFAULT_SETTINGS };

    // Validate currencies if provided
    if (parsed.data.currencies) {
      const incoming = parsed.data.currencies;

      const baseCount = incoming.filter(c => c.isBase).length;
      if (baseCount !== 1) {
        return res.status(400).json({ error: "Musi istnieć dokładnie jedna waluta bazowa." });
      }

      const archivedBase = incoming.find(c => c.isBase && c.isArchived);
      if (archivedBase) {
        return res.status(400).json({ error: "Waluta bazowa nie może być zarchiwizowana." });
      }

      const activeNonBase = incoming.filter(c => !c.isBase && !c.isArchived).length;
      if (activeNonBase > 10) {
        return res.status(400).json({ error: "Można wybrać maksymalnie 10 aktywnych walut (poza bazową)." });
      }
    }

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
      currencies:    parsed.data.currencies ?? existing.currencies ?? DEFAULT_CURRENCIES,
      updatedAt:     new Date().toISOString(),
      updatedBy:     req.user.id,
      updatedByName: req.user.name,
    };

    const { resource } = await settingsContainer.items.upsert(updated);
    console.log(`[SETTINGS PATCH] Updated for: ${familyId}`);
    res.json(resource);

  } catch (error) {
    console.error("[SETTINGS PATCH] Failed:", error);
    res.status(500).json({ error: "Failed to update settings." });
  }
});

module.exports = router;