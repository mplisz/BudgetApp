// @vitest-environment jsdom
// ============================================================
// Bulk "paid with the credit card" in Wydatki — selection mode end to end:
// which rows can be ticked, what exactly is sent, and what the list shows
// afterwards.
//
// Rendered the way the app runs it — the bell beside the panel, because the
// bell is what loads the cards — against a fetch stub keyed by URL.
// ============================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../ui/ToastContainer";
import { AuthProvider } from "../../context/AuthContext";
import { AppProvider } from "../../context/AppContext";
import { NotificationBell } from "../layout/NotificationBell";
import PanelTransactions from "./PanelTransactions";

const MONTH = "2026-10";
const WAIT  = { timeout: 5000 };

const tx = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, type: "EXPENSE", date: `${MONTH}-0${id.slice(1)}`, budgetMonth: MONTH, amount, netAmount: amount,
  originalAmount: amount, originalCurrency: "PLN", fxRate: 1,
  categoryId: "cat_zakupy", categoryName: "Zakupy", subcategoryId: "sub_s", subcategoryName: "Spożywcze",
  description: `opis ${id}`, tags: [], priority: 2, returns: [], isArchived: false, ...extra,
});

const CARD = { id: "card_1", name: "Visa", openingBalance: 0, statementDay: 5, graceDays: 26, isArchived: false };

let transactions: ReturnType<typeof tx>[];
let bulkCalls: Array<{ ids: string[]; cardId: string | null }>;

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  const g = globalThis as any;
  g.ResizeObserver = RO;
  g.IntersectionObserver = RO;
  if (!window.matchMedia) {
    g.matchMedia = (q: string) => ({
      matches: false, media: q,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent() { return false; },
    });
  }
});

beforeEach(() => {
  transactions = [
    tx("t1", 100),
    tx("t2", 250),
    tx("t3", 500, { type: "SAVING", categoryName: "Oszczędności", subcategoryName: "Poduszka" }),
  ];
  bulkCalls = [];

  const respond = (body: unknown) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);

  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/transactions/card-payment")) {
      const body = JSON.parse(String(init?.body));
      bulkCalls.push(body);
      const updated = transactions
        .filter(t => body.ids.includes(t.id))
        .map(t => ({ ...t, cardId: body.cardId }));
      return respond({ updated, skipped: 0 });
    }
    if (url.includes("/api/transactions?budgetMonth=")) return respond(transactions);
    if (url.includes("/api/cards")) return respond({ cards: [CARD], repayments: [], transactions: [] });
    return respond([]);
  }) as typeof fetch;

  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function renderPanel() {
  const { container } = render(
    <MemoryRouter initialEntries={[`/transactions?m=${MONTH}`]}>
      <ToastProvider><AuthProvider><AppProvider>
        <NotificationBell />
        <PanelTransactions />
      </AppProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  );
  return within(container);
}

const cardBadges = (q: ReturnType<typeof within>) => q.queryAllByText("💳 karta").length;

describe("Wydatki — bulk card marking", () => {
  it("is off until asked for: no checkboxes, no bar", async () => {
    const q = renderPanel();
    await q.findByText(/Zaznacz wiele/, {}, WAIT);

    expect(q.queryAllByLabelText("Zaznacz transakcję")).toHaveLength(0);
    expect(q.queryByText(/Zaznaczono/)).toBeNull();
  });

  it("offers a checkbox for expenses only, and marks everything picked in one request", async () => {
    const q = renderPanel();
    fireEvent.click(await q.findByText(/Zaznacz wiele/, {}, WAIT));

    // Two expenses, one saving — the saving can't sit on a card.
    expect(await q.findAllByLabelText("Zaznacz transakcję", {}, WAIT)).toHaveLength(2);
    expect(q.getByText(/Bez pola wyboru/)).toBeTruthy();

    fireEvent.click(q.getByText("Zaznacz wszystkie z filtra (2)"));
    expect(q.getByText("Zaznaczono 2")).toBeTruthy();

    fireEvent.click(q.getByText(/Oznacz kartą/));

    await waitFor(() => expect(bulkCalls).toHaveLength(1), WAIT);
    expect([...bulkCalls[0].ids].sort()).toEqual(["t1", "t2"]);
    expect(bulkCalls[0].cardId).toBe("card_1");

    // The rows take the server's answer, and selection mode ends.
    await waitFor(() => expect(cardBadges(q)).toBe(2), WAIT);
    expect(q.queryByText(/Zaznaczono/)).toBeNull();
    expect(q.queryAllByLabelText("Zaznacz transakcję")).toHaveLength(0);
  });

  it("sends only the ticked rows, and null to take the mark off", async () => {
    transactions[0] = tx("t1", 100, { cardId: "card_1" });
    transactions[1] = tx("t2", 250, { cardId: "card_1" });

    const q = renderPanel();
    fireEvent.click(await q.findByText(/Zaznacz wiele/, {}, WAIT));

    const boxes = await q.findAllByLabelText("Zaznacz transakcję", {}, WAIT);
    fireEvent.click(boxes[0]);
    expect(q.getByText("Zaznaczono 1")).toBeTruthy();

    fireEvent.click(q.getByText("Zdejmij oznaczenie"));

    await waitFor(() => expect(bulkCalls).toHaveLength(1), WAIT);
    expect(bulkCalls[0].ids).toHaveLength(1);
    expect(bulkCalls[0].cardId).toBeNull();
    await waitFor(() => expect(cardBadges(q)).toBe(1), WAIT);
  });

  it("does nothing with an empty selection, and leaving the mode drops it", async () => {
    const q = renderPanel();
    fireEvent.click(await q.findByText(/Zaznacz wiele/, {}, WAIT));
    await q.findAllByLabelText("Zaznacz transakcję", {}, WAIT);

    fireEvent.click(q.getByText(/Oznacz kartą/));   // disabled — nothing picked
    fireEvent.click(q.getByText("Zaznacz wszystkie z filtra (2)"));
    fireEvent.click(q.getByText(/Zakończ/));

    expect(bulkCalls).toHaveLength(0);
    expect(q.queryByText(/Zaznaczono/)).toBeNull();

    // Coming back starts from nothing ticked.
    fireEvent.click(q.getByText(/Zaznacz wiele/));
    expect(q.getByText("Zaznaczono 0")).toBeTruthy();
  });
});
