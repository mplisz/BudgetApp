// ============================================================
// File: src/hooks/useProductCatalog.ts
// Reads the family's PRODUCT CATALOG — the personal "inflation basket" of
// products explicitly registered in Settings → Produkty śledzone — and
// exposes CRUD (create/rename/updateDefault/remove) plus an identity
// resolver for the price-history section. mergedKeys[] is still honoured
// by the resolver (a manual Cosmos edit can still fold identities), even
// though the UI action that used to write it has been removed.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useApi } from "./useApi";
import { useToast } from "./useToast";
import { catalogKey, type IdentityResolver, type CatalogIdentity, type SizeUnit } from "../utils/productPricing";

export interface CatalogProduct {
  id:            string;
  key:           string;
  mergedKeys?:   string[];
  canonicalName: string;
  unit:          SizeUnit | null;
  defaultSize?:  number | null;
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

  // Register a new tracked product. `size` is expected already in BASE
  // units (g/ml) — the Admin form converts a user-friendly "1,5 l" before
  // calling this, so the whole stack keeps one convention.
  const create = useCallback(async (
    canonicalName: string, unit: SizeUnit, defaultSize: number | null,
  ): Promise<boolean> => {
    try {
      await api.post(
        "/api/products",
        { canonicalName, unit, defaultSize },
        { fallback: "Nie udało się dodać produktu." },
      );
      await load();
      showSuccess("Produkt dodany do śledzonych. ✅");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    }
  }, [api, load, showSuccess, showError]);

  const updateDefaultSize = useCallback(async (id: string, defaultSize: number | null): Promise<boolean> => {
    try {
      await api.patch(`/api/products/${id}`, { defaultSize }, { fallback: "Nie udało się zmienić domyślnego rozmiaru." });
      await load();
      showSuccess("Zapisano. ✅");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    }
  }, [api, load, showSuccess, showError]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.del(`/api/products/${id}`, undefined, { fallback: "Nie udało się usunąć produktu." });
      await load();
      showSuccess("Produkt przestał być śledzony.");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    }
  }, [api, load, showSuccess, showError]);

  return { catalog, resolve, load, rename, create, updateDefaultSize, remove, catalogKey };
}
