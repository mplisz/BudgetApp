const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new CosmosClient({ endpoint, key });
const databaseId = "BudgetDB";
const containerId = "Limits";

const limitsData = [
  // --- STAŁE LIMITY DOMYŚLNE (BASE) ---
  { "id": "lim_zakupy_base", "targetId": "cat_zakupy", "targetType": "CATEGORY", "limitType": "BASE", "amount": 2000, "period": "2026-01", "description": "Domyślny na zakupy" },
  { "id": "lim_dom_base", "targetId": "cat_dom", "targetType": "CATEGORY", "limitType": "BASE", "amount": 3500, "period": "2026-01", "description": "Domyślny na dom" },
  { "id": "lim_rozrywka_base", "targetId": "cat_rozrywka", "targetType": "CATEGORY", "limitType": "BASE", "amount": 300, "period": "2026-01" },

  // --- NADPISANIA MIESIĘCZNE (OVERRIDE) ---
  // Załóżmy, że w Maju planujesz większe zakupy spożywcze (np. komunia, grill)
  { "id": "lim_zakupy_may_2026", "targetId": "cat_zakupy", "targetType": "CATEGORY", "limitType": "OVERRIDE", "amount": 3200, "period": "2026-05", "description": "Majówka i zapasy" }
];

async function seedLimits() {
  console.log("🚀 Seeding Limits container...");
  try {
    const container = client.database(databaseId).container(containerId);
    for (const item of limitsData) {
      await container.items.upsert(item);
      console.log(`✅ Limit added: ${item.targetId} (${item.limitType}) -> ${item.amount} PLN`);
    }
    console.log("\n✨ Limits are ready!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

seedLimits();