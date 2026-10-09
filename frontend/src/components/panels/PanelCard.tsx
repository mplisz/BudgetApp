// ============================================================
// File: src/components/panels/PanelCard.tsx
// "Karta kredytowa" — what is owed on each card, and the one place a
// repayment is registered.
//
// A card purchase is an ordinary expense with the 💳 box ticked; it counts in
// its budget month like any other. This panel is the other half: the debt
// those purchases left behind, how much of it the last statement asks for,
// and the repayments that bring it down. All the arithmetic is utils/cardDebt.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { useCreditCards }  from "../../hooks/useCreditCards";
import { CollapsibleSection } from "../ui";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { CardForm }        from "./cardComponents/CardForm";
import { RepaymentModal }  from "./cardComponents/RepaymentModal";
import { fmt, round2, todayYMD, monthLabel, plural } from "../../utils/helpers";
import { ToggleBtn }       from "../ui/ToggleBtn";
import {
  cardsOverview, cardCharge, cardTurnover, statementPeriod, calendarMonth, addDays, type CardStatus,
} from "../../utils/cardDebt";
import type { CardData, CardRepayment, CardTransaction } from "../../types/creditCard";

// Purchases this recent may not be posted by the bank yet — the usual reason
// its balance is lower than ours.
const UNPOSTED_DAYS = 3;

// ── Helpers ───────────────────────────────────────────────────

const dmy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const dm  = (iso: string) => dmy(iso).slice(0, 5);

function dueLabel(status: CardStatus): { text: string; color: string } {
  if (status.statementDue <= 0) return { text: "wyciąg spłacony", color: c.success };
  if (status.daysLeft < 0)  return { text: `termin minął ${dmy(status.dueDate)}`, color: c.danger };
  if (status.daysLeft === 0) return { text: "termin dziś", color: c.warning };
  return {
    text:  `do ${dmy(status.dueDate)} · ${status.daysLeft} ${plural(status.daysLeft, "dzień", "dni", "dni")}`,
    color: status.daysLeft <= 5 ? c.warning : c.textSecondary,
  };
}

// ── Styles ────────────────────────────────────────────────────

const st = {
  panel: { padding: "0 0 40px 0", maxWidth: 760, margin: "0 auto" } as React.CSSProperties,
  card:  { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px", marginBottom: 14 } as React.CSSProperties,
  row:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: `1px solid ${c.border}` } as React.CSSProperties,
  link:  (color: string): React.CSSProperties => ({ background: "none", border: "none", color, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "2px 4px" }),
};

// ── Component ─────────────────────────────────────────────────

