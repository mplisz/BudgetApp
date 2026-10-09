// @vitest-environment jsdom
// ============================================================
// Wydatki — filters stack: setting one filter never clears another.
//
// The option lists are scoped by the other filters (categories by type,
// shops by date range), which used to be "solved" by wiping the dependent
// selection. Now the selection stays and stays visible.
// ============================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../ui/ToastContainer";
import { AuthProvider } from "../../context/AuthContext";
import { AppProvider } from "../../context/AppContext";
import PanelTransactions from "./PanelTransactions";

const MONTH = "2026-10";
const WAIT  = { timeout: 5000 };

const tx = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, type: "EXPENSE", date: `${MONTH}-0${id.slice(1)}`, budgetMonth: MONTH, amount, netAmount: amount,
  originalAmount: amount, originalCurrency: "PLN", fxRate: 1,
  categoryId: "cat_zakupy", categoryName: "Zakupy", subcategoryId: "sub_s", subcategoryName: "Spożywcze",
  description: `opis ${id}`, tags: [], priority: 2, returns: [], isArchived: false, ...extra,
});

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
  localStorage.clear();
  const transactions = [
    tx("t1", 100, { merchant: "Lidl" }),
    tx("t2", 250, { merchant: "Biedronka" }),
    tx("t3", 500, { type: "SAVING", categoryId: "cat_o", categoryName: "Oszczędności", subcategoryId: "sub_p", subcategoryName: "Poduszka" }),
  ];

  const respond = (body: unknown) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);

  globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
    respond(String(input).includes("/api/transactions?budgetMonth=") ? transactions : []),
  ) as typeof fetch;

  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function renderPanel() {
  const { container } = render(
    <MemoryRouter initialEntries={[`/transactions?m=${MONTH}`]}>
      <ToastProvider><AuthProvider><AppProvider>
        <PanelTransactions />
      </AppProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  );
  const q = within(container);
  await q.findByText("Wszystkie kategorie", {}, WAIT);
  return q;
}

/** Opens a CategoryMultiSelect by its placeholder; returns a toggle for its options. */
function openMultiSelect(q: ReturnType<typeof within>, placeholder: string) {
  const button  = q.getByText(placeholder).closest("button") as HTMLButtonElement;
  const wrapper = button.parentElement as HTMLElement;
  fireEvent.click(button);
  return (name: string) => {
    const option = within(wrapper).getAllByText(name).find(el => !button.contains(el)) as HTMLElement;
    fireEvent.mouseDown(option);
  };
}

describe("Wydatki — filters stack", () => {
  it("keeps the picked category when the type is set afterwards", async () => {
    const q = await renderPanel();
    openMultiSelect(q, "Wszystkie kategorie")("Zakupy");

    fireEvent.change(q.getByDisplayValue("Wszystkie"), { target: { value: "SAVING" } });

    // Still selected (the placeholder would be back otherwise) and still
    // filtering: no saving sits in "Zakupy".
    expect(q.queryByText("Wszystkie kategorie")).toBeNull();
    expect(q.getByText(/dla wybranych filtrów/)).toBeTruthy();
  });

  it("keeps the picked shop when a date is set afterwards", async () => {
    const q = await renderPanel();
    fireEvent.change(q.getByDisplayValue("Wszystkie sklepy"), { target: { value: "Lidl" } });

    // "Dzisiaj" is outside the fixture's dates — Lidl drops out of the range,
    // yet stays selected and on the list.
    fireEvent.click(q.getByText("Dzisiaj"));

    expect((q.getByDisplayValue("Lidl") as HTMLSelectElement).value).toBe("Lidl");
  });

  it("keeps subcategories when a category is added; a removed category takes its own", async () => {
    const q = await renderPanel();
    const toggleCategory = openMultiSelect(q, "Wszystkie kategorie");
    toggleCategory("Zakupy");
    openMultiSelect(q, "Wszystkie subkategorie")("Spożywcze");
    expect(q.queryByText("Wszystkie subkategorie")).toBeNull();

    toggleCategory("Oszczędności");
    expect(q.queryByText("Wszystkie subkategorie")).toBeNull();

    toggleCategory("Zakupy");
    expect(q.getByText("Wszystkie subkategorie")).toBeTruthy();
  });
});
