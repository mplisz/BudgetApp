// ============================================================
// File: BuddetApp DB/seed-tags.js
// Run: node seed-tags.js
// ============================================================

const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key      = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const container = client.database("BudgetDB").container("Tags");

const FAMILY_ID = "MMs";

const tags = [
  { id: `tag_uslugi_${FAMILY_ID}`,        userId: FAMILY_ID, name: "Usługi",                       icon: "🏢", isArchived: false },
  { id: `tag_dzieci_${FAMILY_ID}`,         userId: FAMILY_ID, name: "Dzieci",                        icon: "👶", isArchived: false },
  { id: `tag_ubezpieczenia_${FAMILY_ID}`,  userId: FAMILY_ID, name: "Ubezpieczenia",                 icon: "🛡️", isArchived: false },
  { id: `tag_luksus_${FAMILY_ID}`,         userId: FAMILY_ID, name: "Luksus",                        icon: "🍷", isArchived: false },
  { id: `tag_raty_${FAMILY_ID}`,           userId: FAMILY_ID, name: "Raty",                          icon: "💳", isArchived: false },
  { id: `tag_bezpieczenstwo_${FAMILY_ID}`, userId: FAMILY_ID, name: "Bezpieczeństwo",                icon: "🔒", isArchived: false },
  { id: `tag_samochod_${FAMILY_ID}`,       userId: FAMILY_ID, name: "Samochód",                      icon: "🚗", isArchived: false },
  { id: `tag_alkohol_${FAMILY_ID}`,        userId: FAMILY_ID, name: "Alkohol",                       icon: "🍺", isArchived: false },
  { id: `tag_fundusz_rem_${FAMILY_ID}`,    userId: FAMILY_ID, name: "Fundusz remontowo-mieszkaniowy", icon: "🏠", isArchived: false },
  { id: `tag_fundusz_wak_${FAMILY_ID}`,    userId: FAMILY_ID, name: "Fundusz wakacyjny",              icon: "✈️", isArchived: false },
];

async function seed() {
  console.log(`🚀 Seeding ${tags.length} tags for family '${FAMILY_ID}'...`);
  let ok = 0, fail = 0;
  for (const tag of tags) {
    try {
      await container.items.upsert(tag);
      console.log(`✅ ${tag.icon} ${tag.name}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${tag.name} — ${err.message}`);
      fail++;
    }
  }
  console.log(`\n✨ Done! ${ok} upserted, ${fail} failed.`);
}

seed();