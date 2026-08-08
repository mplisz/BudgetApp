// ============================================================
// File: src/utils/safeUrl.ts
// Gatekeeper for every user-supplied URL we turn into a clickable <a>.
//
// The risk is the href scheme, not the destination: `javascript:alert(1)`
// stored in a plan and rendered as a link executes on click. So a URL is
// only ever emitted when it is unambiguously http(s).
//
// A string with NO scheme is treated as a bare domain and gets https://
// prepended — which is also why a schemeless string can never turn into a
// script URL later.
//
// This lives in one place on purpose: it used to be copy-pasted into two
// card components, and a security guard with two copies is a guard that
// gets fixed in one of them.
// ============================================================

export function safeHttpUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  // Leading "<scheme>:" if present at all.
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;

  const candidate = scheme ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    // Re-check after parsing: the parser normalises away tabs and newlines,
    // so the scheme it ends up with is the one the browser would honour.
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null;
  } catch {
    return null;
  }
}
