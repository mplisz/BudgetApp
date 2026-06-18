// ============================================================
// File: BuddetApp DB/setup-db.js
// ZMIANA: Limits container PK zmieniony z /targetId na /userId
// ============================================================
const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new CosmosClient({ endpoint, key });

const databaseDefinition = { id: "BudgetDB" };

const containers = [
  { id: "Categories",            partitionKey: "/userId"  },
 // { id: "Tags",                  partitionKey: "/userId"  },
  { id: "Limits",                partitionKey: "/userId"  }, 
  { id: "Vouchers", partitionKey: "/userId"  },
  { id: "Transactions",          partitionKey: "/userId"  },
  { id: "PlannedExpenses",       partitionKey: "/userId"  },
  { id: "RefreshTokens",         partitionKey: "/email"   },
  { id: "Settings",              partitionKey: "/userId"  },
  { id: "Months",                partitionKey: "/userId"  },
  { id: "Tags",              partitionKey: "/userId"  },
  {id:  "Receipts",               partitionKey: "/userId" }
];

async function setup() {
  console.log("🚀 Starting database setup...");
  try {
    const { database } = await client.databases.createIfNotExists(databaseDefinition);
    console.log(`✅ Database '${database.id}' is ready.`);

    for (const containerDef of containers) {
      await database.containers.createIfNotExists({
        id: containerDef.id,
        partitionKey: { paths: [containerDef.partitionKey] },
      });
      console.log(`✅ Container '${containerDef.id}' (PK: ${containerDef.partitionKey}) is ready.`);
    }

    console.log("\n✨ All containers initialized!");
    console.log("Explorer: https://localhost:8081/_explorer/index.html");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

setup();