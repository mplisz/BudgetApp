// ============================================================
// File: backend/utils/shoppingCatalog.test.js
// Automated tests for the shopping catalog's pure logic.
// Run:  node --test            (Node 18+, no deps)
//
// Covers the identity key, the frequency×recency ranking that drives
// the "Najczęstsze" pills, and the size cap.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const {
  MAX_ENTRIES, shoppingKey, cleanItemName,
  scoreEntry, rankEntries, pruneEntries,
} = require("./shoppingCatalog");

const NOW = Date.parse("2026-09-12T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

// ── shoppingKey / cleanItemName ───────────────────────────────

describe("shoppingKey", () => {
  test("folds case, diacritics and punctuation into one identity", () => {
    const key = shoppingKey("Masło");
    assert.equal(shoppingKey("maslo"), key);
    assert.equal(shoppingKey("  MASŁO  "), key);
    assert.equal(shoppingKey("Masło!"), key);
  });

  test("keeps genuinely different products apart", () => {
    assert.notEqual(shoppingKey("mleko"), shoppingKey("mleko 3,2%"));
  });

  test("empty and punctuation-only names have no key", () => {
    assert.equal(shoppingKey(""), null);
    assert.equal(shoppingKey("   "), null);
    assert.equal(shoppingKey("---"), null);
    assert.equal(shoppingKey(null), null);
  });
});

describe("cleanItemName", () => {
  test("trims, collapses whitespace and caps the length", () => {
    assert.equal(cleanItemName("  Chleb   razowy "), "Chleb razowy");
    assert.equal(cleanItemName("x".repeat(200)).length, 120);
  });

  test("nothing to store → null", () => {
    assert.equal(cleanItemName("   "), null);
    assert.equal(cleanItemName(undefined), null);
  });
});

// ── scoreEntry ────────────────────────────────────────────────

describe("scoreEntry", () => {
  test("a product used today outranks the same count from long ago", () => {
    const fresh = { count: 5, lastUsedAt: daysAgo(0) };
    const stale = { count: 5, lastUsedAt: daysAgo(180) };
    assert.ok(scoreEntry(fresh, NOW) > scoreEntry(stale, NOW));
  });

  test("frequency still wins between products used equally recently", () => {
    const often  = { count: 20, lastUsedAt: daysAgo(3) };
    const seldom = { count: 2,  lastUsedAt: daysAgo(3) };
    assert.ok(scoreEntry(often, NOW) > scoreEntry(seldom, NOW));
  });

  test("weekly bread beats a bulk buy abandoned a year ago", () => {
    // The case the ranking exists for: raw counts would have the old
    // entry (30 uses) sitting on top of the pills forever.
    const bread = { count: 8,  lastUsedAt: daysAgo(2) };
    const old   = { count: 30, lastUsedAt: daysAgo(365) };
    assert.ok(scoreEntry(bread, NOW) > scoreEntry(old, NOW));
  });

  test("no count means no score, whatever the timestamp says", () => {
    assert.equal(scoreEntry({ count: 0, lastUsedAt: daysAgo(0) }, NOW), 0);
    assert.equal(scoreEntry({}, NOW), 0);
  });

  test("an unparsable timestamp falls back to 'just used', not to zero", () => {
    const broken = { count: 4, lastUsedAt: "not-a-date" };
    assert.equal(scoreEntry(broken, NOW), 4);
  });
});

// ── rankEntries ───────────────────────────────────────────────

describe("rankEntries", () => {
  test("orders best-first and does not mutate the input", () => {
    const input = [
      { key: "a", name: "Ananas", count: 1,  lastUsedAt: daysAgo(60) },
      { key: "b", name: "Chleb",  count: 10, lastUsedAt: daysAgo(1)  },
      { key: "c", name: "Cukier", count: 3,  lastUsedAt: daysAgo(10) },
    ];
    const snapshot = JSON.stringify(input);
    const ranked   = rankEntries(input, NOW);
    assert.deepEqual(ranked.map(e => e.key), ["b", "c", "a"]);
    assert.equal(JSON.stringify(input), snapshot);
  });

  test("ties break alphabetically so the pills never shuffle", () => {
    const same = daysAgo(5);
    const ranked = rankEntries([
      { key: "z", name: "Zurek", count: 2, lastUsedAt: same },
      { key: "a", name: "Ajvar", count: 2, lastUsedAt: same },
    ], NOW);
    assert.deepEqual(ranked.map(e => e.key), ["a", "z"]);
  });

  test("an empty or missing catalog is not an error", () => {
    assert.deepEqual(rankEntries([], NOW), []);
    assert.deepEqual(rankEntries(undefined, NOW), []);
  });
});

// ── pruneEntries ──────────────────────────────────────────────

describe("pruneEntries", () => {
  test("leaves a normal catalog untouched", () => {
    const entries = [{ key: "a", name: "A", count: 1, lastUsedAt: daysAgo(1) }];
    assert.equal(pruneEntries(entries, NOW), entries);
  });

  test("over the cap, keeps the strongest entries", () => {
    const entries = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => ({
      key: `k${i}`, name: `P${i}`,
      count: i + 1,                  // higher index = used more often
      lastUsedAt: daysAgo(1),
    }));
    const pruned = pruneEntries(entries, NOW);
    assert.equal(pruned.length, MAX_ENTRIES);
    // The five weakest (count 1..5) are the ones dropped.
    assert.ok(pruned.every(e => e.count > 5));
  });
});
