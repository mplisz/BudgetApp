// ============================================================
// File: src/hooks/useApi.ts
// Returns a memoized ApiClient bound to the session's authenticated
// fetch. Use this in data hooks instead of redeclaring API_URL and the
// fetch/ok-check/translateError boilerplate.
//
//   const api = useApi();
//   const docs = await api.get<PlannedDoc[]>("/api/planned");
//   await api.post("/api/transactions", payload, { fallback: "…" });
// ============================================================

import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { createApiClient } from "../data/api/client";
import type { ApiClient } from "../data/api/client";

export function useApi(): ApiClient {
  const { fetchWithAuth } = useAuth();
  return useMemo(() => createApiClient(fetchWithAuth), [fetchWithAuth]);
}
