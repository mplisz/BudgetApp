// ============================================================
// File: backend/scripts/create-shopping-container.js
// Creates the ShoppingList container against whatever COSMOS_ENDPOINT
// in backend/.env points at — the local emulator or the real account.
//
// WHY THIS EXISTS instead of "just click New Container":
//   - the Portal dialog has no TTL field, so the container would come up
//     without it and every ticked-off item would live forever,
//   - it takes no keys on the command line and leaves none in shell
//     history — .env is already the one place they live,
//   - createIfNotExists is idempotent, so re-running it is a no-op and
//     the same command works for every environment.
//
// HOW TO RUN (from the repo root):
//   node backend/scripts/create-shopping-container.js
//
// Point it at production by running it with that environment's .env
// (or COSMOS_* exported in the shell). It NEVER deletes or overwrites:
// an existing container is reported and left exactly as it is, TTL
// included — fix that one in the Portal if it was created by hand.
// ============================================================

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { CosmosClient } = require("@azure/cosmos");

const CONTAINER = {
  id: "ShoppingList",
  partitionKey: { paths: ["/userId"] },
  // -1 = TTL enabled, nothing expires unless the document says so. Open
  // items live forever; a bought/skipped one sets its own 30-day ttl in
  // routes/shopping.js.
  defaultTtl: -1,
};

async function main() {
  const endpoint   = process.env.COSMOS_ENDPOINT;
  const key        = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE;

  if (!endpoint || !key || !databaseId) {
    console.error("❌ Missing COSMOS_ENDPOINT / COSMOS_KEY / COSMOS_DATABASE (backend/.env).");
    process.exit(1);
  }

  // The emulator's self-signed certificate, same rule as cosmos.js: only
  // ever relaxed for an explicit local run.
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.warn("⚠️  Local endpoint — TLS verification disabled for this script run.");
  }

  console.log(`🔗 ${endpoint} → database "${databaseId}"`);

  const database = new CosmosClient({ endpoint, key }).database(databaseId);

  const existing = await database.containers
    .query({
      query: "SELECT * FROM root r WHERE r.id = @id",
      parameters: [{ name: "@id", value: CONTAINER.id }],
    })
    .fetchAll();

  if (existing.resources.length > 0) {
    const { defaultTtl } = existing.resources[0];
    console.log(`ℹ️  Container "${CONTAINER.id}" already exists — nothing created.`);
    console.log(defaultTtl === -1
      ? "✅ TTL is on with no default — correct."
      : `⚠️  defaultTtl is ${defaultTtl ?? "off"}; it should be -1 (Portal → Settings → Time to Live → On, no default).`);
    return;
  }

  await database.containers.createIfNotExists(CONTAINER);
  console.log(`✅ Container "${CONTAINER.id}" created (PK /userId, TTL on, no default).`);
  console.log("   Throughput: inherited from the database's shared autoscale — no dedicated RU/s.");
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
