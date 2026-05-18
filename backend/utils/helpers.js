// ============================================================
// File: backend/utils/helpers.js
// ============================================================

// ── Shared validators ─────────────────────────────────────────
/**
 * Syncs usedInTransactions on a voucher document.
 *
 * Rebuilds the array from scratch based on the provided operation:
 *   "add"    — append a new usage entry
 *   "remove" — remove all entries for a given transactionId
 *   "update" — replace the amount for a given transactionId
 *
 * Returns the updated voucher document, or null if voucher not found.
 *
 * ⚠️  KNOWN RACE CONDITION:
 * This function performs a read → modify → write without optimistic locking (etag).
 * If two requests concurrently call syncVoucherUsage for the same voucher
 * (e.g. two family members adding transactions with the same voucher at the same time),
 * the last write wins and the first write's usedInTransactions entry may be lost.
 *
 * Why not fixed: Adding etag here would require a retry loop (re-read → re-apply op → re-write
 * on 412), which adds significant complexity for a very unlikely scenario in a family budget app
 * (two people, same voucher, same second). Accepted trade-off.
 *
 * If this becomes a problem, the fix is:
 *   1. Read with etag: const { resource, etag } = await container.item(id, pk).read()
 *   2. Apply operation
 *   3. Upsert with If-Match: container.items.upsert(updated, { accessCondition: { type: "IfMatch", condition: etag } })
 *   4. Catch 412 and retry from step 1 (max 3 retries)
**/





const { z } = require('zod');
const IdParamSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid ID format");
const BudgetMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid budgetMonth format (YYYY-MM)");
const BUDGET_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;


const slugify = (text) => {
  if (!text || typeof text !== "string") return `${Date.now()}`;
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
};

const generateId = slugify;


/**
 * Reads an item from Azure Cosmos DB container along with its ETag.
 * Supports optimistic concurrency control and safely handles 404 errors.
 * 
 * object container - The Cosmos DB container instance.
 * string id - The unique identifier of the item.
 * string partitionKey - The partition key for the item.
 * returns {Promise<{resource: object|null, etag: string|null}>} The document and its ETag, or nulls if not found.
 */

const readItemWithEtag = async (container, id, partitionKey) => {
  try {
    // Fetch the item from Cosmos DB using the id and partition key
    const { resource, etag } = await container.item(id, partitionKey).read();
    
    // If the response is empty, return null values safely
    if (!resource) return { resource: null, etag: null };
    
    // Return the document and the ETag (fallback to system property _etag if needed)
    return { resource, etag: etag ?? resource._etag };
  } catch (err) {
    // Handle Item Not Found (404) gracefully without throwing an exception
    if (err.code === 404) return { resource: null, etag: null };
    
    // Rethrow any other unexpected database or network errors
    throw err;
  }
}

const readItem = async (container, id, partitionKey) => {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource ?? null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
};

/**
 * Syncs usedInTransactions on a voucher document.
 *
 * Rebuilds the array from scratch based on the provided operation:
 *   "add"    — append a new usage entry
 *   "remove" — remove all entries for a given transactionId
 *   "update" — replace the amount for a given transactionId
 *
 * Returns the updated voucher document, or null if voucher not found.
 */
const syncVoucherUsage = async (vouchersContainer, voucherId, familyId, op) => {
  // op: { type: "add"|"remove"|"update", transactionId, amount?, usedAt? }
  const voucher = await readItem(vouchersContainer, voucherId, familyId);
  if (!voucher || voucher.isArchived) return null;

  let entries = [...(voucher.usedInTransactions || [])];

  if (op.type === "add") {
    // Guard against duplicate entries (idempotent re-runs)
    const alreadyExists = entries.some(e => e.transactionId === op.transactionId);
    if (!alreadyExists) {
      entries.push({
        transactionId: op.transactionId,
        amount:        op.amount,
        usedAt:        op.usedAt,
        description:   op.description || "",
      });
    }
  } else if (op.type === "remove") {
    entries = entries.filter(e => e.transactionId !== op.transactionId);
  } else if (op.type === "update") {
    entries = entries.map(e =>
      e.transactionId === op.transactionId
        ? { ...e, amount: op.amount, description: op.description ?? e.description }
        : e
    );
  }

  const updated = { ...voucher, usedInTransactions: entries };
  const { resource } = await vouchersContainer.items.upsert(updated);
  return resource;
};

const currentServerMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const prevServerMonth = () => {
  const now = new Date();
  const m   = now.getMonth();
  const y   = now.getFullYear();
  if (m === 0) return `${y - 1}-12`;
  return `${y}-${String(m).padStart(2, "0")}`;
};

module.exports = { generateId, readItem,readItemWithEtag, syncVoucherUsage, IdParamSchema, BudgetMonthSchema, BUDGET_MONTH_REGEX, currentServerMonth, prevServerMonth };
