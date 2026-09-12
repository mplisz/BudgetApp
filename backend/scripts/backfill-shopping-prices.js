// ============================================================
// File: backend/scripts/backfill-shopping-prices.js
// ONE-OFF: fill the shopping catalog's price history from receipts that
// were saved before prices were recorded at all.
//
// Without this, "zwykle X" stays blank for weeks even though the data is
// sitting in Transactions. It runs the exact code the live save path
// runs — matchLines, observationFrom, addObservation — so a backfilled
// price is indistinguishable from one recorded at the till.
//
// HOW TO RUN (from the repo root):
//   node backend/scripts/backfill-shopping-prices.js --dry-run
//   node backend/scripts/backfill-shopping-prices.js
//   node backend/scripts/backfill-shopping-prices.js --include-existing
//
// Uses backend/.env (COSMOS_ENDPOINT / COSMOS_KEY / COSMOS_DATABASE) and
// prints which database it is about to touch BEFORE doing anything.
//
// WHAT IT WRITES
//   By default only products that have NO recorded price yet. That makes
//   it safe to run twice (the second run finds nothing to do) and means
//   it can never bring back a price someone removed with ✕ — a removed
//   observation leaves no trace, so it cannot tell "rejected" from
//   "never recorded".
//
//   --include-existing also merges history into products that already
//   have a price (duplicates by date+amount are skipped). Use it only if
//   nothing was removed by hand, because those removals WILL come back.
//
// COST: one read of the last 90 days of transactions per family, and one
// write of the catalog document per family — not one write per receipt,
// which on a shared 1000 RU/s database would mean throttling.
// ============================================================

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { CosmosClient } = require("@azure/cosmos");
const { upsertSettingsDoc } = require("../utils/settingsDoc");
const { matchLines } = require("../utils/shoppingMatch");
const { observationFrom, addObservation, summarize, WINDOW_DAYS } = require("../utils/shoppingPrices");
const { withId } = require("../utils/shoppingCatalog");

const DRY_RUN          = process.argv.includes("--dry-run");
const INCLUDE_EXISTING = process.argv.includes("--include-existing");

const money = (n) => n.toFixed(2).replace(".", ",");

