import { describe, it, expect } from "vitest";
import { sortTransactions, nextTxSort, DEFAULT_TX_SORT, type SortableTx } from "./txSort";

type Row = SortableTx & { id: string };
const ids = (rows: Row[]) => rows.map(r => r.id);

const rows: Row[] = [
  { id: "a", date: "2026-09-03", amount: 50,  priority: 3, author: "Marcin" },
  { id: "b", date: "2026-09-10", amount: 200, priority: 1, author: "anna" },
  { id: "c", date: "2026-09-01", amount: 75,               author: "" },
  { id: "d", date: "2026-09-07", amount: 200, priority: 4, author: "Łukasz" },
];

describe("sortTransactions", () => {
  it("date: newest first by default, oldest first ascending", () => {
    expect(ids(sortTransactions(rows, DEFAULT_TX_SORT))).toEqual(["b", "d", "a", "c"]);
    expect(ids(sortTransactions(rows, { key: "date", dir: "asc" }))).toEqual(["c", "a", "d", "b"]);
  });

  it("amount: ties fall back to newest first in both directions", () => {
    expect(ids(sortTransactions(rows, { key: "amount", dir: "desc" }))).toEqual(["b", "d", "c", "a"]);
    expect(ids(sortTransactions(rows, { key: "amount", dir: "asc" }))).toEqual(["a", "c", "b", "d"]);
  });

  it("priority sorts by importance: descending P1→P4, ascending P4→P1", () => {
    // c has no priority — counts as P2, like the badge shows
    expect(ids(sortTransactions(rows, { key: "priority", dir: "desc" }))).toEqual(["b", "c", "a", "d"]);
    expect(ids(sortTransactions(rows, { key: "priority", dir: "asc" }))).toEqual(["d", "a", "c", "b"]);
  });

  it("author: Polish collation, case-insensitive, no author always last", () => {
    expect(ids(sortTransactions(rows, { key: "author", dir: "asc" }))).toEqual(["b", "d", "a", "c"]);
    expect(ids(sortTransactions(rows, { key: "author", dir: "desc" }))).toEqual(["a", "d", "b", "c"]);
  });

  it("does not mutate its input", () => {
    const copy = [...rows];
    sortTransactions(rows, { key: "amount", dir: "asc" });
    expect(rows).toEqual(copy);
  });
});

describe("nextTxSort", () => {
  it("flips the active column", () => {
    expect(nextTxSort({ key: "amount", dir: "desc" }, "amount")).toEqual({ key: "amount", dir: "asc" });
  });

  it("starts a new column in its natural direction", () => {
    expect(nextTxSort(DEFAULT_TX_SORT, "amount")).toEqual({ key: "amount", dir: "desc" });
    expect(nextTxSort(DEFAULT_TX_SORT, "priority")).toEqual({ key: "priority", dir: "desc" });
    expect(nextTxSort(DEFAULT_TX_SORT, "author")).toEqual({ key: "author", dir: "asc" });
  });

  it("clicking Data on the default sort flips to oldest first", () => {
    expect(nextTxSort(DEFAULT_TX_SORT, "date")).toEqual({ key: "date", dir: "asc" });
  });
});
