// ============================================================
// File: src/components/layout/NotificationBell.tsx
// Bell dropdown with reminders for recurring and planned expenses.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useRef } from "react";
import { createPortal }          from "react-dom";
import { useRecurring, getActiveCost } from "../../hooks/useRecurring";
import { usePlanned, sumPaid, computeSuggestion, isReadyToPurchase } from "../../hooks/usePlanned";
import { useCurrencyConverter }  from "../../hooks/useCurrencyConverter";

import { ConfirmModal }          from "../ui/ConfirmModal";
import { PaymentConfirmModal }   from "../ui/PaymentConfirmModal";
import { fmt, fmtAmount }        from "../../utils/helpers";
import type { PlannedDoc }       from "../../hooks/usePlanned";
import type { RecurringDoc }     from "../../types/appContext";


// ── Helpers ───────────────────────────────────────────────────

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── RecurringBellItem ─────────────────────────────────────────

interface RecurringBellItemProps {
  doc:       RecurringDoc;
  onConfirm: (doc: RecurringDoc, date: string, amountPLN: number, liveRate: number) => void;
  onDismiss: (doc: RecurringDoc) => void;


}

function RecurringBellItem({ doc, onConfirm, onDismiss }: RecurringBellItemProps) {
  const currentMonth = todayYMD().slice(0, 7);
  const activeCost   = getActiveCost(doc, currentMonth);
  const isForeign    = !!(activeCost?.originalCurrency && activeCost.originalCurrency !== "PLN");

  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState(todayYMD());


  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter() as {
    loadRate:   (currency: string, date: string) => void;
    activeRate: number | null;
    isLoading:  boolean;
  };

  useEffect(() => {
    if (isForeign && activeCost?.originalCurrency) {
      loadRate(activeCost.originalCurrency, todayYMD());
    }
  }, [activeCost?.originalCurrency, isForeign]);

  const liveRate  = activeRate || activeCost?.fxRate || 1;
  const amountPLN = isForeign
    ? Math.round((activeCost?.amount || 0) * liveRate * 100) / 100
    : (activeCost?.amount || 0);

  const amountStr = activeCost
    ? isForeign
      ? `${fmtAmount(activeCost.amount, activeCost.originalCurrency!)} ${activeCost.originalCurrency} ≈ ${rateLoading ? "…" : fmt(amountPLN)} PLN`
      : fmt(activeCost.amount)
    : "—";

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
            onClick={() => setShowModal(true)}
            style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.success, color: c.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            ✅ Potwierdzam
          </button>
          <button
            onClick={() => onDismiss(doc)}
            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textMuted, fontSize: 12, cursor: "pointer" }}
            title="Pomiń"
          >
            ✕
          </button>
        </div>
      </div>

      <PaymentConfirmModal
        isOpen={showModal}
        title="✅ Potwierdź płatność"
        description={doc.description}
        categoryName={doc.categoryName as string}
        suggestedAmount={amountPLN}
        maxAmount={undefined}
        amountLabel="PLN"
        showRecomputeWarning={false}
        onConfirm={(amount: number) => {
          setShowModal(false);
          onConfirm(doc, modalDate, amount, liveRate);
        }}
        onCancel={() => setShowModal(false)}
        extraInfo={
          <div>
            {isForeign && activeCost && (
              <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 8 }}>
                Kurs NBP: <strong style={{ color: c.success }}>{liveRate.toFixed(4)}</strong>
                {" · "}{fmtAmount(activeCost.amount, activeCost.originalCurrency!)} {activeCost.originalCurrency}
              </div>
            )}
            <label style={{ display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6 }}>
              Data transakcji
            </label>
            <input
              type="date"
              value={modalDate}
              onChange={e => setModalDate(e.target.value)}
              style={{ width: "100%", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme: "dark", boxSizing: "border-box" }}
            />
          </div>
        }
      />
    </>
  );
}

// ── PlannedBellItem ───────────────────────────────────────────

interface PlannedBellItemProps {
  doc:         PlannedDoc;
  onPaySaving: (doc: PlannedDoc, month: string, amount: number, dismissed: boolean) => void;
  onPurchase:  (doc: PlannedDoc) => void;
  onDismiss:   (doc: PlannedDoc, month: string) => void;
}

