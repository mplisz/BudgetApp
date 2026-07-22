// ============================================================
// File: backend/scripts/sproc-markDepositReturns.js
// Cosmos DB stored procedure — one-off backfill.
//
// Marks every return entry as kind:"deposit" on all transactions whose
// subcategoryName matches (default: "Kaucja za opakowania"). Amounts,
// months and every other field stay untouched; a stray `source` (only
// meaningful for reimbursements) is removed from the modified entries.
//
// HOW TO RUN (Azure Portal → Cosmos DB → Data Explorer):
//   1. Transactions container → Stored Procedures → New Stored Procedure,
//      id e.g. "markDepositReturns", paste this file, Save.
//   2. Execute with:
//        - Partition key value: your familyId (the `userId` field on any
//          transaction document),
//        - Param 1 (optional): subcategory name, default
//          "Kaucja za opakowania",
//        - Param 2 (optional): true = DRY RUN (counts only, writes nothing).
//   3. Response: { finished, scanned, matchedDocs, updatedDocs,
//      updatedEntries, dryRun }. Bounded execution can stop early on big
//      data (finished:false) — just execute again until finished:true;
//      already-converted entries are skipped, so re-runs are idempotent.
// ============================================================

function markDepositReturns(subcategoryName, dryRun) {
  var collection = getContext().getCollection();
  var response   = getContext().getResponse();

  var subName = subcategoryName || "Kaucja za opakowania";
  var isDry   = dryRun === true;

  var scanned = 0, matchedDocs = 0, updatedDocs = 0, updatedEntries = 0;

  var query = {
    query: "SELECT * FROM c " +
           "WHERE c.subcategoryName = @sub " +
           "AND IS_DEFINED(c.returns) AND ARRAY_LENGTH(c.returns) > 0",
    parameters: [{ name: "@sub", value: subName }],
  };

  fetchPage(null);

  function fetchPage(continuation) {
    var accepted = collection.queryDocuments(
      collection.getSelfLink(),
      query,
      { continuation: continuation, pageSize: 50 },
      function (err, docs, options) {
        if (err) throw err;
        processDoc(docs, 0, options.continuation);
      },
    );
    if (!accepted) finish(false);
  }

  function processDoc(docs, i, continuation) {
    if (i >= docs.length) {
      if (continuation) fetchPage(continuation);
      else finish(true);
      return;
    }

    var doc = docs[i];
    scanned++;

    var changed = 0;
    for (var j = 0; j < doc.returns.length; j++) {
      if (doc.returns[j].kind !== "deposit") {
        doc.returns[j].kind = "deposit";
        // `source` only makes sense for reimbursements — drop it if present.
        if (doc.returns[j].source !== undefined) delete doc.returns[j].source;
        changed++;
      }
    }

    if (changed === 0) {
      processDoc(docs, i + 1, continuation);
      return;
    }
    matchedDocs++;

    if (isDry) {
      updatedEntries += changed;
      processDoc(docs, i + 1, continuation);
      return;
    }

    doc.updatedAt = new Date().toISOString();
    doc.updatedBy = "sproc:markDepositReturns";

    var accepted = collection.replaceDocument(doc._self, doc, function (err) {
      if (err) throw err;
      updatedDocs++;
      updatedEntries += changed;
      processDoc(docs, i + 1, continuation);
    });
    if (!accepted) finish(false);
  }

  function finish(finished) {
    response.setBody({
      finished:       finished,
      dryRun:         isDry,
      subcategory:    subName,
      scanned:        scanned,
      matchedDocs:    matchedDocs,
      updatedDocs:    updatedDocs,
      updatedEntries: updatedEntries,
    });
  }
}
