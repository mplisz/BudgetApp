// ============================================================
// File: BuddetApp DB/seed-limits.js
// Seed limitów kategorii EXPENSE.
//
// Schemat: jeden dokument per kategoria
//   id: "lim_{FAMILY_ID}_{categoryId}"
//   limits: [{ date, amount, type: "base" | "override" }]
//
// base     — obowiązuje od daty wzwyż (aż do kolejnego base)
// override — tylko dokładnie ten miesiąc
//
// Uruchomienie: node seed-limits.js  (z folderu BuddetApp DB)
// ============================================================

const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key      = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const container = client.database("BudgetDB").container("Limits");

const FAMILY_ID = "MMs";

// ── Limity bazowe (obowiązują od 2026-01 wzwyż) ──────────────
//
// Kwoty dobrane do seedowanych transakcji żeby wskaźniki były
// widoczne (nie zawsze zielone, nie zawsze czerwone).
//
// Kategorie z seeda transakcji:
//   cat_zakupy       ~2395 PLN / miesiąc  → limit 2500
//   cat_dom          ~2309 PLN / miesiąc  → limit 2400 (czynsz+prąd+internet+telefon)
//   cat_restauracje  ~525  PLN / miesiąc  → limit 500  (lekkie przekroczenie)
//   cat_transport    ~565  PLN / miesiąc  → limit 700
//   cat_zdrowie      ~335  PLN / miesiąc  → limit 400
//   cat_rozrywka     ~250  PLN / miesiąc  → limit 300
//   cat_rozne        ~450  PLN / miesiąc  → limit 600
//   cat_kredyt       ~2100 PLN / miesiąc  → limit 2100 (dokładnie)

const limitDocs = [
  {
    categoryId: "cat_zakupy",
    limits: [
      { date: "2026-01", amount: 2500, type: "base" },
    ],
  },
  {
    categoryId: "cat_dom",
    limits: [
      { date: "2026-01", amount: 2400, type: "base" },
    ],
  },
  {
    categoryId: "cat_restauracje",
    limits: [
      { date: "2026-01", amount: 500, type: "base" },
      // Override maj — wyższy limit na majówkę
      { date: "2026-05", amount: 600, type: "override" },
    ],
  },
  {
    categoryId: "cat_transport",
    limits: [
      { date: "2026-01", amount: 700, type: "base" },
    ],
  },
  {
    categoryId: "cat_zdrowie",
    limits: [
      { date: "2026-01", amount: 400, type: "base" },
    ],
  },
  {
    categoryId: "cat_rozrywka",
    limits: [
      { date: "2026-01", amount: 300, type: "base" },
    ],
  },
  {
    categoryId: "cat_rozne",
    limits: [
      { date: "2026-01", amount: 600, type: "base" },
    ],
  },
  {
    categoryId: "cat_kredyt",
    limits: [
      { date: "2026-01", amount: 2200, type: "base" },
    ],
  },
];

// ── Seed ─────────────────────────────────────────────────────

async function seed() {
  console.log(`🚀 Seeding ${limitDocs.length} limit documents for family '${FAMILY_ID}'...\n`);
  let ok = 0, fail = 0;

  for (const doc of limitDocs) {
    const id = `lim_${FAMILY_ID}_${doc.categoryId}`;
    const item = {
      id,
      userId:     FAMILY_ID,
      categoryId: doc.categoryId,
      limits:     doc.limits.sort((a, b) => a.date.localeCompare(b.date)),
      createdAt:  new Date().toISOString(),
      createdBy:  "seed",
      createdById: "seed",
    };

    try {
      await container.items.upsert(item);
      const summary = doc.limits
        .map(l => `${l.type === "override" ? "⚡" : "📌"} ${l.date}: ${l.amount} PLN (${l.type})`)
        .join("  |  ");
      console.log(`✅ ${doc.categoryId.padEnd(20)} ${summary}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${doc.categoryId} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\n✨ Done! ${ok} upserted, ${fail} failed.`);
  console.log(`\n📊 Podgląd limitów maj 2026:`);

  for (const doc of limitDocs) {
    const active = getActiveLimit({ limits: doc.limits }, "2026-05");
    if (active) {
      console.log(`  ${doc.categoryId.padEnd(20)} ${active.amount} PLN (${active.type}${active.type === "override" ? " ⚡" : ""})`);
    }
  }
}

// ── Helper (mirror of backend/frontend logic) ─────────────────

function getActiveLimit(doc, month) {
  if (!doc?.limits?.length) return null;
  const override = doc.limits.find(l => l.type === "override" && l.date === month);
  if (override) return { amount: override.amount, type: "override", date: override.date };
  const bases = doc.limits
    .filter(l => l.type === "base" && l.date <= month)
    .sort((a, b) => b.date.localeCompare(a.date));
  return bases.length ? { amount: bases[0].amount, type: "base", date: bases[0].date } : null;
}

seed().catch(console.error);