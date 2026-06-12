// ============================================================
// File: backend/routes/ocr.js
// POST /api/ocr/receipt — analyze a receipt photo with Azure
// OpenAI Vision and return structured cart items.
//
// Flow:
//   1. Validate base64 image (size, mime type)
//   2. Resize/compress with sharp (cost optimization — smaller
//      image = fewer vision tokens)
//   3. Fetch user's EXPENSE categories from Cosmos → prompt
//   4. Call Azure OpenAI (gpt-4o-mini deployment) with the image
//   5. Parse + validate the JSON response (Zod)
//   6. [optional] Archive original image in Azure Blob Storage
//   7. Return items + metadata to the frontend
//
// Discount merging is handled BY THE MODEL via prompt rules:
// lines like "-Rabat Coca-Cola -6,99" are matched to their items
// and the returned `amount` is always the FINAL (net) price.
// `grossAmount` / `discountAmount` are informational only — the
// frontend shows them in the cart, but they never reach the DB.
//
// Env vars required:
//   AZURE_OPENAI_ENDPOINT    e.g. https://budget-openai.openai.azure.com/
//   AZURE_OPENAI_KEY         API key
//   AZURE_OPENAI_DEPLOYMENT  e.g. budget-vision-mini
// Optional (blob archiving silently skipped when missing):
//   AZURE_STORAGE_CONNECTION_STRING
//   AZURE_STORAGE_CONTAINER  default: "receipts"
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const crypto  = require("crypto");
const sharp   = require("sharp");
const { AzureOpenAI } = require("openai");

const { categoriesContainer } = require("../cosmos");
const { requireAuth }         = require("../middleware/auth");
const { roundMoney }          = require("../utils/helpers");

router.use(requireAuth);

// ── Config ────────────────────────────────────────────────────

const MAX_IMAGE_BYTES   = 5 * 1024 * 1024;       // 5 MB raw upload
const MAX_DIMENSION_W   = 1024;                   // px after resize
const MAX_DIMENSION_H   = 2048;                   // receipts are tall
const JPEG_QUALITY      = 80;
const ALLOWED_MIME      = ["image/jpeg", "image/png", "image/webp"];
const OPENAI_TIMEOUT_MS = 60_000;
const MAX_ITEMS         = 60;                     // sanity cap on response

// ── Azure OpenAI client (lazy singleton) ─────────────────────
// Lazy so the server still boots when OCR env vars are missing —
// the endpoint then returns 503 instead of crashing the process.

let _openaiClient = null;
function getOpenAIClient() {
  if (_openaiClient) return _openaiClient;
  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey     = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !apiKey || !deployment) return null;
  _openaiClient = new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion: "2024-10-21",
    timeout: OPENAI_TIMEOUT_MS,
  });
  return _openaiClient;
}

// ── Blob storage (lazy, optional) ─────────────────────────────

let _blobContainerClient = null;
let _blobInitFailed      = false;
async function getBlobContainer() {
  if (_blobContainerClient) return _blobContainerClient;
  if (_blobInitFailed) return null;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) { _blobInitFailed = true; return null; }
  try {
    const { BlobServiceClient } = require("@azure/storage-blob");
    const service   = BlobServiceClient.fromConnectionString(conn);
    const container = service.getContainerClient(process.env.AZURE_STORAGE_CONTAINER || "receipts");
    await container.createIfNotExists();
    _blobContainerClient = container;
    return container;
  } catch (err) {
    console.error("[OCR] Blob storage init failed — archiving disabled:", err.message);
    _blobInitFailed = true;
    return null;
  }
}

// ── Rate limiting ─────────────────────────────────────────────
// Handled centrally in middleware/rateLimiter.js (ocrLimiter) —
// registered as a dedicated path limiter in applyRateLimiters().

// ── Zod Schemas ───────────────────────────────────────────────

const ReceiptPostSchema = z.object({
  // data URL: "data:image/jpeg;base64,...."
  image: z.string()
    .min(100, "Image payload too small")
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Expected base64 data URL (jpeg/png/webp)"),
});

