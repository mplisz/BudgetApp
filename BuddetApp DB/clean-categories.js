const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new CosmosClient({ endpoint, key });

async function cleanAndSeed() {
    const container = client.database("BudgetDB").container("Categories");
    
    console.log("💣 Czyszczenie kontenera...");
    // Pobieramy wszystko co ma stare ID
    const { resources: oldItems } = await container.items
        .query("SELECT * FROM c WHERE c.userId = 'family'")
        .fetchAll();

    for (const item of oldItems) {
        await container.item(item.id, item.userId).delete();
        console.log(`🗑️ Usunięto: ${item.name} (${item.userId})`);
    }

    console.log("\n🚀 Teraz odpal swój główny skrypt seed-data.js!");
}

cleanAndSeed();