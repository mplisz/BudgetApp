// ============================================================
// File: backend/utils/textSearch.test.js
// Cross-month product search — must agree with the client's matching.
// Run:  node --test
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");
const { normalizeSearch, searchTokens, txMatchesText } = require("./textSearch");

describe("textSearch", () => {
  const tx = {
    description: "Zakupy Lidl",
    lineItems: [
      { description: "GUANCIALE 250G", amount: 18.99 },
      { description: "Makaron", amount: 5.49, product: { name: "Spaghetti Barilla" } },
      { description: "Ser żółty", amount: 12 },
    ],
  };

  test("folds case and Polish diacritics", () => {
    assert.equal(normalizeSearch("ŻÓŁTY Łosoś"), "zolty losos");
  });

  test("a too-short query has no tokens", () => {
    assert.deepEqual(searchTokens(" g "), []);
    assert.equal(txMatchesText(tx, searchTokens("g")), false);
  });

  test("matches a line, the AI product name, and the description", () => {
    assert.equal(txMatchesText(tx, searchTokens("guanciale")), true);
    assert.equal(txMatchesText(tx, searchTokens("barilla")), true);
    assert.equal(txMatchesText(tx, searchTokens("lidl")), true);
  });

  test("ignores diacritics and word order", () => {
    assert.equal(txMatchesText(tx, searchTokens("zolty ser")), true);
  });

  test("every word must be on the same line", () => {
    assert.equal(txMatchesText(tx, searchTokens("guanciale makaron")), false);
  });

  test("copes with a doc without line items", () => {
    assert.equal(txMatchesText({ description: "Guanciale z targu" }, searchTokens("guanciale")), true);
    assert.equal(txMatchesText({}, searchTokens("guanciale")), false);
  });
});
