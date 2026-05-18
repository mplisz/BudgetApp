// ============================================================
// File: BuddetApp DB/seed-limits.js
// ZMIANA: userId (familyId) zamiast targetId jako PK
// ============================================================
const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const container = client.database("BudgetDB").container("Limits");

const FAMILY_ID = "MMs";

// Deterministic IDs: lim_{type}_{targetId}_{period}_{familyId}
const limitsData = [
  // ── BASE limits ──────────────────────────────────────────
  {
    id:          `lim_base_cat_zakupy_2026-01_${FAMILY_ID}`,
    userId:      FAMILY_ID,
    targetId:    "cat_zakupy",
    targetType:  "CATEGORY",
    limitType:   "BASE",
    amount:      2000,
    period:      "2026-01",
    description: "Domyślny limit na zakupy",
  },
  {
    id:          `lim_base_cat_dom_2026-01_${FAMILY_ID}`,
    userId:      FAMILY_ID,
    targetId:    "cat_dom",
    targetType:  "CATEGORY",
    limitType:   "BASE",
    amount:      3500,
    period:      "2026-01",
    description: "Domyślny limit na dom",
  },
  {
    id:          `lim_base_cat_rozrywka_2026-01_${FAMILY_ID}`,
    userId:      FAMILY_ID,
    targetId:    "cat_rozrywka",
    targetType:  "CATEGORY",
    limitType:   "BASE",
    amount:      300,
    period:      "2026-01",
  },

  // ── OVERRIDE — Maj 2026 ───────────────────────────────────
  {
    id:          `lim_override_cat_zakupy_2026-05_${FAMILY_ID}`,
    userId:      FAMILY_ID,
    targetId:    "cat_zakupy",
    targetType:  "CATEGORY",
    limitType:   "OVERRIDE",
    amount:      3200,
    period:      "2026-05",
    description: "Majówka i zapasy",
  },
];

async function seedLimits() {
  console.log("🚀 Seeding Limits container (PK: /userId)...");
  try {
    for (const item of limitsData) {
      await container.items.upsert(item);
      console.log(`✅ ${item.limitType} | ${item.targetId} | ${item.period} → ${item.amount} PLN`);
    }
    console.log("\n✨ Limits seeded!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

seedLimits();