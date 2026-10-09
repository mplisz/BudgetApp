// ============================================================
// File: src/components/ui/CardPaymentToggle.tsx
// "Paid with the credit card" — the one control that puts a cardId on an
// expense. Shared by the expense form and the cart, so both ask the same way.
//
// One card: a plain checkbox. Several: the checkbox plus a picker. No active
// card at all: nothing is rendered — unless the value points at a card that
// was archived since, which still has to show (and be removable) when an old
// purchase is edited.
// ============================================================

import { c } from "../../styles/tokens";
import { useCreditCards } from "../../hooks/useCreditCards";

interface CardPaymentToggleProps {
  value:    string | null;
  onChange: (cardId: string | null) => void;
  style?:   React.CSSProperties;
}

export function CardPaymentToggle({ value, onChange, style }: CardPaymentToggleProps) {
  const { data, activeCards } = useCreditCards();

  // The cards on offer: the active ones, plus the current one if archived.
  const current = value ? data.cards.find(card => card.id === value) : undefined;
  const options = current && current.isArchived ? [...activeCards, current] : activeCards;
  if (options.length === 0) return null;

  const checked = value !== null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", ...style }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked ? options[0].id : null)}
          style={{ width: 14, height: 14, accentColor: c.info, cursor: "pointer" }}
        />
        <span style={{ fontSize: 12, color: checked ? c.info : c.textMuted, fontWeight: 600 }}>
          💳 Karta kredytowa{options.length === 1 && checked ? ` — ${options[0].name}` : ""}
        </span>
      </label>

      {checked && options.length > 1 && (
        <select
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          aria-label="Karta kredytowa"
          style={{
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6,
            color: c.text, padding: "4px 8px", fontSize: 12, cursor: "pointer",
          }}
        >
          {options.map(card => (
            <option key={card.id} value={card.id}>
              {card.name}{card.isArchived ? " (zarchiwizowana)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
