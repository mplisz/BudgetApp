// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import { TooltipLayer } from "./TooltipLayer";

// jsdom has no PointerEvent constructor; a MouseEvent carrying pointerType is
// what the layer reads.
function pointer(type: string, target: Element, pointerType = "mouse", relatedTarget: Element | null = null) {
  const e = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  act(() => { target.dispatchEvent(e); });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup() {
  render(
    <div>
      <TooltipLayer />
      <span data-testid="badge" title={"Linia 1\nLinia 2"}>🔥 badge</span>
      <button data-testid="btn" title="Przycisk">klik</button>
      <div data-testid="elsewhere">nic</div>
    </div>,
  );
  return { badge: screen.getByTestId("badge"), btn: screen.getByTestId("btn"), elsewhere: screen.getByTestId("elsewhere") };
}

describe("TooltipLayer", () => {
  it("hover: lifts the title at once, shows the bubble after the delay, restores on leave", () => {
    const { badge, elsewhere } = setup();
    pointer("pointerover", badge);
    expect(badge.hasAttribute("title")).toBe(false);          // native bubble can't appear
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => { vi.advanceTimersByTime(400); });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Linia 1\nLinia 2");
    expect(badge.getAttribute("aria-describedby")).toBe(tip.id);

    pointer("pointerout", badge, "mouse", elsewhere);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(badge.getAttribute("title")).toBe("Linia 1\nLinia 2");
    expect(badge.hasAttribute("aria-describedby")).toBe(false);
  });

  it("a quick pass under the delay never shows anything and leaves the title intact", () => {
    const { badge, elsewhere } = setup();
    pointer("pointerover", badge);
    act(() => { vi.advanceTimersByTime(100); });
    pointer("pointerout", badge, "mouse", elsewhere);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(badge.getAttribute("title")).toBe("Linia 1\nLinia 2");
  });

  it("a click hides the bubble but keeps the title held until the pointer leaves", () => {
    const { btn, elsewhere } = setup();
    pointer("pointerover", btn);
    act(() => { vi.advanceTimersByTime(400); });
    pointer("pointerdown", btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(btn.hasAttribute("title")).toBe(false);
    pointer("pointerout", btn, "mouse", elsewhere);
    expect(btn.getAttribute("title")).toBe("Przycisk");
  });

  it("touch: tapping a badge toggles it, tapping a button does not", () => {
    const { badge, btn, elsewhere } = setup();
    pointer("pointerup", btn, "touch");
    expect(screen.queryByRole("tooltip")).toBeNull();

    pointer("pointerup", badge, "touch");
    expect(screen.getByRole("tooltip")).toBeTruthy();
    pointer("pointerup", elsewhere, "touch");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(badge.getAttribute("title")).toBe("Linia 1\nLinia 2");
  });

  it("Escape hides it", () => {
    const { badge } = setup();
    pointer("pointerover", badge);
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
