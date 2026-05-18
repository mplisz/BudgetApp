// ============================================================
// File: BuddetApp DB/seed-categories.js
// Run: node seed-categories.js
// Priority scale: 1=must, 2=should, 3=nice-to-have, 4=rare/investment
// ============================================================

const { CosmosClient } = require("@azure/cosmos");

const endpoint = "https://localhost:8081";
const key      = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client    = new CosmosClient({ endpoint, key });
const container = client.database("BudgetDB").container("Categories");

const FAMILY_ID = "MMs";

const data = [

  // ══════════════════════════════════════════════════════════
  // GŁÓWNE KATEGORIE (root)
  // ══════════════════════════════════════════════════════════

  { id: "cat_zakupy",       userId: FAMILY_ID, type: "EXPENSE",  icon: "🛒", name: "Zakupy codzienne", parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_edukacja",     userId: FAMILY_ID, type: "EXPENSE",  icon: "📚", name: "Edukacja",         parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_dom",          userId: FAMILY_ID, type: "EXPENSE",  icon: "🏠", name: "Dom i ogród",      parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_restauracje",  userId: FAMILY_ID, type: "EXPENSE",  icon: "🍽️", name: "Restauracje",      parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_zdrowie",      userId: FAMILY_ID, type: "EXPENSE",  icon: "💊", name: "Zdrowie",          parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_rozrywka",     userId: FAMILY_ID, type: "EXPENSE",  icon: "🎭", name: "Rozrywka",         parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_transport",    userId: FAMILY_ID, type: "EXPENSE",  icon: "🚗", name: "Transport",        parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_rozne",        userId: FAMILY_ID, type: "EXPENSE",  icon: "📦", name: "Różne",            parentCategoryId: null,  isArchived: false , canBeRecurring:false },

  { id: "cat_wyplata",      userId: FAMILY_ID, type: "INCOME",   icon: "💰", name: "Wypłata",          parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_premie",       userId: FAMILY_ID, type: "INCOME",   icon: "🏦", name: "Premie bankowe",   parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_inne_income",  userId: FAMILY_ID, type: "INCOME",   icon: "💵", name: "Inne",             parentCategoryId: null,  isArchived: false , canBeRecurring:false },

  { id: "cat_srodki",       userId: FAMILY_ID, type: "TRANSFER", icon: "🔄", name: "Środki własne",    parentCategoryId: null,  isArchived: false , canBeRecurring:false },

  { id: "cat_fundusz",      userId: FAMILY_ID, type: "SAVING",   icon: "🛡️", name: "Fundusz awaryjny", parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_inwestycje",   userId: FAMILY_ID, type: "SAVING",   icon: "📈", name: "Inwestycje",       parentCategoryId: null,  isArchived: false , canBeRecurring:false },
  { id: "cat_emerytura",    userId: FAMILY_ID, type: "SAVING",   icon: "👴", name: "Emerytura",        parentCategoryId: null,  isArchived: false , canBeRecurring:false },


  // ══════════════════════════════════════════════════════════
  // EXPENSE — Zakupy codzienne
  // ══════════════════════════════════════════════════════════

  { id: "cat_root_zakupy_spozywcze_MMs",      userId: FAMILY_ID, type: "EXPENSE", icon: "🥦", name: "Artykuły spożywcze",             parentCategoryId: "cat_zakupy", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_pampersy_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "👶", name: "Pampersy",                       parentCategoryId: "cat_zakupy", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_mleko_MMs",           userId: FAMILY_ID, type: "EXPENSE", icon: "🍼", name: "Mleko modyfikowane",             parentCategoryId: "cat_zakupy", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_higiena_MMs",         userId: FAMILY_ID, type: "EXPENSE", icon: "🧴", name: "Higiena",                        parentCategoryId: "cat_zakupy", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_chemia_MMs",          userId: FAMILY_ID, type: "EXPENSE", icon: "🧹", name: "Chemia domowa",                  parentCategoryId: "cat_zakupy", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_ubrania_MMs",         userId: FAMILY_ID, type: "EXPENSE", icon: "👗", name: "Ubrania, buty i akcesoria",      parentCategoryId: "cat_zakupy", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_prezenty_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🎁", name: "Prezenty",                       parentCategoryId: "cat_zakupy", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_dania_MMs",           userId: FAMILY_ID, type: "EXPENSE", icon: "🥡", name: "Dania gotowe",                   parentCategoryId: "cat_zakupy", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_papiernicze_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "📝", name: "Artykuły papiernicze",           parentCategoryId: "cat_zakupy", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_slodycze_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🍬", name: "Słodycze",                       parentCategoryId: "cat_zakupy", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_napoje_MMs",          userId: FAMILY_ID, type: "EXPENSE", icon: "🥤", name: "Napoje",                         parentCategoryId: "cat_zakupy", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_zbiorki_MMs",         userId: FAMILY_ID, type: "EXPENSE", icon: "🤝", name: "Zbiórki w pracy",               parentCategoryId: "cat_zakupy", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zakupy_datki_MMs",           userId: FAMILY_ID, type: "EXPENSE", icon: "❤️", name: "Datki, organizacje charytatywne", parentCategoryId: "cat_zakupy", priority: 3,  isArchived: false , canBeRecurring:false },

  // ── Edukacja ─────────────────────────────────────────────

  { id: "cat_root_edukacja_szkolenia_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "🎓", name: "Szkolenia",    parentCategoryId: "cat_edukacja", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_edukacja_kursy_MMs",         userId: FAMILY_ID, type: "EXPENSE", icon: "💻", name: "Kursy",        parentCategoryId: "cat_edukacja", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_edukacja_italki_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🗣️", name: "Italki",       parentCategoryId: "cat_edukacja", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_edukacja_podreczniki_MMs",   userId: FAMILY_ID, type: "EXPENSE", icon: "📖", name: "Podręczniki",  parentCategoryId: "cat_edukacja", priority: 2,  isArchived: false , canBeRecurring:false },

  // ── Dom i ogród ───────────────────────────────────────────

  { id: "cat_root_dom_ubezpieczenie_MMs",      userId: FAMILY_ID, type: "EXPENSE", icon: "🛡️", name: "Ubezpieczenie",         parentCategoryId: "cat_dom", priority: 1,  isArchived: false , canBeRecurring:false },

  { id: "cat_root_dom_remont_MMs",             userId: FAMILY_ID, type: "EXPENSE", icon: "🔨", name: "Remont",                parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_agd_MMs",                userId: FAMILY_ID, type: "EXPENSE", icon: "🍳", name: "AGD",                   parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_benzyna_MMs",            userId: FAMILY_ID, type: "EXPENSE", icon: "⛽", name: "Benzyna",               parentCategoryId: "cat_dom", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_chemia_tech_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🔧", name: "Chemia techniczna",     parentCategoryId: "cat_dom", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_sprzet_MMs",             userId: FAMILY_ID, type: "EXPENSE", icon: "🧰", name: "Drobny sprzęt domowy",  parentCategoryId: "cat_dom", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_elektronika_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "📱", name: "Elektronika i gadżety", parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_meble_MMs",              userId: FAMILY_ID, type: "EXPENSE", icon: "🪑", name: "Meble",                 parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_rtv_MMs",                userId: FAMILY_ID, type: "EXPENSE", icon: "📺", name: "RTV",                   parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_narzedzia_MMs",          userId: FAMILY_ID, type: "EXPENSE", icon: "🪛", name: "Narzędzia",             parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_dom_kwiaty_MMs",             userId: FAMILY_ID, type: "EXPENSE", icon: "🌸", name: "Kwiaty",                parentCategoryId: "cat_dom", priority: 3,  isArchived: false , canBeRecurring:false },

  // ── Restauracje ───────────────────────────────────────────

  { id: "cat_root_restauracje_obiad_MMs",      userId: FAMILY_ID, type: "EXPENSE", icon: "🍲", name: "Obiad",     parentCategoryId: "cat_restauracje", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_restauracje_lody_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "🍦", name: "Lody",      parentCategoryId: "cat_restauracje", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_restauracje_sniadania_MMs",  userId: FAMILY_ID, type: "EXPENSE", icon: "🥐", name: "Śniadania", parentCategoryId: "cat_restauracje", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_restauracje_fastfood_MMs",   userId: FAMILY_ID, type: "EXPENSE", icon: "🍔", name: "Fast food",  parentCategoryId: "cat_restauracje", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_restauracje_kawa_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "☕", name: "Kawa",      parentCategoryId: "cat_restauracje", priority: 2,  isArchived: false , canBeRecurring:false },

  // ── Zdrowie ───────────────────────────────────────────────

  { id: "cat_root_zdrowie_lekarze_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🩺", name: "Lekarze",             parentCategoryId: "cat_zdrowie", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zdrowie_leki_MMs",           userId: FAMILY_ID, type: "EXPENSE", icon: "💊", name: "Leki",                parentCategoryId: "cat_zdrowie", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zdrowie_suplementy_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "🧪", name: "Suplementy",          parentCategoryId: "cat_zdrowie", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zdrowie_apteczka_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "🩹", name: "Apteczka",            parentCategoryId: "cat_zdrowie", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zdrowie_zabiegi_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🏥", name: "Zabiegi",             parentCategoryId: "cat_zdrowie", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zdrowie_badania_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🔬", name: "Badania",             parentCategoryId: "cat_zdrowie", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_zdrowie_abonamenty_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "📋", name: "Abonamenty medyczne", parentCategoryId: "cat_zdrowie", priority: 1,  isArchived: false , canBeRecurring:true},

  // ── Rozrywka ─────────────────────────────────────────────

  { id: "cat_root_rozrywka_ksiazki_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "📚", name: "Książki",         parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_bilety_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🎟️", name: "Bilety wstępu",   parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_prasa_MMs",         userId: FAMILY_ID, type: "EXPENSE", icon: "📰", name: "Prasa",           parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_hobby_MMs",         userId: FAMILY_ID, type: "EXPENSE", icon: "🎨", name: "Hobby",           parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_wycieczki_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "✈️", name: "Wycieczki",       parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_planszowe_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "♟️", name: "Gry planszowe",   parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_komputerowe_MMs",   userId: FAMILY_ID, type: "EXPENSE", icon: "🎮", name: "Gry komputerowe", parentCategoryId: "cat_rozrywka", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozrywka_streaming_MMs",     userId: FAMILY_ID, type: "EXPENSE", icon: "📡", name: "Streaming",       parentCategoryId: "cat_rozrywka", priority: 2,  isArchived: false , canBeRecurring:true },

  // ── Transport ────────────────────────────────────────────

  { id: "cat_root_transport_zbiorkom_MMs",      userId: FAMILY_ID, type: "EXPENSE", icon: "🚌", name: "Zbiorkom",                parentCategoryId: "cat_transport", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_oc_MMs",            userId: FAMILY_ID, type: "EXPENSE", icon: "📄", name: "OC",                      parentCategoryId: "cat_transport", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_ac_MMs",            userId: FAMILY_ID, type: "EXPENSE", icon: "🛡️", name: "AC",                      parentCategoryId: "cat_transport", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_paliwo_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "⛽", name: "Paliwo",                  parentCategoryId: "cat_transport", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_warsztat_MMs",      userId: FAMILY_ID, type: "EXPENSE", icon: "🔧", name: "Warsztat",                parentCategoryId: "cat_transport", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_eksploatacja_MMs",  userId: FAMILY_ID, type: "EXPENSE", icon: "🔩", name: "Materiały eksploatacyjne", parentCategoryId: "cat_transport", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_samolot_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "✈️", name: "Samolot",                 parentCategoryId: "cat_transport", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_parkingi_MMs",      userId: FAMILY_ID, type: "EXPENSE", icon: "🅿️", name: "Parkingi",                parentCategoryId: "cat_transport", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_taxi_MMs",          userId: FAMILY_ID, type: "EXPENSE", icon: "🚕", name: "Taxi",                    parentCategoryId: "cat_transport", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_transport_myjnia_MMs",        userId: FAMILY_ID, type: "EXPENSE", icon: "🚿", name: "Myjnia",                  parentCategoryId: "cat_transport", priority: 3,  isArchived: false , canBeRecurring:false },

  // ── Różne ────────────────────────────────────────────────

  { id: "cat_root_rozne_podatki_MMs",           userId: FAMILY_ID, type: "EXPENSE", icon: "🏛️", name: "Podatki",                 parentCategoryId: "cat_rozne", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozne_ubezp_zycie_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "🛡️", name: "Ubezpieczenie na życie",  parentCategoryId: "cat_rozne", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozne_bankowe_MMs",           userId: FAMILY_ID, type: "EXPENSE", icon: "🏦", name: "Opłaty bankowe",          parentCategoryId: "cat_rozne", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozne_ubezp_podrozne_MMs",    userId: FAMILY_ID, type: "EXPENSE", icon: "🌍", name: "Ubezpieczenie podróżne",  parentCategoryId: "cat_rozne", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_rozne_subskrypcje_MMs",       userId: FAMILY_ID, type: "EXPENSE", icon: "🔔", name: "Subskrypcje",             parentCategoryId: "cat_rozne", priority: 2,  isArchived: false , canBeRecurring:false },

  // ══════════════════════════════════════════════════════════
  // INCOME — Wypłata (priority 1)
  // ══════════════════════════════════════════════════════════

  { id: "cat_root_wyplata_sopra_MMs",           userId: FAMILY_ID, type: "INCOME", icon: "💼", name: "Sopra Steria", parentCategoryId: "cat_wyplata", priority: 1,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_wyplata_pwc_MMs",             userId: FAMILY_ID, type: "INCOME", icon: "💼", name: "PwC",          parentCategoryId: "cat_wyplata", priority: 1,  isArchived: false , canBeRecurring:false },

  // INCOME — Premie bankowe (priority 4)

  { id: "cat_root_premie_bankowe_mms_bnp_MMs",       userId: FAMILY_ID, type: "INCOME", icon: "🏦", name: "BNP",       parentCategoryId: "cat_premie", priority: 4,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_premie_bankowe_mms_millenium_MMs",  userId: FAMILY_ID, type: "INCOME", icon: "🏦", name: "Millenium", parentCategoryId: "cat_premie", priority: 4,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_premie_bankowe_mms_santander_MMs",  userId: FAMILY_ID, type: "INCOME", icon: "🏦", name: "Santander", parentCategoryId: "cat_premie", priority: 4,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_premie_bankowe_mms_pekao_MMs",      userId: FAMILY_ID, type: "INCOME", icon: "🏦", name: "Pekao",     parentCategoryId: "cat_premie", priority: 4,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_premie_bankowe_mms_mbank_MMs",      userId: FAMILY_ID, type: "INCOME", icon: "🏦", name: "mBank",     parentCategoryId: "cat_premie", priority: 4,  isArchived: false , canBeRecurring:false },

  // INCOME — Inne

  { id: "cat_root_inne_income_zwrot_podatku_MMs", userId: FAMILY_ID, type: "INCOME", icon: "💰", name: "Zwrot podatku", parentCategoryId: "cat_inne_income", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_inne_income_800plus_MMs",        userId: FAMILY_ID, type: "INCOME", icon: "👶", name: "800 plus",     parentCategoryId: "cat_inne_income", priority: 2,  isArchived: false , canBeRecurring:false },

  // ══════════════════════════════════════════════════════════
  // TRANSFER — Środki własne
  // ══════════════════════════════════════════════════════════

  { id: "cat_root_srodki_gotowka_MMs",           userId: FAMILY_ID, type: "TRANSFER", icon: "💵", name: "Gotówka",                         parentCategoryId: "cat_srodki", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_srodki_poduszka_MMs",           userId: FAMILY_ID, type: "TRANSFER", icon: "🛡️", name: "Poduszka finansowa",              parentCategoryId: "cat_srodki", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_srodki_nadwyzki_MMs",           userId: FAMILY_ID, type: "TRANSFER", icon: "📥", name: "Nadwyżki z poprzedniego miesiąca", parentCategoryId: "cat_srodki", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_srodki_zwroty_MMs",             userId: FAMILY_ID, type: "TRANSFER", icon: "🔁", name: "Zwroty",                          parentCategoryId: "cat_srodki", priority: 3,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_srodki_walutowe_MMs",           userId: FAMILY_ID, type: "TRANSFER", icon: "💱", name: "Nadwyżki z konta walutowego",     parentCategoryId: "cat_srodki", priority: 4,  isArchived: false , canBeRecurring:false },

  // ══════════════════════════════════════════════════════════
  // SAVING — Fundusz awaryjny
  // ══════════════════════════════════════════════════════════

  { id: "cat_root_fundusz_obligacje10_MMs",       userId: FAMILY_ID, type: "SAVING", icon: "📜", name: "Obligacje 10-letnie", parentCategoryId: "cat_fundusz",    priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_fundusz_gotowka_MMs",           userId: FAMILY_ID, type: "SAVING", icon: "💵", name: "Gotówka",             parentCategoryId: "cat_fundusz",    priority: 3,  isArchived: false , canBeRecurring:false },

  // SAVING — Inwestycje

  { id: "cat_root_inwestycje_obligacje4_MMs",     userId: FAMILY_ID, type: "SAVING", icon: "📜", name: "Obligacje 4-letnie",  parentCategoryId: "cat_inwestycje", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_inwestycje_obligacje12_MMs",    userId: FAMILY_ID, type: "SAVING", icon: "📜", name: "Obligacje 12-letnie", parentCategoryId: "cat_inwestycje", priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_inwestycje_zloto_MMs",          userId: FAMILY_ID, type: "SAVING", icon: "🥇", name: "Złoto",               parentCategoryId: "cat_inwestycje", priority: 4,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_inwestycje_waluty_MMs",         userId: FAMILY_ID, type: "SAVING", icon: "💱", name: "Waluty",              parentCategoryId: "cat_inwestycje", priority: 4,  isArchived: false , canBeRecurring:false },

  // SAVING — Emerytura

  { id: "cat_root_emerytura_ikze_etf_MMs",        userId: FAMILY_ID, type: "SAVING", icon: "📊", name: "IKZE ETF",       parentCategoryId: "cat_emerytura",  priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_emerytura_ike_etf_MMs",         userId: FAMILY_ID, type: "SAVING", icon: "📊", name: "IKE ETF",        parentCategoryId: "cat_emerytura",  priority: 2,  isArchived: false , canBeRecurring:false },
  { id: "cat_root_emerytura_ikze_obl_MMs",        userId: FAMILY_ID, type: "SAVING", icon: "📜", name: "IKZE Obligacje", parentCategoryId: "cat_emerytura",  priority: 2,  isArchived: false , canBeRecurring:false },

  // SAVING - krotkoterminowe
    {id:"cat_root_fundusz_cel_krotko_MMs",
    userId:           FAMILY_ID,
    type:             "SAVING",
    icon:             "🎯",
    name:             "Oszczędności na cel krótkoterminowy",
    parentCategoryId: "cat_fundusz",
    priority:         2,
    isArchived:       false,
    canBeRecurring:false 
}
];

async function seed() {
  console.log(`🚀 Seeding ${data.length} categories for family '${FAMILY_ID}'...`);
  let ok = 0, fail = 0;
  for (const item of data) {
    try {
      await container.items.upsert(item);
      const indent = item.parentCategoryId ? "  ↳" : "📂";
      console.log(`✅ ${indent} [${item.type}${item.priority ? ` p${item.priority}` : ""}] ${item.name}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${item.name} — ${err.message}`);
      fail++;
    }
  }
  console.log(`\n✨ Done! ${ok} upserted, ${fail} failed.`);
}

seed();