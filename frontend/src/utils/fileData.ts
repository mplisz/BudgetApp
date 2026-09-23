// ============================================================
// File: src/utils/fileData.ts
// Getting a picked file ready for an upload that travels as a base64
// data URL in JSON — the receipt scanner and the shopping-list photos.
// ============================================================

/** Raw upload cap — mirrors MAX_IMAGE_BYTES in backend/utils/imageInput.js. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const fileSizeMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/** File → "data:image/jpeg;base64,…" */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale a photo in the browser before it is sent. A phone camera
 * shot is 3–8 MB — over the upload cap, and slow on a shop's signal —
 * when the server would shrink it to a fraction of that anyway.
 * Returns the original file when it cannot be decoded here (the server
 * then gives the real verdict) or when shrinking would not help.
 * Not for receipts: the OCR wants every pixel of the fine print.
 */
export async function shrinkImage(file: File, maxDimension: number, quality = 0.85): Promise<Blob> {
  try {
    // createImageBitmap honours EXIF orientation, so the canvas copy
    // comes out the right way up.
    const bitmap = await createImageBitmap(file);
    const scale  = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_UPLOAD_BYTES && file.type === "image/jpeg") {
      bitmap.close();
      return file;
    }
    const canvas  = document.createElement("canvas");
    canvas.width  = Math.round(bitmap.width  * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
