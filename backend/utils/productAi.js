// ============================================================
// File: backend/utils/productAi.js
// THE single definition of "what a product is" for the AI — the shared
// schema (ProductSchema) and prompt fragment (PRODUCT_RULES) that
// routes/ocr.js injects into the live receipt scan (rule 26).
//
// Also owns the lazy Azure OpenAI client used by the scan.
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

/** Prompt fragment describing HOW to fill the product fields once a line
 *  is recognized as a tracked product. WHETHER to attach one at all is a
 *  separate, restrictive instruction built in ocr.js from the user's
 *  whitelist — this fragment only covers name/size/unit/packCount. */
const PRODUCT_RULES = `- "name": czysta nazwa produktu BEZ gramatury, pojemności, wielopaku i wagi — pełne słowa,
  poprawna polska pisownia (rozwiń skróty z paragonu, np. "MLK UHT3.2" → "Mleko UHT 3,2%").
- "size": rozmiar JEDNEGO opakowania przeliczony do jednostki bazowej ("kg"→g, "l"→ml).
- "unit": "g", "ml" lub "szt". Dla towarów ważonych podaj wagę z paragonu w gramach.
- "packCount": ŁĄCZNA liczba sztuk kupionych, niezależnie od tego skąd wynika:
  · wielopak w nazwie ("0,5L x4" → 4),
  · KOLUMNA ILOŚCI paragonu ("2 * 4,99 9,98" → 2; "2 szt. x 4,99" → 2; "3 x2,39 7,17" → 3),
  · scalenie identycznych pozycji (dwie linie "Coca-Cola 6,99" → 2).
  Pomiń gdy 1. TYLKO ilości CAŁKOWITE (sztuki) — dla towarów ważonych
  (np. "0,442 * 19,99") ilość to WAGA: trafia do "size" w gramach, packCount zostaje null.
- KRYTYCZNE: "size" to rozmiar JEDNEJ sztuki — NIGDY liczba sztuk z "xN" ani
  z kolumny ilości. Gdy znasz ilość, ale nie znasz pojemności/wagi jednej
  sztuki, ustaw size: null, unit: "szt", packCount: N. Nie powtarzaj N w
  "size" — inaczej wyjdzie N×N (np. "x2" zostanie policzone jako 4 sztuki).
Przykłady:
  "ŻUBR PUSZKA 0,5L x4"          → {"name": "Żubr puszka", "size": 500, "unit": "ml", "packCount": 4}
  "Napój Coca-Cola Zero x2"      → {"name": "Coca-Cola Zero", "size": null, "unit": "szt", "packCount": 2}
  "MLEKO UHT 3,2% 1L  2 *3,49"   → {"name": "Mleko UHT 3,2%", "size": 1000, "unit": "ml", "packCount": 2}
  "Filet kurczaka 0,442 kg"      → {"name": "Filet z piersi kurczaka", "size": 442, "unit": "g"}
  "JAJA L 10SZT"                 → {"name": "Jaja L", "size": 10, "unit": "szt"}
  "JAJA L 10SZT x2"              → {"name": "Jaja L", "size": 10, "unit": "szt", "packCount": 2}
  "PAPIER TOALETOWY"             → {"name": "Papier toaletowy", "size": null, "unit": null}
Gdy nie da się ustalić rozmiaru — size/unit: null, ale "name" podaj ZAWSZE.`;

module.exports = {
  getOpenAIClient,
  ProductSchema,
  PRODUCT_RULES,
  OPENAI_TIMEOUT_MS,
};
