// ============================================================
// File: backend/cosmos.js
// ============================================================
require('dotenv').config();

//Needed for emulator, to be deleted in PROD!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE;

// Connect with db
const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

// Export Container
const categoriesContainer = database.container("Categories");
const refreshTokensContainer = database.container("RefreshTokens");
const tagsContainer = database.container("Tags");
const settingsContainer = database.container("Settings");
module.exports = { categoriesContainer, refreshTokensContainer, tagsContainer, settingsContainer };

