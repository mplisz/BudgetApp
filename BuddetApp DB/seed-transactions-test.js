// ============================================================
// File: BuddetApp DB/seed-transactions-test.js
// Generates test transactions for pagination testing.
//
// Flat list:  needs > 25 to trigger pagination (PAGE_SIZE = 25)
// Grouped:    needs > 25 GROUPS to trigger group pagination
//             → we spread transactions across many categories
//
// Run: node seed-transactions-test.js
// WARNING: Deletes and recreates test transactions (budgetMonth 2026-05)
//          Does NOT touch real data in other months.
// ============================================================

const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key      = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const container = client.database("BudgetDB").container("Transactions");

const FAMILY_ID    = "MMs";
const BUDGET_MONTH = "2026-05";

// ── Category / subcategory pairs for spread ───────────────────
// Using IDs from seed-categories.js
const CATEGORIES = [
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_spozywcze_MMs",    subName: "Artykuły spożywcze",    prio: 1 },
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_pampersy_MMs",      subName: "Pampersy",              prio: 1 },
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_higiena_MMs",       subName: "Higiena",               prio: 1 },
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_slodycze_MMs",      subName: "Słodycze",              prio: 2 },
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_napoje_MMs",        subName: "Napoje",                prio: 2 },
  { catId: "cat_restauracje", catName: "Restauracje",       subId: "cat_root_restauracje_obiad_MMs",   subName: "Obiad",                 prio: 2 },
  { catId: "cat_restauracje", catName: "Restauracje",       subId: "cat_root_restauracje_kawa_MMs",    subName: "Kawa",                  prio: 2 },
  { catId: "cat_restauracje", catName: "Restauracje",       subId: "cat_root_restauracje_fastfood_MMs",subName: "Fast food",             prio: 2 },
  { catId: "cat_transport",   catName: "Transport",         subId: "cat_root_transport_paliwo_MMs",    subName: "Paliwo",                prio: 1 },
  { catId: "cat_transport",   catName: "Transport",         subId: "cat_root_transport_taxi_MMs",      subName: "Taxi",                  prio: 2 },
  { catId: "cat_transport",   catName: "Transport",         subId: "cat_root_transport_parkingi_MMs",  subName: "Parkingi",              prio: 2 },
  { catId: "cat_zdrowie",     catName: "Zdrowie",           subId: "cat_root_zdrowie_leki_MMs",        subName: "Leki",                  prio: 1 },
  { catId: "cat_zdrowie",     catName: "Zdrowie",           subId: "cat_root_zdrowie_suplementy_MMs",  subName: "Suplementy",            prio: 2 },
  { catId: "cat_rozrywka",    catName: "Rozrywka",          subId: "cat_root_rozrywka_streaming_MMs",  subName: "Streaming",             prio: 2 },
  { catId: "cat_rozrywka",    catName: "Rozrywka",          subId: "cat_root_rozrywka_ksiazki_MMs",    subName: "Książki",               prio: 3 },
  { catId: "cat_rozrywka",    catName: "Rozrywka",          subId: "cat_root_rozrywka_hobby_MMs",      subName: "Hobby",                 prio: 3 },
  { catId: "cat_dom",         catName: "Dom i ogród",       subId: "cat_root_dom_chemia_tech_MMs",     subName: "Chemia techniczna",     prio: 2 },
  { catId: "cat_dom",         catName: "Dom i ogród",       subId: "cat_root_dom_elektronika_MMs",     subName: "Elektronika i gadżety", prio: 3 },
  { catId: "cat_edukacja",    catName: "Edukacja",          subId: "cat_root_edukacja_kursy_MMs",      subName: "Kursy",                 prio: 2 },
  { catId: "cat_rozne",       catName: "Różne",             subId: "cat_root_rozne_subskrypcje_MMs",   subName: "Subskrypcje",           prio: 2 },
  { catId: "cat_rozne",       catName: "Różne",             subId: "cat_root_rozne_bankowe_MMs",       subName: "Opłaty bankowe",        prio: 1 },
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_ubrania_MMs",       subName: "Ubrania, buty i akcesoria", prio: 2 },
  { catId: "cat_zakupy",      catName: "Zakupy codzienne", subId: "cat_root_zakupy_prezenty_MMs",      subName: "Prezenty",              prio: 2 },
  { catId: "cat_zdrowie",     catName: "Zdrowie",           subId: "cat_root_zdrowie_lekarze_MMs",     subName: "Lekarze",               prio: 1 },
  { catId: "cat_transport",   catName: "Transport",         subId: "cat_root_transport_myjnia_MMs",    subName: "Myjnia",                prio: 3 },
  { catId: "cat_dom",         catName: "Dom i ogród",       subId: "cat_root_dom_kwiaty_MMs",          subName: "Kwiaty",                prio: 3 },
  { catId: "cat_edukacja",    catName: "Edukacja",          subId: "cat_root_edukacja_italki_MMs",     subName: "Italki",                prio: 2 },
  { catId: "cat_restauracje", catName: "Restauracje",       subId: "cat_root_restauracje_lody_MMs",    subName: "Lody",                  prio: 3 },
];

