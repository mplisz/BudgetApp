// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AveragePill, type GoodDirection } from "./AveragePill";
import { c } from "../../styles/tokens";

afterEach(cleanup);

const stat = { mean: 1000, median: 900, months: 6 };

function pill(current: number, good: GoodDirection, inProgress = false) {
  const { container } = render(<AveragePill current={current} stat={stat} good={good} inProgress={inProgress} />);
  const root  = container.firstElementChild as HTMLElement | null;
  const delta = root?.lastElementChild as HTMLElement | undefined;
  return { root, text: root?.textContent?.replace(/ /g, " "), delta };
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("AveragePill", () => {
  it("shows mean and median, and the change against the mean", () => {
    const { text } = pill(1200, "down");
    expect(text).toContain("1000 zł śr.");
    expect(text).toContain("900 zł med.");
    expect(text).toContain("▲ +20,0%");
  });

  it("colours by whether the change is good", () => {
    expect(pill(1200, "down").delta?.style.color).toBe(rgb(c.danger));   // expenses up
    expect(pill(1200, "up").delta?.style.color).toBe(rgb(c.success));    // income up
    expect(pill(800,  "down").delta?.style.color).toBe(rgb(c.success));  // expenses down
    expect(pill(1200, null).delta?.style.color).toBe(rgb(c.textSecondary)); // transfers
  });

  it("under 3% is a neutral ≈", () => {
    expect(pill(1020, "down").delta?.textContent).toBe("≈");
  });

  it("a running month shows progress instead of a difference", () => {
    expect(pill(270, "down", true).delta?.textContent).toBe("27% średniej");
  });

  it("renders nothing without history", () => {
    const { container } = render(<AveragePill current={5} stat={{ mean: 0, median: 0, months: 0 }} good="down" inProgress={false} />);
    expect(container.innerHTML).toBe("");
  });
});
