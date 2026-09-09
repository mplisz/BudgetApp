// ============================================================
// File: src/utils/tags.test.ts
// Resolving stored tag IDs against the live tag list.
// ============================================================

import { describe, it, expect } from "vitest";
import { resolveTags, resolveTagNames } from "./tags";
import type { Tag } from "../types/appContext";

const tag = (id: string, name: string, isArchived = false): Tag =>
  ({ id, name, icon: "🏷️", isArchived }) as Tag;

const ALL = [
  tag("t_trip",  "Wyjazd"),
  tag("t_kids",  "Dzieci"),
  tag("t_old",   "Stary", true),
];

describe("resolveTags", () => {
  it("resolves ids in the order they were stored, not list order", () => {
    expect(resolveTags(["t_kids", "t_trip"], ALL).map(t => t.name))
      .toEqual(["Dzieci", "Wyjazd"]);
  });

  it("drops ids that no longer exist", () => {
    expect(resolveTags(["t_trip", "t_deleted"], ALL).map(t => t.id))
      .toEqual(["t_trip"]);
  });

  it("drops archived tags — an archived tag must stop showing up", () => {
    expect(resolveTags(["t_trip", "t_old"], ALL).map(t => t.id))
      .toEqual(["t_trip"]);
  });

  it("treats null and undefined id lists as empty", () => {
    expect(resolveTags(null, ALL)).toEqual([]);
    expect(resolveTags(undefined, ALL)).toEqual([]);
  });

  it("returns empty when the tag list itself is empty", () => {
    expect(resolveTags(["t_trip"], [])).toEqual([]);
  });
});

describe("resolveTagNames", () => {
  it("returns just the names, same filtering", () => {
    expect(resolveTagNames(["t_trip", "t_old", "t_gone"], ALL)).toEqual(["Wyjazd"]);
  });
});
