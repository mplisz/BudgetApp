// ============================================================
// File: backend/utils/monthStatus.test.js
// What "this month is closed" means on the server.
// Run:  node --test
//
// The regression behind this module: the returns endpoint tested
// `monthDoc?.isClosed`, but a closed-month document carries no such field —
// its EXISTENCE is the status. The check never fired and a return could be
// booked into a closed month. These tests pin the existence rule against the
// real document shape written by routes/months.js.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { monthDocId, isMonthClosed, findClosedMonth } = require("./monthStatus");

// ── Fake Cosmos container ─────────────────────────────────────

const FAMILY = "MMs";

function fakeContainer(docs, { throwOn, emptyRead } = {}) {
  const reads = [];
  return {
    reads,
    item(id, partitionKey) {
      return {
        async read() {
          reads.push(id);
          assert.equal(partitionKey, FAMILY, "must read within the family partition");
          if (throwOn === id) throw new Error("boom");
          const doc = docs[id];
          // The emulator answers a missing item with an empty resource
          // instead of a 404 — both must read as "open".
          if (!doc && emptyRead) return { resource: undefined };
          if (!doc) { const e = new Error("not found"); e.code = 404; throw e; }
          return { resource: doc };
        },
      };
    },
  };
}

// Exactly what POST /api/months writes — note: no `isClosed` field.
const MONTHS = {
  "month_MMs_2026-09": {
    id:          "month_MMs_2026-09",
    userId:      FAMILY,
    budgetMonth: "2026-09",
    status:      "closed",
    closedAt:    "2026-10-01T08:00:00.000Z",
    closedBy:    "Marcin",
    closedById:  "user_1",
  },
};

// ── monthDocId ────────────────────────────────────────────────

describe("monthDocId", () => {
  test("builds the id the Months container is keyed by", () => {
    assert.equal(monthDocId(FAMILY, "2026-09"), "month_MMs_2026-09");
  });
});

// ── isMonthClosed ─────────────────────────────────────────────

describe("isMonthClosed", () => {
  test("a month with a document is closed — no isClosed flag needed", async () => {
    const c = fakeContainer(MONTHS);
    assert.equal(MONTHS["month_MMs_2026-09"].isClosed, undefined);
    assert.equal(await isMonthClosed(c, FAMILY, "2026-09"), true);
    assert.deepEqual(c.reads, ["month_MMs_2026-09"]);
  });

  test("a month without a document is open (404)", async () => {
    const c = fakeContainer(MONTHS);
    assert.equal(await isMonthClosed(c, FAMILY, "2026-10"), false);
  });

  test("a month without a document is open (empty read)", async () => {
    const c = fakeContainer(MONTHS, { emptyRead: true });
    assert.equal(await isMonthClosed(c, FAMILY, "2026-10"), false);
  });

  test("a reopened month is open again", async () => {
    const docs = { ...MONTHS };
    const c = fakeContainer(docs);
    assert.equal(await isMonthClosed(c, FAMILY, "2026-09"), true);
    delete docs["month_MMs_2026-09"]; // DELETE /api/months/2026-09
    assert.equal(await isMonthClosed(c, FAMILY, "2026-09"), false);
  });

  test("a failed read throws instead of reporting the month as open", async () => {
    const c = fakeContainer(MONTHS, { throwOn: "month_MMs_2026-09" });
    await assert.rejects(() => isMonthClosed(c, FAMILY, "2026-09"), /boom/);
  });
});

// ── findClosedMonth ───────────────────────────────────────────

describe("findClosedMonth", () => {
  test("null when every month is open", async () => {
    const c = fakeContainer(MONTHS);
    assert.equal(await findClosedMonth(c, FAMILY, ["2026-10", "2026-11"]), null);
  });

  test("names the closed month — an edit moving a tx out of it is caught", async () => {
    const c = fakeContainer(MONTHS);
    assert.equal(await findClosedMonth(c, FAMILY, ["2026-10", "2026-09"]), "2026-09");
  });

  test("reads each distinct month once across a batch", async () => {
    const c = fakeContainer(MONTHS);
    await findClosedMonth(c, FAMILY, ["2026-10", "2026-10", "2026-11", "2026-10"]);
    assert.deepEqual(c.reads, ["month_MMs_2026-10", "month_MMs_2026-11"]);
  });

  test("skips blanks — a patch that leaves budgetMonth alone", async () => {
    const c = fakeContainer(MONTHS);
    assert.equal(await findClosedMonth(c, FAMILY, ["2026-10", undefined, null]), null);
    assert.deepEqual(c.reads, ["month_MMs_2026-10"]);
  });
});
