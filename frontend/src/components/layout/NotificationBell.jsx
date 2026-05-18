// ============================================================
// File: src/components/layout/NotificationBell.jsx
// ============================================================

import { useState, useEffect, useRef } from "react";
import { createPortal }         from "react-dom";
import { useRecurring, getActiveCost } from "../../hooks/useRecurring";
import { usePlanned, sumPaid, computeSuggestion, isReadyToPurchase } from "../../hooks/usePlanned";
import { useCurrencyConverter } from "../../hooks/useCurrencyConverter";
import { useAppContext }        from "../../context/AppContext";
import { ConfirmModal }         from "../ui/ConfirmModal";
import { PaymentConfirmModal }  from "../ui/PaymentConfirmModal";
import { fmt, fmtAmount }       from "../../utils/helpers";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function plannedDateYMD(doc) {
  const today = new Date();
  const y   = today.getFullYear();
  const m   = today.getMonth() + 1;
  const day = Math.min(doc.plannedDay || 1, new Date(y, m, 0).getDate());
  return `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

// ── Single bell item ──────────────────────────────────────────
function RecurringBellItem({ doc, onConfirm, onDismiss }) {
  const currentMonth = todayYMD().slice(0, 7);
  const activeCost   = getActiveCost(doc, currentMonth);
  const isForeign    = activeCost?.originalCurrency && activeCost.originalCurrency !== "PLN";

  const [showModal, setShowModal] = useState(false);

  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter();

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
      ? `${fmtAmount(activeCost.amount, activeCost.originalCurrency)} ${activeCost.originalCurrency} ≈ ${rateLoading ? "…" : fmt(amountPLN)} PLN`
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
      : `📅 Planowany: ${plannedDay}. tego miesiąca`;

  return (
    <>
      <div style={{ background: "#090e1b", border: "1px solid #f59e0b33", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13, marginBottom: 2 }}>
          {doc.description}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
          {doc.categoryName} · {amountStr}
          {isForeign && !rateLoading && activeRate && (
            <span style={{ color: "#10b98188", marginLeft: 6 }}>(kurs NBP: {liveRate.toFixed(4)})</span>
          )}
        </div>
        <div style={{
          fontSize: 11, marginBottom: 8, fontWeight: isPastDue || isToday ? 700 : 400,
          color: isPastDue ? "#ef4444" : isToday ? "#f97316" : "#64748b",
        }}>
          {dateLabel}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            ✅ Potwierdź wydatek
          </button>
          <button
            onClick={() => onDismiss(doc)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 12, cursor: "pointer" }}
            title="Przypomnij później"
          >
            ✕
          </button>
        </div>
      </div>

      <PaymentConfirmModal
        isOpen={showModal}
        title="✅ Potwierdź wydatek cykliczny"
        description={doc.description || doc.subcategoryName}
        categoryName={doc.categoryName}
        suggestedAmount={amountPLN}
        amountLabel="PLN"
        onConfirm={amount => {
          setShowModal(false);
          onConfirm(doc, amount, liveRate);
        }}
        onCancel={() => setShowModal(false)}
        extraInfo={isForeign && activeCost && (
          <div style={{ fontSize: 11, color: "#64748b" }}>
            Kurs NBP: <strong style={{ color: "#10b981" }}>{liveRate.toFixed(4)}</strong>
            {" · "}{fmtAmount(activeCost.amount, activeCost.originalCurrency)} {activeCost.originalCurrency}
          </div>
        )}
      />
    </>
  );
}

// ── Planned bell item ─────────────────────────────────────────
function PlannedBellItem({ doc, onPaySaving, onPurchase, onDismiss }) {
  const currentMonth = todayYMD().slice(0, 7);
  const ready        = isReadyToPurchase(doc);
  const paid         = sumPaid(doc.virtualSavings);
  const suggestion   = computeSuggestion(doc, currentMonth);
  const isForeign    = doc.originalCurrency && doc.originalCurrency !== "PLN";

  const [showPayModal, setShowPayModal] = useState(false);

  const { loadRate, activeRate, isLoading: rateLoading } = useCurrencyConverter();
  useEffect(() => {
    if (isForeign) loadRate(doc.originalCurrency, todayYMD());
  }, [doc.originalCurrency, isForeign]);

  const liveRate = activeRate || doc.fxRate || 1;
  const totalPLN = isForeign
    ? Math.round(doc.totalAmount * liveRate * 100) / 100
    : doc.totalAmountPLN;

  const progressPct = totalPLN > 0 ? Math.min(100, Math.round(paid / totalPLN * 100)) : 0;
  const todayEntry  = (doc.virtualSavings || []).find(v => v.month === currentMonth);
  const remaining   = Math.max(0, totalPLN - paid);

  return (
    <>
      <div style={{ background: "#090e1b", border: `1px solid ${ready ? "#10b98133" : "#3b82f633"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13, marginBottom: 2 }}>
          {doc.description}
          <span style={{ fontSize: 10, marginLeft: 8, color: doc.mode === "envelope" ? "#3b82f6" : "#f59e0b", fontWeight: 400 }}>
            {doc.mode === "envelope" ? "🪙 Koperta" : "💳 Jednorazowy"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
          {doc.targetCategoryName} ·{" "}
          {isForeign
            ? `${fmtAmount(doc.totalAmount, doc.originalCurrency)} ${doc.originalCurrency} ≈ ${rateLoading ? "…" : fmt(totalPLN)} PLN`
            : fmt(doc.totalAmountPLN)
          }
        </div>

        {doc.mode === "envelope" && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ background: "#1e293b", borderRadius: 3, height: 4, marginBottom: 4 }}>
              <div style={{ width: `${progressPct}%`, height: "100%", background: ready ? "#10b981" : "#3b82f6", borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 10, color: "#475569" }}>
              {fmt(paid)} / {fmt(totalPLN)} PLN ({progressPct}%)
              {!ready && suggestion !== null && (
                <span style={{ color: "#10b981", marginLeft: 8 }}>sugestia: {fmt(suggestion)} PLN</span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          {ready ? (
            <button
              onClick={() => onPurchase(doc)}
              style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              🛍️ Potwierdź zakup
            </button>
          ) : doc.mode === "envelope" && todayEntry ? (
            <>
              <button
                onClick={() => setShowPayModal(true)}
                style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                💰 Odkładam {suggestion !== null ? fmt(suggestion) : "…"} PLN
              </button>
              <button
                onClick={() => onDismiss(doc, currentMonth)}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 12, cursor: "pointer" }}
                title="Pomiń ten miesiąc"
              >
                ✕
              </button>
            </>
          ) : doc.mode === "oneoff" && (
            <button
              onClick={() => onPurchase(doc)}
              style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#f59e0b", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
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
        suggestedAmount={suggestion}
        maxAmount={remaining}
        amountLabel="PLN"
        onConfirm={amount => {
          setShowPayModal(false);
          onPaySaving(doc, currentMonth, amount, false);
        }}
        onCancel={() => setShowPayModal(false)}
        extraInfo={
          <div style={{ fontSize: 11, color: "#475569" }}>
            Pozostało do zebrania: <strong style={{ color: "#e2e8f0" }}>{fmt(remaining)} PLN</strong>
          </div>
        }
      />
    </>
  );
}

