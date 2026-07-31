// ============================================================
// File: src/hooks/useAutoTags.ts
// The ONE sanctioned way to read the auto-tag ("holiday mode") setting.
//
// Whether the tags apply RIGHT NOW is derived, not stored: the settings doc
// only holds which tags were picked and an optional last day. The answer also
// depends on today's date and on those tags still being active. Reading
// settings.autoTagIds directly would miss both filters — so nothing else does.
// ============================================================

import { useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { autoTagsExpired, todayYMD } from "../utils/helpers";
import type { Tag } from "../types/appContext";

export interface UseAutoTags {
  /** Tag ids to pre-select on a new expense — empty when off or expired. */
  ids:          string[];
  /** The picked tags that still exist and aren't archived (for labelling). */
  tags:         Tag[];
  /** Configured last day ("YYYY-MM-DD"), or null when the window never closes. */
  until:        string | null;
  /** Configured, but past its last day — shown as such instead of vanishing. */
  isExpired:    boolean;
  /** Anything picked at all, regardless of whether it currently applies. */
  isConfigured: boolean;
}

export function useAutoTags(): UseAutoTags {
  const { settings, tags } = useAppContext();

  return useMemo<UseAutoTags>(() => {
    const configured = Array.isArray(settings?.autoTagIds) ? settings!.autoTagIds! : [];
    const until      = (settings?.autoTagUntil as string | null | undefined) ?? null;
    const isExpired  = autoTagsExpired(until, todayYMD());

    // A tag archived mid-trip must stop attaching itself.
    const live = configured
      .map(id => tags.find(t => t.id === id))
      .filter((t): t is Tag => !!t && !t.isArchived);

    return {
      ids:          isExpired ? [] : live.map(t => t.id),
      tags:         live,
      until,
      isExpired,
      isConfigured: configured.length > 0,
    };
  }, [settings, tags]);
}
