// ============================================================
// File: src/components/panels/budgetComponents/CardDueStrip.tsx
//
// "💳 Do spłaty w listopadzie: 2 340 zł do 20.11" — the credit-card statement
// the budget month repays, one line per card, above the expense section of
// Baza budżetu.
//
// Information only: the repayment is NOT an expense of this month. What it
// pays for was already counted in the month of each purchase, so adding it
// to Estymata would count the same money twice. Where it does land is the
// bank account — "≈ Na koncie" under Razem budżet (utils/cardDebt
// accountAfterMonth).
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { fmt, monthLabel, shortDate } from "../../../utils/helpers";
import { PanelLink } from "../../ui/summaryUi";
import { PANEL_PATHS } from "../../../data/routes";
import type { MonthStatement } from "../../../utils/cardDebt";

interface Props {
  statements: MonthStatement[];
  month:      string;
}

function StatementLine({ s }: { s: MonthStatement }) {
  const period = `${shortDate(s.period.from)}–${shortDate(s.period.to)}`;
  const [amount, color, note] = !s.isClosed
    ? [`na razie ${fmt(s.toPay)}`, c.textBody,
       `wyciąg zamyka się ${shortDate(s.period.to)}, termin ${shortDate(s.dueDate)}`]
    : s.toPay > 0
      ? [`${fmt(s.toPay)} do ${shortDate(s.dueDate)}`, c.warning, `zakupy ${period}`]
      : ["✓ spłacone", c.success, `wyciąg ${period}, termin ${shortDate(s.dueDate)}`];

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      flexWrap: "wrap", columnGap: 12, rowGap: 2,
    }}>
      <span style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>
        {s.card.name}
        <span style={{ fontSize: 11, color: c.textSecondary, fontWeight: 400, marginLeft: 8 }}>{note}</span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, color, whiteSpace: "nowrap" }}>{amount}</span>
    </div>
  );
}

export function CardDueStrip({ statements, month }: Props) {
  if (statements.length === 0) return null;
  const owing = statements.some(s => s.toPay > 0);

  return (
    <div style={{
      marginBottom: 8, padding: "10px 14px", borderRadius: 10,
      background: alpha(owing ? c.warning : c.success, "0d"),
      border: `1px solid ${alpha(owing ? c.warning : c.success, "44")}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.textTertiary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          💳 Spłata karty · {monthLabel(month)}
        </span>
        <PanelLink to={PANEL_PATHS.card} title="Pokaż kartę kredytową" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {statements.map(s => <StatementLine key={s.card.id} s={s} />)}
      </div>
      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>
        Nie wchodzi do Estymaty — te zakupy są już policzone w miesiącu, w którym je zrobiono.
        Z konta zejdzie — uwzględnia to „≈ Na koncie” pod Razem budżet.
      </div>
    </div>
  );
}