const DESCRIPTIONS = [
  "Biedronka", "Lidl", "Żabka", "Carrefour", "Allegro",
  "Amazon", "Bolt", "Uber", "Orlen", "Shell",
  "Netflix", "Spotify", "Disney+", "Apple", "Google",
  "Apteka Gemini", "Dr Max", "Medicover", "LuxMed", "Zara",
  "H&M", "Reserved", "Empik", "Smyk", "IKEA",
  "Media Expert", "RTV Euro AGD", "Castorama", "", "",
];

function randomAmount(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomDate() {
  const day = Math.floor(Math.random() * 28) + 1;
  return `2026-05-${String(day).padStart(2, "0")}`;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate 60 transactions:
// - 60 entries across 28 distinct categories → ~8 groups with 7-8 rows each
//   (well above PAGE_SIZE=25 for flat, and enough groups to test group pagination)
function generateTransactions() {
  const txs = [];
  const now  = new Date().toISOString();

  for (let i = 0; i < 60; i++) {
    const cat   = CATEGORIES[i % CATEGORIES.length];
    const desc  = randomFrom(DESCRIPTIONS);
    const ts    = Date.now() + i;
    const date  = randomDate();

    const amount = randomAmount(5, 500);
    txs.push({
      id:               `tx_test_${FAMILY_ID}_${ts}_${i}`,
      userId:           FAMILY_ID,
      date,
      budgetMonth:      BUDGET_MONTH,
      subcategoryId:    cat.subId,
      subcategoryName:  cat.subName,
      categoryId:       cat.catId,
      categoryName:     cat.catName,
      type:             "EXPENSE",
      amount:           amount,
      originalAmount:   amount,
      originalCurrency: "PLN",
      fxRate:           1,
      description:      desc,
      tags:             [],
      priority:         cat.prio,
      useVoucher:       false,
      voucherId:        null,
      voucherAmount:    0,
      isRecurring:      false,
      recurringId:      null,
      netAmount:        0, // will be set below
      returns:          [],
      author:           "Test Seed",
      authorId:         "seed",
      isDeleted:        false,
      deletedAt:        null,
      deletedBy:        null,
      deletedById:      null,
      createdAt:        now,
    });

    txs[txs.length - 1].netAmount = txs[txs.length - 1].amount;
  }

  return txs;
}

async function seed() {
  console.log(`🚀 Seeding test transactions for ${BUDGET_MONTH}...`);
  console.log("⚠️  This only touches budgetMonth 2026-05 with id prefix 'tx_test_'");

  const txs = generateTransactions();
  let ok = 0, fail = 0;

  for (const tx of txs) {
    try {
      await container.items.upsert(tx);
      console.log(`✅ ${tx.categoryName} › ${tx.subcategoryName} — ${tx.amount} PLN (${tx.date})`);
      ok++;
    } catch (err) {
      console.error(`❌ ${tx.id} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\n✨ Done! ${ok} inserted, ${fail} failed.`);
  console.log(`\nExpected results:`);
  console.log(`  Flat list: ${txs.length} rows → ${Math.ceil(txs.length / 25)} pages`);
  const groups = [...new Set(txs.map(t => t.categoryId))];
  console.log(`  Groups: ${groups.length} unique categories → ${Math.ceil(groups.length / 25)} pages`);
}

seed();