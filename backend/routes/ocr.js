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
// Optional but strongly recommended (dedicated OCR engine; vision
// fallback is used when absent):
//   MISTRAL_OCR_ENDPOINT     e.g. https://xxx.swedencentral.models.ai.azure.com
//   MISTRAL_OCR_KEY          serverless deployment API key
//   MISTRAL_OCR_MODEL        deployment name, e.g. mistral-document-ai-2512
// Optional (blob archiving silently skipped when missing):
//   AZURE_STORAGE_CONNECTION_STRING
//   AZURE_STORAGE_CONTAINER  default: "receipts"
// ============================================================

const express = require("express");
const router  = express.Router();
const { z }   = require("zod");
const sharp   = require("sharp");
const { AzureOpenAI } = require("openai");

const { categoriesContainer, receiptsContainer, settingsContainer } = require("../cosmos");
const { cleanMerchant, merchantExists, rememberMerchant } = require("../utils/merchant");
const crypto                  = require("crypto");
const { requireAuth }         = require("../middleware/auth");
const { archiveReceipt }      = require("../utils/receiptStorage");
const { roundMoney }          = require("../utils/helpers");

router.use(requireAuth);

// ── Config ────────────────────────────────────────────────────

const MAX_IMAGE_BYTES   = 5 * 1024 * 1024;       // 5 MB raw upload
const MAX_DIMENSION_W   = 1024;                   // px after resize
const MAX_FULL_HEIGHT   = 8192;                   // archival copy height cap
const SEGMENT_HEIGHT    = 1536;                   // px per vision segment
const SEGMENT_OVERLAP   = 120;                    // px overlap between segments
const MAX_SEGMENTS      = 6;                      // hard cap on vision images
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
    merchant:      z.string().max(150).optional().nullable(),
    date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    totalSum:      z.number().min(0).optional().nullable(),
    currency:      z.string().max(5).optional().nullable(),
    receiptNumber: z.string().max(60).optional().nullable(),  // nr wydruku/paragonu
    sellerTaxId:   z.string().max(20).optional().nullable(),  // NIP sprzedawcy (cyfry)
  }).optional().default({}),
  warning: z.string().max(500).optional().nullable(),
});

// ── Mistral Document AI (dedicated OCR) ──────────────────────
// Returns the receipt as markdown text, or null when not configured.
// Throws on API errors so the route can surface a clear 502.

function isMistralConfigured() {
  return !!(process.env.MISTRAL_OCR_ENDPOINT && process.env.MISTRAL_OCR_KEY && process.env.MISTRAL_OCR_MODEL);
}

async function mistralOcrExtract(jpegBuffer) {
  if (!isMistralConfigured()) return null;

  // MISTRAL_OCR_ENDPOINT accepts either:
  //   a) the FULL Target URI from the deployment page (contains "/ocr")
  //      — used verbatim; this is the recommended, zero-guess option
  //   b) a base endpoint — "/v1/ocr?api-version=2024-05-01-preview" is
  //      appended (classic serverless .models.ai.azure.com convention)
  const raw = process.env.MISTRAL_OCR_ENDPOINT.replace(/\/+$/, "");
  const url = raw.includes("/ocr")
    ? raw
    : `${raw}/v1/ocr?api-version=2024-05-01-preview`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      // Both auth header styles — serverless endpoints expect Bearer,
      // Foundry resource endpoints (services.ai.azure.com) accept api-key.
      "Authorization": `Bearer ${process.env.MISTRAL_OCR_KEY}`,
      "api-key":       process.env.MISTRAL_OCR_KEY,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_OCR_MODEL,
      document: {
        type:      "image_url",
        image_url: `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`,
      },
      include_image_base64: false,
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(
      new Error(`Mistral OCR failed: ${res.status} ${body.substring(0, 200)}`),
      { isOcrEngineError: true },
    );
  }

  const data = await res.json();
  const text = (data.pages || []).map(p => p.markdown || "").join("\n\n").trim();
  if (!text) {
    throw Object.assign(new Error("Mistral OCR returned no text"), { isOcrEngineError: true });
  }
  return text;
}

// ── Prompt builder ────────────────────────────────────────────

