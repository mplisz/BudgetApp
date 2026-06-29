// ============================================================
// Tests for normalizeCurrency — the OCR safety net that turns a
// printed currency mark into an ISO 4217 code used for rate lookup.
// A wrong mapping here means a wrong exchange-rate conversion.
// ============================================================

import { describe, it, expect } from "vitest";
import { normalizeCurrency } from "./currencies";

describe("normalizeCurrency", () => {
  it("defaults to PLN for empty / nullish / whitespace input", () => {
    expect(normalizeCurrency("")).toBe("PLN");
    expect(normalizeCurrency(null)).toBe("PLN");
    expect(normalizeCurrency(undefined)).toBe("PLN");
    expect(normalizeCurrency("   ")).toBe("PLN");
  });

  it("maps known printed symbols to ISO codes", () => {
    expect(normalizeCurrency("€")).toBe("EUR");
    expect(normalizeCurrency("$")).toBe("USD");
    expect(normalizeCurrency("£")).toBe("GBP");
  });

  it("matches symbol abbreviations case-insensitively", () => {
    expect(normalizeCurrency("Fr")).toBe("CHF");
    expect(normalizeCurrency("fr")).toBe("CHF");
    expect(normalizeCurrency("FR")).toBe("CHF");
  });

  it("passes through an unrecognized code, upper-cased and trimmed", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("  eur  ")).toBe("EUR");
    expect(normalizeCurrency("xyz")).toBe("XYZ");
  });
});
