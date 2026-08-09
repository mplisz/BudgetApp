// ============================================================
// File: backend/utils/productUnits.js
// THE list of units a tracked product can be measured in, server-side.
//
// The enum used to be written out in four places — the OCR product schema,
// the prompt text describing it, the products route and the transaction
// line-item schema — so adding a unit meant finding all four and the model
// still being told about only three.
//
// Mirrored in frontend/src/data/constants/productUnits.ts: two runtimes, no
// shared build. A unit added here must be added there too, or the UI will
// have no label for what the API accepts.
// ============================================================

/** Stored codes. `m3` stays ASCII — it is part of the catalog identity key. */
const PRODUCT_UNIT_CODES = ["g", "ml", "szt", "kWh", "m3"];

/** Rendered into the OCR prompt so the model is told exactly what the schema
 *  will accept — the two cannot drift apart. */
const PRODUCT_UNIT_LIST = PRODUCT_UNIT_CODES.map(u => `"${u}"`).join(", ");

module.exports = { PRODUCT_UNIT_CODES, PRODUCT_UNIT_LIST };