async function main() {
  const endpoint   = process.env.COSMOS_ENDPOINT;
  const key        = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE;

  if (!endpoint || !key || !databaseId) {
    console.error("❌ Missing COSMOS_ENDPOINT / COSMOS_KEY / COSMOS_DATABASE (backend/.env).");
    process.exit(1);
  }
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  console.log(`🔗 ${endpoint} → ${databaseId}`);
  console.log(DRY_RUN ? "🧪 DRY RUN — nic nie zostanie zapisane\n" : "✍️  ZAPIS WŁĄCZONY\n");
  if (INCLUDE_EXISTING) {
    console.log("⚠️  --include-existing: ceny usunięte ręcznie (✕) wrócą.\n");
  }

  const database     = new CosmosClient({ endpoint, key }).database(databaseId);
  const settings     = database.container("Settings");
  const transactions = database.container("Transactions");

  // Every family that has a catalog. Families without one have never
  // used the shopping list, so there is nothing to attach prices to.
  const { resources: catalogs } = await settings.items
    .query("SELECT * FROM c WHERE c.type = 'SHOPPING_CATALOG'")
    .fetchAll();

  if (catalogs.length === 0) {
    console.log("Brak katalogów zakupowych — nic do zrobienia.");
    return;
  }

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  for (const catalog of catalogs) {
    const familyId = catalog.userId;
    const entries  = Array.isArray(catalog.items) ? catalog.items : [];
    console.log(`━━ rodzina ${familyId} — ${entries.length} produktów w katalogu`);

    const hasPrices = (e) => Array.isArray(e.prices) && e.prices.length > 0;
    const targets = INCLUDE_EXISTING ? entries : entries.filter(e => !hasPrices(e));
    const skipped = entries.length - targets.length;

    if (targets.length === 0) {
      console.log("   wszystkie produkty mają już ceny — pomijam\n");
      continue;
    }

    // Only the fields the price math reads, and only live transactions:
    // a price from an archived (deleted) purchase is not a price anyone
    // paid. Same filter the transactions routes use.
    const { resources: txs } = await transactions.items
      .query({
        query: `SELECT c.id, c.date, c.merchant, c.lineItems FROM c
                WHERE c.userId = @familyId
                  AND c.date >= @cutoff
                  AND IS_DEFINED(c.lineItems) AND ARRAY_LENGTH(c.lineItems) > 0
                  AND (c.isArchived = false OR NOT IS_DEFINED(c.isArchived))`,
        parameters: [
          { name: "@familyId", value: familyId },
          { name: "@cutoff",   value: cutoff },
        ],
      })
      .fetchAll();

    console.log(`   transakcji z liniami od ${cutoff}: ${txs.length}`);

    // Oldest first, so addObservation's "keep the newest N" leaves the
    // most recent purchases, exactly as if they had been recorded live.
    txs.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

    const candidates = targets.map(e => ({ id: e.key, key: e.key, name: e.name }));
    const collected  = new Map();   // key → observations

    for (const tx of txs) {
      const date = (tx.date || "").slice(0, 10);
      for (const m of matchLines(candidates, tx.lineItems)) {
        const obs = observationFrom(tx.lineItems[m.lineIndex], date, tx.merchant, tx.id);
        if (!obs) continue;
        collected.set(m.itemId, addObservation(collected.get(m.itemId) ?? [], withId(obs)));
      }
    }

    // Report before writing, so a dry run shows exactly what a real run
    // would put on screen.
    const byName = new Map(entries.map(e => [e.key, e.name]));
    for (const [k, obs] of [...collected.entries()].sort()) {
      const s = summarize(obs);
      if (!s) continue;
      const unit  = s.unit === "kg" ? " zł/kg" : " zł";
      const usual = s.median != null ? `zwykle ${money(s.median)}${unit}` : "(za mało na medianę)";
      console.log(`   ${String(byName.get(k)).padEnd(24)} ${usual.padEnd(24)} ost. ${money(s.last)}${unit}  [${s.count}]`);
    }
    const untouched = targets.length - collected.size;
    console.log(`   → z cenami: ${collected.size}, bez trafień w paragonach: ${untouched}${skipped ? `, pominięte (już miały ceny): ${skipped}` : ""}`);

    if (DRY_RUN || collected.size === 0) {
      console.log("");
      continue;
    }

    // ONE write per family. The mutate re-checks at write time, so a price
    // recorded by a live receipt while this script was reading is kept,
    // not overwritten.
    const ok = await upsertSettingsDoc(settings, {
      id:     catalog.id,
      familyId,
      type:   "SHOPPING_CATALOG",
      logTag: "BACKFILL",
      mutate: (doc) => {
        const items = Array.isArray(doc.items) ? doc.items : [];
        let changed = false;

        const next = items.map(entry => {
          const found = collected.get(entry.key);
          if (!found) return entry;

          if (!hasPrices(entry)) {
            changed = true;
            return { ...entry, prices: found };
          }
          if (!INCLUDE_EXISTING) return entry;   // gained a price since we read — leave it

          // Duplicate = same day, same amount. NOT including the shop:
          // observations recorded before shops were stored have none, so a
          // key with the shop in it would see the same purchase twice — once
          // bare, once backfilled with its shop — and record it twice.
          const seen = new Set(entry.prices.map(p => `${p.d}|${p.a}`));
          let merged = entry.prices;
          for (const obs of found) {
            if (seen.has(`${obs.d}|${obs.a}`)) continue;
            merged = addObservation(merged, obs);
            changed = true;
          }
          return { ...entry, prices: merged };
        });

        return changed ? { ...doc, items: next } : null;
      },
    });

    console.log(ok ? "   ✅ zapisane\n" : "   ❌ zapis nie powiódł się — szczegóły wyżej\n");
  }
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
