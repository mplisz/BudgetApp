// ============================================================
// File: backend/routes/settings.js
// Handles family settings: thresholds, targets, currencies.
//
// Currency model:
//   { code: "PLN", name: "Polski złoty", isArchived: false, isBase: true }
//
// isBase: true  → always first in dropdown, cannot be archived
// isBase: false → managed by user, max 10 active at a time
// ============================================================

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { settingsContainer } = require('../cosmos');
const { requireAuth }       = require('../middleware/auth');

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
  { code: "PLN", name: "Polski złoty",    isArchived: false, isBase: true  },
  { code: "EUR", name: "Euro",            isArchived: false, isBase: false },
  { code: "USD", name: "Dolar amerykański", isArchived: false, isBase: false },
  { code: "GBP", name: "Funt szterling",  isArchived: false, isBase: false },
  { code: "RUB", name: "Rubel rosyjski",  isArchived: false, isBase: false },
  { code: "CZK", name: "Korona czeska",   isArchived: false, isBase: false },
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
  if (!doc.currencies || doc.currencies.length === 0) {
    doc.currencies = DEFAULT_CURRENCIES;
    return;
  }
  // Ensure at least one base currency exists
  const hasBase = doc.currencies.some(c => c.isBase);
  if (!hasBase) {
    // Try to mark existing PLN as base, else prepend default PLN
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

    try {
      const { resource } = await settingsContainer.item(id, familyId).read();
      backfillCurrencies(resource);
      res.json(resource);
    } catch (err) {
      if (err.code === 404) {
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

// ── PATCH ────────────────────────────────────────────────────
router.patch('/', async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const familyId = req.user.familyId;
    const id       = `settings_${familyId}`;

    let existing;
    try {
      const { resource } = await settingsContainer.item(id, familyId).read();
      existing = resource ?? { id, userId: familyId, ...DEFAULT_SETTINGS };
    } catch (err) {
      if (err.code === 404) {
        existing = { id, userId: familyId, ...DEFAULT_SETTINGS };
      } else {
        throw err;
      }
    }

    // Validate currencies if provided
    if (parsed.data.currencies) {
      const incoming = parsed.data.currencies;

      // Must have exactly one base currency
      const baseCount = incoming.filter(c => c.isBase).length;
      if (baseCount !== 1) {
        return res.status(400).json({ error: "Musi istnieć dokładnie jedna waluta bazowa." });
      }

      // Base currency cannot be archived
      const archivedBase = incoming.find(c => c.isBase && c.isArchived);
      if (archivedBase) {
        return res.status(400).json({ error: "Waluta bazowa nie może być zarchiwizowana." });
      }

      // Max 10 non-base active currencies
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
      currencies: parsed.data.currencies ?? existing.currencies ?? DEFAULT_CURRENCIES,
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