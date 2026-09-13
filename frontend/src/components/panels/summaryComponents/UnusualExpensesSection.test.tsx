// @vitest-environment jsdom
// The section must mount inside Podsumowanie's provider tree and settle out of
// its "computing norms" state — with no history to load it has nothing to wait
// for, so it must render straight away instead of spinning forever.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../ui/ToastContainer";
import { AuthProvider } from "../../../context/AuthContext";
import { AppProvider } from "../../../context/AppContext";
import { UnusualExpensesSection } from "./UnusualExpensesSection";
import type { Transaction } from "../../../types/summary";

beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve("[]"),
  } as Response));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

const tx = (id: string, amount: number, sub: string, description: string): Transaction => ({
  id, type: "EXPENSE", budgetMonth: "2026-09", date: "2026-09-10", amount,
  categoryId: "c", categoryName: "Rozrywka", subcategoryId: sub, subcategoryName: sub, description,
});

function renderSection(monthTx: Transaction[]) {
  const { container } = render(
    <MemoryRouter>
      <ToastProvider><AuthProvider><AppProvider>
        <UnusualExpensesSection monthTx={monthTx} month="2026-09" />
      </AppProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  );
  return within(container);
}

describe("UnusualExpensesSection", () => {
  it("links each flagged expense to Wydatki with the filter on", async () => {
    // No history (the stubbed range is empty) → the month's own median is the norm.
    const q = renderSection([tx("a", 20, "x", "Drobne"), tx("b", 30, "y", "Drobne"), tx("c", 40, "z", "Drobne"), tx("d", 400, "kino", "Koncert")]);
    const link = await q.findByTitle(/Kliknij, aby otworzyć w panelu Wydatki/, {}, { timeout: 5000 });
    expect(decodeURIComponent(link.getAttribute("href")!)).toBe("/transactions?m=2026-09&type=EXPENSE&cat=Rozrywka&sub=kino&big=1");
    expect(link.textContent).toContain("Koncert");
  });

  it("says so when nothing is unusual", async () => {
    const q = renderSection([tx("a", 20, "x", "a"), tx("b", 30, "y", "b"), tx("c", 40, "z", "c")]);
    expect(await q.findByText(/Brak jednorazowych wydatków/, {}, { timeout: 5000 })).toBeTruthy();
  });
});
