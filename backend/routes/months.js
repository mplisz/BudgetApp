// ============================================================
// File: backend/routes/months.js
// Manages fiscal month open/close status.
//
// A month is CLOSED when a document exists in the Months container.
// A month is OPEN when no document exists (implicit open).
//
// Rules:
//   - Cannot close a month if the previous month is still open
//   - Cannot close a future month (> next calendar month)
//   - Reopening has no restrictions
//
// Endpoints:
//   GET    /api/months              — list all closed months for this user
//   POST   /api/months              — close a month
//   DELETE /api/months/:budgetMonth — reopen a month
// ============================================================

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { monthsContainer } = require('../cosmos');
const { requireAuth }     = require('../middleware/auth');

router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────

const BUDGET_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Returns "YYYY-MM" for the month immediately before the given one.
 */
function previousMonth(budgetMonth) {
  const [y, m] = budgetMonth.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Returns "YYYY-MM" for next calendar month relative to now.
 */
function nextCalendarMonth() {
  const now = new Date();
  const m   = now.getMonth() + 2; // +1 for 0-index, +1 for next month
  const y   = now.getFullYear();
  if (m > 12) return `${y + 1}-01`;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ── Zod ───────────────────────────────────────────────────────

const CloseMonthSchema = z.object({
  budgetMonth: z.string().regex(BUDGET_MONTH_REGEX, "Nieprawidłowy format budgetMonth (YYYY-MM)"),
});

// ── GET /api/months ───────────────────────────────────────────
// Returns array of closed budgetMonth strings: ["2026-03", "2026-04"]

router.get('/', async (req, res) => {
  try {
    const familyId = req.user.familyId;

    const { resources } = await monthsContainer.items
      .query({
        query: `SELECT c.budgetMonth, c.closedAt, c.closedBy
                FROM c
                WHERE c.userId = @userId
                ORDER BY c.budgetMonth ASC`,
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll();

    res.json(resources);
  } catch (error) {
    console.error("[MONTHS GET] Failed:", error);
    res.status(500).json({ error: "Failed to fetch month statuses." });
  }
});

// ── POST /api/months — close a month ─────────────────────────

router.post('/', async (req, res) => {
  const parsed = CloseMonthSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const { budgetMonth } = parsed.data;
    const familyId        = req.user.familyId;

    // Block closing months too far in the future
    const nextMonth = nextCalendarMonth();
    if (budgetMonth > nextMonth) {
      return res.status(400).json({
        error: `Nie można zamknąć miesiąca ${budgetMonth} — zbyt daleka przyszłość.`,
      });
    }

    // Check if already closed
    const id = `month_${familyId}_${budgetMonth}`;
    try {
      await monthsContainer.item(id, familyId).read();
      return res.status(409).json({ error: `Miesiąc ${budgetMonth} jest już zamknięty.` });
    } catch (err) {
      if (err.code !== 404) throw err;
      // 404 = not closed yet, proceed
    }

    // Enforce sequential closing only if there are already closed months.
    // If no months are closed yet, the user is just starting — allow any month.
    const { resources: existingClosed } = await monthsContainer.items
      .query({
        query: "SELECT TOP 1 c.budgetMonth FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: familyId }],
      })
      .fetchAll();

    const hasAnyClosedMonth = existingClosed.length > 0;

    if (hasAnyClosedMonth) {
      const prevMonth = previousMonth(budgetMonth);
      const prevId    = `month_${familyId}_${prevMonth}`;
      try {
        await monthsContainer.item(prevId, familyId).read();
        // Previous is closed — OK to proceed
      } catch (err) {
        if (err.code === 404) {
          return res.status(400).json({
            error: `Nie można zamknąć ${budgetMonth} — poprzedni miesiąc (${prevMonth}) jest jeszcze otwarty.`,
          });
        }
        throw err;
      }
    }

    // Create the closed month document
    const doc = {
      id,
      userId:      familyId,
      budgetMonth,
      status:      "closed",
      closedAt:    new Date().toISOString(),
      closedBy:    req.user.name || req.user.email,
      closedById:  req.user.id,
    };

    const { resource } = await monthsContainer.items.create(doc);
    console.log(`[MONTHS POST] Closed: ${budgetMonth} for ${familyId}`);
    res.status(201).json(resource);

  } catch (error) {
    console.error("[MONTHS POST] Failed:", error);
    res.status(500).json({ error: "Failed to close month." });
  }
});

// ── DELETE /api/months/:budgetMonth — reopen a month ─────────

router.delete('/:budgetMonth', async (req, res) => {
  const { budgetMonth } = req.params;

  if (!BUDGET_MONTH_REGEX.test(budgetMonth)) {
    return res.status(400).json({ error: "Nieprawidłowy format budgetMonth (YYYY-MM)." });
  }

  try {
    const familyId = req.user.familyId;
    const id       = `month_${familyId}_${budgetMonth}`;

    try {
      await monthsContainer.item(id, familyId).delete();
      console.log(`[MONTHS DELETE] Reopened: ${budgetMonth} for ${familyId}`);
      res.json({ success: true, budgetMonth });
    } catch (err) {
      if (err.code === 404) {
        return res.status(404).json({ error: `Miesiąc ${budgetMonth} nie jest zamknięty.` });
      }
      throw err;
    }

  } catch (error) {
    console.error("[MONTHS DELETE] Failed:", error);
    res.status(500).json({ error: "Failed to reopen month." });
  }
});

module.exports = router;