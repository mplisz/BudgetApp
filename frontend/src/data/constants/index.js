// ============================================================
// File: src/data/constants/index.js
//
// Barrel re-export. Lets every consumer use:
//   import { MONTHS, PANEL_META, ... } from "../../data/constants";
//
// without caring which sub-file actually owns each constant.
//
// Why a barrel:
//   - Backwards-compat with existing imports after splitting the old
//     monolithic `constants.js` into smaller files.
//   - One stable public path for the data/constants module.
//   - Sub-files can be reorganised without touching consumer imports.
//
// If a consumer needs something very specific (e.g. the `translateError`
// helper from errorMessages), it can still import directly from the
// sub-file: `from "../../data/constants/errorMessages"`. Both styles
// work; the barrel is for the common case.
// ============================================================

export * from "./ui";
export * from "./panels";
export * from "./categoryTypes";
export * from "./errorMessages";
export * from "./currencies";
