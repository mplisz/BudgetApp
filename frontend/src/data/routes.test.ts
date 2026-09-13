import { describe, it, expect } from "vitest";
import { txLink, readTxLink } from "./routes";

function paramsOf(link: string) {
  return new URLSearchParams(link.slice(link.indexOf("?") + 1));
}

describe("txLink", () => {
  it("sends EXPENSE and SAVING to Wydatki, INCOME and TRANSFER to Wpływy", () => {
    expect(txLink("2026-09", { type: "EXPENSE" })).toMatch(/^\/transactions\?/);
    expect(txLink("2026-09", { type: "SAVING" })).toMatch(/^\/transactions\?/);
    expect(txLink("2026-09", { type: "INCOME" })).toMatch(/^\/income-transactions\?/);
    expect(txLink("2026-09", { type: "TRANSFER" })).toMatch(/^\/income-transactions\?/);
  });

  it("keeps the month", () => {
    expect(paramsOf(txLink("2026-09", { type: "EXPENSE" })).get("m")).toBe("2026-09");
  });

  it("round-trips Polish names with spaces and commas", () => {
    const link = txLink("2026-09", { type: "EXPENSE", category: "Zakupy codzienne", sub: "Ubrania, buty i akcesoria" });
    expect(readTxLink(paramsOf(link))).toEqual({
      type: "EXPENSE", category: "Zakupy codzienne", sub: "Ubrania, buty i akcesoria",
    });
  });

  it("drops a subcategory given without its category", () => {
    const link = txLink("2026-09", { type: "EXPENSE", sub: "Alkohol" });
    expect(paramsOf(link).has("sub")).toBe(false);
  });
});

describe("readTxLink", () => {
  it("is null without a link — a plain ?m= is not one", () => {
    expect(readTxLink(new URLSearchParams("m=2026-09"))).toBeNull();
  });

  it("ignores an unknown type", () => {
    expect(readTxLink(new URLSearchParams("type=HACK&cat=X"))).toBeNull();
  });

  it("ignores a hand-typed sub without cat", () => {
    expect(readTxLink(new URLSearchParams("type=EXPENSE&sub=Alkohol"))).toEqual({
      type: "EXPENSE", category: undefined, sub: undefined,
    });
  });
});
