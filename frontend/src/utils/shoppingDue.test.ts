// ============================================================
// File: src/utils/shoppingDue.test.ts
// Which tab a shopping item lands on, and how its day reads.
// ============================================================

import { describe, expect, test } from "vitest";
import { addDays, daysUntil, dayLabel, dueChoices, dueLabel, isDueNow, tabOf } from "./shoppingDue";

const today = "2026-09-27";   // a Sunday

describe("tabOf", () => {
  test("an item from before horizons existed is on 'now'", () => {
    expect(tabOf({}, today)).toBe("now");
  });
  test("a dated item moves to 'now' the day before its day", () => {
    expect(tabOf({ when: "date", needBy: "2026-09-29" }, today)).toBe("date");
    expect(tabOf({ when: "date", needBy: "2026-09-28" }, today)).toBe("now");
    expect(tabOf({ when: "date", needBy: "2026-09-27" }, today)).toBe("now");
    expect(tabOf({ when: "date", needBy: "2026-09-20" }, today)).toBe("now");
  });
  test("watch stays watch", () => {
    expect(tabOf({ when: "watch" }, today)).toBe("watch");
  });
  test("a date without a day is shown rather than lost", () => {
    expect(tabOf({ when: "date", needBy: null }, today)).toBe("now");
  });
});

describe("isDueNow", () => {
  test("only dated items are ever 'due'", () => {
    expect(isDueNow({ when: "now" }, today)).toBe(false);
    expect(isDueNow({ when: "date", needBy: "2026-09-28" }, today)).toBe(true);
  });
});

describe("dates", () => {
  test("add and count days across a month end", () => {
    expect(addDays(today, 5)).toBe("2026-10-02");
    expect(daysUntil("2026-10-02", today)).toBe(5);
    expect(daysUntil("2026-09-26", today)).toBe(-1);
  });
  test("labels", () => {
    expect(dayLabel("2026-09-30")).toBe("śr 30.09");
    expect(dueLabel("2026-09-27", today)).toBe("na dziś");
    expect(dueLabel("2026-09-28", today)).toBe("na jutro");
    expect(dueLabel("2026-09-30", today)).toBe("za 3 dni");
    expect(dueLabel("2026-09-25", today)).toBe("po terminie");
  });
  test("choices run from the day after tomorrow to five days ahead", () => {
    expect(dueChoices(today)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});