export default function PanelCard() {
  const { data, isLoaded, isSaving, reload, createCard } = useCreditCards();
  const [showArchived, setShowArchived] = useState(false);
  const [adding,       setAdding]       = useState(false);

  useEffect(() => { reload(); }, [reload]);

  const today    = todayYMD();
  const overview = useMemo(() => cardsOverview(data, today), [data, today]);

  // An archived card stays on screen for as long as something is owed on it.
  const visible  = overview.cards.filter(s => !s.card.isArchived || s.debt !== 0 || showArchived);
  const hidden   = overview.cards.length - overview.cards.filter(s => !s.card.isArchived || s.debt !== 0).length;

  return (
    <div style={st.panel}>
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 4 }}>💳 Karta kredytowa</div>
        <div style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          Zakup kartą to zwykły wydatek z zaznaczonym 💳 — liczy się w swoim miesiącu.
          Tutaj widzisz, ile z tego jest jeszcze do oddania bankowi, i rejestrujesz spłaty.
        </div>
      </div>

      {!isLoaded && <div style={{ color: c.textMuted, padding: "40px 0", textAlign: "center" }}>⏳ Ładowanie…</div>}

      {isLoaded && overview.cards.length === 0 && (
        <div style={st.card}>
          <div style={{ fontWeight: 700, color: c.text, marginBottom: 4 }}>Dodaj pierwszą kartę</div>
          <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
            Po dodaniu karty w formularzu wydatku pojawi się pole „💳 Karta kredytowa”.
          </div>
          <CardForm isSaving={isSaving} onSave={createCard} />
        </div>
      )}

      {isLoaded && visible.map(status => <CardSection key={status.card.id} status={status} data={data} today={today} />)}

      {isLoaded && overview.cards.length > 0 && (
        <>
          {adding ? (
            <div style={st.card}>
              <div style={{ fontWeight: 700, color: c.text, marginBottom: 14 }}>Nowa karta</div>
              <CardForm
                isSaving={isSaving}
                onSave={async card => { if (await createCard(card)) setAdding(false); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setAdding(true)} style={st.link(c.info)}>➕ Dodaj kolejną kartę</button>
              {hidden > 0 && (
                <button onClick={() => setShowArchived(v => !v)} style={st.link(c.textMuted)}>
                  🗄 {showArchived ? "Ukryj" : "Pokaż"} zarchiwizowane ({hidden})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── One card ──────────────────────────────────────────────────

function CardSection({ status, data, today }: { status: CardStatus; data: CardData; today: string }) {
  const { isSaving, updateCard, deleteRepayment } = useCreditCards();
  const { card } = status;

  const [editing,   setEditing]   = useState(false);
  const [repaying,  setRepaying]  = useState(false);
  const [correcting, setCorrecting] = useState<CardRepayment | null>(null);
  const [removing,  setRemoving]  = useState<CardRepayment | null>(null);

  // Newest first. Only the two periods that matter for the next transfer are
  // listed here; the full history is the 💳 filter in Wydatki.
  const purchases = useMemo(
    () => data.transactions
      .filter(tx => tx.cardId === card.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [data.transactions, card.id],
  );
  const current   = purchases.filter(tx => tx.date > status.closeDate);
  const statement = purchases.filter(tx => tx.date > status.previousCloseDate && tx.date <= status.closeDate);

  const repayments = useMemo(
    () => data.repayments
      .filter(r => r.cardId === card.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [data.repayments, card.id],
  );

  const due       = dueLabel(status);
  const overpaid  = status.debt < 0;

  return (
    <div style={{ ...st.card, opacity: card.isArchived ? 0.75 : 1 }}>
      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: c.text }}>
          {card.name}
          {card.isArchived && <span style={{ marginLeft: 8, fontSize: 11, color: c.textMuted, fontWeight: 600 }}>zarchiwizowana</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {!card.isArchived && <button onClick={() => setEditing(v => !v)} style={st.link(c.info)}>✏️ Edytuj</button>}
          <button
            onClick={() => updateCard(card.id, { isArchived: !card.isArchived })}
            disabled={isSaving}
            style={st.link(c.textMuted)}
          >
            {card.isArchived ? "↩️ Przywróć" : "🗄 Archiwizuj"}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${c.border}` }}>
          <CardForm
            card={card}
            isSaving={isSaving}
            onSave={async input => { if (await updateCard(card.id, input)) setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {/* The three numbers */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Figure
          label={overpaid ? "Nadpłata" : "Do spłaty łącznie"}
          value={fmt(Math.abs(status.debt))}
          color={overpaid ? c.success : status.debt > 0 ? c.text : c.success}
        />
        <Figure
          label={`Z wyciągu ${dm(status.closeDate)}`}
          value={fmt(status.statementDue)}
          color={status.statementDue > 0 ? c.warning : c.success}
          sub={due.text} subColor={due.color}
        />
        <Figure
          label={`Bieżący okres (od ${dm(addDays(status.closeDate, 1))})`}
          value={fmt(status.notYetDue)}
          color={c.textSecondary}
          sub="jeszcze niewymagane"
        />
      </div>

      {overpaid && (
        <div style={{ fontSize: 12, color: c.warning, background: alpha(c.warning, "11"), border: `1px solid ${alpha(c.warning, "44")}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, lineHeight: 1.5 }}>
          Spłacono więcej, niż wynosi dług. Jeśli to nie celowa nadpłata, sprawdź wyciąg — pewnie brakuje
          zakupu oznaczonego 💳 albo odsetek. Nadpłatę zjedzą kolejne zakupy kartą.
        </div>
      )}

      {!card.isArchived && (
        <button
          onClick={() => setRepaying(true)}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: c.success, color: c.white, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 6 }}
        >
          💸 Zarejestruj spłatę
        </button>
      )}

      <Turnover status={status} data={data} today={today} />

      {/* Purchases */}
      <CollapsibleSection title={`Zakupy kartą — bieżący okres (${current.length})`} defaultOpen={false}>
        <PurchaseList items={current} empty="Brak zakupów kartą po ostatnim wyciągu." />
      </CollapsibleSection>

      <CollapsibleSection
        title={`Ostatni wyciąg ${dm(addDays(status.previousCloseDate, 1))}–${dm(status.closeDate)} (${statement.length})`}
        defaultOpen={false}
      >
        <PurchaseList items={statement} empty="Brak zakupów kartą w okresie ostatniego wyciągu." />
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          Bank zamyka wyciąg po dacie zaksięgowania, aplikacja po dacie zakupu — zakup z ostatnich
          dni okresu może trafić na następny wyciąg. Kwotę spłaty zawsze możesz poprawić.
        </div>
      </CollapsibleSection>

      {/* Repayments */}
      <CollapsibleSection title={`Historia spłat (${repayments.length})`} defaultOpen={false}>
        {repayments.length === 0 && <Empty text="Brak zarejestrowanych spłat." />}
        {repayments.map(r => (
          <div key={r.id} style={st.row}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>{dmy(r.date)}</div>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                {monthLabel(r.budgetMonth)}
                {(r.interestAmount ?? 0) > 0 && <> · w tym odsetki {fmt(r.interestAmount!)}</>}
                {r.createdBy && <> · {r.createdBy}</>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, color: c.success, fontVariantNumeric: "tabular-nums" }}>−{fmt(r.amount)}</div>
              <div>
                <button onClick={() => setCorrecting(r)} style={st.link(c.info)} title="Popraw kwotę lub datę">✏️</button>
                <button onClick={() => setRemoving(r)} style={st.link(c.danger)} title="Usuń spłatę">🗑</button>
              </div>
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {/* Reconciliation */}
      <CollapsibleSection title="Uzgodnienie z bankiem" defaultOpen={false}>
        <Reconciliation status={status} purchases={purchases} today={today} />
      </CollapsibleSection>

      {repaying   && <RepaymentModal status={status} onClose={() => setRepaying(false)} />}
      {correcting && <RepaymentModal status={status} repayment={correcting} onClose={() => setCorrecting(null)} />}

      <ConfirmModal
        isOpen={!!removing}
        title="🗑 Usuń spłatę"
        message={removing
          ? `Usunąć spłatę ${fmt(removing.amount)} z ${dmy(removing.date)}? Dług na karcie wzrośnie o tę kwotę.` +
            ((removing.interestAmount ?? 0) > 0
              ? `\n\nWydatek z odsetkami (${fmt(removing.interestAmount!)}) zostanie — usuń go osobno w panelu Wydatki, jeśli też był pomyłką.`
              : "")
          : ""}
        onConfirm={() => { if (removing) deleteRepayment(removing.id); setRemoving(null); }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

// ── Turnover ──────────────────────────────────────────────────
// How much was spent with the card in a calendar month or in a statement
// period — what a "spend at least X" condition is checked against. Unlike
// the figures above it has nothing to do with the debt: repaying the card
// doesn't lower it.

function Turnover({ status, data, today }: { status: CardStatus; data: CardData; today: string }) {
  const [byStatement, setByStatement] = useState(false);
  const [offset,      setOffset]      = useState(0);   // 0 = running, -1 = the one before, …

  const range = byStatement ? statementPeriod(status.card, today, offset) : calendarMonth(today, offset);
  const { amount, count } = cardTurnover(status.card.id, data, range);
  const label = byStatement
    ? `${dm(range.from)}–${dmy(range.to)}`
    : monthLabel(range.from.slice(0, 7));

  const step = (color: string, disabled = false): React.CSSProperties => ({
    ...st.link(color), fontSize: 16, opacity: disabled ? 0.3 : 1, cursor: disabled ? "default" : "pointer",
  });

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px", margin: "8px 0 6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
          Obrót kartą
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <ToggleBtn active={!byStatement} onClick={() => { setByStatement(false); setOffset(0); }}>Miesiąc</ToggleBtn>
          <ToggleBtn active={byStatement}  onClick={() => { setByStatement(true);  setOffset(0); }}>Okres rozliczeniowy</ToggleBtn>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={() => setOffset(o => o - 1)} style={step(c.info)} aria-label="Poprzedni okres">‹</button>
        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 12, color: c.textSecondary }}>
            {label}{offset === 0 && <span style={{ color: c.textMuted }}> · trwa</span>}
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: c.text, fontVariantNumeric: "tabular-nums" }}>{fmt(amount)}</div>
          <div style={{ fontSize: 11, color: c.textMuted }}>
            {count} {plural(count, "pozycja", "pozycje", "pozycji")} · po zwrotach do sklepu
          </div>
        </div>
        <button
          onClick={() => setOffset(o => Math.min(0, o + 1))}
          disabled={offset === 0}
          style={step(c.info, offset === 0)}
          aria-label="Następny okres"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ── Reconciliation ────────────────────────────────────────────
// Type in what the bank says is owed; see how far our figure is from it and
// which way to look. Nothing is saved — the fix is always a missing or a
// surplus entry, made where entries are made.

function Reconciliation({ status, purchases, today }: { status: CardStatus; purchases: CardTransaction[]; today: string }) {
  const [bankText, setBankText] = useState("");

  const unposted = round2(
    purchases
      .filter(tx => tx.date > addDays(today, -UNPOSTED_DAYS))
      .reduce((sum, tx) => sum + cardCharge(tx), 0),
  );

  const hasInput = bankText.trim() !== "";
  const diff     = round2((parseFloat(bankText.replace(",", ".")) || 0) - status.debt);

  let verdict: { text: string; color: string } | null = null;
  if (hasInput) {
    if (Math.abs(diff) < 0.005) {
      verdict = { text: "✅ Zgadza się co do grosza.", color: c.success };
    } else if (diff < 0 && Math.abs(diff + unposted) < 0.005) {
      verdict = { text: `✅ Różnicę ${fmt(-diff)} tłumaczą zakupy z ostatnich ${UNPOSTED_DAYS} dni, których bank jeszcze nie zaksięgował.`, color: c.success };
    } else if (diff > 0) {
      verdict = { text: `Bank pokazuje o ${fmt(diff)} więcej. Szukaj: zakupu kartą bez 💳, niewpisanych odsetek lub opłaty, albo spłaty wpisanej dwa razy.`, color: c.warning };
    } else {
      verdict = { text: `Bank pokazuje o ${fmt(-diff)} mniej. Szukaj: niewpisanej spłaty, zwrotu na kartę, albo wydatku oznaczonego 💳 przez pomyłkę.`, color: c.warning };
    }
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 }}>
        Zadłużenie według banku (PLN)
      </label>
      <input
        type="number" min={0} step={0.01}
        value={bankText}
        onChange={e => setBankText(e.target.value)}
        placeholder={`u nas: ${fmt(status.debt)}`}
        style={{ width: "100%", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
      />
      {verdict && <div style={{ fontSize: 12, color: verdict.color, marginTop: 8, lineHeight: 1.5 }}>{verdict.text}</div>}
      {unposted > 0 && (
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          Zakupy kartą z ostatnich {UNPOSTED_DAYS} dni: <strong style={{ color: c.textSecondary }}>{fmt(unposted)}</strong> —
          bank mógł ich jeszcze nie zaksięgować.
        </div>
      )}
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────

function Figure({ label, value, color, sub, subColor = c.textMuted }: {
  label: string; value: string; color: string; sub?: string; subColor?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 150, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: c.textMuted, fontSize: 12, padding: "12px 0" }}>{text}</div>;
}

function PurchaseList({ items, empty }: { items: CardTransaction[]; empty: string }) {
  if (items.length === 0) return <Empty text={empty} />;
  return (
    <>
      {items.map(tx => {
        const owed     = cardCharge(tx);
        const charged  = tx.netAmount ?? tx.amount;
        return (
          <div key={tx.id} style={st.row}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: c.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                {tx.description || tx.subcategoryName || tx.categoryName || "Zakup"}
              </div>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                {dmy(tx.date)}
                {tx.merchant && <> · {tx.merchant}</>}
                {tx.subcategoryName && tx.description && <> · {tx.subcategoryName}</>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              <div style={{ fontWeight: 700, color: c.text }}>{fmt(owed)}</div>
              {owed < charged && (
                <div style={{ fontSize: 11, color: c.successLight }}>po zwrocie z {fmt(charged)}</div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
