// ============================================================
// File: backend/utils/shoppingPrices.test.js
// Tests for the price statistics behind "zwykle X · ost. Y".
// Run:  node --test            (Node 18+, no deps)
//
// The descriptions are real lines from this family's receipts. The
// multipack and weight notations in particular were taken from a 1031-row
// export rather than imagined — that is where "x 3,90" (a unit price, not
// a pack) and "kg 0,216" (weight written backwards) came from.
// ============================================================

const { test, describe } = require("node:test");
const assert             = require("node:assert/strict");

const {
  MAX_OBSERVATIONS, MAX_SEEN, MIN_FOR_MEDIAN,
  seenObservation, addSeenObservation, cheapestSeen,
  parsePackCount, parsePackageSize, parseWeightKg, observationFrom,
  median, pruneObservations, addObservation, summarize,
} = require("./shoppingPrices");

const TODAY = new Date("2026-09-12T12:00:00Z");
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86_400_000).toISOString().slice(0, 10);

// ── Pack counts ───────────────────────────────────────────────

describe("parsePackCount", () => {
  test("reads every notation the receipts actually use", () => {
    assert.equal(parsePackCount("Majo Go Vege 280 g x2"), 2);
    assert.equal(parsePackCount("Napój energetyczny 'Dzik' x 2"), 2);
    assert.equal(parsePackCount("2x Ritter marcepan"), 2);
    assert.equal(parsePackCount("Pomidoryx3 w puszce"), 3);
    assert.equal(parsePackCount("Woda Cisowianka perlista 0,7L x6"), 6);
    assert.equal(parsePackCount("Perlage woda x12"), 12);
  });

  test("15 x 60 sztuk is fifteen packs, not sixty", () => {
    assert.equal(parsePackCount("Pampers Aqua Soft Touch Chusteczki 15 x 60 sztuk"), 15);
  });

  test("a decimal after the x is never a pack count", () => {
    // Both of these are real, and both would otherwise divide the price.
    assert.equal(parsePackCount("Marchewka 0,386 kg x 3,90"), null);   // unit price
    assert.equal(parsePackCount("Kapusta czerwona x1,300 kg"), null);  // weight
  });

  test("x1 and no marking both mean one", () => {
    assert.equal(parsePackCount("Czosnek młody szt. x1"), null);
    assert.equal(parsePackCount("Kiełbasa kasztelańska"), null);
    assert.equal(parsePackCount(""), null);
  });
});

// ── Package sizes ─────────────────────────────────────────────

describe("parsePackageSize", () => {
  test("reads the notations on these receipts, into base units", () => {
    assert.deepEqual(parsePackageSize("Majo Go Vege 280 g x2"), { size: 280, unit: "g" });
    assert.deepEqual(parsePackageSize("Napój energetyczny En... 0,5 l"), { size: 500, unit: "ml" });
    assert.deepEqual(parsePackageSize("Polaris Mama 1,5L x6"), { size: 1500, unit: "ml" });
    assert.deepEqual(parsePackageSize("Krewetki surowe 500g"), { size: 500, unit: "g" });
    assert.deepEqual(parsePackageSize("Red Bull Lilac puszka 0,25L"), { size: 250, unit: "ml" });
    assert.deepEqual(parsePackageSize("BIO jaja 10 szt."), { size: 10, unit: "szt" });
  });

  test("takes the last size — the first one is sometimes not the package", () => {
    // Real line: "6-10 kg" is the baby, "90 szt" is the box.
    assert.deepEqual(
      parsePackageSize("Pieluszki Pampers 3 Active Baby 6-10 kg 90 szt"),
      { size: 90, unit: "szt" },
    );
  });

  test("a percentage is not a size", () => {
    assert.deepEqual(parsePackageSize("Mleko UHT 3,2% 1L"), { size: 1000, unit: "ml" });
    assert.equal(parsePackageSize("Somersby Pear 0%"), null);
  });

  test("nothing to read → null", () => {
    assert.equal(parsePackageSize("Kiełbasa kasztelańska"), null);
    assert.equal(parsePackageSize(""), null);
    assert.equal(parsePackageSize(undefined), null);
  });
});