function PlannedBellItem({ doc, onPaySaving, onPurchase, onDismiss }: PlannedBellItemProps) {
  const currentMonth = todayYMD().slice(0, 7);
  const ready        = isReadyToPurchase(doc);
  const paid         = sumPaid(doc.virtualSavings);
  const suggestion   = computeSuggestion(doc, currentMonth);
  const isForeign    = !!(doc.originalCurrency && doc.originalCurrency !== "PLN");

  const [showPayModal, setShowPayModal] = useState(false);

  const { loadRate, activeRate } = useCurrencyConverter() as {
    loadRate:   (currency: string, date: string) => void;
    activeRate: number | null;
    isLoading:  boolean;
  };

  useEffect(() => {
    if (isForeign) loadRate(doc.originalCurrency, todayYMD());
  }, [doc.originalCurrency, isForeign]);

  const liveRate    = activeRate || doc.fxRate || 1;
  const totalPLN    = isForeign
    ? Math.round(doc.totalAmount * liveRate * 100) / 100
    : doc.totalAmountPLN;
  const progressPct = totalPLN > 0 ? Math.min(100, Math.round(paid / totalPLN * 100)) : 0;
  const remaining   = Math.max(0, totalPLN - paid);

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
            <button
              onClick={() => onPurchase(doc)}
              style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.success, color: c.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              🛍️ Kup teraz
            </button>
          ) : doc.mode === "envelope" ? (
            <>
              <button
                onClick={() => setShowPayModal(true)}
                style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.info, color: c.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                💰 Odkładam {suggestion !== null ? fmt(suggestion) : "…"} PLN
              </button>
              <button
                onClick={() => onDismiss(doc, currentMonth)}
                style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textMuted, fontSize: 12, cursor: "pointer" }}
                title="Pomiń ten miesiąc"
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => onPurchase(doc)}
              style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: c.warning, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              💳 Potwierdź zakup
            </button>
          )}
        </div>
      </div>

      <PaymentConfirmModal
        isOpen={showPayModal}
        title="💰 Potwierdź odkładanie"
        description={doc.description}
        categoryName={doc.targetCategoryName}
        suggestedAmount={suggestion ?? 0}
        maxAmount={remaining}
        amountLabel="PLN"
        onConfirm={(amount: number) => {
          setShowPayModal(false);
          onPaySaving(doc, currentMonth, amount, false);
        }}
        onCancel={() => setShowPayModal(false)}
        extraInfo={
          <div style={{ fontSize: 11, color: c.textMuted }}>
            Pozostało: <strong style={{ color: c.text }}>{fmt(remaining)} PLN</strong>
          </div>
        }
      />
    </>
  );
}

// ── Main NotificationBell ─────────────────────────────────────

export function NotificationBell() {
  const {
    pendingNotifications: recurringPending,
    loadAll: loadRecurring,
    confirmRecurring,
    markNotified,
  } = useRecurring();

  const {
    pendingNotifications: plannedPending,
    loadAll: loadPlanned,
    payMonth,
    dismissMonth,
    purchasePlanned,
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

  async function handleConfirmRecurring(doc: RecurringDoc, date: string, amountPLN: number, liveRate: number) {
    await confirmRecurring(doc.id, date, date.slice(0, 7), liveRate, amountPLN);
    setOpen(false);
  }

  async function handleDismiss(doc: RecurringDoc) {
    await markNotified(doc.id);
  }

  async function handlePaySaving(doc: PlannedDoc, month: string, amount: number, dismissed: boolean) {
    if (dismissed) {
      await dismissMonth(doc.id, month);
    } else {
      await payMonth(doc.id, month, amount, amount, 1);
    }
  }

  async function handleDismissPlanned(doc: PlannedDoc, month: string) {
    await dismissMonth(doc.id, month);
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
                onConfirm={handleConfirmRecurring}
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
                onPaySaving={handlePaySaving}
                onPurchase={d => setPurchaseDoc(d)}
                onDismiss={handleDismissPlanned}
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
