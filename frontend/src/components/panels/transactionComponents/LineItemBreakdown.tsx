// ============================================================
// File: src/components/panels/transactionComponents/LineItemBreakdown.tsx
// The receipt lines of a merged transaction, with a way to re-tag some of
// them after the fact. Tags belong to the whole transaction, so picked lines
// are MOVED to the transaction carrying the chosen tags (the backend merges
// into a matching sibling of the same receipt, or creates one).
// Shared by the desktop row and the mobile card.
// ============================================================

import { useState }       from "react";
import { createPortal }   from "react-dom";
import { c }              from "../../../styles/tokens";
import { fmt, fmtAmount } from "../../../utils/helpers";
import { useTransactions } from "../../../hooks/useTransactions";
import { TagMultiSelect } from "../../ui/TagMultiSelect";
import { s }              from "./txStyles";
import type { Transaction } from "../../../types/appContext";

type LineItem = NonNullable<Transaction["lineItems"]>[number];

interface LineItemBreakdownProps {
  tx:        Transaction;
  lineItems: LineItem[];
  onUpdated: (tx: Transaction) => void;
  /** Left padding of the list, so desktop and mobile keep their own indent. */
  indent?:   number;
}

export function LineItemBreakdown({ tx, lineItems, onUpdated, indent = 0 }: LineItemBreakdownProps) {
  const { moveLines, isSaving } = useTransactions();
  const [picked, setPicked]     = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tags, setTags]         = useState<string[]>([]);

  // Returns reference lines by index and vouchers are split per transaction —
  // the backend refuses to move lines of such a tx, so don't offer it.
  const canMove = (tx.returns ?? []).length === 0 && !tx.useVoucher;

  function toggle(i: number) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function openPicker() {
    setTags(tx.tags ?? []);
    setPickerOpen(true);
  }

  async function confirm() {
    const result = await moveLines(tx.id, [...picked].sort((a, b) => a - b), tags);
    if (!result) return;          // error toast already shown
    setPickerOpen(false);
    setPicked(new Set());
    onUpdated(result.source);
  }

  const unchanged = (() => {
    const a = [...(tx.tags ?? [])].sort().join("|");
    return a === [...tags].sort().join("|");
  })();

  return (
    <div style={{ paddingLeft: indent }}>
      {lineItems.map((li, i) => (
        <div
          key={i}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: 12,
            borderBottom: i < lineItems.length - 1 ? `1px solid ${c.surfaceAlt2}` : "none",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: canMove ? "pointer" : "default" }}>
            {canMove && (
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} style={{ flexShrink: 0 }} />
            )}
            <span style={{ color: c.textTertiary }}>{li.description || "—"}</span>
          </label>
          <span style={{ color: c.textBody, fontWeight: 600, marginLeft: 12, flexShrink: 0 }}>
            {li.originalCurrency && li.originalCurrency !== "PLN"
              ? `${fmtAmount(li.originalAmount, li.originalCurrency)} ${li.originalCurrency} (${fmt(li.amount)})`
              : fmt(li.amount)}
          </span>
        </div>
      ))}

      {picked.size > 0 && (
        <div style={{ marginTop: 6 }}>
          <button style={s.actionBtn(c.info)} onClick={openPicker}>
            🏷️ Zmień tagi zaznaczonych ({picked.size})
          </button>
        </div>
      )}

      {pickerOpen && createPortal(
        <div style={s.modal} onClick={() => setPickerOpen(false)}>
          <div style={{ ...s.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>🏷️ Tagi dla {picked.size} pozycji</div>
            <div style={{ color: c.textSecondary, fontSize: 12, marginBottom: 12 }}>
              Zaznaczone pozycje trafią do transakcji z tymi tagami (z tego samego paragonu) —
              istniejącej albo nowej. Kategoria, data i sklep zostają.
            </div>
            <TagMultiSelect value={tags} onChange={setTags} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button style={s.btn("secondary")} onClick={() => setPickerOpen(false)} disabled={isSaving}>Anuluj</button>
              <button style={s.btn()} onClick={confirm} disabled={isSaving || unchanged}>
                {isSaving ? "Zapisuję…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
