// ============================================================
// File: src/components/layout/NotificationBell.tsx
// Bell dropdown with reminders for recurring and planned expenses.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useRef } from "react";
import { createPortal }          from "react-dom";
import { useRecurring }          from "../../hooks/useRecurring";
import { usePlanned, sumPaid }   from "../../hooks/usePlanned";
import { useRecurringConfirm }   from "../../hooks/useRecurringConfirm";
import { useEnvelopePay }        from "../../hooks/useEnvelopePay";

import { ConfirmModal }          from "../ui/ConfirmModal";
import { fmt, todayYMD }         from "../../utils/helpers";
import type { PlannedDoc }       from "../../hooks/usePlanned";
import type { RecurringDoc }     from "../../types/appContext";


// ── DismissButton ─────────────────────────────────────────────
// The ✕ used across bell items to dismiss a reminder.

function DismissButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textMuted, fontSize: 12, cursor: "pointer" }}
    >
      ✕
    </button>
  );
}

// ── RecurringBellItem ─────────────────────────────────────────

interface RecurringBellItemProps {
  doc:       RecurringDoc;
  onClose:   () => void;
  onDismiss: (doc: RecurringDoc) => void;
}

function RecurringBellItem({ doc, onClose, onDismiss }: RecurringBellItemProps) {
  const currentMonth = todayYMD().slice(0, 7);
  const { open, modal, amountStr } = useRecurringConfirm(doc, currentMonth, { onDone: onClose });

  const todayDay   = new Date().getDate();
  const lastDay    = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const plannedDay = Math.min(doc.plannedDay || 1, lastDay);
  const isPastDue  = todayDay > plannedDay;
  const isToday    = todayDay === plannedDay;

  const dateLabel = isPastDue
    ? `⚠️ Termin minął ${plannedDay}. tego miesiąca`
    : isToday
      ? `🔴 Dziś (${plannedDay}.)`
      : `📅 Planowany: ${plannedDay}.`;

  return (
    <>
      <div style={{ background: c.bgDeepest, border: `1px solid ${isPastDue ? alpha(c.danger, "33") : c.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: c.text, fontSize: 13, marginBottom: 2 }}>
          {doc.description}
        </div>
        <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 6 }}>
          {doc.categoryName} · {amountStr}
          <span style={{ marginLeft: 8, color: isPastDue ? c.danger : isToday ? c.warning : c.textMuted }}>
            {dateLabel}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={open}
            style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.success, color: c.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            ✅ Potwierdzam
          </button>
          <DismissButton onClick={() => onDismiss(doc)} title="Pomiń" />
        </div>
      </div>

      {modal}
    </>
  );
}

// ── PlannedBellItem ───────────────────────────────────────────

interface PlannedBellItemProps {
  doc:             PlannedDoc;
  onPurchase:      (doc: PlannedDoc) => void;
  onDismissNotify: (doc: PlannedDoc) => void;
}

function PlannedBellItem({ doc, onPurchase, onDismissNotify }: PlannedBellItemProps) {
  const { open, modal, suggestion, paid, totalPLN, progressPct, ready } = useEnvelopePay(doc);

  return (
    <>
      <div style={{ background: c.bgDeepest, border: `1px solid ${ready ? alpha(c.success, "33") : alpha(c.info, "33")}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: c.text, fontSize: 13, marginBottom: 2 }}>
          {doc.description}
          <span style={{ fontSize: 10, marginLeft: 8, color: doc.mode === "envelope" ? c.info : c.warning, fontWeight: 400 }}>
            {doc.mode === "envelope" ? "Koperta" : "Jednorazowy"}
          </span>
        </div>

        {doc.mode === "envelope" && (
          <>
            <div style={{ height: 4, background: c.border, borderRadius: 99, overflow: "hidden", margin: "6px 0" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: ready ? c.success : c.info, borderRadius: 99 }} />
            </div>
            <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 6 }}>
              {fmt(paid)} / {fmt(totalPLN)} PLN · {progressPct}%
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          {ready ? (
            <>
              <button
                onClick={() => onPurchase(doc)}
                style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.success, color: c.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                🛍️ Kup teraz
              </button>
              <DismissButton onClick={() => onDismissNotify(doc)} title="Pomiń przypomnienie" />
            </>
          ) : doc.mode === "envelope" ? (
            <>
              <button
                onClick={open}
                style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.info, color: c.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                💰 Odkładam {suggestion !== null ? fmt(suggestion) : "…"} PLN
              </button>
              <DismissButton onClick={() => onDismissNotify(doc)} title="Pomiń przypomnienie" />
            </>
          ) : (
            <>
              <button
                onClick={() => onPurchase(doc)}
                style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.warning, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                💳 Potwierdź zakup
              </button>
              <DismissButton onClick={() => onDismissNotify(doc)} title="Pomiń przypomnienie" />
            </>
          )}
        </div>
      </div>

      {doc.mode === "envelope" && modal}
    </>
  );
}

