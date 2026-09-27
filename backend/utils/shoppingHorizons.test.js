// ============================================================
// File: backend/utils/shoppingHorizons.test.js
// Automated tests for the "when is it needed" rules of the list.
// Run:  node --test            (Node 18+, no deps)
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { isYmd, itemHorizon, normalizeWhen, moreUrgent } = require("./shoppingHorizons");

describe("isYmd", () => {
  test("accepts real days only", () => {
    assert.equal(isYmd("2026-09-30"), true);
    assert.equal(isYmd("2026-02-31"), false);
    assert.equal(isYmd("2026-9-30"),  false);
    assert.equal(isYmd(null),         false);
  });
});

describe("itemHorizon", () => {
  test("an item from before horizons existed is on 'now'", () => {
    assert.equal(itemHorizon({}), "now");
    assert.equal(itemHorizon({ when: "bogus" }), "now");
    assert.equal(itemHorizon({ when: "watch" }), "watch");
  });
});

describe("normalizeWhen", () => {
  test("date needs a day; other horizons drop it", () => {
    assert.deepEqual(normalizeWhen("date", "2026-10-01"), { when: "date", needBy: "2026-10-01" });
    assert.equal(normalizeWhen("date", null), null);
    assert.deepEqual(normalizeWhen("watch", "2026-10-01"), { when: "watch", needBy: null });
    assert.deepEqual(normalizeWhen(undefined, undefined), { when: "now", needBy: null });
    assert.equal(normalizeWhen("later", null), null);
  });
});

describe("moreUrgent — merging a second add of the same product", () => {
  test("now beats date beats watch, whichever side it comes from", () => {
    assert.equal(moreUrgent({ when: "watch" }, { when: "now" }).when, "now");
    assert.equal(moreUrgent({ when: "now" }, { when: "watch" }).when, "now");
    assert.equal(moreUrgent({ when: "watch" }, { when: "date", needBy: "2026-10-01" }).when, "date");
  });
  test("two dates keep the earlier one", () => {
    const r = moreUrgent({ when: "date", needBy: "2026-10-03" }, { when: "date", needBy: "2026-10-01" });
    assert.deepEqual(r, { when: "date", needBy: "2026-10-01" });
  });
  test("an old item without `when` counts as now", () => {
    assert.equal(moreUrgent({}, { when: "watch" }).when, "now");
  });
});
