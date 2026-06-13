// ============================================================
// File: backend/utils/receiptStorage.js
// Shared Azure Blob Storage helper for receipt photos.
// Used by routes/ocr.js (upload) and routes/transactions.js
// (download proxy — the container is private, so the frontend
// never gets a direct blob URL).
//
// Lazy + optional: when AZURE_STORAGE_CONNECTION_STRING is
// missing or init fails, all functions silently no-op so the
// rest of the app keeps working without receipt archiving.
// ============================================================

const crypto = require("crypto");

let _containerClient = null;
let _initFailed      = false;

async function getReceiptBlobContainer() {
  if (_containerClient) return _containerClient;
  if (_initFailed) return null;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) { _initFailed = true; return null; }
  try {
    const { BlobServiceClient } = require("@azure/storage-blob");
    const service   = BlobServiceClient.fromConnectionString(conn);
    const container = service.getContainerClient(process.env.AZURE_STORAGE_CONTAINER || "receipts");
    await container.createIfNotExists();
    _containerClient = container;
    return container;
  } catch (err) {
    console.error("[RECEIPTS] Blob storage init failed — receipts disabled:", err.message);
    _initFailed = true;
    return null;
  }
}

// Upload a processed receipt JPEG. Best-effort: returns the blob
// path on success, null on any failure (never throws).
async function archiveReceipt(jpegBuffer, familyId, userId, metadata) {
  try {
    const container = await getReceiptBlobContainer();
    if (!container) return null;

    const now      = new Date();
    const year     = now.getFullYear();
    const month    = String(now.getMonth() + 1).padStart(2, "0");
    const blobName = `${familyId}/${year}/${month}/${crypto.randomUUID()}.jpg`;

    const blockBlob = container.getBlockBlobClient(blobName);
    await blockBlob.uploadData(jpegBuffer, {
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
      metadata: {
        merchant:   encodeURIComponent(metadata?.merchant || ""),
        date:       metadata?.date || "",
        totalsum:   String(metadata?.totalSum ?? ""),
        uploadedby: encodeURIComponent(userId || ""),
      },
      // Two-phase commit: blobs start as "pending" and are promoted to
      // "committed" when a transaction referencing them is saved. An
      // Azure lifecycle rule deletes pending blobs after 1 day, so
      // abandoned scans clean themselves up — no cron needed.
      tags: { status: "pending" },
    });

    console.log(`[RECEIPTS] Archived: ${blobName}`);
    return blobName;
  } catch (err) {
    console.error("[RECEIPTS] Archiving failed (non-fatal):", err.message);
    return null;
  }
}

// Set retention class on a receipt blob via tags. Warranty receipts
// get a longer lifecycle (user configures the rule in the portal on
// retention=warranty); everything else is retention=normal.
async function setReceiptRetention(blobPath, isWarranty) {
  try {
    const container = await getReceiptBlobContainer();
    if (!container) return false;
    await container.getBlockBlobClient(blobPath).setTags({
      status:    "committed",
      retention: isWarranty ? "warranty" : "normal",
    });
    return true;
  } catch (err) {
    console.error(`[RECEIPTS] setRetention failed for ${blobPath}:`, err.message);
    return false;
  }
}
module.exports = { getReceiptBlobContainer, archiveReceipt, setReceiptRetention };

