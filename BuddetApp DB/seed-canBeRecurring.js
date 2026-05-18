// ============================================================
// File: BuddetApp DB/seed-canBeRecurring.js
// Sets canBeRecurring: true for subcategories that make sense
// as recurring expenses (subscriptions, bills, rent, etc.)
// Run: node seed-canBeRecurring.js
// ============================================================

const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key      = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const container = client.database("BudgetDB").container("Categories");

const FAMILY_ID = "MMs";

// Subcategory IDs that make sense as recurring expenses
// Logic: subscriptions, bills, rent, insurance, loans, memberships
const RECURRING_SUBCATEGORY_IDS = new Set([
  // Dom
  "cat_root_dom_czynsz_MMs",
  "cat_root_dom_prad_MMs",
  "cat_root_dom_gaz_MMs",
  "cat_root_dom_woda_MMs",
  "cat_root_dom_internet_MMs",
  "cat_root_dom_telefon_MMs",
  "cat_root_dom_ubezpieczenie_MMs",

  // Transport
  "cat_root_transport_ubezpieczenie_oc_MMs",
  "cat_root_transport_leasing_MMs",
  "cat_root_transport_abonament_MMs",

  // Rozrywka
  "cat_root_rozrywka_streaming_MMs",
  "cat_root_rozrywka_muzyka_MMs",
  "cat_root_rozrywka_gry_MMs",

  // Zdrowie
  "cat_root_zdrowie_abonament_MMs",
  "cat_root_zdrowie_siłownia_MMs",
  "cat_root_zdrowie_suplementy_MMs",

  // Edukacja
  "cat_root_edukacja_kurs_MMs",
  "cat_root_edukacja_italki_MMs",
  "cat_root_edukacja_szkolenia_MMs",
  "cat_root_edukacja_ksiazki_sub_MMs",

  // Różne / subskrypcje
  "cat_root_rozne_subskrypcje_MMs",
  "cat_root_rozne_bankowe_MMs",

  // Zobowiązania
  "cat_root_zobowiazania_hipoteka_MMs",
  "cat_root_zobowiazania_rata_MMs",
  "cat_root_zobowiazania_czynsz_MMs",
  "cat_root_zobowiazania_ubezpieczenie_MMs",
]);

async function seed() {
  console.log(`🚀 Setting canBeRecurring on subcategories for family '${FAMILY_ID}'...`);

  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @userId AND IS_DEFINED(c.parentCategoryId) AND c.parentCategoryId != null",
      parameters: [{ name: "@userId", value: FAMILY_ID }],
    })
    .fetchAll();

  console.log(`Found ${resources.length} subcategories`);

  let updated = 0, skipped = 0;

  for (const sub of resources) {
    const shouldBeRecurring = RECURRING_SUBCATEGORY_IDS.has(sub.id);
    const currentValue      = sub.canBeRecurring ?? false;

    if (shouldBeRecurring === currentValue) { skipped++; continue; }

    await container.items.upsert({ ...sub, canBeRecurring: shouldBeRecurring });
    console.log(`${shouldBeRecurring ? "✅" : "⬜"} ${sub.name} (${sub.id})`);
    updated++;
  }

  console.log(`\n✨ Done! ${updated} updated, ${skipped} unchanged.`);
  console.log(`\nNote: If subcategory IDs don't match, set canBeRecurring manually`);
  console.log(`via Settings → Categories → toggle the 🔄 button on each subcategory.`);
}

seed().catch(console.error);
