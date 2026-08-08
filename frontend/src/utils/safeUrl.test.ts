// ============================================================
// File: src/utils/safeUrl.test.ts
// The href gate. These are security tests, not formatting tests: anything
// that gets through here becomes a clickable link in the app.
// ============================================================

import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "./safeUrl";

describe("safeHttpUrl", () => {
  it("passes ordinary http(s) links through", () => {
    expect(safeHttpUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHttpUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("treats a schemeless string as a bare domain over https", () => {
    expect(safeHttpUrl("example.com")).toBe("https://example.com/");
    expect(safeHttpUrl("sklep.pl/rower")).toBe("https://sklep.pl/rower");
  });

  it("rejects script-bearing schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects a scheme hidden behind leading whitespace", () => {
    expect(safeHttpUrl("   javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("\n\tjavascript:alert(1)")).toBeNull();
  });

  it("never lets a schemeless string become a script URL", () => {
    // No leading scheme match → https:// is prepended, so whatever follows
    // can only ever be parsed as an https URL (or fail outright).
    const out = safeHttpUrl("javascript:alert(1)");
    expect(out === null || out.startsWith("https://")).toBe(true);
  });

  it("returns null for nothing to link to", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });

  it("returns null for input the URL parser rejects", () => {
    expect(safeHttpUrl("http://")).toBeNull();
  });
});
