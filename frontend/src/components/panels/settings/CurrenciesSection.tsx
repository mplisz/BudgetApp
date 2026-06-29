// ============================================================
// File: src/components/panels/settings/CurrenciesSection.jsx
// Managing currencies to be used in dropdowns
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState }             from "react";
import { theme as s }           from "../../../styles/theme";
import { CollapsibleSection }   from "../../ui/index";
import { ConfirmModal }         from "../../ui/ConfirmModal";
import { ArchiveToggleButton }  from "./ArchiveToggleButton";
import { useCurrencyManager }   from "../../../hooks/useCurrencyManager";
import { EditableLabel }         from "../../ui/EditableLabel";
import type { Currency }         from "../../../types/appContext";

const MODAL_CLOSED = { isOpen: false, title: "", message: "", onConfirm: () => {} };

const SUGGESTIONS = [
  { code: "CHF", name: "Frank szwajcarski" },
  { code: "NOK", name: "Korona norweska" },
  { code: "SEK", name: "Korona szwedzka" },
  { code: "HUF", name: "Forint węgierski" },
  { code: "JPY", name: "Jen japoński" },
  { code: "MXN", name: "Peso meksykańskie" },
  { code: "TRY", name: "Lira turecka" },
  { code: "AED", name: "Dirham emiracki" },
  { code: "THB", name: "Bat tajski" },
  { code: "AUD", name: "Dolar australijski" },
  { code: "CAD", name: "Dolar kanadyjski" },
  { code: "DKK", name: "Korona duńska" },
  { code: "CNY", name: "Juan renminbi" },
  { code: "BRL", name: "Real brazylijski" },
  { code: "ILS", name: "Szekel izraelski" },
  { code: "ZAR", name: "Rand południowoafrykański" }
];