// ── Weights ───────────────────────────────────────────────────

describe("parseWeightKg", () => {
  test("reads weights written either way round", () => {
    assert.equal(parseWeightKg("Cebula 0,262 kg"), 0.262);
    assert.equal(parseWeightKg("Ziemniaki (PL) 1,17 kg"), 1.17);
    assert.equal(parseWeightKg("Kapusta stożkowa luz (1,534 kg)"), 1.534);
    assert.equal(parseWeightKg("Marchew kg 0,216"), 0.216);
  });

  test("a whole-number gram size is not a weighing", () => {
    assert.equal(parseWeightKg("Ser gouda 400 g"), null);
    assert.equal(parseWeightKg("Kiełbasa kasztelańska"), null);
  });
});

// ── One line → one comparable number ──────────────────────────

describe("observationFrom", () => {
  test("a multipack is divided down to one item", () => {
    // 20,97 for three bottles is 6,99 a bottle, not 20,97 — and the size
    // recorded is ONE bottle's, matching the price it sits next to.
    const o = observationFrom({ description: "Coca-Cola Zero 1,75 l x3", amount: 20.97 }, "2026-09-01");
    assert.deepEqual(o, { d: "2026-09-01", a: 6.99, u: "szt", z: 1750, zu: "ml", t: "Coca-Cola Zero 1,75 l x3" });
  });

  test("keeps the receipt line's own words, so a median shows what it is made of", () => {
    // The point: seeing that "Piwo" is Warka in one shop and Harnaś in
    // another, instead of trusting a number built from both.
    const o = observationFrom({ description: "Piwo Warka Jasne", amount: 20.94, packCount: 4 }, "2026-09-01", "Lidl", "tx_fam_202609_1_0");
    assert.equal(o.t, "Piwo Warka Jasne");
    assert.equal(o.s, "Lidl");
    assert.equal(o.x, "tx_fam_202609_1_0");
  });

  test("a long description is trimmed, not dropped", () => {
    const long = "Pampers Premium Care Pants Pieluchomajtki, rozmiar 3, 6kg-11kg, 3x70 szt";
    const o = observationFrom({ description: long, amount: 189.99 }, "2026-09-01");
    assert.equal(o.t.length, 60);
    assert.ok(long.startsWith(o.t));
  });

  test("no transaction id → no id field", () => {
    const o = observationFrom({ description: "Kefir 400g", amount: 2.29 }, "2026-09-01");
    assert.equal("x" in o, false);
  });

  test("records the package size, so a price says what it buys", () => {
    const o = observationFrom({ description: "Kefir Activia 280 g", amount: 5.6 }, "2026-09-01");
    assert.equal(o.z, 280);
    assert.equal(o.zu, "g");
  });

  test("the AI's structured size outranks the text", () => {
    const o = observationFrom(
      { description: "Chleb pasterski 700 g", amount: 6.25, product: { size: 350, unit: "g" } },
      "2026-09-01",
    );
    assert.equal(o.z, 350);
  });

  test("no size in the text means no size field, not a guess", () => {
    const o = observationFrom({ description: "Kiełbasa kasztelańska", amount: 12.57 }, "2026-09-01");
    assert.equal("z" in o, false);
  });

  test("a weighed line becomes a price per kilo", () => {
    const o = observationFrom({ description: "Cebula 0,262 kg", amount: 1.81 }, "2026-09-01");
    assert.equal(o.u, "kg");
    assert.equal(o.a, 6.91);
  });

  test("the AI's pack count outranks anything parsed from the text", () => {
    const o = observationFrom(
      { description: "Żubr puszka 0,5 l x4", amount: 17.56, product: { packCount: 4 } },
      "2026-09-01",
    );
    assert.equal(o.a, 4.39);
  });

  test("the line's own packCount wins — it is the one that reads the quantity column", () => {
    // A receipt printing "4 * 5,235" says nothing in the description, so
    // this is the ONLY source that can get the price right. Ranking it
    // below the others would have made the whole rule-27 chain pointless.
    const o = observationFrom(
      { description: "Piwo Warka Jasne", amount: 20.94, packCount: 4 },
      "2026-09-01",
    );
    assert.equal(o.a, 5.24);
  });

  test("falls back to the description when nothing structured is there", () => {
    // Every receipt scanned before rule 27 existed looks like this.
    const o = observationFrom({ description: "Coca-Cola Zero 1,75 l x3", amount: 20.97 }, "2026-09-01");
    assert.equal(o.a, 6.99);
  });

  test("a weighed line ignores pack counts entirely", () => {
    const o = observationFrom(
      { description: "Szynka wieprzowa (ważona) 0,238 kg", amount: 13.07, packCount: 2 },
      "2026-09-01",
    );
    assert.equal(o.u, "kg");
    assert.equal(o.a, 54.92);
  });

  test("records where the purchase happened, when known", () => {
    const o = observationFrom({ description: "Kefir 400g", amount: 2.29 }, "2026-09-01", "Biedronka");
    assert.equal(o.s, "Biedronka");
  });

  test("an unknown shop adds no field at all", () => {
    // These live in a document read on every panel open; an empty "s"
    // on every observation would be bytes spent on saying nothing.
    const o = observationFrom({ description: "Kefir 400g", amount: 2.29 }, "2026-09-01", null);
    assert.equal("s" in o, false);
  });

  test("a line with no usable amount yields nothing", () => {
    assert.equal(observationFrom({ description: "Kaucja za opakowania", amount: 0 }, "2026-09-01"), null);
    assert.equal(observationFrom({ description: "x", amount: null }, "2026-09-01"), null);
  });
});

