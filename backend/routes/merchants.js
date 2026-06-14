// ============================================================
// File: backend/routes/merchants.js
// GET  /api/merchants        — list known shop names (for autocomplete)
// POST /api/merchants        — add a shop name (idempotent)
//
// Storage: a single document per family in the Settings container,
// id `merchants_<familyId>`, type "MERCHANTS", field `merchants: []`.
// No dedicated container — merchants are a small config list, not an
// entity collection. Edit/delete is done directly in the DB by design;
// this route only exposes read + append.
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const { settingsContainer } = require("../cosmos");
const { requireAuth }       = require("../middleware/auth");
const { readItem }          = require("../utils/helpers");
const { cleanMerchant, merchantExists, rememberMerchant } = require("../utils/merchant");

router.use(requireAuth);

const docId = (familyId) => `merchants_${familyId}`;

// Read the merchants doc, or a synthetic empty one if it doesn't exist yet.
async function loadMerchantsDoc(familyId) {
  const existing = await readItem(settingsContainer, docId(familyId), familyId);
  if (existing) return existing;
  return {
    id:        docId(familyId),
    userId:    familyId,
    type:      "MERCHANTS",
    merchants: [],
    createdAt: new Date().toISOString(),
  };
}

// ── GET /api/merchants ────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const doc = await loadMerchantsDoc(req.user.familyId);
    const list = Array.isArray(doc.merchants) ? doc.merchants : [];
    res.json(list.slice().sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    console.error("[MERCHANTS GET]", err);
    res.status(500).json({ error: "Failed to fetch merchants." });
  }
});

// ── POST /api/merchants ───────────────────────────────────────
const PostSchema = z.object({ name: z.string().min(1).max(150) });

router.post("/", async (req, res) => {
  const parsed = PostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const familyId = req.user.familyId;
  const name = cleanMerchant(parsed.data.name);
  if (!name) return res.status(400).json({ error: "Invalid merchant name." });

  try {
    // rememberMerchant is idempotent + best-effort (shared with the OCR
    // path). After it runs, return the fresh, sorted list to the client.
    await rememberMerchant(settingsContainer, familyId, name);
    const doc = await loadMerchantsDoc(familyId);
    const list = Array.isArray(doc.merchants) ? doc.merchants : [];
    res.json(list.slice().sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    console.error("[MERCHANTS POST]", err);
    res.status(500).json({ error: "Failed to add merchant." });
  }
});

module.exports = router;