// ── Main bell ─────────────────────────────────────────────────
export function NotificationBell() {
  const { pendingNotifications: recurringPending, loadAll: loadRecurring, confirmRecurring, markNotified } = useRecurring();
  const { pendingNotifications: plannedPending,   loadAll: loadPlanned,   paySavingMonth, purchasePlanned } = usePlanned();
  const { setPanel } = useAppContext();

  const [open,          setOpen]          = useState(false);
  const [confirmItem,   setConfirmItem]   = useState(null);
  const [liveAmountPLN, setLiveAmountPLN] = useState(null);
  const [liveRate,      setLiveRate]      = useState(null);
  const [purchaseDoc,   setPurchaseDoc]   = useState(null);
  const dropRef = useRef(null);

  useEffect(() => { loadRecurring(); loadPlanned(); }, []);

  useEffect(() => {
    function handleClick(e) {
      // Don't close bell when clicking inside a portal modal
      if (e.target.closest('[data-modal="true"]')) return;
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = recurringPending.length + plannedPending.length;

  function handleConfirmClick(doc, amountPLN, rate) {
    setConfirmItem(doc);
    setLiveAmountPLN(amountPLN);
    setLiveRate(rate);
  }

  async function handleConfirm() {
    if (!confirmItem) return;
    const planned     = plannedDateYMD(confirmItem);
    const budgetMonth = todayYMD().slice(0, 7);
    await confirmRecurring(confirmItem.id, planned, budgetMonth, liveRate);
    setConfirmItem(null);
    setOpen(false);
  }

  async function handleDismiss(doc) {
    await markNotified(doc.id);
  }

  async function handleDismissPlanned(doc, month) {
    await paySavingMonth(doc.id, month, { dismissed: true });
  }

  async function handlePaySaving(doc, month, amount, dismissed) {
    if (dismissed) {
      await paySavingMonth(doc.id, month, { dismissed: true });
    } else {
      await paySavingMonth(doc.id, month, { amount, amountPLN: amount, fxRate: 1, dismissed: false });
    }
  }

  async function handlePurchasePlanned() {
    if (!purchaseDoc) return;
    const today       = todayYMD();
    const budgetMonth = today.slice(0, 7);
    await purchasePlanned(purchaseDoc.id, today, budgetMonth);
    setPurchaseDoc(null);
    setOpen(false);
  }

  const currentMonth  = todayYMD().slice(0, 7);
  const confirmCost   = confirmItem ? getActiveCost(confirmItem, currentMonth) : null;
  const isForeign     = confirmCost?.originalCurrency && confirmCost.originalCurrency !== "PLN";
  const confirmAmountStr = confirmItem
    ? isForeign
      ? `${fmt(confirmCost.amount)} ${confirmCost.originalCurrency} ≈ ${fmt(liveAmountPLN)} PLN (kurs NBP: ${liveRate?.toFixed(4)})`
      : `${fmt(confirmCost?.amount)} PLN`
    : "";

  return (
    <>
      <div style={{ position: "relative" }} ref={dropRef}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            position: "relative", background: "transparent",
            border: `1px solid ${count > 0 ? "#f59e0b44" : "#1e293b"}`,
            borderRadius: 10, padding: "7px 10px", cursor: "pointer",
            color: count > 0 ? "#f59e0b" : "#475569", fontSize: 18, lineHeight: 1,
          }}
          title={count > 0 ? `${count} przypomnienie${count > 1 ? "ń" : ""}` : "Brak przypomnień"}
        >
          🔔
          {count > 0 && (
            <span style={{ position: "absolute", top: -6, right: -6, background: "#f59e0b", color: "#000", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {count}
            </span>
          )}
        </button>

        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#0d1424", border: "1px solid #1e293b", borderRadius: 12, padding: 8, minWidth: 320, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 1000 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", padding: "4px 8px 10px" }}>
              🔔 Przypomnienia
            </div>

            {count === 0 && (
              <div style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                Brak aktywnych przypomnień
              </div>
            )}

            {recurringPending.map(doc => (
              <RecurringBellItem
                key={doc.id}
                doc={doc}
                onConfirm={handleConfirmClick}
                onDismiss={handleDismiss}
              />
            ))}

            {plannedPending.length > 0 && (
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", padding: "6px 4px 4px" }}>
                📅 Planowane
              </div>
            )}

            {plannedPending.map(doc => (
              <PlannedBellItem
                key={doc.id}
                doc={doc}
                onPaySaving={handlePaySaving}
                onPurchase={d => setPurchaseDoc(d)}
                onDismiss={handleDismissPlanned}
              />
            ))}

            <div style={{ textAlign: "center", paddingTop: 6 }}>
              <button
                onClick={() => { setOpen(false); setPanel("recurring"); }}
                style={{ background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
              >
                Zarządzaj cyklicznymi →
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmItem && createPortal(
        <ConfirmModal
          isOpen={!!confirmItem}
          title="Potwierdź wydatek cykliczny"
          message={
            `Czy potwierdzasz wydatek:\n` +
            `${confirmItem.description} — ${confirmAmountStr}?\n\n` +
            `Data transakcji: ${plannedDateYMD(confirmItem)}.`
          }
          onConfirm={handleConfirm}
          onCancel={() => setConfirmItem(null)}
        />,
        document.body
      )}
      {purchaseDoc && createPortal(
        <ConfirmModal
          isOpen={!!purchaseDoc}
          title="🛍️ Potwierdź zakup"
          message={
            `Czy potwierdzasz zakup:\n${purchaseDoc.description} — ${fmt(purchaseDoc.totalAmountPLN)} PLN?\n\n` +
            `Zebrano: ${fmt(sumPaid(purchaseDoc.virtualSavings))} PLN\n\n` +
            `Zostaną utworzone:\n• Wydatek → ${purchaseDoc.targetCategoryName}\n• Transfer → Środki własne`
          }
          onConfirm={handlePurchasePlanned}
          onCancel={() => setPurchaseDoc(null)}
        />,
        document.body
      )}
    </>
  );
}