// What we expect back from the model — validated defensively,
// because LLM output is untrusted input like any other.
const LlmItemSchema = z.object({
  description:        z.string().min(1).max(200),
  amount:             z.number().min(0),            // FINAL price after discounts
  grossAmount:        z.number().min(0).optional(), // before discounts (informational)
  discountAmount:     z.number().min(0).optional(), // total discount applied (informational)
  mergeNote:          z.string().max(300).optional().nullable(),
  category:           z.string().max(100).optional().nullable(),
  subcategory:        z.string().max(100).optional().nullable(),
  categoryConfidence: z.number().min(0).max(1).optional().default(0.5),
});

const LlmResponseSchema = z.object({
  items: z.array(LlmItemSchema).max(MAX_ITEMS),
  metadata: z.object({
    merchant: z.string().max(150).optional().nullable(),
    date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    totalSum: z.number().min(0).optional().nullable(),
    currency: z.string().max(5).optional().nullable(),
  }).optional().default({}),
  warning: z.string().max(500).optional().nullable(),
});

// ── Prompt builder ────────────────────────────────────────────

function buildSystemPrompt(categoryTree) {
  // categoryTree: [{ name, subcategories: [name, ...] }, ...]
  const catLines = categoryTree
    .map(c => `- ${c.name}: ${c.subcategories.join(", ") || "(brak podkategorii)"}`)
    .join("\n");

  return `Jesteś asystentem OCR analizującym zdjęcia polskich paragonów fiskalnych.

ZADANIE: Wyodrębnij pozycje zakupowe z paragonu i zwróć je jako JSON.

ZASADY SCALANIA RABATÓW (KRYTYCZNE):
1. Linie zaczynające się od "-" lub zawierające słowa "rabat", "zniżka", "opust", "promocja", "upust" to KOREKTY, nie osobne pozycje.
2. Dopasuj każdą korektę do pozycji której dotyczy (zwykle ta sama lub podobna nazwa, linia bezpośrednio powyżej/poniżej).
3. Identyczne pozycje występujące wielokrotnie (np. 2x "Coca-Cola 6,99") POŁĄCZ w jedną pozycję z sumą ilości w opisie (np. "Coca-Cola 1.5L x2").
4. Pole "amount" to ZAWSZE cena finalna po wszystkich rabatach.
5. Pole "grossAmount" to suma przed rabatem, "discountAmount" to wartość rabatu. Gdy nie było rabatu — pomiń oba pola lub ustaw discountAmount: 0.
6. W polu "mergeNote" krótko opisz scalenie, np. "2x 6,99 + rabat -6,99 = 6,99 za 2 szt". Gdy nie było scalania — null.
7. Suma wszystkich "amount" MUSI zgadzać się z sumą paragonu (pole "SUMA"/"RAZEM"). Jeśli się nie zgadza, dodaj wyjaśnienie w polu "warning".

POMIJAJ: kaucje zwrócone, linie VAT/PTU, numery NIP, formy płatności, wydaną resztę, punkty lojalnościowe.

KATEGORYZACJA: Przypisz każdej pozycji kategorię i podkategorię WYŁĄCZNIE z poniższej listy użytkownika (dokładne nazwy). Gdy żadna nie pasuje, ustaw null i obniż categoryConfidence.

KATEGORIE UŻYTKOWNIKA:
${catLines}

FORMAT ODPOWIEDZI — wyłącznie poprawny JSON, bez markdown, bez komentarzy:
{
  "items": [
    {
      "description": "Coca-Cola 1.5L x2",
      "amount": 6.99,
      "grossAmount": 13.98,
      "discountAmount": 6.99,
      "mergeNote": "2x 6,99 + rabat -6,99",
      "category": "Zakupy codzienne",
      "subcategory": "Napoje",
      "categoryConfidence": 0.95
    }
  ],
  "metadata": {
    "merchant": "Biedronka",
    "date": "2026-06-09",
    "totalSum": 96.21,
    "currency": "PLN"
  },
  "warning": null
}

Jeśli zdjęcie NIE jest paragonem lub jest nieczytelne, zwróć: {"items": [], "metadata": {}, "warning": "opis problemu po polsku"}.`;
}

