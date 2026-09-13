// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AveragePill, type GoodDirection } from "./AveragePill";
import { c } from "../../styles/tokens";

afterEach(cleanup);

const stat = {
  mean: 1000, median: 900, months: 3,
  series: [
    { month: "2026-06", value: 1300 },
    { month: "2026-07", value: 800 },
    { month: "2026-08", value: 900 },
  ],
};

function pill(current: number, good: GoodDirection, inProgress = false, withPrevious = false) {
  const { container } = render(
    <AveragePill current={current} stat={stat} good={good} inProgress={inProgress} withPrevious={withPrevious} />,
  );
  const wrapper  = container.firstElementChild as HTMLElement;
  const bubble   = wrapper.firstElementChild as HTMLElement;          // the pill itself
  const previous = wrapper.children[1] as HTMLElement | undefined;    // "vs Sie …" line
  const text = (el?: Element | null) => el?.textContent?.replace(/[\u00a0\u202f]/g, " ");
  return { bubble, delta: bubble.lastElementChild as HTMLElement, previous, text };
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("AveragePill", () => {
  it("shows mean and median, and the change against the mean", () => {
    const { bubble, text } = pill(1200, "down");
    expect(text(bubble)).toContain("1000 zł śr.");
    expect(text(bubble)).toContain("900 zł med.");
    expect(text(bubble)).toContain("▲ +20,0%");
  });

  it("colours by whether the change is good", () => {
    expect(pill(1200, "down").delta.style.color).toBe(rgb(c.danger));   // expenses up
    cleanup();
    expect(pill(1200, "up").delta.style.color).toBe(rgb(c.success));    // income up
    cleanup();
    expect(pill(800,  "down").delta.style.color).toBe(rgb(c.success));  // expenses down
    cleanup();
    expect(pill(1200, null).delta.style.color).toBe(rgb(c.textSecondary)); // transfers
  });

  it("under 3% is a neutral ≈", () => {
    expect(pill(1020, "down").delta.textContent).toBe("≈");
  });

  it("a running month shows progress instead of a difference", () => {
    expect(pill(270, "down", true).delta.textContent).toBe("27% średniej");
  });

  it("the tooltip holds only the range — mean and median are already on the pill", () => {
    const title = pill(1200, "down").bubble.getAttribute("title")!;
    expect(title.split("\n").map(line => line.replace(/\s/g, " "))).toEqual(["Najwięcej: 1300 zł (Cze)", "Najmniej: 800 zł (Lip)"]);
  });

  it("no tooltip with a single month — there is no range", () => {
    const { container } = render(
      <AveragePill current={5} stat={{ mean: 5, median: 5, months: 1, series: [{ month: "2026-08", value: 5 }] }} good="down" inProgress={false} />,
    );
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("withPrevious compares with the last month — or just names it while this one runs", () => {
    const closed = pill(990, "down", false, true);
    expect(closed.text(closed.previous)).toBe("vs Sie ▲ +10,0%");
    cleanup();
    const running = pill(300, "down", true, true);
    expect(running.text(running.previous)).toBe("Sie: 900 zł");
  });

  it("renders nothing without history", () => {
    const { container } = render(<AveragePill current={5} stat={{ mean: 0, median: 0, months: 0 }} good="down" inProgress={false} />);
    expect(container.innerHTML).toBe("");
  });
});
