// @vitest-environment jsdom
// ============================================================
// Tests for the suggestion logic shared by MerchantInput and the
// shopping list's quick-add bar.
//
// The rules worth pinning down are the ones that make free text usable:
// no list until you type, no list once you have typed an exact match,
// and a wrapping highlight. Both call sites depend on them, so a
// regression here would break two features at once.
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSuggestions } from "./useSuggestions";

const SHOPS = ["Biedronka", "Lidl", "Leroy Merlin", "Żabka"];
const identity = (s: string) => s;

function setup(query: string, onPick = vi.fn(), onEnterRaw = vi.fn()) {
  const hook = renderHook(() =>
    useSuggestions<string>({ options: SHOPS, query, getLabel: identity, onPick, onEnterRaw }),
  );
  return { ...hook, onPick, onEnterRaw };
}

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as never;

describe("useSuggestions — what gets suggested", () => {
  it("suggests nothing until something is typed", () => {
    const { result } = setup("");
    expect(result.current.suggestions).toEqual([]);
  });

  it("matches anywhere in the name, case-insensitively", () => {
    // Substring, not prefix: "l" hits both, and a lowercase query still
    // matches capitalized names.
    const { result } = setup("l");
    expect(result.current.suggestions).toEqual(["Lidl", "Leroy Merlin"]);
  });

  it("goes quiet on an exact match — the user is done typing", () => {
    const { result } = setup("lidl");
    expect(result.current.suggestions).toEqual([]);
  });

  it("a brand-new value simply has no suggestions", () => {
    const { result } = setup("Rossmann");
    expect(result.current.suggestions).toEqual([]);
  });
});

describe("useSuggestions — the list only shows while focused", () => {
  it("stays hidden until the field is focused, and hides again on Escape", () => {
    const { result } = setup("l");
    expect(result.current.showList).toBe(false);

    act(() => result.current.handleFocus());
    expect(result.current.showList).toBe(true);

    act(() => result.current.handleKeyDown(key("Escape")));
    expect(result.current.showList).toBe(false);
  });
});

describe("useSuggestions — keyboard", () => {
  it("wraps the highlight around both ends", () => {
    const { result } = setup("l");           // Lidl, Leroy Merlin
    act(() => result.current.handleFocus());

    act(() => result.current.handleKeyDown(key("ArrowDown")));
    expect(result.current.highlight).toBe(0);
    act(() => result.current.handleKeyDown(key("ArrowDown")));
    expect(result.current.highlight).toBe(1);
    act(() => result.current.handleKeyDown(key("ArrowDown")));
    expect(result.current.highlight).toBe(0);   // wrapped forward
    act(() => result.current.handleKeyDown(key("ArrowUp")));
    expect(result.current.highlight).toBe(1);   // wrapped back
  });

  it("Enter on a highlighted suggestion picks it and closes the list", () => {
    const { result, onPick, onEnterRaw } = setup("l");
    act(() => result.current.handleFocus());
    act(() => result.current.handleKeyDown(key("ArrowDown")));
    act(() => result.current.handleKeyDown(key("Enter")));

    expect(onPick).toHaveBeenCalledWith("Lidl");
    expect(onEnterRaw).not.toHaveBeenCalled();
    expect(result.current.showList).toBe(false);
  });

  it("Enter with nothing highlighted means the typed text, not a suggestion", () => {
    const { result, onPick, onEnterRaw } = setup("l");
    act(() => result.current.handleFocus());
    act(() => result.current.handleKeyDown(key("Enter")));

    expect(onPick).not.toHaveBeenCalled();
    expect(onEnterRaw).toHaveBeenCalledTimes(1);
  });
});
