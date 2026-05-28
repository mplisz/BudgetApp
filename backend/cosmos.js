// ============================================================
// File: backend/cosmos.js
// ============================================================
require('dotenv').config();
// ── TLS verification: SAFE BY DEFAULT ─────────────────────────
//
// Local emulator (Cosmos DB Emulator) uses a self-signed cert that
// fails Node's default TLS verification. We disable it ONLY when
// NODE_ENV is *explicitly* set to "development" — any other value
// (including undefined, "test", "staging", or a typo) keeps TLS
// verification ON.
//
// Rationale: a missing or misconfigured NODE_ENV on the production
// server should NOT silently disable TLS for the entire process.
// Disabling verification globally would let any MITM attacker
// impersonate Cosmos DB / external APIs. Fail-safe = secure default.
//
// Previous version used `if (NODE_ENV !== 'production')`, which had
// the opposite default: missing env var = TLS off. That's a footgun.
const { isDevelopment } = require('./utils/helpers');
if (isDevelopment) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.warn("⚠️ [cosmos] TLS verification DISABLED — local emulator mode (NODE_ENV=development)");
}

const { CosmosClient } = require("@azure/cosmos");


const endpoint   = process.env.COSMOS_ENDPOINT;
const key        = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE;

if (!endpoint || !key || !databaseId) {
  console.error("❌ [cosmos] CRITICAL: Missing required env vars. Got:");
  console.error(`    COSMOS_ENDPOINT: ${endpoint ? "set" : "MISSING"}`);
  console.error(`    COSMOS_KEY:      ${key ? "set" : "MISSING"}`);
  console.error(`    COSMOS_DATABASE: ${databaseId ? "set" : "MISSING"}`);
  process.exit(1);
}

// Connect with db
const client   = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

// Export Containers
const categoriesContainer    = database.container("Categories");
const refreshTokensContainer = database.container("RefreshTokens");
const tagsContainer          = database.container("Tags");
const settingsContainer      = database.container("Settings");
const transactionsContainer  = database.container("Transactions");
const monthsContainer        = database.container("Months");
const vouchersContainer      = database.container("Vouchers");
const limitsContainer        = database.container("Limits");
const recurringContainer     = database.container("RecurringTransactions");
const plannedContainer       = database.container("PlannedExpenses");

module.exports = {
  categoriesContainer,
  refreshTokensContainer,
  tagsContainer,
  settingsContainer,
  transactionsContainer,
  monthsContainer,
  vouchersContainer,
  limitsContainer,
  recurringContainer,
  plannedContainer,
};