function buildSystemPrompt(categoryTree, knownMerchants = []) {
  // categoryTree: [{ name, subcategories: [name, ...] }, ...]
  const catLines = categoryTree
    .map(c => `- ${c.name}: ${c.subcategories.join(", ") || "(brak podkategorii)"}`)
    .join("\n");
  const merchantLine = knownMerchants.length
    ? knownMerchants.join(", ")
    : "(brak zapisanych sklepów)";

  return `Jesteś asystentem OCR analizującym zdjęcia paragonów fiskalnych (zwykle polskich, ale możliwe też zagraniczne).


ZADANIE: Wyodrębnij pozycje zakupowe z paragonu i zwróć je jako JSON.
Paragon otrzymasz jako odczytany tekst (markdown z OCR) LUB jako zdjęcie/fragmenty zdjęcia.

ZASADY SCALANIA RABATÓW (KRYTYCZNE):
1. Korekta to linia, która OBNIŻA cenę innej pozycji — rozpoznawaj ją po FUNKCJI, nie po
   konkretnym słowie: ujemna kwota, znak "-" na początku, lub wiersz odnoszący się do
   pozycji powyżej/poniżej. Słowa-klucze (lista PRZYKŁADOWA, nie wyczerpująca, różne języki):
   PL: rabat, zniżka, opust, upust, promocja
   CZ/SK: sleva, zľava, akce, akcia
   DE: Rabatt, Nachlass, Aktion
   EN: discount, rebate, promo, "off"
   FR/IT/ES/NL: remise, réduction, sconto, descuento, korting
   Jeśli linia pełni funkcję korekty w JAKIMKOLWIEK języku — potraktuj ją jak rabat,
   nawet gdy słowo nie jest na liście.
2. Dopasuj każdą korektę do pozycji której dotyczy (zwykle ta sama lub podobna nazwa, linia
   bezpośrednio powyżej/poniżej).
3. Identyczne pozycje występujące wielokrotnie (np. 2x "Coca-Cola 6,99") POŁĄCZ w jedną
   pozycję z sumą ilości w opisie (np. "Coca-Cola 1.5L x2").
4. Pole "amount" to ZAWSZE cena finalna po wszystkich rabatach.
5. Pole "grossAmount" to suma przed rabatem, "discountAmount" to wartość rabatu.
   Gdy nie było rabatu — pomiń oba pola lub ustaw discountAmount: 0.
6. W polu "mergeNote" krótko opisz scalenie. Gdy nie było scalania — null.
7. Suma wszystkich "amount" MUSI zgadzać się z finalnym totalem paragonu, niezależnie od
   tego, jak jest podpisany ("Do zapłaty", "Suma", "Celkem", "K úhradě", "Gesamt",
   "Summe", "Total", "À payer", ...). Jeśli się nie zgadza, dodaj wyjaśnienie w "warning".
8. Niektóre sklepy drukują rabaty w OSOBNYM BLOKU na dole paragonu (np. polskie
   "OPUST SK. NAZWA -X,XX", ale też analogiczne bloki w innych sieciach/krajach).
   Przypisz je do właściwych pozycji tak samo jak rabaty inline.
9. Wypisz KAŻDĄ pozycję zakupową — paragon może mieć kilkadziesiąt pozycji. Nie pomijaj żadnej i nie skracaj listy.
10. Jeśli paragon jest dostarczony jako kilka nakładających się fragmentów: pozycje widoczne na styku dwóch fragmentów potraktuj JEDEN raz (deduplikuj po nazwie i cenie).
11. Ujemna linia o PEŁNEJ wartości pozycji (np. "BATON X 3,48" oraz osobno "BATON X -3,48") oznacza ZWROT/anulowanie — pomiń tę pozycję całkowicie.
12. OPISY: usuń kody produktów (ciągi cyfr z literą, np. "298378C") i rozwiń oczywiste skróty na naturalne polskie nazwy: "M#KA PSZEN" → "Mąka pszenna", "JAGODA KAM" → "Jagoda kamczacka", "NAPOJ G NS" → "Napój gazowany". Gdy skrót jest niejednoznaczny, zostaw jak jest.
13. ARYTMETYKA: dla każdej pozycji ZWERYFIKUJ, że amount = grossAmount − discountAmount oraz że grossAmount = cena_jednostkowa × ilość, dokładnie jak na paragonie. Nie zaokrąglaj, nie szacuj — przepisuj liczby.
14. KATEGORIE SPECJALNE: piwo, wino, wódka i inne alkohole → kategoria/podkategoria alkoholowa jeśli istnieje na liście użytkownika (NIE "napoje"). Zawsze wybieraj NAJBARDZIEJ szczegółową pasującą podkategorię.
15. KAUCJE I OPAKOWANIA ZWROTNE (np. "OPAKOWANIA ZWROTNE WYDANIA", "KAUCJA", "Opakowanie zwr."): potraktuj jako JEDNĄ zbiorczą pozycję (description: "Kaucja za opakowania", amount: suma kaucji) i przypisz do kategorii kaucji/opakowań zwrotnych jeśli istnieje u użytkownika. Kaucje ZWRÓCONE (ujemne) nadal pomijaj.
16. ROZRÓŻNIANIE KATEGORII DOMOWYCH (jeśli użytkownik ma takie kategorie):
   - PŁYNY I DETERGENTY: środki czystości, płyny do prania/zmywania/podłóg, proszki, kapsułki, udrażniacze, odświeżacze powietrza → "Chemia domowa"
   - PRZEDMIOTY GOSPODARCZE (nie-chemiczne): gąbki, ścierki, worki na śmieci, ręczniki papierowe, miotły, mopy, folia/papier śniadaniowy, baterie, żarówki → "Artykuły gospodarcze"
   - HIGIENA OSOBISTA: mydła, żele pod prysznic, szampony, pasty i szczoteczki do zębów, dezodoranty, papier toaletowy, chusteczki, podpaski, golenie → "Higiena"
   - PIELĘGNACJA I URODA: perfumy, kremy, balsamy, makijaż, pielęgnacja twarzy → "Kosmetyki"
17. SUMA KOŃCOWA: jako metadata.totalSum przyjmij kwotę FAKTYCZNIE ZAPŁACONĄ ("DO ZAPŁATY" / "RAZEM DO ZAPŁATY"), która zawiera kaucje. Suma wszystkich pozycji (wraz z pozycją kaucji) musi się z nią zgadzać.
18. METADANE PARAGONU:
   - "merchant": krótka, potoczna nazwa sieci. ZNANE SKLEPY UŻYTKOWNIKA: ${merchantLine}. Jeśli sklep z paragonu pasuje do któregoś ze znanych — użyj DOKŁADNIE tej nazwy z listy (kanonizacja). Jeśli nie pasuje do żadnego — zwróć nową krótką, potoczną nazwę sieci (np. "AUCHAN POLSKA SP. Z O.O." → "Auchan"), NIE pełną nazwę prawną.
   - "receiptNumber": numer wydruku/paragonu jeśli widoczny (np. przy "nr:", "WYDRUK NR", "PARAGON NR") — same znaki numeru, bez etykiety.
   - "sellerTaxId": NIP sprzedawcy jeśli widoczny (przy "NIP") — same cyfry, bez spacji i myślników.
19. WALUTA (metadata.currency):
- Rozpoznaj walutę paragonu po symbolach/kodach: "zł"/"PLN" → PLN, "Kč"/"CZK" → CZK,
  "€"/"EUR" → EUR, "$"/"USD" → USD, "£"/"GBP" → GBP, "kr" → SEK/NOK/DKK wg kraju sklepu.
- W metadata.currency zwróć ZAWSZE kod ISO 4217 (3 wielkie litery), nigdy symbol.
- Gdy symbol jest niejednoznaczny ($, kr, £, ¥, Rs), ustal walutę na podstawie
  kraju/adresu sklepu, języka paragonu i formatu podatku (np. "$" + adres w Kanadzie
  lub "GST/HST" → CAD; "$" + "MwSt"/Austria nie dotyczy; "kr" + ".se"/szwedzki → SEK).
  Dopiero gdy brak jakichkolwiek wskazówek — przyjmij walutę domyślną regionu.
- Jeśli paragon nie wskazuje waluty jednoznacznie i wygląda na polski → "PLN".
   Gdy któregoś z tych pól nie ma na paragonie, ustaw null.
20. TŁUMACZENIE NAZW: Jeśli paragon jest w obcym języku, w "description" podaj polski rodzaj
produktu, a oryginalną nazwę rodzajową dodaj w nawiasie. Nazwy własne/marki ZOSTAW w oryginale
w cudzysłowie. NIE tłumacz marek, kodów produktów ani jednostek.
Format:  <polski rodzaj> (<oryginał rodzajowy>) ['marka']
Przykłady:
  "Non" (uzb.)              → "Chleb (Non)"
  "Sūris" (lt.)             → "Ser (Sūris)"
  "Mléko Pribináček" (cz.)  → "Mleko (Mléko) 'Pribináček'"
21. ŻADNA pozycja w "items" nie może mieć ujemnego "amount". Ujemne wartości na paragonie to
rabaty (reguła 1 — scal z odpowiednią pozycją) albo zwroty/anulowania (reguła 11 — pomiń
całkowicie). Nigdy nie zwracaj korekty jako osobnej pozycji.
POMIJAJ: linie VAT/PTU, numery NIP, formy płatności, wydaną resztę, punkty lojalnościowe i naklejki, kaucje zwrócone (ujemne).

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
    "receiptNumber": "181530",
    "sellerTaxId": "5260309174",
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

async function fetchKnownMerchants(familyId) {
  try {
    const { resource } = await settingsContainer.item(`merchants_${familyId}`, familyId).read();
    return Array.isArray(resource?.merchants) ? resource.merchants : [];
  } catch {
    return [];  // no doc yet → empty list, scan proceeds normally
  }
}

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

// Long receipts are the hard case: a 1:4 receipt squeezed into one
// frame gets downscaled twice (here + inside the vision API, which
// caps the short side at ~768px) and fine print becomes illegible.
// Fix: normalize once at full height, then slice tall receipts into
// overlapping segments — each is sent as a separate image in ONE
// model call, so every line is read at native resolution.
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

  // Normalize: EXIF rotate (phone photos!), cap width, generous height.
  // Thermal receipts are low-contrast and often crumpled — grayscale +
  // histogram normalization + mild sharpening dramatically improves
  // print legibility for the vision model (and receipts are B&W anyway).
  const fullJpeg = await sharp(rawBuf)
    .rotate()
    .resize(MAX_DIMENSION_W, MAX_FULL_HEIGHT, { fit: "inside", withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1 })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const { width, height } = await sharp(fullJpeg).metadata();

  // Short receipt → single image, no slicing needed.
  if (height <= SEGMENT_HEIGHT) {
    return { fullJpeg, segments: [fullJpeg] };
  }

  // Tall receipt → overlapping vertical slices. Overlap guarantees no
  // line of print is cut in half; the prompt tells the model to dedupe.
  const step     = SEGMENT_HEIGHT - SEGMENT_OVERLAP;
  const segments = [];
  for (let top = 0; top < height && segments.length < MAX_SEGMENTS; top += step) {
    const h = Math.min(SEGMENT_HEIGHT, height - top);
    segments.push(
      await sharp(fullJpeg)
        .extract({ left: 0, top, width, height: h })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer()
    );
    if (top + h >= height) break;
  }

  return { fullJpeg, segments };
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

// ── Receipt fingerprint + dedup ──────────────────────────────
// Primary identity: seller NIP + receipt number + date — practically
// unique per fiscal receipt in Poland. Fallback when OCR didn't read
// the number/NIP: merchant + date + total (weaker — same-day identical
// shops collide, hence a soft warning, never a hard block).

function computeFingerprint(metadata) {
  const norm = s => (s || "").toString().trim().toLowerCase();
  const hasStrong = metadata.sellerTaxId && metadata.receiptNumber;
  const basis = hasStrong
    ? `nip:${norm(metadata.sellerTaxId)}|nr:${norm(metadata.receiptNumber)}|d:${norm(metadata.date)}`
    : `m:${norm(metadata.merchant)}|d:${norm(metadata.date)}|t:${metadata.totalSum ?? ""}`;
  return {
    fingerprint: crypto.createHash("sha1").update(basis).digest("hex"),
    strong: !!hasStrong,
  };
}

// Look for an existing committed receipt with the same fingerprint.
// Returns the matching receipt doc or null. Best-effort: a query
// failure must not break the scan, so it logs and returns null.
async function findDuplicateReceipt(familyId, fingerprint) {
  try {
    const { resources } = await receiptsContainer.items
      .query({
        query: `SELECT TOP 1 c.id, c.date, c.merchant, c.transactionIds
                FROM c
                WHERE c.userId = @userId
                  AND c.fingerprint = @fp
                  AND ARRAY_LENGTH(c.transactionIds) > 0`,
        parameters: [
          { name: "@userId", value: familyId },
          { name: "@fp",     value: fingerprint },
        ],
      })
      .fetchAll();
    return resources[0] || null;
  } catch (err) {
    console.error("[OCR] Dedup query failed (non-fatal):", err.message);
    return null;
  }
}

// Create the Receipt entity at scan time with ttl=7200 (2h). It
// starts "pending" with an empty transactionIds[]; committing a
// transaction promotes it (ttl=-1, status=committed). Abandoned scans
// expire automatically via the container's TTL. Best-effort: returns
// the receipt id or null, never throws.
async function createPendingReceipt(familyId, userId, metadata, fingerprint, blobPath) {
  try {
    const id = `rcpt_${familyId}_${crypto.randomUUID()}`;
    const doc = {
      id,
      userId:         familyId,           // partition key
      status:         "pending",
      blobPath:       blobPath || null,
      merchant:       metadata.merchant || null,
      date:           metadata.date || null,
      totalSum:       metadata.totalSum != null ? roundMoney(metadata.totalSum) : null,
      currency:       metadata.currency || "PLN",
      receiptNumber:  metadata.receiptNumber || null,
      sellerTaxId:    metadata.sellerTaxId || null,
      fingerprint,
      transactionIds: [],
      isWarranty:     false,
      imageExpired:   false,
      createdAt:      new Date().toISOString(),
      createdBy:      userId || null,
      ttl:            7200,               // 2h; commit sets -1
    };
    await receiptsContainer.items.create(doc);
    console.log(`[OCR] Receipt created (pending): ${id}`);
    return id;
  } catch (err) {
    console.error("[OCR] Receipt create failed (non-fatal):", err.message);
    return null;
  }
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
    // 1. Preprocess image (validate + resize + EXIF rotate + segment)
    const { fullJpeg, segments } = await preprocessImage(parsed.data.image);

    // 2. Fetch user's categories + known merchants for the prompt
    const categoryTree = await fetchCategoryTree(familyId);
    if (categoryTree.length === 0) {
      return res.status(422).json({ error: "No expense categories defined." });
    }
    const knownMerchants = await fetchKnownMerchants(familyId);

    // 3a. PREFERRED: dedicated OCR engine reads the receipt as text.
    // Deterministic line reading — no vision-LLM row confusion.
    let ocrText = null;
    try {
      ocrText = await mistralOcrExtract(fullJpeg);
    } catch (ocrErr) {
      // OCR engine configured but failing → log and fall back to vision
      // rather than hard-failing the scan.
      console.error("[OCR] Mistral engine error, falling back to vision:", ocrErr.message);
    }
    const engine = ocrText ? "mistral+text" : "vision";

    // 3b. LLM does discount merging + categorization.
    // Text mode: cheap, reliable. Vision mode: legacy fallback.
    const userContent = ocrText
      ? `Przeanalizuj ten paragon (odczytany tekst poniżej) i zwróć JSON.\n\n--- PARAGON (OCR) ---\n${ocrText}`
      : [
          { type: "text", text: segments.length > 1
              ? `Przeanalizuj ten paragon i zwróć JSON. Paragon jest podzielony na ${segments.length} nakładających się fragmentów (góra → dół).`
              : "Przeanalizuj ten paragon i zwróć JSON." },
          ...segments.map(seg => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${seg.toString("base64")}`, detail: "high" },
          })),
        ];

    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT, // deployment name, required by SDK but routing uses client config
      messages: [
        { role: "system", content: buildSystemPrompt(categoryTree.map(c => ({
            name: c.name,
            subcategories: c.subcategories.map(s => s.name),
          })), knownMerchants) },
        { role: "user", content: userContent },
      ],
      // gpt-5.x renamed max_tokens → max_completion_tokens and rejects
      // custom temperature (reasoning models accept only the default).
      // max_completion_tokens works for gpt-4.x too on current api-versions,
      // so this stays backward-compatible with older deployments.
      max_completion_tokens: 8000,
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

    // Defensive: in case LLM pushes the negative line item delete this LI to avoid the crash
    // Step 5 below will handle the difference between sum and sum of line items
    let droppedNeg = 0;
    if (Array.isArray(llmJson?.items)) {
      const n = llmJson.items.length;
      llmJson.items = llmJson.items.filter(it => !(typeof it?.amount === "number" && it.amount < 0));
      droppedNeg = n - llmJson.items.length;
    }
    const validated = LlmResponseSchema.safeParse(llmJson);
    if (!validated.success) {
      console.error("[OCR] Model response failed schema:", validated.error.issues[0]);
      return res.status(502).json({ error: "Failed to parse model response." });
    }

    const { items, metadata, warning } = validated.data;

    // 5. Sanity check: items sum vs receipt total (tolerance 0.05 zł)
    let sumWarning = warning || null;
    if (droppedNeg > 0 && !sumWarning) {
      sumWarning = `Pominięto ${droppedNeg} ujemną pozycję (rabat/zwrot jako osobna linia). Sprawdź, czy suma się zgadza.`;
    }
    if (items.length > 0 && metadata.totalSum != null) {
      const itemsSum = roundMoney(items.reduce((s, i) => s + i.amount, 0));
      if (Math.abs(itemsSum - metadata.totalSum) > 0.05 && !sumWarning) {
        sumWarning = `Suma pozycji (${itemsSum.toFixed(2)}) różni się od sumy paragonu (${metadata.totalSum.toFixed(2)}). Sprawdź pozycje.`;
      }
    }
    

    // 6. Map category names → IDs
    const mappedItems = mapItemsToCategories(items, categoryTree);

    // 7. Fingerprint + duplicate check (soft warning, never blocks).
    // duplicateWarning is a SEPARATE channel from sumWarning — a receipt
    // can be both a re-scan AND have OCR quality notes; one must not
    // suppress the other (they share no slot).
    const { fingerprint, strong } = computeFingerprint(metadata);
    const duplicate = await findDuplicateReceipt(familyId, fingerprint);
    const duplicateWarning = duplicate
      ? `Ten paragon wygląda na już zeskanowany (${duplicate.merchant || "sklep"}, ${duplicate.date || "wcześniej"}). Sprawdź zanim dodasz, by uniknąć duplikatu.`
      : null;

    // 8. Archive original image (best-effort, non-blocking failure)
    const receiptBlobPath = await archiveReceipt(fullJpeg, familyId, req.user.id, metadata);

    // 9. Create the pending Receipt entity (ttl=1day until committed)
    const receiptId = await createPendingReceipt(
      familyId, req.user.id, metadata, fingerprint, receiptBlobPath,
    );

    // 9b. Remember the merchant if it's new (guard A: AI got the list,
    // so a name here that isn't on it is genuinely new). Fire-and-forget.
    if (metadata.merchant) rememberMerchant(settingsContainer, familyId, metadata.merchant);

    const elapsed = Date.now() - t0;
    const usage   = completion.usage || {};
    console.log(`[OCR] Scan ok: ${mappedItems.length} items, engine: ${engine}, fp:${strong ? "strong" : "weak"}${duplicate ? " DUP" : ""}, ${elapsed}ms, tokens: ${usage.prompt_tokens || "?"}+${usage.completion_tokens || "?"}, family: ${familyId}`);

    // 10. Respond
    res.json({
      items: mappedItems,
      metadata: {
        merchant: metadata.merchant || null,
        date:     metadata.date     || null,
        totalSum: metadata.totalSum != null ? roundMoney(metadata.totalSum) : null,
        currency: metadata.currency || "PLN",
      },
      warning:          sumWarning,
      duplicateWarning,
      receiptBlobPath,
      receiptId,
      isDuplicate:      !!duplicate,
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
