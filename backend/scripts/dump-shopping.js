// ============================================================
// File: backend/scripts/dump-shopping.js
// READ-ONLY diagnostic dump of the ShoppingList container.
//
// Prints every item with the fields that decide which section of the
// panel it lands in (status, missedAt) and whether it is scheduled to
// disappear (ttl) — the things a screenshot cannot tell us apart.
//
// HOW TO RUN (from the repo root):
//   node backend/scripts/dump-shopping.js
//
// Writes nothing, deletes nothing. Uses backend/.env, same as the app.
// ============================================================

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { CosmosClient } = require("@azure/cosmos");

function ttlLabel(ttl) {
  if (ttl === undefined || ttl === null) return "brak (nie wygasa)";
  if (ttl === -1) return "-1 (nie wygasa)";
  return `${ttl}s ≈ ${(ttl / 86400).toFixed(1)} dni`;
}

async function main() {
  const endpoint   = process.env.COSMOS_ENDPOINT;
  const key        = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE;

  if (!endpoint || !key || !databaseId) {
    console.error("❌ Missing COSMOS_ENDPOINT / COSMOS_KEY / COSMOS_DATABASE (backend/.env).");
    process.exit(1);
  }
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  console.log(`🔗 ${endpoint} → ${databaseId}\n`);

  const database  = new CosmosClient({ endpoint, key }).database(databaseId);
  const container = database.container("ShoppingList");

  // Container-level TTL setting — the difference between "only ticked-off
  // items expire" and "everything expires".
  const { resource: def } = await container.read();
  console.log(`Kontener defaultTtl: ${def.defaultTtl === -1 ? "-1 ✅ (TTL on, brak domyślnej)" : def.defaultTtl ?? "wyłączony ⚠️"}\n`);

  const { resources } = await container.items
    .query("SELECT * FROM c WHERE c.type = 'SHOPPING_ITEM' ORDER BY c.addedAt DESC")
    .fetchAll();

  if (resources.length === 0) {
    console.log("(kontener pusty)");
    return;
  }

  for (const it of resources) {
    console.log(`• ${it.name}  (qty ${it.qty})`);
    console.log(`    id:         ${it.id}`);
    console.log(`    key:        ${JSON.stringify(it.key)}`);
    console.log(`    status:     ${it.status}${it.missedAt ? "  + missedAt " + it.missedAt : ""}`);
    console.log(`    ttl:        ${ttlLabel(it.ttl)}`);
    console.log(`    added:      ${it.addedAt} (${it.addedBy ?? "?"})`);
    if (it.resolvedAt) console.log(`    resolved:   ${it.resolvedAt} (${it.resolvedBy ?? "?"})`);
    console.log();
  }

  const byStatus = resources.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {});
  console.log(`Razem: ${resources.length} —`, byStatus);

  // The catalog that feeds the "Najczęstsze" pills lives elsewhere (one
  // Settings doc), and an empty one is the other thing worth ruling out.
  const familyIds = [...new Set(resources.map(i => i.userId))];
  for (const familyId of familyIds) {
    const id = `shopping_catalog_${familyId}`;
    try {
      const { resource } = await database.container("Settings").item(id, familyId).read();
      const items = resource?.items ?? [];
      console.log(`\nKatalog podpowiedzi (${id}): ${items.length} pozycji`);
      // `section: —` means nobody corrected this product, so the keyword
      // dictionary in utils/shoppingSections.js still decides its aisle.
      // Anything else is a remembered choice that outranks the dictionary.
      for (const e of items) {
        console.log(`    ${(e.name ?? "?").padEnd(24)} sekcja: ${(e.section ?? "— (ze słownika)").padEnd(18)} count ${e.count}, last ${e.lastUsedAt}`);
      }
    } catch {
      console.log(`\nKatalog podpowiedzi (${id}): BRAK DOKUMENTU ⚠️  (zapis katalogu nie przechodzi)`);
    }
  }
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
