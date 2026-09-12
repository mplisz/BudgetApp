// ============================================================
// File: backend/utils/shoppingMatch.test.js
// Tests for receipt-line ↔ shopping-item matching.
// Run:  node --test            (Node 18+, no deps)
//
// Every description below is a REAL line from this family's receipts,
// copied out of a 1031-row export. Invented strings would have made the
// matcher look better than it is: the actual text carries OCR noise,
// brands in quotes, glued multipacks and weighed amounts.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const { matchTokens, tokensMatch, scoreLine, matchLines } = require("./shoppingMatch");

// ── Tokenizing ────────────────────────────────────────────────

describe("matchTokens", () => {
  test("drops packaging noise and prepositions", () => {
    assert.deepEqual(matchTokens("Cebula żółta luz"), ["cebula", "zolta"]);
    assert.deepEqual(matchTokens("Płyn do naczyń"), ["plyn", "naczyn"]);
  });

  test("keeps numbers — they are what tells two variants apart", () => {
    // A number can never carry a match on its own (every word of the
    // entry still has to be found), but without them "Mleko 3,2%" and
    // "Mleko" are the same query and a receipt's milk lands on whichever
    // happens to rank higher.
    assert.deepEqual(matchTokens("Mleko 3,2%"), ["mleko", "3", "2"]);
    assert.deepEqual(matchTokens("Ziemniaki (PL) 1,17 kg"), ["ziemniaki", "pl", "1", "17"]);
  });

  test("keeps qualifiers that are part of the product's identity", () => {
    // "Zero" appears on 47 sampled lines and is the whole difference
    // between two Colas — it is not noise.
    assert.ok(matchTokens("Coca-Cola Zero 1,75 l x3").includes("zero"));
  });

  test("survives quotes, brackets and OCR gibberish", () => {
    assert.deepEqual(
      matchTokens("Napój energetyczny 'Dzik' (Kwa Jab An Mix)"),
      ["napoj", "energetyczny", "dzik", "kwa", "jab", "an", "mix"],
    );
  });
});

// ── Token similarity ──────────────────────────────────────────

describe("tokensMatch — Polish inflection", () => {
  test("long words match on a shared stem", () => {
    assert.ok(tokensMatch("bulki", "bulka"));
    assert.ok(tokensMatch("pieluchy", "pieluszki"));
    assert.ok(tokensMatch("mielone", "mielonego"));
    assert.ok(tokensMatch("chleb", "chlebek"));
  });

  test("short words must match exactly — this is the vodka rule", () => {
    // "woda"/"wodka" and "jaja"/"jajka" differ in exactly the same way.
    // No rule keeps the second without letting the first through, and
    // buying vodka instead of water is the worse failure.
    assert.equal(tokensMatch("woda", "wodka"), false);
    assert.equal(tokensMatch("jaja", "jajka"), false);
    assert.ok(tokensMatch("woda", "woda"));
  });

  test("a stem must not run away into a different word", () => {
    assert.equal(tokensMatch("ser", "serwetki"), false);
    assert.equal(tokensMatch("sok", "sos"), false);
    assert.equal(tokensMatch("mleko", "mielone"), false);
    assert.equal(tokensMatch("maslo", "maslanka"), false);
  });
});

// ── Whole-item matching ───────────────────────────────────────

describe("scoreLine", () => {
  test("every word of the list entry has to be found", () => {
    assert.ok(scoreLine(matchTokens("chleb razowy"), matchTokens("Chleb razowy żytni 500 g")));
    assert.equal(scoreLine(matchTokens("chleb razowy"), matchTokens("Chleb słowiański 380 g")), null);
  });

  test("extra words in the description are expected, not a problem", () => {
    const s = scoreLine(matchTokens("mielone"), matchTokens("Mięso mielone wieprzowo-wołowe 400g"));
    assert.ok(s);
    assert.ok(s.extra > 0);
  });

  test("nothing matches nothing", () => {
    assert.equal(scoreLine(matchTokens("żarówka"), matchTokens("Kefir Activia 280 g")), null);
    assert.equal(scoreLine([], matchTokens("Cukinia luz")), null);
  });
});

// ── Assignment over a whole receipt ───────────────────────────

