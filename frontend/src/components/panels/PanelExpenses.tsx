// ============================================================
// File: src/components/panels/PanelExpenses.tsx
// Add-expense panel with manual form, OCR receipt scan, and cart.
// ============================================================

import { useState, useRef, useCallback, useMemo,useEffect  } from "react";
import type { ChangeEvent } from "react";
import { useAppContext }    from "../../context/AppContext";
import { useAuth }          from "../../context/AuthContext";
import { useTransactions }  from "../../hooks/useTransactions";
import { useToast }         from "../../hooks/useToast";
import { useMonthStatus }   from "../../hooks/useMonthStatus";
import { theme as s }       from "../../styles/theme";
import { fmt }              from "../../utils/helpers";
import { TransactionForm, emptyFormValues} from "./transactionComponents/TransactionForm";
import type { TransactionPayload } from "../../types/transaction";
import { CartPanel } from "./transactionComponents/CartPanel";
import type { CartItem } from "./transactionComponents/CartPanel";
import { computeSuggestedPriority } from "../ui/PriorityPicker";
import { MerchantInput } from "../ui/MerchantInput";
import { translateError } from "../../data/constants/errorMessages";


// ── Cart ID generator ─────────────────────────────────────────

let cartIdCounter = 0;
const newCartId = (): string => `cart_${Date.now()}_${++cartIdCounter}`;

// Guard against the model returning a placeholder instead of null
// ("nieznany", "brak", "", whitespace) — we'd rather store no merchant
// than a junk value polluting the per-shop filter.
const MERCHANT_JUNK = new Set(["nieznany", "nieznany sklep", "brak", "n/a", "-", "unknown"]);
const cleanMerchant = (m?: string | null): string | undefined => {
  const t = (m || "").trim();
  if (!t || MERCHANT_JUNK.has(t.toLowerCase())) return undefined;
  return t;
};

// ── OCR types — mirror of backend /api/ocr/receipt response ──

interface OcrLine {
  description:        string;
  amount:             number;          // final price after discounts (goes to DB)
  grossAmount:        number | null;   // before discounts (informational)
  discountAmount:     number | null;   // merged discount (informational)
  mergeNote:          string | null;   // e.g. "2x 6,99 + rabat -6,99"
  categoryId:         string | null;
  categoryName:       string | null;
  subcategoryId:      string | null;
  subcategoryName:    string | null;
  categoryConfidence: number;
  selected:           boolean;         // client-side only
}

interface OcrMeta {
  merchant:        string | null;
  date:            string | null;     // YYYY-MM-DD from the receipt
  totalSum:        number | null;
  warning:         string | null;
  receiptBlobPath: string | null;
  receiptId:        string | null;    // Receipt entity id (for tx linking)
  isDuplicate:      boolean;          // backend flagged a likely re-scan
  duplicateWarning: string | null;   // separate from `warning` (OCR quality)
}

const OCR_MAX_FILE_BYTES = 5 * 1024 * 1024;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Component ─────────────────────────────────────────────────

