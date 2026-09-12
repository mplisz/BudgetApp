// ============================================================
// File: backend/routes/shopping.js
// The family SHOPPING LIST — the permanent "what to buy" list, one
// document per item:
//   GET    /api/shopping            — open items + recent history + catalog
//   POST   /api/shopping            — put a product on the list
//   PATCH  /api/shopping/:id        — edit fields, or change status
//   DELETE /api/shopping/:id        — drop an item (we changed our mind)
//   DELETE /api/shopping/catalog/:key — prune a suggestion
//
// WHY A DOCUMENT PER ITEM (and not one array doc like merchants):
// this is the one list two family members write to at the same time —
// one in the aisle, one at the till. An array in a single document
// would lose whichever tick-off landed second.
//
// STATUS MODEL:
//   open    — still to buy. `missedAt` marks "nie było" — the item stays
//             open BECAUSE we still want it; it just gets flagged so it
//             stands out next time.
//
// An item carries NO shop. Which shop something is cheapest in has to be
// checked at the time anyway, and on the rare trip that covers two shops
// the note field says so in the words that actually matter. Grouping the
// list by shop would have been a field to maintain for a case that does
// not arise.
//   bought  — done. Kept briefly as history, then expires by itself.
//   skipped — we gave up on it. Same retention as bought.
//
// RETENTION: resolved items get a per-document Cosmos `ttl` instead of
// a cleanup job — the container is created with defaultTtl -1 (TTL on,
// nothing expires unless it says so), so an open item lives forever and
// a resolved one disappears on its own after RESOLVED_TTL_SECONDS.
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const crypto  = require("crypto");
const { shoppingContainer, settingsContainer } = require("../cosmos");
const { requireAuth } = require("../middleware/auth");
const { readItemWithEtag, IdParamSchema } = require("../utils/helpers");
const {
  shoppingKey, cleanItemName, fetchCatalog,
  rememberShoppingItem, rememberShoppingSection, lookupSection, forgetShoppingItem,
} = require("../utils/shoppingCatalog");
const { SECTION_IDS, DEFAULT_SECTION, guessSection } = require("../utils/shoppingSections");

router.use(requireAuth);

// A week of history — the two questions it has to answer are "did I just
// mis-tap that?" (minutes) and "did we already buy this?" (days). What is
// worth keeping long-term — that this is a product we buy — lives in the
// catalog instead. Longer retention would only grow the payload every
// panel open has to carry, in a shop, on whatever signal is going.
//
// Kept in sync by hand with the "znika po 7 dniach" note in PanelShopping.
const RESOLVED_TTL_SECONDS = 7 * 24 * 60 * 60;

const STATUSES = ["open", "bought", "skipped"];

// ── Schemas ──────────────────────────────────────────────────

const PostSchema = z.object({
  name:         z.string().min(1).max(120),
  qty:          z.number().int().min(1).max(999).optional().default(1),
  unit:         z.string().max(20).nullable().optional(),
  note:         z.string().max(300).optional().default(""),
  // Omitted means "work it out" — see resolveSection. An explicit value
  // is the user overruling both the catalog and the dictionary.
  section:      z.enum(SECTION_IDS).nullable().optional(),
  // Set when the item came from the Potencjalne zakupy panel — keeps the
  // trail back to the entry that was archived in exchange.
  sourceWishId: z.string().max(200).nullable().optional(),
});

const PatchSchema = z.object({
  name:     z.string().min(1).max(120).optional(),
  qty:      z.number().int().min(1).max(999).optional(),
  unit:     z.string().max(20).nullable().optional(),
  note:     z.string().max(300).optional(),
  section:  z.enum(SECTION_IDS).optional(),
  status:   z.enum(["open", "bought", "skipped"]).optional(),
  // "Nie było" — only meaningful together with status "open" (explicitly
  // or by omission); clearing it is what un-flags an item.
  missed:   z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: "No fields to update." });

// ── Helpers ──────────────────────────────────────────────────

function actor(req) {
  return req.user.name || req.user.email || req.user.id || null;
}

// Which aisle this product belongs to, in order of authority:
//   1. what the request explicitly says — the user overruling everything,
//   2. what this household filed the product under last time,
//   3. the keyword dictionary,
//   4. "Inne".
// The catalog outranks the dictionary on purpose: one correction has to
// be enough, and a household's own habit beats a generic word list.
async function resolveSection(familyId, key, name, requested) {
  if (requested) return requested;
  const remembered = await lookupSection(settingsContainer, familyId, key);
  return remembered || guessSection(name) || DEFAULT_SECTION;
}

