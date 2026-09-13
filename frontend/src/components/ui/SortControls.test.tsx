// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, within, cleanup } from "@testing-library/react";
import { SortableTh, SortBar } from "./SortControls";
import { TransactionList } from "../panels/transactionComponents/TransactionList";
import { DEFAULT_TX_SORT } from "../../utils/txSort";

// Vitest globals are off, so Testing Library can't auto-clean between tests.
afterEach(cleanup);

describe("SortableTh", () => {
  function renderTh(sortKey: "date" | "amount") {
    const onSort = vi.fn();
    render(
      <table><thead><tr>
        <SortableTh sortKey={sortKey} sort={DEFAULT_TX_SORT} onSort={onSort} style={{}} />
      </tr></thead></table>,
    );
    return onSort;
  }

  it("marks the active column and shows its direction", () => {
    renderTh("date");
    const th = screen.getByRole("columnheader");
    expect(th.getAttribute("aria-sort")).toBe("descending");
    expect(th.textContent).toBe("Data↓");
  });

  it("an inactive column shows ↕ and reports its key on click", () => {
    const onSort = renderTh("amount");
    const th = screen.getByRole("columnheader");
    expect(th.getAttribute("aria-sort")).toBe("none");
    expect(th.textContent).toBe("Kwota↕");
    fireEvent.click(within(th).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("amount");
  });
});

describe("SortBar", () => {
  it("renders only the keys it is given", () => {
    const onSort = vi.fn();
    render(<SortBar keys={["date", "amount", "author"]} sort={DEFAULT_TX_SORT} onSort={onSort} />);
    expect(screen.queryByText("Prio")).toBeNull();
    fireEvent.click(screen.getByText("Autor"));
    expect(onSort).toHaveBeenCalledWith("author");
  });
});

describe("TransactionList headers", () => {
  const noop = () => {};

  it("are sortable (Data, Prio, Kwota, Autor) when sort is wired in", () => {
    render(<TransactionList items={[]} isMobile={false} onDelete={noop} onReturn={noop} onUpdated={noop}
      sort={DEFAULT_TX_SORT} onSort={noop} />);
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["Data↓", "Prio↕", "Kwota↕", "Autor↕"]);
  });

  it("stay plain text without it", () => {
    render(<TransactionList items={[]} isMobile={false} onDelete={noop} onReturn={noop} onUpdated={noop} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Kwota")).toBeTruthy();
  });
});
