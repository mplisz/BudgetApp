// ============================================================
// File: backend/utils/productAi.js
// THE single definition of "what a product is" for the AI, shared by:
//   - the live receipt scan (routes/ocr.js, rule 23 of its prompt)
//   - the retroactive backfill (routes/products.js → productBackfill.js)
//
// Both paths MUST name products identically — otherwise the same item
// scanned today and backfilled from history would land as two separate
// products, which is exactly what the catalog is supposed to prevent.
// Hence one prompt fragment (PRODUCT_RULES) and one schema
// (ProductSchema) live here, not copies in each caller.
//
// Also owns the lazy Azure OpenAI client, so both callers share one
// connection and one timeout policy.
// ============================================================

const { z } = require("zod");
const { AzureOpenAI } = require("openai");

const OPENAI_TIMEOUT_MS = 120000;

// ── Shared Azure OpenAI client (lazy singleton) ──────────────
// Lazy so the server still boots when the env vars are missing — the
// callers then degrade (503 / skip) instead of crashing the process.

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

// ── The product contract ─────────────────────────────────────

/** Structured product identity. Every field nullable: the model emits
 *  null (not omission) for "not applicable". */
const ProductSchema = z.object({
  name:      z.string().min(1).max(120).nullable().optional(),
  size:      z.number().positive().nullable().optional(),
  unit:      z.enum(["g", "ml", "szt"]).nullable().optional(),
  packCount: z.number().int().positive().max(99).nullable().optional(),
});

/** Prompt fragment describing the product fields. Injected verbatim into
 *  the scan prompt AND the backfill prompt so the naming never diverges. */
const PRODUCT_RULES = `- "name": czysta nazwa produktu BEZ gramatury, pojemności, wielopaku i wagi — pełne słowa,
  poprawna polska pisownia (rozwiń skróty z paragonu, np. "MLK UHT3.2" → "Mleko UHT 3,2%").
- "size": rozmiar JEDNEGO opakowania przeliczony do jednostki bazowej ("kg"→g, "l"→ml).
- "unit": "g", "ml" lub "szt". Dla towarów ważonych podaj wagę z paragonu w gramach.
- "packCount": liczba sztuk w wielopaku (np. "0,5L x4" → 4). Pomiń gdy 1.
Przykłady:
  "ŻUBR PUSZKA 0,5L x4"        → {"name": "Żubr puszka", "size": 500, "unit": "ml", "packCount": 4}
  "Filet kurczaka 0,442 kg"    → {"name": "Filet z piersi kurczaka", "size": 442, "unit": "g"}
  "JAJA L 10SZT"               → {"name": "Jaja L", "size": 10, "unit": "szt"}
  "PAPIER TOALETOWY"           → {"name": "Papier toaletowy", "size": null, "unit": null}
Gdy nie da się ustalić rozmiaru — size/unit: null, ale "name" podaj ZAWSZE.`;

// ── Retroactive inference (backfill) ─────────────────────────

/** How many descriptions go into one model call. */
const BATCH_SIZE = 50;

const InferResponseSchema = z.object({
  products: z.array(ProductSchema.extend({ i: z.number().int().min(0) })).max(BATCH_SIZE),
});

function buildInferPrompt() {
  return `Jesteś asystentem normalizującym nazwy produktów z paragonów.

ZADANIE: Dla każdej podanej pozycji paragonu zwróć ustrukturyzowaną tożsamość produktu.

${PRODUCT_RULES}

POMIŃ pozycję (nie zwracaj jej wcale), gdy nie jest produktem — np. usługa, opłata,
nazwa sklepu, "zakupy", rabat, kaucja. Lepiej pominąć niż zmyślić.

WEJŚCIE: tablica JSON obiektów {"i": <indeks>, "t": "<tekst pozycji>"}.
ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown:
{"products": [{"i": 0, "name": "Mleko UHT 3,2%", "size": 1000, "unit": "ml"}]}
Pole "i" MUSI odpowiadać indeksowi z wejścia.`;
}

/**
 * Infer structured products for raw receipt-line texts.
 * Deduplication is the CALLER's job — this receives unique strings only,
 * which is what keeps the backfill cheap and guarantees that identical
 * text always yields the identical product (no split-by-batch).
 *
 * @returns Map<description, product> — only entries the model was
 *   confident about; unparseable lines are simply absent.
 */
async function inferProducts(descriptions, { onProgress } = {}) {
  const client = getOpenAIClient();
  if (!client) throw new Error("Azure OpenAI is not configured.");

  const result = new Map();
  for (let start = 0; start < descriptions.length; start += BATCH_SIZE) {
    const batch = descriptions.slice(start, start + BATCH_SIZE);
    const payload = batch.map((t, i) => ({ i, t }));

    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      messages: [
        { role: "system", content: buildInferPrompt() },
        { role: "user",   content: JSON.stringify(payload) },
      ],
      max_completion_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) continue;                       // empty batch → skip, keep going

    let parsed;
    try {
      parsed = InferResponseSchema.safeParse(JSON.parse(raw));
    } catch {
      continue;                               // malformed JSON → skip batch
    }
    if (!parsed.success) continue;

    for (const entry of parsed.data.products) {
      const description = batch[entry.i];
      const name = entry.name?.trim();
      if (!description || !name) continue;    // model skipped or gave no name
      result.set(description, {
        name,
        size:      entry.size      ?? null,
        unit:      entry.unit      ?? null,
        packCount: entry.packCount ?? null,
      });
    }
    if (onProgress) onProgress(Math.min(start + BATCH_SIZE, descriptions.length), descriptions.length);
  }
  return result;
}

module.exports = {
  getOpenAIClient,
  ProductSchema,
  PRODUCT_RULES,
  inferProducts,
  BATCH_SIZE,
  OPENAI_TIMEOUT_MS,
};