// Everything the panel needs in one round-trip: the list itself and the
// suggestion catalog. Two reads, one request — the panel is opened in a
// shop, often on a bad connection.
async function loadPanelState(familyId) {
  const [{ resources: items }, catalog] = await Promise.all([
    shoppingContainer.items
      .query({
        query: `SELECT * FROM c
                WHERE c.userId = @userId AND c.type = 'SHOPPING_ITEM'
                ORDER BY c.addedAt DESC`,
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll(),
    fetchCatalog(settingsContainer, familyId),
  ]);

  // Items written before sections existed have none. Fill one in on the
  // way out rather than migrating the container: a GET has no business
  // writing, the guess costs nothing, and the value persists by itself
  // the first time anything about that item is edited.
  return {
    items: items.map(i => (i.section ? i : { ...i, section: guessSection(i.name) })),
    catalog,
  };
}

// ── GET / ────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    res.json(await loadPanelState(req.user.familyId));
  } catch (err) {
    console.error("[SHOPPING GET]", err);
    res.status(500).json({ error: "Failed to fetch the shopping list." });
  }
});

// ── POST / ───────────────────────────────────────────────────
// Adding a product that is ALREADY open bumps its quantity instead of
// creating a second row: tapping the "mleko" pill twice means two
// milks, not two lines saying milk. A bought/skipped item of the same
// name is NOT reused — that one belongs to history.

router.post("/", async (req, res) => {
  const parsed = PostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const familyId = req.user.familyId;
  const name     = cleanItemName(parsed.data.name);
  const key      = shoppingKey(name);
  if (!key) return res.status(400).json({ error: "Invalid product name." });

  const { qty, unit, note, sourceWishId } = parsed.data;
  const now = new Date().toISOString();

  try {
    const section = await resolveSection(familyId, key, name, parsed.data.section);

    const { resources: open } = await shoppingContainer.items
      .query({
        // Bracket notation for `key`/`status`: both are close enough to
        // Cosmos SQL keywords that dot access is a coin flip.
        query: `SELECT * FROM c
                WHERE c.userId = @userId AND c.type = 'SHOPPING_ITEM'
                  AND c["key"] = @key AND c["status"] = 'open'`,
        parameters: [
          { name: "@userId", value: familyId },
          { name: "@key",    value: key },
        ],
      })
      .fetchAll();

    // Re-check the status here rather than trusting the query alone. A
    // resolved row must never be reused: bumping its quantity would hand
    // the user back a "bought" item carrying its 30-day ttl, so the thing
    // they just added would be missing from the list AND set to expire.
    // History stays history; adding a product always yields a NEW open row.
    const existing = open.find(i => i.status === "open");

    let resource;
    if (existing) {
      // Last write wins on a simultaneous double-add of the SAME product
      // from two phones — the loser is one quantity bump, and paying for
      // an ETag round-trip plus a retry to protect that is not worth it.
      ({ resource } = await shoppingContainer.item(existing.id, familyId).replace({
        ...existing,
        qty:       Math.min(999, (Number(existing.qty) || 1) + qty),
        unit:      unit ?? existing.unit ?? null,
        // A note on the second add wins ("bez soli, to dla córki" is the
        // point of adding it again); an empty one leaves the first alone.
        note:      note || existing.note || "",
        section:   existing.section || section,
        // Putting a product back on the list clears "nie było": you are
        // asking for it afresh, not re-reporting the empty shelf.
        status:     "open",
        missedAt:   null,
        resolvedBy: null,
        resolvedAt: null,
        ttl:        -1,
        updatedAt:  now,
      }));
    } else {
      ({ resource } = await shoppingContainer.items.create({
        id:     `shop_${crypto.randomUUID()}`,
        userId: familyId,          // partition key
        type:   "SHOPPING_ITEM",
        key,
        name,
        qty,
        unit:     unit ?? null,
        note,
        section,
        status:   "open",
        missedAt:    null,
        missedCount: 0,
        sourceWishId: sourceWishId ?? null,
        addedBy:   actor(req),
        addedAt:   now,
        resolvedBy: null,
        resolvedAt: null,
        // Explicit "never expires" rather than relying on the container
        // default being -1. If the container were ever configured with a
        // real default TTL, this is what stops an unbought item from
        // quietly disappearing off the list.
        ttl:       -1,
        updatedAt: now,
      }));
    }

    // Learn the name (and its aisle) for the pills/autocomplete.
    // Best-effort by design: the item is already on the list, and a
    // catalog failure must not turn a successful add into an error the
    // user sees. Only an EXPLICIT section is taught here — a guess must
    // not harden into a remembered fact nobody chose.
    await rememberShoppingItem(settingsContainer, familyId, name, unit ?? null, parsed.data.section ?? null);

    res.status(existing ? 200 : 201).json(resource);
  } catch (err) {
    console.error("[SHOPPING POST]", err);
    res.status(500).json({ error: "Failed to add the item." });
  }
});

