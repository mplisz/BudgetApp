// ============================================================
// File: src/components/panels/settings/DepositSection.tsx
// Lets the user pick which existing SUBCATEGORY holds bottle/can deposits
// (kaucja za opakowania). The Bottle Deposits panel returns those
// transactions. Analogous to LuxmedSection.tsx.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState, useEffect } from "react";
import { useSettings }         from "../../../hooks/useSettings";
import { SubcategorySelect }   from "../../ui/SubcategorySelect";
import { CollapsibleSection }  from "../../ui/index";
import { theme as s }          from "../../../styles/theme";

export function DepositSection() {
  const { settings, isLoading, isSaving, updateSettings } = useSettings();

  const [subId, setSubId] = useState<string>("");

  useEffect(() => {
    setSubId(settings?.depositSubcategoryId ?? "");
  }, [settings]);

  function handleSave() {
    updateSettings({ depositSubcategoryId: subId || null });
  }

  return (
    <CollapsibleSection title="🍾 Zwroty butelek" defaultOpen={false}>
      {isLoading ? (
        <div style={{ color: c.textMuted, fontSize: 13 }}>Ładowanie…</div>
      ) : (
        <>
          <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
            Wybierz subkategorię, której wydatki to kaucja za opakowania (butelki, puszki).
            Panel <strong style={{ color: c.textSecondary }}>Zwroty butelek</strong> pozwoli zwracać
            te transakcje jedną kwotą (od najstarszych).
          </div>

          <SubcategorySelect
            value={subId}
            onChange={sel => setSubId(sel.subcategoryId)}
            allowedTypes={["EXPENSE"]}
            placeholder="— brak (panel wyłączony) —"
          />

          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{ ...s.btn(), marginTop: 16, opacity: isSaving ? 0.5 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "⏳ Zapisywanie..." : "💾 Zapisz subkategorię kaucji"}
          </button>
        </>
      )}
    </CollapsibleSection>
  );
}