export default function PanelExpenses() {
  const { cart, setCart, categories } = useAppContext() as {
    cart:       CartItem[];
    setCart:    (v: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
    categories: Array<{ sub?: Array<{ id: string; priority?: number }> }>;
  };
  const { addTransaction, isSaving, loadTransactions  } = useTransactions() as {
    addTransaction: (p: TransactionPayload) => Promise<unknown>;
    isSaving:       boolean;
    loadTransactions: (month: string) => Promise<void>;

  };
  const { isActiveMonthClosed, activeBudgetMonth, isFutureMonth } = useMonthStatus() as {
    isActiveMonthClosed: boolean;
    activeBudgetMonth:   string;
    isFutureMonth:       boolean;
  };
  const { fetchWithAuth } = useAuth() as {
    fetchWithAuth: (url: string, opts?: RequestInit) => Promise<Response>;
  };
  const { showError, showWarning } = useToast() as {
    showError:   (m: string) => void;
    showWarning: (m: string) => void;
  };
  // Single source: the URL-derived active month
  const budgetMonth = activeBudgetMonth;

  useEffect(() => {
    loadTransactions(budgetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetMonth]);

  const fileRef    = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [ocrLines,        setOcrLines]        = useState<OcrLine[]>([]);
  const [ocrMeta,         setOcrMeta]         = useState<OcrMeta | null>(null);
  const [ocrWarranty,     setOcrWarranty]     = useState(false);  // per-receipt warranty flag
  const [editingMerchant, setEditingMerchant] = useState(false);  // merchant edit mode (decoupled from value)
  const [ocrLoading,      setOcrLoading]      = useState(false);
  const [ocrMode,         setOcrMode]         = useState(false);
  const [formKey,         setFormKey]         = useState(0);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);

  const hasCart = cart.length > 0;

  const resetForm = useCallback(() => {
    setFormKey(k => k + 1);
    setEditingCartItem(null);
  }, []);

  // ── Cart actions ──────────────────────────────────────────

  const handleAddToCart = useCallback((payload: TransactionPayload) => {
    setCart(prev => [...prev, { ...payload, _cartId: newCartId() }]);
    resetForm();
  }, [setCart]);

  const handleSubmitDirect = useCallback(async (payload: TransactionPayload) => {
    const result = await addTransaction(payload);
    if (result) resetForm();
  }, [addTransaction, resetForm]);

  const handleLoadFromCart = useCallback((item: CartItem) => {
    setEditingCartItem(item);
    setFormKey(k => k + 1);
    setOcrMode(false);
  }, [setEditingCartItem]);

  const handleCartItemSave = useCallback(async (payload: TransactionPayload) => {
    if (!editingCartItem) return;

    // For merged items, _allCartIds contains all original cart ids.
    // Remove all of them and insert the edited item at the first position.
    const allIds = editingCartItem._allCartIds || [editingCartItem._cartId];
    const keepId = allIds[0];

    setCart(prev => {
      const insertAt = prev.findIndex(i => allIds.includes(i._cartId));
      const filtered = prev.filter(i => !allIds.includes(i._cartId));
      const newItem: CartItem = {
        ...payload,
        _cartId:       keepId,
        _mergedCount:  1,
        _allCartIds:   [keepId],
        // Preserve OCR provenance — the form returns plain transaction
        // fields and has no knowledge of _ocr* metadata. Editing an
        // item's category/amount doesn't change which receipt it came
        // from, so the receipt link must survive the rebuild.
        _ocrWarranty:    editingCartItem._ocrWarranty,
        // Editing IS the review — once the user touched it, clear the flag.
        _ocrNeedsReview: undefined,
        _ocrReceiptId:   editingCartItem._ocrReceiptId,
        _ocrReceiptPath: editingCartItem._ocrReceiptPath,
        _ocrMerchant:    editingCartItem._ocrMerchant,
        _ocrGross:       editingCartItem._ocrGross,
        _ocrDiscount:    editingCartItem._ocrDiscount,
        _ocrMergeNote:   editingCartItem._ocrMergeNote,
      };
      if (insertAt >= 0) {
        filtered.splice(Math.min(insertAt, filtered.length), 0, newItem);
      } else {
        filtered.push(newItem);
      }
      return filtered;
    });
    resetForm();
  // editingCartItem MUST be in deps — without it the closure captures
  // the initial null value and the save does nothing (stale closure bug)
  }, [editingCartItem, setCart]);

  const handleCartSaveComplete = useCallback(() => {
    setFormKey(k => k + 1);
  }, []);

  // ── OCR ───────────────────────────────────────────────────

  // File → base64 → POST /api/ocr/receipt → ocrLines
  const handleFileSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-picked after an error
    e.target.value = "";
    if (!file) return;

    if (file.size > OCR_MAX_FILE_BYTES) {
      showError(`Zdjęcie jest za duże (${(file.size / 1024 / 1024).toFixed(1)} MB, max 5 MB).`);
      return;
    }

    setOcrLoading(true);
    setOcrLines([]);
    setOcrMeta(null);

    try {
      // Read as data URL (data:image/jpeg;base64,...)
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
        reader.readAsDataURL(file);
      });

      const res = await fetchWithAuth(`${API_URL}/api/ocr/receipt`, {
        method: "POST",
        body:   JSON.stringify({ image: dataUrl }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(translateError(err.error, "Nie udało się przeanalizować paragonu."));
      }

      const data = await res.json();

      if (!data.items?.length) {
        showWarning(data.warning || "Nie znaleziono pozycji na zdjęciu. Spróbuj wyraźniejszego ujęcia.");
        return;
      }

      setOcrLines(data.items.map((it: Omit<OcrLine, "selected">) => ({ ...it, selected: true })));
      setOcrMeta({
        merchant:        data.metadata?.merchant ?? null,
        date:            data.metadata?.date     ?? null,
        totalSum:        data.metadata?.totalSum ?? null,
        warning:         data.warning            ?? null,
        receiptBlobPath: data.receiptBlobPath    ?? null,
        receiptId:        data.receiptId          ?? null,
        isDuplicate:      !!data.isDuplicate,
        duplicateWarning: data.duplicateWarning   ?? null,
      });
      if (data.warning) showWarning(data.warning);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Błąd analizy paragonu.");
    } finally {
      setOcrLoading(false);
    }
  }, [fetchWithAuth, showError, showWarning]);

  // Selected OCR lines → cart items. Items WITHOUT a matched category
  // still go in — the user fixes them via the cart's ✏️ edit flow.
  // Receipt date becomes the item date → cartDate sticky logic picks
  // it up automatically for subsequent manual entries.
  const handleAddOcrLines = useCallback(() => {
    const selected = ocrLines.filter(l => l.selected);
    if (!selected.length) return;

    const itemDate = ocrMeta?.date || new Date().toISOString().slice(0, 10);
    const merchant = ocrMeta?.merchant;

    setCart(prev => [
      ...prev,
      ...selected.map((line): CartItem => ({
        date:             itemDate,
        type:             "EXPENSE",
        budgetMonth,
        subcategoryId:    line.subcategoryId   || "",
        subcategoryName:  line.subcategoryName || "",
        categoryId:       line.categoryId      || "",
        categoryName:     line.categoryName    || "",
        amount:           line.amount,
        originalAmount:   line.amount,
        originalCurrency: "PLN",
        fxRate:           1,
        description:      line.description || (merchant ? `${merchant}` : ""),
        tags:             [],
        priority:         computeSuggestedPriority(line.subcategoryId || "", categories) as 1 | 2 | 3 | 4,
        useVoucher:       false,
        voucherId:        null,
        voucherAmount:    0,
        netAmount:        line.amount,
        isRecurring:      false,
        recurringId:      null,
        _cartId:          newCartId(),
        _ocrGross:        line.grossAmount    ?? undefined,
        _ocrDiscount:     line.discountAmount ?? undefined,
        _ocrMergeNote:    line.mergeNote      ?? undefined,
        _ocrReceiptPath:  ocrMeta?.receiptBlobPath ?? undefined,
        _ocrReceiptId:    ocrMeta?.receiptId       ?? undefined,
        _ocrMerchant:     cleanMerchant(ocrMeta?.merchant),
        _ocrWarranty:     ocrWarranty || undefined,
        // Carry the "needs review" signal into the cart so low-confidence
        // items stay visibly flagged after adding — on a 28-item receipt
        // it's impossible to remember which the AI was unsure about.
        _ocrNeedsReview:  line.categoryConfidence < 0.75 || undefined,
      })),
    ]);

    const missingCat = selected.filter(l => !l.subcategoryId).length;
    if (missingCat > 0) {
      showWarning(`${missingCat} pozycji bez kategorii — uzupełnij je w koszyku (✏️) przed zapisem.`);
    }

    // Reset OCR view — ready for the next receipt
    setOcrLines([]);
    setOcrMeta(null);
    setOcrWarranty(false);
    setEditingMerchant(false);
  }, [ocrLines, ocrMeta, ocrWarranty, budgetMonth, categories, setCart, showWarning]);

  // ── Form initial values ───────────────────────────────────
    // Cart-aware default date — sticky to first cart item's date.
    // Use case: user types receipt items one by one, all sharing the same date.
    // First item sets the date; subsequent items inherit it instead of jumping
    // back to today. When cart empties (save), next entry starts at today again.
    const cartDate = useMemo(() => {
      if (cart.length === 0) return null;
      const first = cart[0];
      if (!first.date) return null;
      // Parse YYYY-MM-DD without timezone shift
      const [y, m, d] = first.date.split("-").map(Number);
      return new Date(y, m - 1, d);
    }, [cart]);

    const formInitialValues = editingCartItem
      ? (() => {
          const [y, m, d] = editingCartItem.date.split("-").map(Number);
          return {
            date:            new Date(y, m - 1, d),
            currency:        editingCartItem.originalCurrency,
            customCurrency:  "",
            amountOrig:      String(editingCartItem.originalAmount),
            subcategoryId:   editingCartItem.subcategoryId,
            subcategoryName: editingCartItem.subcategoryName,
            categoryId:      editingCartItem.categoryId,
            categoryName:    editingCartItem.categoryName,
            categoryType:    null,
            priority:        editingCartItem.priority,
            description:     editingCartItem.description,
            tags:            editingCartItem.tags || [],
            useVoucher:      editingCartItem.useVoucher || false,
            voucherId:       editingCartItem.voucherId  || "",
            voucherAmount:   editingCartItem.voucherAmount ? String(editingCartItem.voucherAmount) : "",
            amountGross:     "",
            discountAmount:  "",
            qty:             1,
            merchant:        editingCartItem._ocrMerchant || "",
          };
        })() 
      : cartDate
      ? { ...emptyFormValues(), date: cartDate }
      : undefined;

  // ── Guards ────────────────────────────────────────────────

  if (isActiveMonthClosed) {
    return (
      <div style={{ ...(s as any).panel, textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ color: "#64748b", fontSize: 15 }}>
          Miesiąc {activeBudgetMonth} jest zamknięty.
        </div>
      </div>
    );
  }

  if (isFutureMonth) {
    return (
      <div style={{ ...(s as any).panel, textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ color: "#64748b", fontSize: 15, marginBottom: 8 }}>
          Ten miesiąc jest zbyt daleko w przyszłości.
        </div>
        <div style={{ color: "#475569", fontSize: 13 }}>
          Użyj planowanych wydatków do zaplanowania przyszłych miesięcy.
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Full-screen blocker while the AI analyzes a receipt. A single
          overlay guards EVERYTHING (mode toggle, cart, form) — clicking
          mid-scan caused state races, and per-button disabling doesn't
          scale. pointer-events are eaten by the fixed layer. */}
      {ocrLoading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(2, 6, 16, 0.7)", backdropFilter: "blur(2px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            border: "3px solid #1e293b", borderTopColor: "#10b981",
            animation: "ocr-spin 0.8s linear infinite",
          }} />
          <div style={{ color: "#10b981", fontWeight: 700, fontSize: 15 }}>
            🤖 Analiza paragonu w toku…
          </div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            To może potrwać kilkanaście sekund
          </div>
        </div>
      )}

      <div className="expenses-layout">

        {/* ════ FORM COLUMN ════ */}
        <div className="expenses-form-col">
          <div style={{ marginBottom: 20, marginTop: 8 }}>
            <div style={(s as any).sectionTitle}>
              {editingCartItem ? "✏️ Edytuj pozycję z koszyka" : "➕ Dodaj wydatek"}
            </div>
          </div>


          {/* Mode toggle: manual / OCR */}
          {!editingCartItem && (
            <div style={{ display: "flex", gap: 8, padding: 6, background: "#0d1424", border: "1px solid #1e293b", borderRadius: 10, marginBottom: 24 }}>
              <button onClick={() => setOcrMode(false)}
                style={{ flex: 1, padding: "9px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: !ocrMode ? "#10b981" : "transparent", color: !ocrMode ? "#fff" : "#64748b" }}>
                ✏️ Ręcznie
              </button>
              <button onClick={() => { setOcrMode(true); setOcrLines([]); }}
                style={{ flex: 1, padding: "9px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: ocrMode ? "#10b981" : "transparent", color: ocrMode ? "#fff" : "#64748b" }}>
                📷 Skan paragonu
              </button>
            </div>
          )}

          {/* ════ OCR MODE ════ */}
          {ocrMode && !editingCartItem && (
            <>
              {ocrLines.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>📷</div>
                  <div style={{ color: "#64748b", marginBottom: 20, fontSize: 14 }}>
                    Zrób zdjęcie paragonu lub wybierz z galerii
                  </div>
                  {/* Camera input — capture forces the camera app on mobile,
                      ignored on desktop (regular file picker opens instead) */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                  />
                  {/* Gallery input — NO capture, so mobile opens the system
                      chooser (gallery + files), desktop the file picker */}
                  <input
                    ref={galleryRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                  />
                  <button onClick={() => fileRef.current?.click()} disabled={ocrLoading}
                    style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: ocrLoading ? "#064e3b" : "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: ocrLoading ? "not-allowed" : "pointer", marginBottom: 8 }}>
                    📷 Zrób zdjęcie
                  </button>
                  <button onClick={() => galleryRef.current?.click()} disabled={ocrLoading}
                    style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: ocrLoading ? "#1e3a8a" : "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: ocrLoading ? "not-allowed" : "pointer" }}>
                    🖼️ Wybierz z galerii
                  </button>

                </div>
              ) : (
                <>
                  {/* Metadata bar: merchant (editable) / date / receipt total */}
                  {ocrMeta && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, gap: 8 }}>
                      {!editingMerchant && ocrMeta.merchant ? (
                        // Known shop — click to correct
                        <span
                          onClick={() => setEditingMerchant(true)}
                          title="Kliknij, by poprawić nazwę sklepu"
                          style={{ color: "#e2e8f0", fontWeight: 600, cursor: "pointer" }}
                        >
                          🏪 {ocrMeta.merchant} <span style={{ color: "#475569", fontSize: 10 }}>✏️</span>
                        </span>
                      ) : (
                        // Editing OR unknown shop — type it with autocomplete.
                        // MerchantInput mounts on editingMerchant (stable flag),
                        // not on the value, so the first letter doesn't drop focus.
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                          <span>🏪</span>
                          <MerchantInput
                            value={ocrMeta.merchant || ""}
                            autoFocus
                            placeholder="Wpisz nazwę sklepu…"
                            onChange={(v: string) => setOcrMeta(m => m && ({ ...m, merchant: v || null }))}
                            onBlur={() => setEditingMerchant(false)}
                            onEnter={() => setEditingMerchant(false)}
                            style={{ flex: 1, minWidth: 0, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "4px 8px", color: "#e2e8f0", fontSize: 12 }}
                          />
                        </span>
                      )}
                      <span style={{ color: "#64748b", flexShrink: 0 }}>{ocrMeta.date || "—"}</span>
                      {ocrMeta.totalSum != null && (
                        <span style={{ color: "#10b981", fontWeight: 700, flexShrink: 0 }}>{fmt(ocrMeta.totalSum)}</span>
                      )}
                    </div>
                  )}

                  {/* Duplicate — its own red banner, independent of OCR quality notes */}
                  {ocrMeta?.duplicateWarning && (
                    <div style={{ background: "#7f1d1d33", border: "1px solid #ef444477", borderRadius: 8, padding: "8px 12px", marginBottom: 12, color: "#fca5a5", fontSize: 12 }}>
                      🔁 {ocrMeta.duplicateWarning}
                    </div>
                  )}

                  {/* OCR quality warning (sum mismatch, unreadable parts, ...) */}
                  {ocrMeta?.warning && (
                    <div style={{ background: "#78350f33", border: "1px solid #f59e0b55", borderRadius: 8, padding: "8px 12px", marginBottom: 12, color: "#fbbf24", fontSize: 12 }}>
                      ⚠️ {ocrMeta.warning}
                    </div>
                  )}

                  <div style={{ color: "#10b981", fontWeight: 700, marginBottom: 12 }}>✅ Znalezione pozycje:</div>
                  {ocrLines.map((line, i) => {
                    const lowConf    = line.categoryConfidence < 0.75;
                    const noCategory = !line.subcategoryId;
                    return (
                      <div key={i} style={{
                        background:   "#0d1424",
                        border:       noCategory ? "1px solid #ef444455" : lowConf ? "1px solid #f59e0b55" : "1px solid #1e293b",
                        borderRadius: 8, padding: "10px 14px", marginBottom: 8,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={line.selected}
                              onChange={e => {
                                const next = [...ocrLines];
                                next[i] = { ...next[i], selected: e.target.checked };
                                setOcrLines(next);
                              }}
                              style={{ width: 18, height: 18, accentColor: "#10b981", marginTop: 2, flexShrink: 0 }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{line.description}</div>
                              <div style={{ color: noCategory ? "#ef4444" : "#64748b", fontSize: 11, marginTop: 2 }}>
                                {noCategory
                                  ? "❓ Brak kategorii — uzupełnisz w koszyku"
                                  : `${line.categoryName} › ${line.subcategoryName}`}
                                {lowConf && !noCategory && <span style={{ color: "#f59e0b" }}> · sprawdź ⚠️</span>}
                              </div>
                              {line.discountAmount != null && line.discountAmount > 0 && (
                                <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 3 }}>
                                  🏷️ rabat −{fmt(line.discountAmount)}
                                  {line.mergeNote && <span style={{ color: "#92710a" }}> · {line.mergeNote}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                            {line.grossAmount != null && line.discountAmount != null && line.discountAmount > 0 && (
                              <div style={{ color: "#64748b", fontSize: 11, textDecoration: "line-through" }}>{fmt(line.grossAmount)}</div>
                            )}
                            <div style={{ color: "#10b981", fontWeight: 700 }}>{fmt(line.amount)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Per-receipt warranty flag → longer blob retention */}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 4, background: ocrWarranty ? "#78350f22" : "#0d1424", border: `1px solid ${ocrWarranty ? "#f59e0b55" : "#1e293b"}`, borderRadius: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={ocrWarranty}
                      onChange={e => setOcrWarranty(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "#f59e0b", flexShrink: 0 }}
                    />
                    <span style={{ color: ocrWarranty ? "#fbbf24" : "#94a3b8", fontSize: 13, fontWeight: 600 }}>
                      🛡️ Paragon gwarancyjny
                    </span>
                    <span style={{ color: "#64748b", fontSize: 11, marginLeft: "auto" }}>
                      dłuższe przechowywanie
                    </span>
                  </label>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #1e293b", marginBottom: 12 }}>
                    <span style={{ color: "#64748b" }}>Suma zaznaczonych:</span>
                    <span style={{ color: "#10b981", fontWeight: 800, fontSize: 18 }}>
                      {fmt(ocrLines.filter(l => l.selected).reduce((sum, l) => sum + l.amount, 0))}
                    </span>
                  </div>
                  <button onClick={handleAddOcrLines}
                    disabled={!ocrLines.some(l => l.selected)}
                    style={{ display: "block", width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8, opacity: ocrLines.some(l => l.selected) ? 1 : 0.5 }}>
                    🛒 Dodaj zaznaczone do koszyka ({ocrLines.filter(l => l.selected).length})
                  </button>
                  <button onClick={() => { setOcrLines([]); setOcrMeta(null); setOcrWarranty(false); setEditingMerchant(false); }}
                    style={{ display: "block", width: "100%", padding: 10, borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    🔄 Skanuj ponownie
                  </button>
                </>
              )}
            </>
          )}

          {/* ════ MANUAL MODE ════ */}
          {(!ocrMode || editingCartItem) && (
            <>
              <TransactionForm
                key={formKey}
                initialValues={formInitialValues}
                budgetMonth={budgetMonth}
                onSubmit={editingCartItem ? handleCartItemSave : handleSubmitDirect}
                onAddToCart={editingCartItem ? undefined : handleAddToCart}
                isSaving={isSaving}
                mode="add"
              />
              {editingCartItem && (
                <button
                  onClick={resetForm}
                  style={{ marginTop: 8, background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12 }}
                >
                  ✕ Anuluj edycję koszyka
                </button>
              )}
            </>
          )}
        </div>

        {/* ════ CART COLUMN ════ */}
        {hasCart && (
          <div className="expenses-cart-col">
            <CartPanel
              onLoadToForm={handleLoadFromCart}
              onSaveComplete={handleCartSaveComplete}
            />
          </div>
        )}
      </div>

      <style>{`
        .expenses-layout   { display: flex; gap: 24px; align-items: flex-start; justify-content: center;}
        .expenses-form-col { flex: 0 0 520px; min-width: 0; }
        .expenses-cart-col { width: 340px; flex-shrink: 0; }
        @keyframes ocr-spin { to { transform: rotate(360deg); } }
        @media (max-width: 700px) {
          .expenses-layout   { flex-direction: column; gap: 0; }
          .expenses-form-col { flex: 1 1 auto; width: 100%; }
          .expenses-cart-col { width: 100%; padding-bottom: 80px; }
        }
      `}</style>
    </>
  );
}