// ── Statistics ────────────────────────────────────────────────

describe("median", () => {
  test("one promotion does not move it, and would have moved an average", () => {
    const prices = [12.99, 12.99, 6.99, 13.49, 12.99];
    assert.equal(median(prices), 12.99);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    assert.ok(mean < 12);   // 11,89 — the number we are deliberately not showing
  });

  test("an even count averages the two middles", () => {
    assert.equal(median([10, 12, 14, 16]), 13);
  });
});

describe("pruneObservations", () => {
  test("drops anything older than the window", () => {
    const kept = pruneObservations([
      { d: daysAgo(10), a: 5, u: "szt" },
      { d: daysAgo(200), a: 3, u: "szt" },
    ], TODAY);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].a, 5);
  });

  test("keeps the newest few, newest first", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ d: daysAgo(i), a: i, u: "szt" }));
    const kept = pruneObservations(many, TODAY);
    assert.equal(kept.length, MAX_OBSERVATIONS);
    assert.equal(kept[0].a, 0);          // today's
    assert.ok(kept.every(o => o.a < MAX_OBSERVATIONS));
  });

  test("missing or malformed input is not an error", () => {
    assert.deepEqual(pruneObservations(undefined, TODAY), []);
    assert.deepEqual(pruneObservations([null, { d: daysAgo(1) }], TODAY), []);
  });
});

// ── What the row shows ────────────────────────────────────────

describe("summarize", () => {
  const obs = (...prices) => prices.map((a, i) => ({ d: daysAgo(i * 7), a, u: "szt" }));

  test("reports the typical price and the last one separately", () => {
    const s = summarize(obs(6.99, 12.99, 12.99, 13.49), TODAY);
    assert.equal(s.median, 12.99);
    assert.equal(s.last, 6.99);      // the promotion is still visible
    assert.equal(s.unit, "szt");
    assert.equal(s.count, 4);
  });

  test("below three observations there is no 'usually' to report", () => {
    const s = summarize(obs(12.99, 6.99), TODAY);
    assert.equal(s.median, null);
    assert.equal(s.last, 12.99);
    assert.ok(MIN_FOR_MEDIAN === 3);
  });

  test("kilograms and pieces are never averaged together", () => {
    const mixed = [
      { d: daysAgo(1), a: 6.9,  u: "kg" },
      { d: daysAgo(8), a: 7.2,  u: "kg" },
      { d: daysAgo(15), a: 7.0, u: "kg" },
      { d: daysAgo(22), a: 1.8, u: "szt" },
    ];
    const s = summarize(mixed, TODAY);
    assert.equal(s.unit, "kg");
    assert.equal(s.count, 3);
    assert.equal(s.median, 7.0);
  });

  test("nothing recorded yet → nothing shown", () => {
    assert.equal(summarize([], TODAY), null);
    assert.equal(summarize(undefined, TODAY), null);
  });
});

