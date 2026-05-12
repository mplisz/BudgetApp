const { CosmosClient } = require("@azure/cosmos");

// Connection details for local Azure Cosmos DB Emulator
const endpoint = "https://localhost:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new CosmosClient({ endpoint, key });
const databaseId = "BudgetDB";
const containerId = "Categories";

const FAMILY_ID = "MMs"; 
const data = [
  // --- MAIN CATEGORIES (PARENTS) ---
  { "id": "cat_zakupy", "userId": FAMILY_ID, "name": "Zakupy codzienne", "icon": "🛒", "parentCategoryId": null, "isArchived": false},
  { "id": "cat_dom", "userId": FAMILY_ID, "name": "Dom", "icon": "🏠", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_zobowiazania", "userId": FAMILY_ID, "name": "Zobowiązania", "icon": "⚖️", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_transport", "userId": FAMILY_ID, "name": "Transport", "icon": "🚗", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_zdrowie", "userId": FAMILY_ID, "name": "Zdrowie", "icon": "💊", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_restauracje", "userId": FAMILY_ID, "name": "Restauracje", "icon": "🍽️", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_rozrywka", "userId": FAMILY_ID, "name": "Rozrywka", "icon": "🎭", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_edukacja", "userId": FAMILY_ID, "name": "Edukacja", "icon": "📚", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_finanse", "userId": FAMILY_ID, "name": "Finanse", "icon": "💰", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_uslugi", "userId": FAMILY_ID, "name": "Usługi", "icon": "🔧", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_prezenty", "userId": FAMILY_ID, "name": "Prezenty", "icon": "🎁", "parentCategoryId": null, "isArchived": false },
  { "id": "cat_inne", "userId": FAMILY_ID, "name": "Inne i Niespodziewane", "icon": "📦", "parentCategoryId": null, "isArchived": false },

  // --- SUB-CATEGORIES ---

  // Finanse (Koszty vs Inwestycje)
  { "id": "sub_podatki", "userId": FAMILY_ID, "name": "Podatki", "parentCategoryId": "cat_finanse", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_prowizje", "userId": FAMILY_ID, "name": "Prowizje i opłaty bankowe", "parentCategoryId": "cat_finanse", "priority": 2, "type": "EXPENSE","isArchived": false },
  { "id": "sub_inne_zobowiazania_fin", "userId": FAMILY_ID, "name": "Inne zobowiązania finansowe", "parentCategoryId": "cat_finanse", "priority": 2, "type": "EXPENSE","isArchived": false },
  { "id": "sub_poduszka", "userId": FAMILY_ID, "name": "Poduszka bezpieczeństwa", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },
  { "id": "sub_emerytura", "userId": FAMILY_ID, "name": "Emerytura", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },
  { "id": "sub_inwestycje", "userId": FAMILY_ID, "name": "Inwestycje", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },
  { "id": "sub_gotowka_awaryjna", "userId": FAMILY_ID, "name": "Gotówka awaryjna", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },
  { "id": "sub_oszcz_krotkie", "userId": FAMILY_ID, "name": "Oszczędności krótkofalowe", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },
  { "id": "sub_zloto", "userId": FAMILY_ID, "name": "Złoto", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },
  { "id": "sub_obligacje", "userId": FAMILY_ID, "name": "Obligacje 12-letnie", "parentCategoryId": "cat_finanse", "priority": 4, "type": "INVESTMENT","isArchived": false },

  // Zakupy codzienne
  { "id": "sub_spozywcze", "userId": FAMILY_ID, "name": "Spożywcze", "parentCategoryId": "cat_zakupy", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_chemia", "userId": FAMILY_ID, "name": "Chemia", "parentCategoryId": "cat_zakupy", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_higiena", "userId": FAMILY_ID, "name": "Higiena", "parentCategoryId": "cat_zakupy", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_odziez", "userId": FAMILY_ID, "name": "Odzież i obuwie", "parentCategoryId": "cat_zakupy", "priority": 2, "type": "EXPENSE","isArchived": false },

  // Dom & Zobowiązania
  { "id": "sub_hipoteka", "userId": FAMILY_ID, "name": "Rata hipoteczna", "parentCategoryId": "cat_zobowiazania", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_czynsz", "userId": FAMILY_ID, "name": "Czynsz", "parentCategoryId": "cat_dom", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_prad", "userId": FAMILY_ID, "name": "Prąd", "parentCategoryId": "cat_dom", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_woda", "userId": FAMILY_ID, "name": "Woda", "parentCategoryId": "cat_dom", "priority": 1, "type": "EXPENSE","isArchived": false },
  
  // Zdrowie (Dla dziecka i rodziny)
  { "id": "sub_leki", "userId": FAMILY_ID, "name": "Lekarstwa", "parentCategoryId": "cat_zdrowie", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_lekarz", "userId": FAMILY_ID, "name": "Wizyty lekarskie", "parentCategoryId": "cat_zdrowie", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_dziecko_higiena", "userId": FAMILY_ID, "name": "Pielęgnacja dziecka", "parentCategoryId": "cat_zdrowie", "priority": 1, "type": "EXPENSE","isArchived": false },

  // Inne
  { "id": "sub_awarie", "userId": FAMILY_ID, "name": "Awarie i naprawy nagłe", "parentCategoryId": "cat_inne", "priority": 1, "type": "EXPENSE","isArchived": false },
  { "id": "sub_inne_zakupy", "userId": FAMILY_ID, "name": "Różne", "parentCategoryId": "cat_inne", "priority": 3, "type": "EXPENSE","isArchived": false }
];

async function seed() {
  console.log("🚀 Starting data UPSERT to 'Categories'...");
  try {
    const container = client.database(databaseId).container(containerId);
    for (const item of data) {
      await container.items.upsert(item);
      console.log(`✅ [${item.type}] ${item.name}`);
    }
    console.log("\n✨ Database updated successfully!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

seed();