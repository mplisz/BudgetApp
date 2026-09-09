// ============================================================
// File: src/utils/tags.ts
// Resolving stored tag IDs → live tags.
//
// Documents (transactions, recurring, settings) store tag IDs; every view
// that shows them has to look each one up and drop what no longer resolves.
// A tag can be deleted or archived long after a document referenced it, so
// the "drop unknown, drop archived" pair is the rule everywhere — hence one
// helper instead of the same map/find/filter chain in each panel.
// ============================================================

import type { Tag } from "../types/appContext";

/** Live tags for the given IDs, in the order the IDs were stored. */
export function resolveTags(ids: string[] | null | undefined, tags: Tag[]): Tag[] {
  return (ids ?? [])
    .map(id => tags.find(t => t.id === id))
    .filter((t): t is Tag => !!t && !t.isArchived);
}

/** Just the names — what read-only rows and badges need. */
export function resolveTagNames(ids: string[] | null | undefined, tags: Tag[]): string[] {
  return resolveTags(ids, tags).map(t => t.name);
}