// ── Category tree fetch ───────────────────────────────────────
// Builds [{ name, subcategories: [...] }] from the flat Cosmos
// Categories container. Only EXPENSE, only non-archived.

async function fetchCategoryTree(familyId) {
  const { resources } = await categoriesContainer.items
    .query({
      query: `SELECT c.id, c.name, c.parentCategoryId, c.type, c.isArchived
              FROM c WHERE c.userId = @userId`,
      parameters: [{ name: "@userId", value: familyId }],
    })
    .fetchAll();

  const active  = resources.filter(c => !c.isArchived && c.type === "EXPENSE");
  const roots   = active.filter(c => !c.parentCategoryId);
  const tree    = roots.map(root => ({
    id:   root.id,
    name: root.name,
    subcategories: active
      .filter(c => c.parentCategoryId === root.id)
      .map(c => ({ id: c.id, name: c.name })),
  }));

  return tree;
}

// ── Image preprocessing ───────────────────────────────────────

async function preprocessImage(dataUrl) {
  const base64  = dataUrl.substring(dataUrl.indexOf(",") + 1);
  const rawBuf  = Buffer.from(base64, "base64");

  if (rawBuf.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("Image too large."), { status: 413 });
  }

  // sharp validates magic bytes — a mislabeled or corrupt file throws here.
  const meta = await sharp(rawBuf).metadata();
  const mime = `image/${meta.format === "jpg" ? "jpeg" : meta.format}`;
  if (!ALLOWED_MIME.includes(mime)) {
    throw Object.assign(new Error("Unsupported image format."), { status: 415 });
  }

  // Resize: receipts are tall & narrow. Keep detail in height, cap width.
  // rotate() with no args applies EXIF orientation (phone photos!).
  const processed = await sharp(rawBuf)
    .rotate()
    .resize(MAX_DIMENSION_W, MAX_DIMENSION_H, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return processed; // always JPEG after this point
}

// ── Blob archiving (best-effort, never blocks the response) ───

async function archiveReceipt(jpegBuffer, familyId, userId, metadata) {
  try {
    const container = await getBlobContainer();
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
    });

    console.log(`[OCR] Receipt archived: ${blobName}`);
    return blobName; // store the blob PATH, not a full URL — access via backend proxy later
  } catch (err) {
    // Archiving is non-critical; the scan result is still returned.
    console.error("[OCR] Blob archiving failed (non-fatal):", err.message);
    return null;
  }
}

// ── Response mapper ───────────────────────────────────────────
// Maps LLM category NAMES to category IDs so the frontend doesn't
// have to do fuzzy matching. Unknown names → null (user picks manually).

function mapItemsToCategories(items, categoryTree) {
  // Case-insensitive name → node lookup
  const catByName = new Map();
  for (const root of categoryTree) {
    catByName.set(root.name.toLowerCase(), root);
  }

  return items.map(item => {
    let categoryId = null, categoryName = null;
    let subcategoryId = null, subcategoryName = null;
    let confidence = item.categoryConfidence ?? 0.5;

    const root = item.category ? catByName.get(item.category.toLowerCase()) : null;
    if (root) {
      categoryId   = root.id;
      categoryName = root.name;
      const sub = item.subcategory
        ? root.subcategories.find(s => s.name.toLowerCase() === item.subcategory.toLowerCase())
        : null;
      if (sub) {
        subcategoryId   = sub.id;
        subcategoryName = sub.name;
      } else {
        // Category matched but subcategory didn't — flag for review.
        confidence = Math.min(confidence, 0.5);
      }
    } else {
      confidence = Math.min(confidence, 0.3);
    }

    return {
      description:        item.description,
      amount:             roundMoney(item.amount),
      grossAmount:        item.grossAmount != null ? roundMoney(item.grossAmount) : null,
      discountAmount:     item.discountAmount != null ? roundMoney(item.discountAmount) : null,
      mergeNote:          item.mergeNote || null,
      categoryId,
      categoryName,
      subcategoryId,
      subcategoryName,
      categoryConfidence: confidence,
    };
  });
}

