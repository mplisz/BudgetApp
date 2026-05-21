// ============================================================
// File: backend/seed_transactions.js
// Seed ~60 transakcji dla miesiąca 2026-05 (aktywny miesiąc)
// i kilku poprzednich — żeby Summary Panel miał co pokazać.
//
// Użycie:
//   node backend/seed_transactions.js
//
// Uruchomienie: node seed_transactions.js  (z folderu BuddetApp DB)
// ============================================================

const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key      = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const db        = client.database("BudgetDB");
const container = db.container("Transactions");

const FAMILY_ID   = "MMs";
const MONTHS      = ["2026-02", "2026-03", "2026-04", "2026-05"];
const ACTIVE_MONTH = "2026-05";

let seq = 1;
function id(month) {
  return `tx_seed_${month.replace("-","")}_${String(seq++).padStart(3,"0")}_MMs`;
}
function date(month, day) {
  return `${month}-${String(day).padStart(2,"0")}`;
}

// ── Transakcje ────────────────────────────────────────────────

const transactions = [

  // ══════════════════════════════════════════════════════
  // 2026-05 (aktywny miesiąc) — pełny przekrój
  // ══════════════════════════════════════════════════════

  // INCOME
  { budgetMonth: "2026-05", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_sopra_MMs",         subcategoryName: "Sopra Steria",             amount: 7200,  priority: 1, date: date("2026-05", 5)  },
  { budgetMonth: "2026-05", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_pwc_MMs",           subcategoryName: "PwC",                      amount: 5800,  priority: 1, date: date("2026-05", 5)  },
  { budgetMonth: "2026-05", type: "INCOME",  categoryId: "cat_premie",     categoryName: "Premie bankowe",   subcategoryId: "cat_root_premie_bankowe_mms_bnp_MMs",subcategoryName: "BNP",                      amount: 120,   priority: 4, date: date("2026-05", 8)  },
  { budgetMonth: "2026-05", type: "INCOME",  categoryId: "cat_inne_income",categoryName: "Inne wpływy",      subcategoryId: "cat_root_inne_income_800plus_MMs",   subcategoryName: "800 plus",                 amount: 800,   priority: 2, date: date("2026-05", 3)  },

  // EXPENSE — Zakupy (cat_zakupy)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_spozywcze_MMs",      subcategoryName: "Artykuły spożywcze",       amount: 680,   priority: 1, date: date("2026-05", 3)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_spozywcze_MMs",      subcategoryName: "Artykuły spożywcze",       amount: 520,   priority: 1, date: date("2026-05", 12) },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_pampersy_MMs",       subcategoryName: "Pampersy",                 amount: 210,   priority: 1, date: date("2026-05", 4)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_mleko_MMs",          subcategoryName: "Mleko modyfikowane",       amount: 180,   priority: 1, date: date("2026-05", 4)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_higiena_MMs",        subcategoryName: "Higiena",                  amount: 95,    priority: 1, date: date("2026-05", 7)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_ubrania_MMs",        subcategoryName: "Ubrania, buty i akcesoria",amount: 340,   priority: 2, date: date("2026-05", 10) },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_prezenty_MMs",       subcategoryName: "Prezenty",                 amount: 150,   priority: 2, date: date("2026-05", 14) },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_dania_MMs",          subcategoryName: "Dania gotowe",             amount: 220,   priority: 2, date: date("2026-05", 9)  },

  // EXPENSE — Dom (cat_dom)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_czynsz_MMs",            subcategoryName: "Czynsz",                   amount: 1850,  priority: 1, date: date("2026-05", 1)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_prad_MMs",              subcategoryName: "Prąd",                     amount: 280,   priority: 1, date: date("2026-05", 2)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_internet_MMs",          subcategoryName: "Internet",                 amount: 59,    priority: 1, date: date("2026-05", 2)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_telefon_MMs",           subcategoryName: "Telefon",                  amount: 120,   priority: 1, date: date("2026-05", 2)  },

  // EXPENSE — Restauracje (cat_restauracje)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_restauracje",categoryName: "Restauracje",      subcategoryId: "cat_root_restauracje_obiad_MMs",     subcategoryName: "Obiady",                   amount: 380,   priority: 2, date: date("2026-05", 11) },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_restauracje",categoryName: "Restauracje",      subcategoryId: "cat_root_restauracje_kawa_MMs",      subcategoryName: "Kawiarnia",                amount: 145,   priority: 3, date: date("2026-05", 15) },

  // EXPENSE — Transport (cat_transport)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_transport",  categoryName: "Transport",        subcategoryId: "cat_root_transport_paliwo_MMs",      subcategoryName: "Paliwo",                   amount: 420,   priority: 1, date: date("2026-05", 6)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_transport",  categoryName: "Transport",        subcategoryId: "cat_root_transport_parking_MMs",     subcategoryName: "Parkingi",                 amount: 80,    priority: 2, date: date("2026-05", 8)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_transport",  categoryName: "Transport",        subcategoryId: "cat_root_transport_taxi_MMs",        subcategoryName: "Taxi",                     amount: 65,    priority: 2, date: date("2026-05", 13) },

  // EXPENSE — Zdrowie (cat_zdrowie)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zdrowie",    categoryName: "Zdrowie",          subcategoryId: "cat_root_zdrowie_leki_MMs",          subcategoryName: "Leki",                     amount: 135,   priority: 1, date: date("2026-05", 7)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_zdrowie",    categoryName: "Zdrowie",          subcategoryId: "cat_root_zdrowie_wizyta_MMs",        subcategoryName: "Wizyta lekarska",          amount: 200,   priority: 1, date: date("2026-05", 9)  },

  // EXPENSE — Rozrywka (cat_rozrywka)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_rozrywka",   categoryName: "Rozrywka",         subcategoryId: "cat_root_rozrywka_kino_MMs",         subcategoryName: "Kino / teatr",             amount: 90,    priority: 3, date: date("2026-05", 16) },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_rozrywka",   categoryName: "Rozrywka",         subcategoryId: "cat_root_rozrywka_sport_MMs",        subcategoryName: "Sport i rekreacja",        amount: 160,   priority: 2, date: date("2026-05", 5)  },

  // EXPENSE — Różne: ubezpieczenia (cat_rozne) — liczy się do wskaźnika
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_rozne",      categoryName: "Różne",            subcategoryId: "cat_root_rozne_ubezp_zycie_MMs",     subcategoryName: "Ubezpieczenie na życie",   amount: 320,   priority: 1, date: date("2026-05", 1)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_rozne",      categoryName: "Różne",            subcategoryId: "cat_root_rozne_subskrypcje_MMs",     subcategoryName: "Subskrypcje",              amount: 85,    priority: 2, date: date("2026-05", 3)  },
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_rozne",      categoryName: "Różne",            subcategoryId: "cat_root_rozne_bankowe_MMs",         subcategoryName: "Opłaty bankowe",           amount: 45,    priority: 1, date: date("2026-05", 2)  },

  // EXPENSE — Zobowiązania / kredyt (cat_kredyt lub cat_zobowiazania jeśli istnieje)
  { budgetMonth: "2026-05", type: "EXPENSE", categoryId: "cat_kredyt",     categoryName: "Kredyt hipoteczny",subcategoryId: "cat_root_kredyt_rata_MMs",           subcategoryName: "Rata kredytu",             amount: 2100,  priority: 1, tags: ["tag_raty_MMs"], date: date("2026-05", 1)  },

  // SAVING — Emerytura (liczy się do wskaźnika minRetirementPercent)
  { budgetMonth: "2026-05", type: "SAVING",  categoryId: "cat_emerytura",  categoryName: "Emerytura",        subcategoryId: "cat_root_emerytura_ikze_etf_MMs",    subcategoryName: "IKZE ETF",                 amount: 700,   priority: 2, date: date("2026-05", 5)  },
  { budgetMonth: "2026-05", type: "SAVING",  categoryId: "cat_emerytura",  categoryName: "Emerytura",        subcategoryId: "cat_root_emerytura_ike_etf_MMs",     subcategoryName: "IKE ETF",                  amount: 500,   priority: 2, date: date("2026-05", 5)  },

  // SAVING — Inwestycje
  { budgetMonth: "2026-05", type: "SAVING",  categoryId: "cat_inwestycje", categoryName: "Inwestycje",       subcategoryId: "cat_root_inwestycje_obligacje4_MMs", subcategoryName: "Obligacje 4-letnie",       amount: 1000,  priority: 2, date: date("2026-05", 5)  },
  { budgetMonth: "2026-05", type: "SAVING",  categoryId: "cat_inwestycje", categoryName: "Inwestycje",       subcategoryId: "cat_root_inwestycje_zloto_MMs",      subcategoryName: "Złoto",                    amount: 400,   priority: 4, date: date("2026-05", 10) },

  // SAVING — Fundusz awaryjny
  { budgetMonth: "2026-05", type: "SAVING",  categoryId: "cat_fundusz",    categoryName: "Fundusz awaryjny", subcategoryId: "cat_root_fundusz_obligacje10_MMs",   subcategoryName: "Obligacje 10-letnie",      amount: 600,   priority: 2, date: date("2026-05", 5)  },

  // ══════════════════════════════════════════════════════
  // 2026-04
  // ══════════════════════════════════════════════════════

  { budgetMonth: "2026-04", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_sopra_MMs",         subcategoryName: "Sopra Steria",             amount: 7200,  priority: 1, date: date("2026-04", 5) },
  { budgetMonth: "2026-04", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_pwc_MMs",           subcategoryName: "PwC",                      amount: 5800,  priority: 1, date: date("2026-04", 5) },
  { budgetMonth: "2026-04", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_spozywcze_MMs",      subcategoryName: "Artykuły spożywcze",       amount: 1100,  priority: 1, date: date("2026-04", 6) },
  { budgetMonth: "2026-04", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_czynsz_MMs",            subcategoryName: "Czynsz",                   amount: 1850,  priority: 1, date: date("2026-04", 1) },
  { budgetMonth: "2026-04", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_prad_MMs",              subcategoryName: "Prąd",                     amount: 310,   priority: 1, date: date("2026-04", 2) },
  { budgetMonth: "2026-04", type: "EXPENSE", categoryId: "cat_transport",  categoryName: "Transport",        subcategoryId: "cat_root_transport_paliwo_MMs",      subcategoryName: "Paliwo",                   amount: 390,   priority: 1, date: date("2026-04", 7) },
  { budgetMonth: "2026-04", type: "EXPENSE", categoryId: "cat_rozne",      categoryName: "Różne",            subcategoryId: "cat_root_rozne_ubezp_zycie_MMs",     subcategoryName: "Ubezpieczenie na życie",   amount: 320,   priority: 1, date: date("2026-04", 1) },
  { budgetMonth: "2026-04", type: "EXPENSE", categoryId: "cat_kredyt",     categoryName: "Kredyt hipoteczny",subcategoryId: "cat_root_kredyt_rata_MMs",           subcategoryName: "Rata kredytu",             amount: 2100,  priority: 1, tags: ["tag_raty_MMs"], date: date("2026-04", 1) },
  { budgetMonth: "2026-04", type: "SAVING",  categoryId: "cat_emerytura",  categoryName: "Emerytura",        subcategoryId: "cat_root_emerytura_ikze_etf_MMs",    subcategoryName: "IKZE ETF",                 amount: 600,   priority: 2, date: date("2026-04", 5) },
  { budgetMonth: "2026-04", type: "SAVING",  categoryId: "cat_inwestycje", categoryName: "Inwestycje",       subcategoryId: "cat_root_inwestycje_obligacje4_MMs", subcategoryName: "Obligacje 4-letnie",       amount: 800,   priority: 2, date: date("2026-04", 5) },

  // ══════════════════════════════════════════════════════
  // 2026-03
  // ══════════════════════════════════════════════════════

  { budgetMonth: "2026-03", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_sopra_MMs",         subcategoryName: "Sopra Steria",             amount: 7200,  priority: 1, date: date("2026-03", 5) },
  { budgetMonth: "2026-03", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_pwc_MMs",           subcategoryName: "PwC",                      amount: 5800,  priority: 1, date: date("2026-03", 5) },
  { budgetMonth: "2026-03", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_spozywcze_MMs",      subcategoryName: "Artykuły spożywcze",       amount: 950,   priority: 1, date: date("2026-03", 4) },
  { budgetMonth: "2026-03", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_czynsz_MMs",            subcategoryName: "Czynsz",                   amount: 1850,  priority: 1, date: date("2026-03", 1) },
  { budgetMonth: "2026-03", type: "EXPENSE", categoryId: "cat_transport",  categoryName: "Transport",        subcategoryId: "cat_root_transport_paliwo_MMs",      subcategoryName: "Paliwo",                   amount: 460,   priority: 1, date: date("2026-03", 6) },
  { budgetMonth: "2026-03", type: "EXPENSE", categoryId: "cat_rozne",      categoryName: "Różne",            subcategoryId: "cat_root_rozne_ubezp_zycie_MMs",     subcategoryName: "Ubezpieczenie na życie",   amount: 320,   priority: 1, date: date("2026-03", 1) },
  { budgetMonth: "2026-03", type: "EXPENSE", categoryId: "cat_kredyt",     categoryName: "Kredyt hipoteczny",subcategoryId: "cat_root_kredyt_rata_MMs",           subcategoryName: "Rata kredytu",             amount: 2100,  priority: 1, tags: ["tag_raty_MMs"], date: date("2026-03", 1) },
  { budgetMonth: "2026-03", type: "SAVING",  categoryId: "cat_emerytura",  categoryName: "Emerytura",        subcategoryId: "cat_root_emerytura_ike_etf_MMs",     subcategoryName: "IKE ETF",                  amount: 500,   priority: 2, date: date("2026-03", 5) },
  { budgetMonth: "2026-03", type: "SAVING",  categoryId: "cat_fundusz",    categoryName: "Fundusz awaryjny", subcategoryId: "cat_root_fundusz_obligacje10_MMs",   subcategoryName: "Obligacje 10-letnie",      amount: 500,   priority: 2, date: date("2026-03", 5) },

  // ══════════════════════════════════════════════════════
  // 2026-02
  // ══════════════════════════════════════════════════════

  { budgetMonth: "2026-02", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_sopra_MMs",         subcategoryName: "Sopra Steria",             amount: 7200,  priority: 1, date: date("2026-02", 5) },
  { budgetMonth: "2026-02", type: "INCOME",  categoryId: "cat_wyplata",    categoryName: "Wypłata",          subcategoryId: "cat_root_wyplata_pwc_MMs",           subcategoryName: "PwC",                      amount: 5800,  priority: 1, date: date("2026-02", 5) },
  { budgetMonth: "2026-02", type: "EXPENSE", categoryId: "cat_zakupy",     categoryName: "Zakupy",           subcategoryId: "cat_root_zakupy_spozywcze_MMs",      subcategoryName: "Artykuły spożywcze",       amount: 870,   priority: 1, date: date("2026-02", 4) },
  { budgetMonth: "2026-02", type: "EXPENSE", categoryId: "cat_dom",        categoryName: "Dom",              subcategoryId: "cat_root_dom_czynsz_MMs",            subcategoryName: "Czynsz",                   amount: 1850,  priority: 1, date: date("2026-02", 1) },
  { budgetMonth: "2026-02", type: "EXPENSE", categoryId: "cat_transport",  categoryName: "Transport",        subcategoryId: "cat_root_transport_paliwo_MMs",      subcategoryName: "Paliwo",                   amount: 410,   priority: 1, date: date("2026-02", 6) },
  { budgetMonth: "2026-02", type: "EXPENSE", categoryId: "cat_rozne",      categoryName: "Różne",            subcategoryId: "cat_root_rozne_ubezp_zycie_MMs",     subcategoryName: "Ubezpieczenie na życie",   amount: 320,   priority: 1, date: date("2026-02", 1) },
  { budgetMonth: "2026-02", type: "EXPENSE", categoryId: "cat_kredyt",     categoryName: "Kredyt hipoteczny",subcategoryId: "cat_root_kredyt_rata_MMs",           subcategoryName: "Rata kredytu",             amount: 2100,  priority: 1, tags: ["tag_raty_MMs"], date: date("2026-02", 1) },
  { budgetMonth: "2026-02", type: "SAVING",  categoryId: "cat_emerytura",  categoryName: "Emerytura",        subcategoryId: "cat_root_emerytura_ikze_etf_MMs",    subcategoryName: "IKZE ETF",                 amount: 650,   priority: 2, date: date("2026-02", 5) },
  { budgetMonth: "2026-02", type: "SAVING",  categoryId: "cat_inwestycje", categoryName: "Inwestycje",       subcategoryId: "cat_root_inwestycje_zloto_MMs",      subcategoryName: "Złoto",                    amount: 300,   priority: 4, date: date("2026-02", 5) },
];

// ── Uzupełnij pola wymagane przez backend ─────────────────────

const enriched = transactions.map((tx, i) => ({
  id:               id(tx.budgetMonth),
  userId:           FAMILY_ID,
  isArchived:       false,
  originalAmount:   tx.amount,
  originalCurrency: "PLN",
  fxRate:           1,
  tags:             [],
  description:      "",
  isRecurring:      false,
  recurringId:      null,
  useVoucher:       false,
  voucherId:        null,
  voucherAmount:    0,
  returns:          [],
  createdAt:        new Date().toISOString(),
  ...tx,
}));

// ── Seed ──────────────────────────────────────────────────────

async function seed() {
  console.log(`🚀 Seeding ${enriched.length} transactions...`);
  let ok = 0, fail = 0;

  for (const tx of enriched) {
    try {
      await container.items.upsert(tx);
      const icon = tx.type === "INCOME" ? "💰" : tx.type === "SAVING" ? "🏦" : tx.type === "TRANSFER" ? "🔄" : "💸";
      console.log(`✅ ${icon} [${tx.budgetMonth}] ${tx.categoryName} / ${tx.subcategoryName} — ${tx.amount} PLN`);
      ok++;
    } catch (err) {
      console.error(`❌ ${tx.id} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\n✨ Done! ${ok} upserted, ${fail} failed.`);
  console.log(`\n📊 Podział wg miesięcy:`);
  for (const m of MONTHS) {
    const count = enriched.filter(t => t.budgetMonth === m).length;
    const income = enriched.filter(t => t.budgetMonth === m && t.type === "INCOME").reduce((s,t)=>s+t.amount,0);
    const expense = enriched.filter(t => t.budgetMonth === m && t.type === "EXPENSE").reduce((s,t)=>s+t.amount,0);
    const saving = enriched.filter(t => t.budgetMonth === m && t.type === "SAVING").reduce((s,t)=>s+t.amount,0);
    console.log(`  ${m}: ${count} tx | wpływy ${income} | wydatki ${expense} | oszczędności ${saving}`);
  }
}

seed().catch(console.error);