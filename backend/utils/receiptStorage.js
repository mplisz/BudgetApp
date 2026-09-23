// ============================================================
// File: backend/utils/receiptStorage.js
// Shared Azure Blob Storage helper for receipt photos — and for the
// photos attached to shopping-list items, which ride the same private
// container, the same tag-driven lifecycle and the same download proxy.
// Used by routes/ocr.js (receipt upload), routes/transactions.js
// (receipt download proxy) and routes/shopping.js (item photos). The
// container is private, so the frontend never gets a direct blob URL.
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

// Best-effort upload: returns true on success, false on any failure
// (never throws).
async function uploadBlob(blobName, buffer, contentType, metadata, tags) {
  try {
    const container = await getReceiptBlobContainer();
    if (!container) return false;
    await container.getBlockBlobClient(blobName).uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
      metadata,
      tags,
    });
    console.log(`[RECEIPTS] Stored: ${blobName}`);
    return true;
  } catch (err) {
    console.error("[RECEIPTS] Upload failed (non-fatal):", err.message);
    return false;
  }
}

// Upload a processed receipt (JPEG by default, or the original PDF
// for e-receipts). Best-effort: returns the blob path on success,
// null on any failure (never throws).
async function archiveReceipt(buffer, familyId, userId, metadata, contentType = "image/jpeg") {
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = String(now.getMonth() + 1).padStart(2, "0");
  const ext      = contentType === "application/pdf" ? "pdf" : "jpg";
  const blobName = `${familyId}/${year}/${month}/${crypto.randomUUID()}.${ext}`;

  const ok = await uploadBlob(blobName, buffer, contentType, {
    merchant:   encodeURIComponent(metadata?.merchant || ""),
    date:       metadata?.date || "",
    totalsum:   String(metadata?.totalSum ?? ""),
    uploadedby: encodeURIComponent(userId || ""),
  },
  // Two-phase commit: blobs start as "pending" and are promoted to
  // "committed" when a transaction referencing them is saved. An
  // Azure lifecycle rule deletes pending blobs after 1 day, so
  // abandoned scans clean themselves up — no cron needed.
  { status: "pending" });
  return ok ? blobName : null;
}

// Blob tags for a shopping-list photo. An OPEN item's photo is
// "committed" and lives as long as the item does. Once the item is
// bought or skipped the photo goes back to "pending", so the same
// lifecycle rule that sweeps abandoned receipt scans sweeps it too —
// the list item itself expires via Cosmos TTL, and nothing else would
// ever come back for its photo. Re-opening the item (an undo) commits
// it again.
function shoppingPhotoTags(isOpen) {
  return { status: isOpen ? "committed" : "pending", retention: "shopping" };
}

// Upload a shopping-list item photo (already a processed JPEG).
// Returns the blob path, or null on failure.
async function archiveShoppingPhoto(buffer, familyId, userId) {
  const blobName = `${familyId}/shopping/${crypto.randomUUID()}.jpg`;
  const ok = await uploadBlob(blobName, buffer, "image/jpeg",
    { uploadedby: encodeURIComponent(userId || "") },
    shoppingPhotoTags(true));
  return ok ? blobName : null;
}

// Replace a blob's tags (setTags overwrites the whole set). Best-effort.
async function setBlobTags(blobPath, tags) {
  try {
    const container = await getReceiptBlobContainer();
    if (!container) return false;
    await container.getBlockBlobClient(blobPath).setTags(tags);
    return true;
  } catch (err) {
    console.error(`[RECEIPTS] setTags failed for ${blobPath}:`, err.message);
    return false;
  }
}

// Set retention class on a receipt blob via tags. Warranty receipts
// get a longer lifecycle (user configures the rule in the portal on
// retention=warranty); everything else is retention=normal.
function setReceiptRetention(blobPath, isWarranty) {
  return setBlobTags(blobPath, {
    status:    "committed",
    retention: isWarranty ? "warranty" : "normal",
  });
}

// Best-effort delete — a leftover blob is a few hundred KB, never an
// error the user should see.
async function deleteBlob(blobPath) {
  try {
    const container = await getReceiptBlobContainer();
    if (!container) return false;
    await container.getBlockBlobClient(blobPath).deleteIfExists();
    return true;
  } catch (err) {
    console.error(`[RECEIPTS] delete failed for ${blobPath}:`, err.message);
    return false;
  }
}

// Stream a stored file to the client — the download proxy behind both
// "📎 paragon" and "📷 zdjęcie". The caller has already point-read the
// owning document (which scopes it to the family); the prefix check is
// defense in depth, since the path was client-supplied or stored long
// ago. Responds on its own in every case.
async function streamBlob(res, blobPath, familyId, logTag) {
  try {
    if (!blobPath || !blobPath.startsWith(`${familyId}/`)) {
      return res.status(404).json({ error: "No file attached." });
    }
    const container = await getReceiptBlobContainer();
    if (!container) return res.status(503).json({ error: "Receipt storage is not configured." });

    const download = await container.getBlockBlobClient(blobPath).download();
    // PDF e-receipts are archived as .pdf — the frontend modal picks
    // its viewer (img vs iframe) off this header via blob.type.
    res.setHeader("Content-Type", download.contentType
      || (blobPath.endsWith(".pdf") ? "application/pdf" : "image/jpeg"));
    res.setHeader("Cache-Control", "private, max-age=86400");
    download.readableStreamBody.pipe(res);
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "File not found." });
    console.error(`[${logTag}]`, err);
    res.status(500).json({ error: "Failed to fetch the file." });
  }
}

module.exports = {
  getReceiptBlobContainer, archiveReceipt, setReceiptRetention,
  archiveShoppingPhoto, shoppingPhotoTags, setBlobTags, deleteBlob, streamBlob,
};
