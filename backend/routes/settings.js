// ============================================================
// File: backend/routes/settings.js
// ============================================================

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { settingsContainer }  = require('../cosmos');
const { requireAuth }        = require('../middleware/auth');
const { readItem, BUDGET_MONTH_REGEX } = require('../utils/helpers');


router.use(requireAuth);

// ── Zod Schemas ──────────────────────────────────────────────

const CurrencySchema = z.object({
  code:       z.string().length(3, "Kod waluty musi mieć dokładnie 3 znaki.").toUpperCase(),
  name:       z.string().min(2).max(50),
  isArchived: z.boolean().optional().default(false),
  isBase:     z.boolean().optional().default(false),
});

// ── Safety Net schemas (must come BEFORE SettingsSchema) ─────

const AssetBucketSchema = z.object({
  id:               z.string().min(1).max(100),
  label:            z.string().min(1).max(80),
  amount:           z.number().min(0),
  liquidity:        z.enum(["instant", "fast", "slow"]),
  categoryId:       z.string().optional(),
  categoryName:     z.string().optional(),
  // FX origin (optional — only when user entered foreign currency)
  originalAmount:   z.number().min(0).optional(),
  originalCurrency: z.string().length(3).optional(),
  fxRate:           z.number().positive().optional(),
  fxRateDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Soft delete metadata — physical removal only via admin cleanup
  isArchived:       z.boolean().optional(),
  archivedAt:       z.string().optional(),
});

const SafetyNetSchema = z.object({
  lookbackMonths:     z.number().int().min(1).max(36).optional(),
  horizonMonths:      z.number().int().min(1).max(36).optional(),
  excludedIncomeKeys: z.array(z.string().max(200)).max(100).optional(),
  // 200 max — we never delete physically, so this lets the user have a
  // long history of archived buckets without hitting the cap.
  assets:             z.array(AssetBucketSchema).max(200).optional(),
  selectedLevel:      z.number().int().min(1).max(4).optional(),
  // Toggle: include upcoming planned expenses (oneoff + envelope) in the
  // cushion target. Defaults to true on the client; persisted explicitly.
  includePlannedExpenses: z.boolean().optional(),
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
  currencies:    z.array(CurrencySchema).max(30).optional(),
  voucherExpiryWarningDays: z.number().int().min(1).max(90).optional(),
  notifyDaysBefore: z.number().int().min(0).max(14).optional(),
  // Tags pre-selected on every new expense until cleared (holiday mode).
  // Capped low on purpose: this is a temporary switch, not a tagging policy.
  autoTagIds: z.array(z.string().min(1).max(200)).max(5).optional(),
  // First month visible in MonthNavigator — blocks navigating before this month
  appStartMonth: z.string()
    .regex(BUDGET_MONTH_REGEX, "Nieprawidłowy format appStartMonth (YYYY-MM)")
    .nullable()
    .optional(),
  // Persisted state for PanelSafetyNet (Poduszka finansowa)
  safetyNet:     SafetyNetSchema.optional(),
  luxmed: z.object({
    maxPercent: z.number().int().min(1).max(100).optional(),
    maxTotal:   z.number().min(0).max(99999).optional(),
  }).optional(),
  // Category mapping (all store a single subcategoryId; backend resolves the
  // rest). null clears the mapping.
  //  - depositSubcategoryId          : EXPENSE subcategory recognised as deposits
  //  - returnTransferSubcategoryId   : TRANSFER subcategory for auto-transfers on returns
  //  - envelopeTransferSubcategoryId : TRANSFER subcategory for envelope-purchase release
  depositSubcategoryId:          z.string().min(1).max(200).nullable().optional(),
  returnTransferSubcategoryId:   z.string().min(1).max(200).nullable().optional(),
  envelopeTransferSubcategoryId: z.string().min(1).max(200).nullable().optional(),
}).refine(
  data => data.thresholds
       || data.targets
       || data.currencies
       || data.appStartMonth !== undefined
       || data.autoTagIds !== undefined
       || data.voucherExpiryWarningDays !== undefined
       || data.safetyNet !== undefined
       || data.notifyDaysBefore !== undefined
       || data.luxmed !== undefined
       || data.depositSubcategoryId !== undefined
       || data.returnTransferSubcategoryId !== undefined
       || data.envelopeTransferSubcategoryId !== undefined,
  { message: "No valid fields provided for update." }
);

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
  },  luxmed: {
    maxPercent: 90,   // max. % 
    maxTotal:   500,  // max amount of return
  },
  currencies:    DEFAULT_CURRENCIES,
  voucherExpiryWarningDays: 14,
  notifyDaysBefore: 3,
  appStartMonth: null,  // null = no restriction
  autoTagIds:    [],    // empty = no tag pre-selected on new expenses
  safetyNet:     null,  // null = user hasn't configured the panel yet
  depositSubcategoryId: null,          // null = Bottle Deposits panel not configured
  returnTransferSubcategoryId: null,   // null = transfers on returns not configured
  envelopeTransferSubcategoryId: null, // null = envelope-release transfer not configured
};

