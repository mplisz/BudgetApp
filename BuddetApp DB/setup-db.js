const { CosmosClient } = require("@azure/cosmos");

// Default credentials for the local Azure Cosmos DB Emulator
const endpoint = "https://localhost:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

// Disable SSL certificate check for local emulator (Self-signed cert)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new CosmosClient({ endpoint, key });

const databaseDefinition = { id: "BudgetDB" };

// Containers configuration based on our refined schema
const containers = [
    { id: "Categories", partitionKey: "/userId" },
    //{ id: "Subcategories", partitionKey: "/categoryId" },
    { id: "Tags", partitionKey: "/userId" },
    { id: "Limits", partitionKey: "/targetId" },
    { id: "RecurringTransactions", partitionKey: "/userId" },
    { id: "Transactions", partitionKey: "/userId" },
    { id: "Goals",partitionKey:"/userId"},
   // { id: "Users",partitionKey:"/userId"},
    { id: "RefreshTokens",partitionKey:"/email"},
    {id: "Settings",partitionKey:"/userId"},
    { id: "Months",partitionKey: "/userId" },
    { id: "Vouchers",partitionKey: "/userId" },
];
async function setup() {
    console.log("🚀 Starting database setup...");

    try {
        // 1. Create Database
        const { database } = await client.databases.createIfNotExists(databaseDefinition);
        console.log(`✅ Database '${database.id}' is ready.`);

        // 2. Create Containers
        for (const containerDef of containers) {
            await database.containers.createIfNotExists({
                id: containerDef.id,
                partitionKey: { paths: [containerDef.partitionKey] }
            });
            console.log(`✅ Container '${containerDef.id}' (PK: ${containerDef.partitionKey}) is ready.`);
        }

        console.log("\n✨ All containers have been successfully initialized!");
        console.log("You can now view them at: https://localhost:8081/_explorer/index.html");

    } catch (error) {
        console.error("❌ Error setting up database:", error.message);
    }
}

setup();