// ── POST /api/ocr/receipt ─────────────────────────────────────

router.post("/receipt", async (req, res) => {
  const client = getOpenAIClient();
  if (!client) {
    console.error("[OCR] Azure OpenAI env vars missing — endpoint disabled.");
    return res.status(503).json({ error: "OCR service is not configured." });
  }

  const parsed = ReceiptPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const familyId = req.user.familyId;
  const t0 = Date.now();

  try {
    // 1. Preprocess image (validate + resize + EXIF rotate)
    const jpegBuffer = await preprocessImage(parsed.data.image);
    const imageBase64 = jpegBuffer.toString("base64");

    // 2. Fetch user's categories for the prompt
    const categoryTree = await fetchCategoryTree(familyId);
    if (categoryTree.length === 0) {
      return res.status(422).json({ error: "No expense categories defined." });
    }

    // 3. Call Azure OpenAI Vision
    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT, // deployment name, required by SDK but routing uses client config
      messages: [
        { role: "system", content: buildSystemPrompt(categoryTree.map(c => ({
            name: c.name,
            subcategories: c.subcategories.map(s => s.name),
          }))) },
        {
          role: "user",
          content: [
            { type: "text", text: "Przeanalizuj ten paragon i zwróć JSON." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" } },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,                       // deterministic extraction, not creativity
      response_format: { type: "json_object" }, // hard JSON guarantee
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("Empty response from model");
    }

    // 4. Parse + validate LLM output (untrusted input!)
    let llmJson;
    try {
      llmJson = JSON.parse(rawContent);
    } catch {
      console.error("[OCR] Model returned invalid JSON:", rawContent.substring(0, 300));
      return res.status(502).json({ error: "Model returned invalid response." });
    }

    const validated = LlmResponseSchema.safeParse(llmJson);
    if (!validated.success) {
      console.error("[OCR] Model response failed schema:", validated.error.issues[0]);
      return res.status(502).json({ error: "Failed to parse model response." });
    }

    const { items, metadata, warning } = validated.data;

    // 5. Sanity check: items sum vs receipt total (tolerance 0.05 zł)
    let sumWarning = warning || null;
    if (items.length > 0 && metadata.totalSum != null) {
      const itemsSum = roundMoney(items.reduce((s, i) => s + i.amount, 0));
      if (Math.abs(itemsSum - metadata.totalSum) > 0.05 && !sumWarning) {
        sumWarning = `Suma pozycji (${itemsSum.toFixed(2)}) różni się od sumy paragonu (${metadata.totalSum.toFixed(2)}). Sprawdź pozycje.`;
      }
    }

    // 6. Map category names → IDs
    const mappedItems = mapItemsToCategories(items, categoryTree);

    // 7. Archive original (best-effort, non-blocking failure)
    const receiptBlobPath = await archiveReceipt(jpegBuffer, familyId, req.user.id, metadata);

    const elapsed = Date.now() - t0;
    const usage   = completion.usage || {};
    console.log(`[OCR] Scan ok: ${mappedItems.length} items, ${elapsed}ms, tokens: ${usage.prompt_tokens || "?"}+${usage.completion_tokens || "?"}, family: ${familyId}`);

    // 8. Respond
    res.json({
      items: mappedItems,
      metadata: {
        merchant: metadata.merchant || null,
        date:     metadata.date     || null,
        totalSum: metadata.totalSum != null ? roundMoney(metadata.totalSum) : null,
        currency: metadata.currency || "PLN",
      },
      warning: sumWarning,
      receiptBlobPath,
    });

  } catch (err) {
    // Custom errors from preprocessing carry their own status.
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    // Azure OpenAI SDK errors
    if (err.status === 429 || err.code === "rate_limit_exceeded") {
      return res.status(429).json({ error: "Model rate limit exceeded." });
    }
    if (err.name === "APIConnectionTimeoutError" || err.code === "ETIMEDOUT") {
      return res.status(504).json({ error: "Analysis timed out." });
    }
    console.error("[OCR] Unexpected error:", err);
    res.status(500).json({ error: "Failed to analyze receipt." });
  }
});

module.exports = router;