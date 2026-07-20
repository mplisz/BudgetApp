// ============================================================
// File: src/hooks/useProductCatalog.ts
// Reads the family PRODUCT CATALOG and exposes an identity resolver +
// merge/rename actions. The catalog gives the price-history section a
// stable cross-shop identity and lets the user merge products the AI
// named differently (e.g. a generic "Napój energetyczny" from one shop
// and a branded "…Dzik" from another).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useApi } from "./useApi";
import { useToast } from "./useToast";
import { catalogKey, type IdentityResolver, type CatalogIdentity } from "../utils/productPricing";

export interface CatalogProduct {
  id:            string;
  key:           string;
  mergedKeys?:   string[];
  canonicalName: string;
  unit:          "g" | "ml" | "szt" | null;
  merchants:     string[];
  purchaseCount: number;
}

export function useProductCatalog() {
  const api = useApi();
  const { showError, showSuccess } = useToast();
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  const load = useCallback(async () => {
    try {
      setCatalog(await api.get<CatalogProduct[]>("/api/products", { fallback: "Nie udało się pobrać katalogu produktów." }));
    } catch {
      // Non-fatal: price history still works via name-fold fallback.
    }
  }, [api]);

  // Resolver: every product's own key AND its absorbed mergedKeys point to
  // the same canonical identity, so a merge takes effect immediately.
  const resolve = useMemo<IdentityResolver>(() => {
    const map = new Map<string, CatalogIdentity>();
    for (const p of catalog) {
      const identity: CatalogIdentity = { groupId: p.id, canonicalName: p.canonicalName };
      map.set(p.key, identity);
      for (const mk of p.mergedKeys ?? []) map.set(mk, identity);
    }
    return (key: string) => map.get(key) ?? null;
  }, [catalog]);

  const merge = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    try {
      await api.post("/api/products/merge", { sourceId, targetId }, { fallback: "Nie udało się połączyć produktów." });
      await load();
      showSuccess("Produkty połączone. ✅");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    }
  }, [api, load, showSuccess, showError]);

  const rename = useCallback(async (id: string, canonicalName: string): Promise<boolean> => {
    try {
      await api.patch(`/api/products/${id}`, { canonicalName }, { fallback: "Nie udało się zmienić nazwy." });
      await load();
      showSuccess("Nazwa zmieniona. ✅");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    }
  }, [api, load, showSuccess, showError]);

  return { catalog, resolve, load, merge, rename, catalogKey };
}