// ── Main NotificationBell ─────────────────────────────────────

export function NotificationBell() {
  const {
    pendingNotifications: recurringPending,
    loadAll: loadRecurring,
    markNotified,
  } = useRecurring();

  const {
    pendingNotifications: plannedPending,
    loadAll: loadPlanned,
    purchasePlanned,
    markNotified: markPlannedNotified,
  } = usePlanned();

  const [open,        setOpen]        = useState(false);
  const [purchaseDoc, setPurchaseDoc] = useState<PlannedDoc | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadRecurring(); loadPlanned(); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('[data-modal="true"]')) return;
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Guard: ensure arrays are defined (may be undefined before AppContext hydrates)
  const safeRecurring = recurringPending || [];
  const safePlanned   = plannedPending   || [];
  const count         = safeRecurring.length + safePlanned.length;

  // ── Handlers ────────────────────────────────────────────────

  async function handleDismiss(doc: RecurringDoc) {
    await markNotified(doc.id);
  }

  async function handleDismissNotifyPlanned(doc: PlannedDoc) {
    await markPlannedNotified(doc.id);
  }

  async function handlePurchasePlanned() {
    if (!purchaseDoc) return;
    const today = todayYMD();
    await purchasePlanned(purchaseDoc.id, today, today.slice(0, 7));
    setPurchaseDoc(null);
    setOpen(false);
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <>
      <div style={{ position: "relative" }} ref={dropRef}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            position: "relative", background: "transparent",
            border: `1px solid ${count > 0 ? alpha(c.warning, "44") : c.border}`,
            borderRadius: 10, padding: "7px 10px", cursor: "pointer",
            color: count > 0 ? c.warning : c.textMuted, fontSize: 18, lineHeight: 1,
          }}
          title={count > 0 ? `${count} przypomnienie${count > 1 ? "ń" : ""}` : "Brak przypomnień"}
        >
          🔔
          {count > 0 && (
            <span style={{ position: "absolute", top: -6, right: -6, background: c.warning, color: "#000", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {count}
            </span>
          )}
        </button>

        {open && (
              <div style={{
                position: "fixed",
                top: 64,
                right: 12,
                left: "auto",
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                padding: 8,
                width: "min(360px, calc(100vw - 24px))",
                maxHeight: "calc(100vh - 100px)",
                overflowY: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                zIndex: 1000,
            }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", padding: "4px 8px 10px" }}>
              🔔 Przypomnienia
            </div>

            {count === 0 && (
              <div style={{ color: c.borderStrong, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                Brak aktywnych przypomnień
              </div>
            )}

            {safeRecurring.map(doc => (
              <RecurringBellItem
                key={doc.id}
                doc={doc}
                onClose={() => setOpen(false)}
                onDismiss={handleDismiss}
              />
            ))}

            {safePlanned.length > 0 && (
              <div style={{ fontSize: 10, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", padding: "6px 4px 4px" }}>
                📅 Planowane
              </div>
            )}

            {safePlanned.map(doc => (
              <PlannedBellItem
                key={doc.id}
                doc={doc}
                onPurchase={d => setPurchaseDoc(d)}
                onDismissNotify={handleDismissNotifyPlanned}
              />
            ))}
          </div>
        )}
      </div>

      {purchaseDoc && createPortal(
        <ConfirmModal
          isOpen={!!purchaseDoc}
          title="🛍️ Potwierdź zakup"
          message={
            `Czy potwierdzasz zakup:\n` +
            `${purchaseDoc.description} — ${fmt(purchaseDoc.totalAmountPLN)} PLN?\n\n` +
            `Zebrano: ${fmt(sumPaid(purchaseDoc.virtualSavings))} PLN`
          }
          onConfirm={handlePurchasePlanned}
          onCancel={() => setPurchaseDoc(null)}
        />,
        document.body
      )}
    </>
  );
}
