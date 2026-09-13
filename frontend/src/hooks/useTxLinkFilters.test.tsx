// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, renderHook, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useTxLinkFilters } from "./useTxLinkFilters";
import { txLink } from "../data/routes";
import { CategoryLimitBar } from "../components/panels/summaryComponents/CategoryLimitBar";

function hookWithUrl(url: string, apply: Parameters<typeof useTxLinkFilters>[0]) {
  let location = "";
  function Spy() { const l = useLocation(); location = l.pathname + l.search; return null; }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}<Spy /></MemoryRouter>
  );
  renderHook(() => useTxLinkFilters(apply), { wrapper });
  return () => location;
}

describe("useTxLinkFilters", () => {
  it("hands the link's filters over once and strips them, keeping the month", () => {
    const apply = vi.fn();
    const url = txLink("2026-09", { type: "EXPENSE", category: "Zakupy codzienne", sub: "Alkohol" });
    const location = hookWithUrl(url, apply);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ type: "EXPENSE", category: "Zakupy codzienne", sub: "Alkohol" });
    expect(location()).toBe("/transactions?m=2026-09");
  });

  it("does nothing on a plain visit", () => {
    const apply = vi.fn();
    const location = hookWithUrl("/transactions?m=2026-09", apply);
    expect(apply).not.toHaveBeenCalled();
    expect(location()).toBe("/transactions?m=2026-09");
  });
});

describe("CategoryLimitBar links", () => {
  const category = {
    categoryId: "cat_zakupy", categoryName: "Zakupy codzienne", categoryIcon: "🛒",
    spent: 500, limit: 1000, percent: 50,
  };
  const subcategories = [
    { subcategoryId: "sub_alk", subcategoryName: "Alkohol", spent: 100, percentOfCategory: 20, percentOfTotal: 5 },
  ];

  function renderBar() {
    let location = "";
    function Spy() { const l = useLocation(); location = l.pathname + l.search; return null; }
    render(
      <MemoryRouter initialEntries={["/summary?m=2026-09"]}>
        <Routes>
          <Route path="/summary" element={<CategoryLimitBar category={category} subcategories={subcategories} budgetMonth="2026-09" />} />
          <Route path="*" element={null} />
        </Routes>
        <Spy />
      </MemoryRouter>,
    );
    return () => location;
  }

  it("the category ↗ navigates without toggling the subcategory list", () => {
    const location = renderBar();
    const link = screen.getByTitle(/Pokaż wydatki „Zakupy codzienne"/);
    expect(link.getAttribute("href")).toBe(txLink("2026-09", { type: "EXPENSE", category: "Zakupy codzienne" }));
    fireEvent.click(link);
    expect(location()).toBe(txLink("2026-09", { type: "EXPENSE", category: "Zakupy codzienne" }));
  });

  it("an expanded subcategory row links to that subcategory", () => {
    renderBar();
    expect(screen.queryByText(/Alkohol/)).toBeNull();
    fireEvent.click(screen.getByText(/Zakupy codzienne/));          // header still toggles
    const row = screen.getByTitle(/Pokaż wydatki „Alkohol"/);
    expect(row.getAttribute("href")).toBe(
      txLink("2026-09", { type: "EXPENSE", category: "Zakupy codzienne", sub: "Alkohol" }),
    );
  });
});