// ── Helpers ───────────────────────────────────────────────────

function backfillCurrencies(doc) {
  if (!doc) return;
  if (!doc.currencies || doc.currencies.length === 0) {
    doc.currencies = DEFAULT_CURRENCIES;
    return;
  }
  const hasBase = doc.currencies.some(c => c.isBase);
  if (!hasBase) {
    const pln = doc.currencies.find(c => c.code === "PLN");
    if (pln) pln.isBase = true;
    else doc.currencies.unshift(DEFAULT_CURRENCIES[0]);
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

    // Backfill missing fields for old documents
    if (!("appStartMonth"            in doc)) doc.appStartMonth = null;
    if (!("autoTagIds"               in doc)) doc.autoTagIds = [];
    if (!("voucherExpiryWarningDays" in doc)) doc.voucherExpiryWarningDays = 14;
    if (!("safetyNet"                in doc)) doc.safetyNet = null;
    if (!("luxmed"    in doc)) doc.luxmed    = { maxPercent: 90, maxTotal: 500 };
    if (!("depositSubcategoryId"          in doc)) doc.depositSubcategoryId = null;
    if (!("returnTransferSubcategoryId"   in doc)) doc.returnTransferSubcategoryId = null;
    if (!("envelopeTransferSubcategoryId" in doc)) doc.envelopeTransferSubcategoryId = null;

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
      currencies:    parsed.data.currencies    ?? existing.currencies    ?? DEFAULT_CURRENCIES,
      // null explicitly clears the restriction; undefined means "not sent — keep existing"
      voucherExpiryWarningDays: parsed.data.voucherExpiryWarningDays ?? existing.voucherExpiryWarningDays ?? 14,
      notifyDaysBefore: parsed.data.notifyDaysBefore ?? existing.notifyDaysBefore ?? 3,
      appStartMonth: parsed.data.appStartMonth !== undefined
        ? parsed.data.appStartMonth
        : (existing.appStartMonth ?? null),
      autoTagIds: parsed.data.autoTagIds !== undefined
        ? parsed.data.autoTagIds
        : (existing.autoTagIds ?? []),
      // Safety net: shallow merge so partial patches don't wipe other fields.
      // Frontend currently always sends the full object, but be defensive.
      safetyNet: parsed.data.safetyNet !== undefined
        ? { ...(existing.safetyNet || {}), ...parsed.data.safetyNet }
        : (existing.safetyNet ?? null),
      luxmed: parsed.data.luxmed !== undefined
        ? { ...(existing.luxmed || { maxPercent: 90, maxTotal: 500 }), ...parsed.data.luxmed }
        : (existing.luxmed ?? { maxPercent: 90, maxTotal: 500 }),
      depositSubcategoryId: parsed.data.depositSubcategoryId !== undefined
        ? parsed.data.depositSubcategoryId
        : (existing.depositSubcategoryId ?? null),
      returnTransferSubcategoryId: parsed.data.returnTransferSubcategoryId !== undefined
        ? parsed.data.returnTransferSubcategoryId
        : (existing.returnTransferSubcategoryId ?? null),
      envelopeTransferSubcategoryId: parsed.data.envelopeTransferSubcategoryId !== undefined
        ? parsed.data.envelopeTransferSubcategoryId
        : (existing.envelopeTransferSubcategoryId ?? null),
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
