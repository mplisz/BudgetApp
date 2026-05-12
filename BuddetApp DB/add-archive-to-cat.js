// ============================================================
// File: backend/patchDb.js
// Skrypt jednorazowy do aktualizacji schematu bazy
// ============================================================
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Dla lokalnego emulatora

const { categoriesContainer } = require('./cosmos');

async function fixArchivedFlag() {
  try {
    console.log("Rozpoczynam skanowanie bazy...");
    
    // Pobierz wszystkie elementy użytkownika family
    const { resources: items } = await categoriesContainer.items
      .query("SELECT * FROM c WHERE c.userId = 'family'")
      .fetchAll();

    let updatedCount = 0;

    for (const item of items) {
      // Jeśli dokument nie ma zdefiniowanego pola isArchived
      if (item.isArchived === undefined) {
        // Dopisujemy flagę
        item.isArchived = false;
        
        // Zapisujemy nadpisany dokument z powrotem do bazy
        // Cosmos DB wymaga podania ID oraz Partition Key (u nas userId)
        await categoriesContainer.item(item.id, item.userId).replace(item);
        updatedCount++;
        console.log(`Zaktualizowano: ${item.name} (${item.id})`);
      }
    }

    console.log(`✅ Sukces! Dodano flagę isArchived do ${updatedCount} dokumentów.`);
  } catch (error) {
    console.error("❌ Błąd podczas aktualizacji:", error);
  }
}

fixArchivedFlag();