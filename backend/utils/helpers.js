// ============================================================
// File: backend/utils/helpers.js
// ============================================================

// Slugifies text for use in document IDs
const generateId = (text) => {
  if (!text || typeof text !== 'string') return `${Date.now()}`;
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
};

/**
 * Safely reads a single document from a Cosmos DB container.
 *
 * Handles both production Azure (throws 404 error) and local emulator
 * (returns resource: undefined without throwing) transparently.
 *
 * @returns {object|null} The document, or null if not found.
 */
const readItem = async (container, id, partitionKey) => {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource ?? null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
};

module.exports = { generateId, readItem };