export function CurrenciesSection() {
  const {
    allCurrencies,
    baseCurrency,
    activeCurrencies,
    archivedCurrencies,
    addCurrency,
    archiveCurrency,
    updateCurrency,
    restoreCurrency,
  } = useCurrencyManager();

  const [newCode,      setNewCode]      = useState("");
  const [newName,      setNewName]      = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalConfig,  setModalConfig]  = useState(MODAL_CLOSED);

  const activeCount = activeCurrencies.length;
  const atLimit     = activeCount >= 10;

  async function handleAdd() {
    const ok = await addCurrency(newCode, newName);
    if (ok) { setNewCode(""); setNewName(""); }
  }

  function handleSuggestion(sugg: { code: string; name: string }) {
    if (activeCurrencies.find(c => c.code === sugg.code)) return;
    setNewCode(sugg.code);
    setNewName(sugg.name);
  }

  function confirmArchive(currency: Currency) {
    setModalConfig({
      isOpen:  true,
      title:   "Archiwizacja waluty",
      message: `Czy na pewno chcesz zarchiwizować ${currency.code} – ${currency.name}? Waluta zniknie z dropdownu, ale możesz ją później przywrócić.`,
      onConfirm: () => { setModalConfig(MODAL_CLOSED); archiveCurrency(currency.code); },
    });
  }

  // ── Style helpers ────────────────────────────────────────────
  const chip = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8,
    background: c.border,
    border:     `1px solid ${active ? c.borderStrong : c.border}`,
    borderRadius: 8,
    padding:    "6px 12px",
    opacity:    active ? 1 : 0.5,
  });

  return (
    <>
      <CollapsibleSection title="💱 Waluty" defaultOpen={false}>

        {/* Licznik */}
        <div style={{ fontSize: 11, color: atLimit ? c.warning : c.textMuted, marginBottom: 14 }}>
          {activeCount}/10 aktywnych walut
          {atLimit && " — osiągnięto limit. Zarchiwizuj walutę żeby dodać nową."}
        </div>

        {/* Base currency */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
            Waluta bazowa
          </div>
          <div style={chip(true)}>
            <span style={{ fontWeight: 700, color: c.success, fontSize: 13, minWidth: 36 }}>
              {baseCurrency.code}
            </span>
            <span style={{ color: c.textTertiary, fontSize: 12 }}>{baseCurrency.name}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: c.borderStrong }}>bazowa</span>
          </div>
        </div>

        {/* Active currencies */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: c.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Aktywne</span>
          <ArchiveToggleButton isShowingArchived={showArchived} onToggle={() => setShowArchived(!showArchived)} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {activeCurrencies.map(cur => (
            <div key={cur.code} style={chip(true)}>
              <EditableLabel
                value={cur.code}
                onSave={newCode => updateCurrency(cur.code, { code: newCode })}
                fontSize={13}
                fontWeight={700}
              />
              <EditableLabel
                value={cur.name}
                onSave={newName => updateCurrency(cur.code, { name: newName })}
                fontSize={12}
                fontWeight={400}
              />
              <button onClick={() => confirmArchive(cur)}
                style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 14, marginLeft: 4 }}>
                🗑️
              </button>
            </div>
          ))}
          {activeCurrencies.length === 0 && (
            <div style={{ color: c.textMuted, fontSize: 13 }}>Brak aktywnych walut.</div>
          )}
        </div>

        {/* Archive */}
        {showArchived && (
          <>
            <div style={{ fontSize: 10, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
              Archiwum
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {archivedCurrencies.map(cur => (
                <div key={cur.code} style={chip(false)}>
                  <span style={{ fontWeight: 700, color: c.textSecondary, fontSize: 13, minWidth: 36 }}>{cur.code}</span>
                  <span style={{ color: c.textMuted, fontSize: 12 }}>{cur.name}</span>
                  <button
                    onClick={() => restoreCurrency(cur.code)}
                    title="Przywróć"
                    disabled={atLimit}
                    style={{ background: "none", border: "none", color: c.success, cursor: atLimit ? "not-allowed" : "pointer", fontSize: 14, marginLeft: 4, opacity: atLimit ? 0.4 : 1 }}>
                    🔄
                  </button>
                </div>
              ))}
              {archivedCurrencies.length === 0 && (
                <div style={{ color: c.textMuted, fontSize: 13 }}>Brak zarchiwizowanych walut.</div>
              )}
            </div>
          </>
        )}

        {/* Suggestions */}
        {!atLimit && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
              Szybkie dodanie
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUGGESTIONS
                .filter(s => !allCurrencies.find(c => c.code === s.code && !c.isArchived))
                .map(sugg => (
                  <button key={sugg.code} onClick={() => handleSuggestion(sugg)}
                    style={{
                      padding: "4px 10px", borderRadius: 16,
                      border:     `1px solid ${newCode === sugg.code ? c.info : c.borderStrong}`,
                      background: newCode === sugg.code ? alpha(c.info, "22") : "transparent",
                      color:      newCode === sugg.code ? c.info   : c.textSecondary,
                      cursor: "pointer", fontSize: 12,
                    }}>
                    {sugg.code}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Add */}
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            value={newCode}
            onChange={e => setNewCode(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="KOD"
            maxLength={3}
            disabled={atLimit}
            style={{ ...s.input, width: 64, textAlign: "center", fontWeight: 700, letterSpacing: 2, flexShrink: 0 }}
          />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nazwa waluty…"
            maxLength={50}
            disabled={atLimit}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            style={{ ...s.input, flex: 1 }}
          />
          <button
            onClick={handleAdd}
            disabled={atLimit || !newCode.trim() || !newName.trim()}
            style={{
              ...s.btn(), width: "auto", padding: "10px 18px", marginTop: 0,
              opacity: (atLimit || !newCode.trim() || !newName.trim()) ? 0.4 : 1,
              cursor:  (atLimit || !newCode.trim() || !newName.trim()) ? "not-allowed" : "pointer",
            }}>
            ➕ Dodaj
          </button>
        </div>

      </CollapsibleSection>

      <ConfirmModal
        isOpen={modalConfig.isOpen} title={modalConfig.title}
        message={modalConfig.message} onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig(MODAL_CLOSED)}
      />
    </>
  );
}