// ── PATCH /:id ───────────────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const familyId = req.user.familyId;
  const d        = parsed.data;
  const now      = new Date().toISOString();

  try {
    const { resource: existing, etag } = await readItemWithEtag(shoppingContainer, idParsed.data, familyId);
    if (!existing || existing.type !== "SHOPPING_ITEM") {
      return res.status(404).json({ error: "Item not found." });
    }

    const nextStatus = d.status ?? existing.status;
    if (!STATUSES.includes(nextStatus)) return res.status(400).json({ error: "Invalid status." });
    const resolving = nextStatus !== "open";
    const wasOpen   = existing.status === "open";

    const next = {
      ...existing,
      ...(d.name     !== undefined ? { name: cleanItemName(d.name) || existing.name,
                                       key:  shoppingKey(d.name) || existing.key } : {}),
      ...(d.qty      !== undefined ? { qty: d.qty } : {}),
      ...(d.unit     !== undefined ? { unit: d.unit } : {}),
      ...(d.note     !== undefined ? { note: d.note } : {}),
      ...(d.section  !== undefined ? { section: d.section } : {}),
      status:    nextStatus,
      updatedAt: now,
    };

    // "Nie było": the item stays open, but we record when and how often,
    // so the panel can surface it instead of letting it blend in.
    if (d.missed === true) {
      next.missedAt    = now;
      next.missedCount = (Number(existing.missedCount) || 0) + 1;
    } else if (d.missed === false) {
      next.missedAt = null;
    }

    if (resolving) {
      // Only stamp the resolver on the transition, so editing a bought
      // item later doesn't rewrite who ticked it off.
      if (wasOpen) {
        next.resolvedBy = actor(req);
        next.resolvedAt = now;
      }
      next.missedAt = null;             // a resolved item is not "missing"
      next.ttl      = RESOLVED_TTL_SECONDS;
    } else if (!resolving && !wasOpen) {
      // Re-opened (an undo, or a mis-tap): drop the expiry and the
      // resolution stamps, otherwise the item would silently vanish.
      next.resolvedBy = null;
      next.resolvedAt = null;
      next.ttl        = -1;
    }

    const { resource } = await shoppingContainer.item(idParsed.data, familyId).replace(
      next,
      { accessCondition: { type: "IfMatch", condition: etag } },
    );

    // Moving an item to a different aisle teaches the catalog, so the
    // next "bułki" lands in Pieczywo without being told again. Same
    // learn-from-corrections idea as the OCR category feedback, and just
    // as best-effort: the move itself has already been saved above.
    if (d.section !== undefined && d.section !== existing.section) {
      await rememberShoppingSection(settingsContainer, familyId, next.key, d.section);
    }

    res.json(resource);
  } catch (err) {
    // 412 = someone else changed this item first. On a shared list that
    // is routine (both phones ticking off at the till), so it is a plain
    // "refresh", not an error worth logging as a failure.
    if (err.code === 412) return res.status(409).json({ error: "Pozycja zmieniona na innym urządzeniu — odśwież listę." });
    console.error("[SHOPPING PATCH]", err);
    res.status(500).json({ error: "Failed to update the item." });
  }
});

// ── DELETE /catalog/:key ─────────────────────────────────────
// Declared BEFORE /:id — otherwise "catalog" would be read as an item id.

router.delete("/catalog/:key", async (req, res) => {
  const key = (req.params.key || "").trim();
  if (!key || key.length > 200) return res.status(400).json({ error: "Invalid catalog key." });

  try {
    const catalog = await forgetShoppingItem(settingsContainer, req.user.familyId, key);
    res.json(catalog);
  } catch (err) {
    console.error("[SHOPPING CATALOG DELETE]", err);
    res.status(500).json({ error: "Failed to remove the suggestion." });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────
// Hard delete: a list item is ephemeral. What is worth keeping — that
// this product is one we buy — already lives in the catalog, and the
// client restores a mis-tap by re-posting it.

router.delete("/:id", async (req, res) => {
  const idParsed = IdParamSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: idParsed.error.issues[0].message });

  try {
    await shoppingContainer.item(idParsed.data, req.user.familyId).delete();
    res.json({ success: true, id: idParsed.data });
  } catch (err) {
    if (err.code === 404) return res.status(404).json({ error: "Item not found." });
    console.error("[SHOPPING DELETE]", err);
    res.status(500).json({ error: "Failed to delete the item." });
  }
});

module.exports = router;