// ── Accumulating over time ────────────────────────────────────

// ── Prices seen on a shelf ────────────────────────────────────

describe("seenObservation", () => {
  test("a price without a shop says nothing and is refused", () => {
    // "22,99" alone answers no question; "22,99 w Biedronce" does.
    assert.equal(seenObservation({ amount: 22.99, shop: "", date: daysAgo(0) }), null);
    assert.equal(seenObservation({ amount: 22.99, shop: "   ", date: daysAgo(0) }), null);
  });

  test("a nonsense amount is refused", () => {
    assert.equal(seenObservation({ amount: 0, shop: "Lidl", date: daysAgo(0) }), null);
    assert.equal(seenObservation({ amount: -5, shop: "Lidl", date: daysAgo(0) }), null);
    assert.equal(seenObservation({ amount: "abc", shop: "Lidl", date: daysAgo(0) }), null);
  });

  test("keeps price, shop and date", () => {
    const o = seenObservation({ amount: 22.999, shop: "  Biedronka  ", date: "2026-09-17" });
    assert.deepEqual(o, { d: "2026-09-17", a: 23, s: "Biedronka" });
  });

  test("keeps the condition a price came with", () => {
    // Without it, 64,99 remembered on its own sends you back for one pack
    // at 89,89 a week later.
    const o = seenObservation({ amount: 64.99, shop: "Biedronka", date: "2026-09-17", note: "przy zakupie 2" });
    assert.equal(o.n, "przy zakupie 2");
  });

  test("no condition → no field", () => {
    const o = seenObservation({ amount: 22.99, shop: "Lidl", date: "2026-09-17", note: "  " });
    assert.equal("n" in o, false);
  });

  test("keeps the package size in the same shape as a receipt observation", () => {
    const o = seenObservation({ amount: 5.49, shop: "Auchan", date: "2026-09-17", size: 250, sizeUnit: "g" });
    assert.equal(o.z, 250);
    assert.equal(o.zu, "g");
  });

  test("a senseless size is dropped, the price is still kept", () => {
    // The price is what someone stood at the shelf to write down.
    for (const bad of [{ size: 0, sizeUnit: "g" }, { size: 500, sizeUnit: "kg" }, { size: 500 }, { sizeUnit: "g" }]) {
      const o = seenObservation({ amount: 5.49, shop: "Auchan", date: "2026-09-17", ...bad });
      assert.equal(o.a, 5.49);
      assert.equal("z" in o, false);
      assert.equal("zu" in o, false);
    }
  });
});

