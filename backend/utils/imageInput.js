// ============================================================
// File: backend/utils/imageInput.js
// Turning an uploaded base64 data URL into a trusted image buffer.
// Shared by the receipt scanner (routes/ocr.js) and the shopping-list
// photos (routes/shopping.js): both accept a phone photo, and both must
// refuse the same things — too big, or not really an image.
// ============================================================

const sharp = require("sharp");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;               // 5 MB raw upload
const ALLOWED_MIME    = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_DATA_URL  = /^data:image\/(jpeg|png|webp);base64,/;

// Decode + validate. Throws an Error carrying an HTTP `status`
// (413 too large, 415 not an allowed image) — callers map it to the
// response. The data URL prefix is client-supplied, so the format is
// checked on the bytes themselves: sharp reads the magic numbers, and
// a mislabeled or corrupt file throws here.
async function decodeImageDataUrl(dataUrl) {
  const base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
  const rawBuf = Buffer.from(base64, "base64");

  if (rawBuf.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("Image too large."), { status: 413 });
  }

  let meta;
  try {
    meta = await sharp(rawBuf).metadata();
  } catch {
    throw Object.assign(new Error("Unsupported image format."), { status: 415 });
  }
  const mime = `image/${meta.format === "jpg" ? "jpeg" : meta.format}`;
  if (!ALLOWED_MIME.includes(mime)) {
    throw Object.assign(new Error("Unsupported image format."), { status: 415 });
  }
  return rawBuf;
}

module.exports = { decodeImageDataUrl, MAX_IMAGE_BYTES, IMAGE_DATA_URL };