const RECEIPT = [
  { description: "Mięso mielone wieprzowo-wołowe 400g" },
  { description: "Chleb słowiański 380 g" },
  { description: "Piwo 'Pilsner Urquell' 0,5 l x2" },
  { description: "Napój energetyczny 'Dzik' 0,5 l puszka" },
  { description: "Cebula czerwona luz 0,152 kg" },
  { description: "Ser gouda 400 g" },
  { description: "Ludwik hipoalergiczny do zapasów" },
  { description: "Kaucja za opakowania" },
];

describe("matchLines", () => {
  test("matches an ordinary list against an ordinary receipt", () => {
    const items = [
      { id: "i1", name: "Mielone" },
      { id: "i2", name: "Chleb" },
      { id: "i3", name: "Cebula" },
      { id: "i4", name: "Ser" },
    ];
    const out = matchLines(items, RECEIPT);
    const byItem = Object.fromEntries(out.map(m => [m.itemId, m.lineIndex]));

    assert.equal(byItem.i1, 0);
    assert.equal(byItem.i2, 1);
    assert.equal(byItem.i3, 4);
    assert.equal(byItem.i4, 5);
    assert.ok(out.every(m => m.confidence === "tokens"));
  });

  test("leaves alone what was not on the list", () => {
    const out = matchLines([{ id: "i1", name: "Mielone" }], RECEIPT);
    assert.equal(out.length, 1);
    assert.equal(out[0].lineIndex, 0);
  });

  test("a brand nobody could guess needs a taught alias", () => {
    const items = [{ id: "i1", name: "Płyn do naczyń", key: "plyn do naczyn" }];
    assert.equal(matchLines(items, RECEIPT).length, 0);

    const aliases = { "ludwik hipoalergiczny do zapasow": "plyn do naczyn" };
    const out = matchLines(items, RECEIPT, aliases);
    assert.deepEqual(out, [{ itemId: "i1", lineIndex: 6, confidence: "alias" }]);
  });

  test("a structured product name outranks a text match", () => {
    const lines = [
      { description: "Chleb słowiański 380 g" },
      { description: "Chleb duży 1100g ZAJ 0,500 kg", product: { name: "Chleb Zwykły Pszenny" } },
    ];
    const out = matchLines([{ id: "i1", name: "Chleb Zwykły Pszenny" }], lines);
    assert.deepEqual(out, [{ itemId: "i1", lineIndex: 1, confidence: "exact" }]);
  });

  test("the more specific item wins a contested line", () => {
    const lines = [{ description: "Mleko modyfikowane Bebilon 2" }];
    const items = [
      { id: "ogolne",    name: "Mleko" },
      { id: "konkretne", name: "Mleko modyfikowane" },
    ];
    const out = matchLines(items, lines);
    assert.deepEqual(out, [{ itemId: "konkretne", lineIndex: 0, confidence: "tokens" }]);
  });

  test("two variants of one product go to the right one, or fall back", () => {
    // Keeping "Mleko" and "Mleko 3,2%" on the same list is the user's own
    // doing, but the prices still have to land somewhere sensible.
    const items = [
      { id: "ogolne",    name: "Mleko" },
      { id: "konkretne", name: "Mleko 3,2%" },
    ];
    const pick = (description) =>
      matchLines(items, [{ description }])[0]?.itemId ?? null;

    assert.equal(pick("Mleko UHT 3,2% 1L"), "konkretne");
    assert.equal(pick("Mleko 2% 1L"), "ogolne");        // the 3 is missing
    assert.equal(pick("Mleko bez laktozy"), "ogolne");
  });

  test("one line is never spent twice, even on identical entries", () => {
    // Two people adding "piwo" separately must not both be ticked off by
    // a single bottle on the receipt.
    const items = [{ id: "a", name: "Piwo" }, { id: "b", name: "Piwo" }];
    const out = matchLines(items, [{ description: "Piwo 'Pilsner Urquell' 0,5 l x2" }]);
    assert.equal(out.length, 1);
  });

  test("an empty list or an empty receipt is not an error", () => {
    assert.deepEqual(matchLines([], RECEIPT), []);
    assert.deepEqual(matchLines([{ id: "i1", name: "Mielone" }], []), []);
  });
});
