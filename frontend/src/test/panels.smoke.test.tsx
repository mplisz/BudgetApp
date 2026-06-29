// @vitest-environment jsdom
// ============================================================
// Smoke tests: every top-level panel must MOUNT without throwing.
//
// Why this exists: the color-token refactor touched ~100 files, and a
// `.jsx` component referencing an unimported `c` (LockBanner) slipped past
// `tsc` (checkJs is off) and the bundler — it only blew up at render time.
// Rendering each panel transitively exercises its whole child tree, so this
// guards that entire class of "crashes on render" regressions cheaply.
//
// The harness mirrors main.jsx's provider tree. `fetch` is stubbed to a
// no-auth response, so AppProvider's bootstrap self-skips and panels render
// against their empty initial state — no real network, no fixtures needed.
// ============================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

import { ToastProvider } from "../components/ui/ToastContainer";
import { AuthProvider } from "../context/AuthContext";
import { AppProvider } from "../context/AppContext";

import PanelExpenses           from "../components/panels/PanelExpenses";
import PanelTransactions       from "../components/panels/PanelTransactions";
import PanelRecurring          from "../components/panels/PanelRecurring";
import PanelBaseBudget         from "../components/panels/PanelBaseBudget";
import PanelSettings           from "../components/panels/PanelSettings";
import PanelAdmin              from "../components/panels/PanelAdmin";
import PanelVouchers           from "../components/panels/PanelVouchers";
import PanelAddIncome          from "../components/panels/PanelAddIncome";
import PanelIncomeTransactions from "../components/panels/PanelIncomeTransactions";
import PanelPlanned            from "../components/panels/PanelPlanned";
import PanelAddRecurring       from "../components/panels/PanelAddRecurring";
import PanelAddPlanned         from "../components/panels/PanelAddPlanned";
import PanelSummary            from "../components/panels/PanelSummary";
import PanelAnalytics          from "../components/panels/PanelAnalytics";
import PanelSafetyNet          from "../components/panels/PanelSafetyNet";
import PanelLuxmed             from "../components/panels/PanelLuxmed";

// ── Browser API stubs jsdom lacks (recharts / responsive hooks) ──
beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  const g = globalThis as any;
  g.ResizeObserver = RO;
  g.IntersectionObserver = RO;
  if (!window.matchMedia) {
    g.matchMedia = (q: string) => ({
      matches: false, media: q,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent() { return false; },
    });
  }
});

// No-auth fetch: ok response with empty payload. AuthProvider gets no usable
// token (jwtDecode throws on the empty body → caught), so AppProvider's
// bootstrap is skipped and panels mount with empty initial state.
beforeEach(() => {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve("[]"),
    } as Response),
  );
  // Keep expected error/warning toasts from cluttering test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function Providers({ children }: { children: ReactElement }) {
  return (
    <MemoryRouter initialEntries={["/?m=2026-06"]}>
      <ToastProvider>
        <AuthProvider>
          <AppProvider>{children}</AppProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const PANELS: Array<[string, () => ReactElement]> = [
  ["PanelExpenses",           () => <PanelExpenses />],
  ["PanelTransactions",       () => <PanelTransactions />],
  ["PanelRecurring",          () => <PanelRecurring />],
  ["PanelBaseBudget",         () => <PanelBaseBudget />],
  ["PanelSettings",           () => <PanelSettings />],
  ["PanelAdmin",              () => <PanelAdmin />],
  ["PanelVouchers",           () => <PanelVouchers />],
  ["PanelAddIncome",          () => <PanelAddIncome />],
  ["PanelIncomeTransactions", () => <PanelIncomeTransactions />],
  ["PanelPlanned",            () => <PanelPlanned />],
  ["PanelAddRecurring",       () => <PanelAddRecurring />],
  ["PanelAddPlanned",         () => <PanelAddPlanned />],
  ["PanelSummary",            () => <PanelSummary />],
  ["PanelAnalytics",          () => <PanelAnalytics />],
  ["PanelSafetyNet",          () => <PanelSafetyNet />],
  ["PanelLuxmed",             () => <PanelLuxmed />],
];

describe("panels mount without throwing", () => {
  for (const [name, make] of PANELS) {
    it(name, () => {
      expect(() => render(<Providers>{make()}</Providers>)).not.toThrow();
    });
  }
});
