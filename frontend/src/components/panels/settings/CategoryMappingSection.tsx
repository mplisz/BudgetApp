// ============================================================
// File: src/components/panels/settings/CategoryMappingSection.tsx
// Maps app features to existing (sub)categories. Each field stores a single
// subcategoryId in settings; the backend resolves the full category from it.
// Grows over time (e.g. retirement mapping later).
// ============================================================

import { c } from "../../../styles/tokens";
import { useState, useEffect } from "react";
import { useSettings }         from "../../../hooks/useSettings";
import { SubcategorySelect }   from "../../ui/SubcategorySelect";
import { CollapsibleSection }  from "../../ui/index";
import { theme as s }          from "../../../styles/theme";

interface FieldProps {
  label:    string;
  desc:     string;
  value:    string;
  onChange: (v: string) => void;
  types:    string[];
}

function Field({ label, desc, value, onChange, types }: FieldProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, color: c.text, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6, lineHeight: 1.4 }}>{desc}</div>
      <SubcategorySelect
        value={value}
        onChange={sel => onChange(sel.subcategoryId)}
        allowedTypes={types}
        placeholder="— brak —"
      />
    </div>
  );
}

export function CategoryMappingSection() {
  const { settings, isLoading, isSaving, updateSettings } = useSettings();

  const [depositSub,  setDepositSub]  = useState("");
  const [returnSub,   setReturnSub]   = useState("");
  const [envelopeSub, setEnvelopeSub] = useState("");

  useEffect(() => {
    setDepositSub(settings?.depositSubcategoryId ?? "");
    setReturnSub(settings?.returnTransferSubcategoryId ?? "");
    setEnvelopeSub(settings?.envelopeTransferSubcategoryId ?? "");
  }, [settings]);

  function handleSave() {
    updateSettings({
      depositSubcategoryId:          depositSub  || null,
      returnTransferSubcategoryId:   returnSub   || null,
      envelopeTransferSubcategoryId: envelopeSub || null,
    });
  }

  return (
    <CollapsibleSection title="🗂️ Mapowanie kategorii" defaultOpen={false}>
      {isLoading ? (
        <div style={{ color: c.textMuted, fontSize: 13 }}>Ładowanie…</div>
      ) : (
        <>
          <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            Wskaż istniejące (sub)kategorie używane przez poszczególne funkcje aplikacji.
          </div>

          <Field
            label="🍾 Kaucja za opakowania"
            desc="Subkategoria do rozpoznania zwrotów kaucyjnych (butelki, puszki) w panelu „Zwroty butelek”."
            value={depositSub}
            onChange={setDepositSub}
            types={["EXPENSE"]}
          />

          <Field
            label="🔙 Transfer przy zwrotach"
            desc="Subkategoria do automatycznego tworzenia transferów podczas zwrotów (ręcznych, LuxMed, butelek). Polecana: Gotówka."
            value={returnSub}
            onChange={setReturnSub}
            types={["TRANSFER"]}
          />

          <Field
            label="📅 Transfer przy finalizacji koperty"
            desc="Subkategoria do automatycznego tworzenia transferu podczas finalizacji wirtualnej koperty. Polecana: Gotówka."
            value={envelopeSub}
            onChange={setEnvelopeSub}
            types={["TRANSFER"]}
          />

          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{ ...s.btn(), marginTop: 8, opacity: isSaving ? 0.5 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "⏳ Zapisywanie..." : "💾 Zapisz mapowanie"}
          </button>
        </>
      )}
    </CollapsibleSection>
  );
}
