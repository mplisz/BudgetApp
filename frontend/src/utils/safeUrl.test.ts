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

  it("blocks data: URLs, base64 payload or not", () => {
    // <script>alert(1)</script>
    expect(safeHttpUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeNull();
    expect(safeHttpUrl("DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeNull();
    expect(safeHttpUrl("  data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    // Legitimate data URIs go too — we only ever want real links here.
    expect(safeHttpUrl("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
  });

  it("cannot be tricked by encoding the scheme itself", () => {
    // base64 of "javascript:alert(1)" — no scheme, so it can only become a
    // (nonsense) https host. Nothing in the app ever base64-decodes an href.
    const out = safeHttpUrl("amF2YXNjcmlwdDphbGVydCgxKQ==");
    expect(out === null || out.startsWith("https://")).toBe(true);
    // percent-encoded "j" in javascript:
    const pct = safeHttpUrl("%6Aavascript:alert(1)");
    expect(pct === null || pct.startsWith("https://")).toBe(true);
  });

  it("allows base64 that is merely part of a normal https link", () => {
    // Not an injection: the payload is just path/fragment data on a real host.
    expect(safeHttpUrl("https://example.com/p?d=PHNjcmlwdD4="))
      .toBe("https://example.com/p?d=PHNjcmlwdD4=");
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