describe("addSeenObservation", () => {
  const seen = (shop, a, ago) => ({ d: daysAgo(ago), a, s: shop });

  test("one price per shop — a newer look replaces the older one", () => {
    let list = [];
    list = addSeenObservation(list, seen("Biedronka", 22.99, 7), TODAY);
    list = addSeenObservation(list, seen("Lidl", 24.99, 3), TODAY);
    list = addSeenObservation(list, seen("biedronka", 21.49, 0), TODAY);   // same shop, other case

    assert.equal(list.length, 2);
    assert.equal(list.find(o => o.s.toLowerCase() === "biedronka").a, 21.49);
  });

  test("two offers in one shop coexist when their conditions differ", () => {
    // The case that makes the condition part of the key: Biedronka quotes
    // 64,99 for two and 89,89 for one, and both are true at once.
    let list = [];
    list = addSeenObservation(list, { d: daysAgo(0), a: 89.89, s: "Biedronka" }, TODAY);
    list = addSeenObservation(list, { d: daysAgo(0), a: 64.99, s: "Biedronka", n: "przy zakupie 2" }, TODAY);

    assert.equal(list.length, 2);
    assert.equal(cheapestSeen(list, TODAY).a, 64.99);
  });

  test("the same offer noted again still replaces itself", () => {
    let list = [];
    list = addSeenObservation(list, { d: daysAgo(7), a: 64.99, s: "Biedronka", n: "przy zakupie 2" }, TODAY);
    list = addSeenObservation(list, { d: daysAgo(0), a: 61.99, s: "biedronka", n: "Przy zakupie 2" }, TODAY);

    assert.equal(list.length, 1);
    assert.equal(list[0].a, 61.99);
  });

  test("two package sizes in one shop are two offers", () => {
    let list = [];
    list = addSeenObservation(list, { d: daysAgo(0), a: 4.49, s: "Lidl", z: 200, zu: "g" }, TODAY);
    list = addSeenObservation(list, { d: daysAgo(0), a: 5.49, s: "Lidl", z: 250, zu: "g" }, TODAY);
    assert.equal(list.length, 2);
  });

  test("forgets what a shop said more than 90 days ago", () => {
    const list = addSeenObservation([seen("Lidl", 24.99, 200)], null, TODAY);
    assert.deepEqual(list, []);
  });

  test("caps the board at a sane number of shops", () => {
    let list = [];
    for (let i = 0; i < MAX_SEEN + 4; i++) {
      list = addSeenObservation(list, seen(`Sklep ${i}`, 10 + i, i), TODAY);
    }
    assert.equal(list.length, MAX_SEEN);
  });
});

describe("cheapestSeen", () => {
  test("finds the lowest price still inside the window", () => {
    const list = [
      { d: daysAgo(1), a: 24.99, s: "Lidl" },
      { d: daysAgo(2), a: 21.49, s: "Biedronka" },
      { d: daysAgo(3), a: 23.00, s: "Auchan" },
    ];
    assert.equal(cheapestSeen(list, TODAY).s, "Biedronka");
  });

  test("an expired bargain is not the cheapest", () => {
    const list = [
      { d: daysAgo(1),   a: 24.99, s: "Lidl" },
      { d: daysAgo(200), a: 9.99,  s: "Stara Promocja" },
    ];
    assert.equal(cheapestSeen(list, TODAY).s, "Lidl");
  });

  test("per kilogram when every offer has a size in the same unit", () => {
    // 5,49 for 250 g is 21,96 zł/kg; 4,49 for 200 g is 22,45 zł/kg.
    const list = [
      { d: daysAgo(1), a: 4.49, s: "Lidl",   z: 200, zu: "g" },
      { d: daysAgo(1), a: 5.49, s: "Auchan", z: 250, zu: "g" },
    ];
    assert.equal(cheapestSeen(list, TODAY).s, "Auchan");
  });

  test("by amount once one offer has no size, or the units differ", () => {
    const unsized = [
      { d: daysAgo(1), a: 4.49, s: "Lidl" },
      { d: daysAgo(1), a: 5.49, s: "Auchan", z: 250, zu: "g" },
    ];
    assert.equal(cheapestSeen(unsized, TODAY).s, "Lidl");

    const mixed = [
      { d: daysAgo(1), a: 4.49, s: "Lidl",   z: 200, zu: "g" },
      { d: daysAgo(1), a: 5.49, s: "Auchan", z: 2,   zu: "szt" },
    ];
    assert.equal(cheapestSeen(mixed, TODAY).s, "Lidl");
  });

  test("nothing seen → nothing to report", () => {
    assert.equal(cheapestSeen([], TODAY), null);
    assert.equal(cheapestSeen(undefined, TODAY), null);
  });
});

describe("addObservation", () => {
  test("a new purchase lands at the front and the oldest falls off", () => {
    let list = [];
    for (let i = MAX_OBSERVATIONS + 2; i >= 0; i--) {
      list = addObservation(list, { d: daysAgo(i), a: i, u: "szt" }, TODAY);
    }
    assert.equal(list.length, MAX_OBSERVATIONS);
    assert.equal(list[0].d, daysAgo(0));
  });

  test("nothing to record leaves the list alone (but still pruned)", () => {
    const list = [{ d: daysAgo(2), a: 5, u: "szt" }];
    assert.deepEqual(addObservation(list, null, TODAY), list);
  });
});
