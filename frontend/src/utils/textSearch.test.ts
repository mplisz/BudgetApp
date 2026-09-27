import { describe, it, expect } from "vitest";
import { normalizeSearch, searchTokens, matchTxText } from "./textSearch";

describe("normalizeSearch", () => {
  it("folds case and Polish diacritics, ł included", () => {
    expect(normalizeSearch("ŻÓŁTY Ser Łososiowy ąęśćń")).toBe("zolty ser lososiowy aescn");
  });
});

describe("searchTokens", () => {
  it("is empty below the minimum length", () => {
    expect(searchTokens(" g ")).toEqual([]);
  });
  it("splits into normalised words", () => {
    expect(searchTokens("  Ser   ŻÓŁTY ")).toEqual(["ser", "zolty"]);
  });
});

describe("matchTxText", () => {
  const tx = {
    description: "Zakupy Lidl",
    lineItems: [
      { description: "GUANCIALE 250G", amount: 18.99 },
      { description: "Makaron", amount: 5.49, product: { name: "Spaghetti Barilla" } },
      { description: "Ser żółty", amount: 12 },
    ],
  };

  it("finds a receipt line regardless of case", () => {
    expect(matchTxText(tx, searchTokens("guanciale"))?.hits.map(h => h.amount)).toEqual([18.99]);
  });
  it("matches the AI product name as well as the printed text", () => {
    expect(matchTxText(tx, searchTokens("barilla"))?.hits.map(h => h.amount)).toEqual([5.49]);
  });
  it("ignores diacritics and word order", () => {
    expect(matchTxText(tx, searchTokens("zolty ser"))?.hits.map(h => h.amount)).toEqual([12]);
  });
  it("needs every word on the SAME line", () => {
    expect(matchTxText(tx, searchTokens("guanciale makaron"))).toBeNull();
  });
  it("falls back to the description, with no line hits", () => {
    expect(matchTxText(tx, searchTokens("lidl"))).toEqual({ hits: [] });
  });
  it("is null when nothing matches", () => {
    expect(matchTxText(tx, searchTokens("pancetta"))).toBeNull();
  });
  it("copes with a transaction without line items", () => {
    expect(matchTxText({ description: "Guanciale z targu" }, searchTokens("guanciale"))).toEqual({ hits: [] });
  });
});
