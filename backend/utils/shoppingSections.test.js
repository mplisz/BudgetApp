// ============================================================
// File: backend/utils/shoppingSections.test.js
// Automated tests for the shop-section guesser.
// Run:  node --test            (Node 18+, no deps)
//
// The guess is what saves the user from filing every item by hand, so
// the cases here are ordinary shopping-list entries written the way a
// person types them on a phone — diacritics, inflections, extra words.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const {
  SECTION_IDS, DEFAULT_SECTION, guessSection, isSection, sectionOrder,
} = require("./shoppingSections");

describe("guessSection — everyday items land in the right aisle", () => {
  const CASES = {
    pieczywo: ["Bułki", "bulki", "Chleb razowy", "bagietka", "Rogaliki"],
    nabial:   ["Mleko 3,2%", "Ser żółty", "Jajka", "jogurt naturalny", "Masło extra"],
    mieso:    ["Mięso mielone", "Pierś z kurczaka", "kiełbasa śląska", "Szynka"],
    warzywa:  ["Ziemniaki", "Banany", "marchewka", "Pomidory malinowe", "sałata"],
    chemia:   ["Płyn do mycia naczyń", "Proszek do prania", "Tabletki do zmywarki", "Worki na śmieci"],
    higiena:  ["Papier toaletowy", "Pasta do zębów", "Szampon", "Ręczniki papierowe"],
    napoje:   ["Woda gazowana", "Piwo", "Coca-Cola", "sok pomarańczowy"],
    slodycze: ["Czekolada mleczna", "Ciastka", "chipsy paprykowe"],
    suche:    ["Makaron spaghetti", "Kawa mielona", "Ryż basmati", "Mąka pszenna"],
    mrozone:  ["Lody", "Pierogi ruskie", "Mrożona pizza"],
    dom:      ["Baterie AA", "Żarówka LED", "Karma dla kota"],
    dzieci:   ["Pieluchy 4", "Pampersy", "Kaszka manna", "Kredki", "Zeszyt w kratkę"],
    ubrania:  ["Skarpetki", "Majtki", "Piżama dla córki", "Czapka zimowa", "Buty sportowe"],
    gotowe:   ["Sałatka grecka", "Zapiekanka", "Sushi", "Kanapka", "Pizza"],
    apteka:   ["Paracetamol", "Witamina D", "Magnez", "Octenisept", "Leki dla mamy"],
  };

  for (const [section, names] of Object.entries(CASES)) {
    test(section, () => {
      for (const name of names) {
        assert.equal(guessSection(name), section, `"${name}" should be ${section}`);
      }
    });
  }
});

describe("guessSection — diacritics and spelling", () => {
  test("folds Polish characters, so typing without them still works", () => {
    assert.equal(guessSection("Mięso mielone"), guessSection("mieso mielone"));
    assert.equal(guessSection("Żarówka"), guessSection("zarowka"));
  });

  test("the distinctive noun decides, not the whole phrase", () => {
    // The reason keywords are stems: nobody writes the canonical form.
    assert.equal(guessSection("Płyn do naczyń"), "chemia");
    assert.equal(guessSection("Płyn do mycia naczyń"), "chemia");
    assert.equal(guessSection("płyn do naczyń cytrynowy 1l"), "chemia");
  });

  test("near-miss keywords do not steal each other's items", () => {
    // Each of these pairs shares a stem with the other's section, which
    // is exactly how a keyword dictionary goes wrong unnoticed.
    assert.equal(guessSection("Tabletki do zmywarki"), "chemia");   // not apteka
    assert.equal(guessSection("Sałatka grecka"), "gotowe");         // not warzywa
    assert.equal(guessSection("Sałata lodowa"), "warzywa");         // not gotowe
    assert.equal(guessSection("Mleko"), "nabial");                  // "lek" is inside it
    assert.equal(guessSection("Mrożona pizza"), "mrozone");         // not gotowe
  });

  test("a longer keyword beats a shorter one starting in the same place", () => {
    // Otherwise these read as plain dairy and a plain drink.
    assert.equal(guessSection("Mleko modyfikowane 2"), "dzieci");
    assert.equal(guessSection("Mleko 2%"), "nabial");
    assert.equal(guessSection("Sok dla dzieci"), "dzieci");
    assert.equal(guessSection("Sok pomarańczowy"), "napoje");
  });
});

describe("guessSection — when it does not know", () => {
  test("an unrecognized product is honestly 'inne', not a wrong aisle", () => {
    assert.equal(guessSection("Coś dziwnego"), DEFAULT_SECTION);
    assert.equal(guessSection("xyz"), DEFAULT_SECTION);
  });

  test("empty input never throws", () => {
    assert.equal(guessSection(""), DEFAULT_SECTION);
    assert.equal(guessSection(null), DEFAULT_SECTION);
    assert.equal(guessSection(undefined), DEFAULT_SECTION);
    assert.equal(guessSection("   "), DEFAULT_SECTION);
  });
});

describe("sections as data", () => {
  test("isSection accepts every listed id and nothing else", () => {
    for (const id of SECTION_IDS) assert.ok(isSection(id));
    assert.equal(isSection("nieistniejaca"), false);
    assert.equal(isSection(""), false);
  });

  test("'inne' exists and sorts last — it is the fallback", () => {
    assert.ok(SECTION_IDS.includes(DEFAULT_SECTION));
    assert.equal(sectionOrder(DEFAULT_SECTION), SECTION_IDS.length - 1);
  });

  test("an unknown section sorts to the end instead of breaking the order", () => {
    assert.ok(sectionOrder("cokolwiek") >= SECTION_IDS.length);
  });
});
