// ============================================================
// File: src/components/panels/shoppingComponents/ShoppingRow.tsx
// One line of the shopping list.
//
// The leading control is a REAL checkbox: empty while the item is still
// to buy, filled once it is bought. It used to render a ✓ inside the box
// in both states, which reads as "this is already done" rather than "tap
// to mark done" — the first thing anyone misread about this panel.
// Ticking and un-ticking are the same control, so undo needs no separate
// button.
//
// The other two outcomes are deliberately distinct from each other:
//   🚫 nie było — stays on the list, flagged: the shop was out, we
//                 still want it
//   🗑️ usuń     — we changed our mind; gone for good
//
// TWO STOREYS ON A PHONE. Every control stays visible — quantity, "nie
// było", delete, and the two editors — but on a phone they sit in their
// own labelled bar UNDER the item instead of beside its name. Beside the
// name they left it about sixty pixels, into which the note and the
// prices were wrapped a word per line or spilled under the buttons. The
// row is taller for it; everything in it is readable. A desktop has the
// width, so there the buttons stay on the item's line.
//
// Two editors, each behind its own button, because they are used at
// different moments: ✎ (note and aisle) when writing the list, 💰 (a
// price seen on a shelf) standing in front of that shelf. They used to
// share one form with two save buttons, and the price part hid behind a
// tap on the aisle chip, where nobody looks for a price.
//
// A PHOTO is added from the ✎ editor (it belongs to writing the list —
// "kup ten olej" typed at home) and shown via "📷 zobacz zdjęcie" in the
// same viewer as a receipt (ui/StoredFileModal).
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, ChangeEvent } from "react";
import { theme as s } from "../../../styles/theme";
import { SHOPPING_SECTIONS, SECTION_IDS, sectionMeta } from "../../../data/constants/shoppingSections";
import { UNIT_ENTRY_OPTIONS } from "../../../data/constants/productUnits";
import { parseSizeInput, computeUnitPrice, unitPriceLabel } from "../../../utils/productPricing";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { PriceChip, PricePanel } from "./PriceHint";
import { MerchantInput } from "../../ui/MerchantInput";
import { StoredFileModal } from "../../ui/StoredFileModal";
import type { ShoppingItem, CatalogEntry, SeenPriceInput } from "../../../hooks/useShoppingList";

interface ShoppingRowProps {
  item:      ShoppingItem;
  onBought:  (id: string) => void;
  onMissed:  (id: string) => void;
  onReopen:  (id: string) => void;
  onRemove:  (id: string) => void;
  onQty:     (id: string, qty: number) => void;
  onDetails: (id: string, details: { note: string; section: string }) => void;
  /** What this product usually costs — absent until a scanned receipt
   *  has been matched to it. */
  catalogEntry?: CatalogEntry;
  onForgetPrice: (key: string, observationId: string) => void;
  /** Note a price seen on a shelf without buying it — kept on the item,
   *  so it expires along with it. */
  onSeenPrice:       (id: string, input: SeenPriceInput) => void;
  onForgetSeenPrice: (id: string, observationId: string) => void;
  /** Attach / replace the product photo; resolves once it is stored. */
  onPhoto:       (id: string, file: File) => Promise<boolean>;
  onRemovePhoto: (id: string) => void;
  /** False when the list shows no aisle headings (everything is in one
   *  aisle) — the row then names its aisle itself. With headings the
   *  name would only repeat the one right above it. */
  sectionsShown?: boolean;
}

// The units a shelf label is written in; each maps to the base unit the
// receipts use (g / ml / szt), so both kinds of price compare directly.
const SIZE_UNITS = ["g", "kg", "ml", "l", "szt"] as const;
type SizeEntry = typeof SIZE_UNITS[number];

// Walking one shop, you note several prices in a row, and retyping the
// shop each time is the whole cost of the form. Remembered for the tab's
// session only: tomorrow's trip is likely a different shop.
const LAST_SHOP_KEY = "shopping.lastSeenShop";
function readLastShop(): string {
  try { return sessionStorage.getItem(LAST_SHOP_KEY) ?? ""; } catch { return ""; }
}
function writeLastShop(shop: string) {
  try { sessionStorage.setItem(LAST_SHOP_KEY, shop); } catch { /* private mode — fine */ }
}

const money = (n: number) => n.toFixed(2).replace(".", ",");

const iconBtn = (color: string, active = false): CSSProperties => ({
  background: active ? alpha(color, "22") : "transparent",
  border: `1px solid ${active ? color : alpha(color, "55")}`,
  color,
  borderRadius: 8,
  // 40px keeps every control a comfortable thumb target — this list is
  // worked one-handed while pushing a trolley.
  minWidth: 40, height: 40,
  fontSize: 15, cursor: "pointer", flexShrink: 0,
});

// A phone's bar button: icon over a word, so nothing has to be guessed.
const barBtn = (color: string, active = false): CSSProperties => ({
  ...iconBtn(color, active),
  flex: 1, minWidth: 0, height: 44, padding: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 1, lineHeight: 1.1,
});

function BarLabel({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 3 }}>{children}</div>;
}

export function ShoppingRow({
  item, onBought, onMissed, onReopen, onRemove, onQty, onDetails,
  catalogEntry, onForgetPrice, onSeenPrice, onForgetSeenPrice,
  onPhoto, onRemovePhoto,
  sectionsShown = false,
}: ShoppingRowProps) {
  const isMobile = useIsMobile();
  const resolved = item.status !== "open";
  const missed   = !resolved && !!item.missedAt;
  // Ticked means BOUGHT specifically. A skipped item is settled too, but
  // showing it with a tick would claim we bought something we gave up on.
  const checked  = item.status === "bought";

  // Which editor is open under the row, if any.
  const [panel, setPanel] = useState<null | "details" | "price">(null);

  const [draftNote,    setDraftNote]    = useState(item.note ?? "");
  const [draftSection, setDraftSection] = useState(item.section ?? "inne");

  const [draftPrice,     setDraftPrice]     = useState("");
  const [draftSize,      setDraftSize]      = useState("");
  const [draftSizeUnit,  setDraftSizeUnit]  = useState<SizeEntry>("g");
  const [draftShop,      setDraftShop]      = useState("");
  const [shopRemembered, setShopRemembered] = useState(false);
  const [draftPriceNote, setDraftPriceNote] = useState("");
  const [priceNoteOpen,  setPriceNoteOpen]  = useState(false);

  // The breakdown lives BELOW the row, at full width — it is a table.
  const [pricesOpen, setPricesOpen] = useState(false);

  const [photoOpen,      setPhotoOpen]      = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const hasPhoto = !!item.photoBlobPath;

  async function handlePhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";               // so the same file can be re-picked after an error
    if (!file) return;
    setPhotoUploading(true);
    await onPhoto(item.id, file);
    setPhotoUploading(false);
  }

  // iOS zooms into any field whose text is under 16px and never zooms
  // back out — on a phone that is the page lurching sideways mid-aisle.
  const fieldFont = isMobile ? 16 : 13;
  const field: CSSProperties = { ...s.input, fontSize: fieldFont, padding: "8px 10px", height: 40 };

  // Tapping the name (or ✎) toggles: the same gesture that opened the
  // editor closes it, so getting out does not mean hunting for "Anuluj".
  function toggleDetails() {
    if (resolved) return;            // nothing to adjust on a settled item
    if (panel === "details") { setPanel(null); return; }
    setDraftNote(item.note ?? "");
    setDraftSection(item.section ?? "inne");
    setPanel("details");
  }

  function togglePrice() {
    if (panel === "price") { setPanel(null); return; }
    if (!draftShop) {
      const last = readLastShop();
      setDraftShop(last);
      setShopRemembered(!!last);
    }
    setPanel("price");
  }

  function save() {
    onDetails(item.id, { note: draftNote.trim(), section: draftSection });
    setPanel(null);
  }

  const priceValue = Number(draftPrice.replace(",", "."));
  const priceOk    = Number.isFinite(priceValue) && priceValue > 0;
  const shop       = draftShop.trim();

  const sizeEntry = UNIT_ENTRY_OPTIONS[draftSizeUnit];
  const sizeTyped = parseSizeInput(draftSize);
  const sizeBase  = sizeTyped ? Math.round(sizeTyped * sizeEntry.factor) : null;
  const baseUnit  = sizeEntry.base as "g" | "ml" | "szt";
  // Shown while typing: the comparable price is the reason to type a
  // size at all, so it should not wait until the price is saved.
  const livePerUnit = priceOk && sizeBase ? computeUnitPrice(priceValue, sizeBase, baseUnit) : null;

  const canNotePrice = priceOk && shop.length > 0;
  const missing = !priceOk ? "Wpisz cenę" : !shop ? "Podaj sklep" : null;

  function noteSeenPrice() {
    if (!canNotePrice) return;
    onSeenPrice(item.id, {
      amount: priceValue,
      shop,
      note: draftPriceNote.trim() || undefined,
      ...(sizeBase ? { size: sizeBase, sizeUnit: baseUnit } : {}),
    });
    writeLastShop(shop);
    setDraftPrice("");
    setDraftSize("");
    setDraftShop("");
    setDraftPriceNote("");
    setPriceNoteOpen(false);
    // Noting a price finishes the job you opened this for — standing in
    // front of a shelf, one price, done. The toast confirms it landed.
    setPanel(null);
  }

  const hasPrices = !!catalogEntry?.price || (item.seen?.length ?? 0) > 0;
  const showSectionChip = !resolved && !sectionsShown;

  // ── Controls: the same set on both layouts, arranged differently ──

  const qtyMinus = () => onQty(item.id, Math.max(1, item.qty - 1));
  const qtyPlus  = () => onQty(item.id, Math.min(999, item.qty + 1));

  const desktopControls = !resolved && (
    <>
      {/* Quantity lives here rather than in an edit modal: "weź dwa" is
          the most common correction made while shopping. */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button type="button" onClick={qtyMinus} disabled={item.qty <= 1} title="Mniej"
          style={{ ...iconBtn(c.textSecondary), minWidth: 32, opacity: item.qty <= 1 ? 0.35 : 1 }}>−</button>
        <button type="button" onClick={qtyPlus} title="Więcej"
          style={{ ...iconBtn(c.textSecondary), minWidth: 32 }}>+</button>
      </div>
      <button type="button" onClick={() => onMissed(item.id)} title="Nie było w sklepie" style={iconBtn(c.warning)}>🚫</button>
      <button type="button" onClick={() => onRemove(item.id)} title="Usuń z listy" style={iconBtn(c.danger)}>🗑️</button>
      <button type="button" onClick={togglePrice} title="Zanotuj cenę z półki"
        aria-expanded={panel === "price"} style={iconBtn(c.infoLight, panel === "price")}>💰</button>
      <button type="button" onClick={toggleDetails} title="Komentarz i sekcja"
        aria-expanded={panel === "details"} style={iconBtn(c.textTertiary, panel === "details")}>✎</button>
    </>
  );

  const mobileBar = !resolved && (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <div style={{
        flex: 1.5, minWidth: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between",
        border: `1px solid ${alpha(c.textSecondary, "55")}`, borderRadius: 8,
      }}>
        <button type="button" onClick={qtyMinus} disabled={item.qty <= 1} aria-label="Mniej"
          style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 18, width: 36, height: 42, cursor: "pointer", opacity: item.qty <= 1 ? 0.35 : 1 }}>−</button>
        <span style={{ color: c.text, fontWeight: 700, fontSize: 14 }}>{item.qty}</span>
        <button type="button" onClick={qtyPlus} aria-label="Więcej"
          style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 18, width: 36, height: 42, cursor: "pointer" }}>+</button>
      </div>
      <button type="button" onClick={() => onMissed(item.id)} style={barBtn(c.warningLight)}>
        🚫<BarLabel>nie było</BarLabel>
      </button>
      <button type="button" onClick={() => onRemove(item.id)} style={barBtn(c.dangerLight)}>
        🗑️<BarLabel>usuń</BarLabel>
      </button>
      <button type="button" onClick={togglePrice} aria-expanded={panel === "price"} style={barBtn(c.infoLight, panel === "price")}>
        💰<BarLabel>cena</BarLabel>
      </button>
      <button type="button" onClick={toggleDetails} aria-expanded={panel === "details"} style={barBtn(c.textTertiary, panel === "details")}>
        ✎<BarLabel>opis</BarLabel>
      </button>
    </div>
  );

  const flags = (
    <>
      {showSectionChip && (
        // No onClick of its own: it sits inside the name block, whose tap
        // already opens the editor — a second handler would toggle twice.
        <span
          title="Zmień sekcję lub dopisz komentarz"
          style={{
            color: c.textTertiary, background: c.raised,
            border: `1px dashed ${c.borderStrong}`, borderRadius: 20,
            padding: "2px 9px", fontWeight: 600, whiteSpace: "nowrap",
          }}
        >
          {sectionMeta(item.section).icon} {sectionMeta(item.section).label} ✎
        </span>
      )}
      {missed && (
        <span style={{ color: c.warningLight, fontWeight: 600 }}>
          🚫 nie było{item.missedCount > 1 ? ` (${item.missedCount}×)` : ""}
        </span>
      )}
      {item.status === "bought" && item.resolvedBy && <span>kupił(a): {item.resolvedBy}</span>}
      {item.status === "skipped" && <span>odpuszczone</span>}
    </>
  );
  const hasFlags = showSectionChip || missed || (item.status === "bought" && !!item.resolvedBy) || item.status === "skipped";

  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${missed ? alpha(c.warning, "55") : c.border}`,
      borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => (resolved ? onReopen(item.id) : onBought(item.id))}
          title={resolved ? "Cofnij — wróć na listę" : "Odhacz jako kupione"}
          style={{
            ...iconBtn(checked ? c.success : c.borderStrong),
            // Filled only once it IS bought; an empty box is what makes
            // "still to buy" readable at a glance.
            background: checked ? c.success : "transparent",
            color:      checked ? c.white : "transparent",
            borderWidth: 2,
            fontSize: 18, lineHeight: 1,
          }}
        >
          ✓
        </button>

        <div
          style={{ flex: 1, minWidth: 0, cursor: resolved ? "default" : "pointer" }}
          onClick={toggleDetails}
          title={resolved ? undefined : "Komentarz i sekcja"}
        >
          <div style={{
            fontSize: isMobile ? 15 : 14, fontWeight: 600,
            color: resolved ? c.textMuted : c.text,
            textDecoration: item.status === "bought" ? "line-through" : "none",
          }}>
            {item.name}
            {item.qty > 1 && (
              <span style={{ color: c.textTertiary, fontWeight: 700 }}>
                {" "}×{item.qty}{item.unit ? ` ${item.unit}` : ""}
              </span>
            )}
          </div>

          {/* The note is the loudest thing here on purpose: "bez soli, to
              dla córki" is the whole reason the item was written down that
              way, and it has to survive a glance in a shop. In full, on a
              line of its own. */}
          {item.note && (
            <div style={{ fontSize: 12, color: c.infoLight, fontWeight: 600, marginTop: 3, lineHeight: 1.4, overflowWrap: "anywhere" }}>
              📝 {item.note}
            </div>
          )}

          {/* The photo says what the note cannot — "ten olej" — so it gets
              a line of its own, right under the note. Opens the same viewer
              as a receipt. Its own tap, not the name block's editor. */}
          {hasPhoto && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setPhotoOpen(true); }}
              style={{
                marginTop: 5, background: alpha(c.info, "18"), border: `1px solid ${alpha(c.info, "55")}`,
                color: c.infoLight, borderRadius: 20, padding: "3px 10px",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              📷 zobacz zdjęcie
            </button>
          )}

          {hasFlags && (
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {flags}
            </div>
          )}
        </div>

        {/* A resolved row keeps only its checkbox — un-ticking is the undo,
            and quantity/"nie było" mean nothing for something already
            settled. */}
        {!isMobile && desktopControls}
      </div>

      {hasPrices && (
        // Lined up with the name on a desktop; full width on a phone,
        // where every pixel of it is needed.
        <div style={{ marginLeft: isMobile ? 0 : 50 }}>
          <PriceChip
            price={catalogEntry?.price}
            observations={catalogEntry?.prices ?? []}
            seen={item.seen ?? []}
            open={pricesOpen}
            onToggle={() => setPricesOpen(o => !o)}
          />
        </div>
      )}

      {pricesOpen && (
        <PricePanel
          price={catalogEntry?.price}
          observations={catalogEntry?.prices ?? []}
          onForget={id => catalogEntry && onForgetPrice(catalogEntry.key, id)}
          seen={item.seen ?? []}
          onForgetSeen={id => onForgetSeenPrice(item.id, id)}
        />
      )}

      {isMobile && mobileBar}

      {panel === "details" && !resolved && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
          <input
            autoFocus
            value={draftNote}
            onChange={e => setDraftNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setPanel(null); }}
            placeholder="Komentarz, np. bez soli — dla córki"
            maxLength={300}
            style={{ ...field, flex: "2 1 220px" }}
          />
          <select
            value={draftSection}
            onChange={e => setDraftSection(e.target.value)}
            title="Sekcja sklepu"
            style={{ ...field, flex: "1 1 150px", cursor: "pointer" }}
          >
            {SECTION_IDS.map(id => (
              <option key={id} value={id}>
                {SHOPPING_SECTIONS[id].icon} {SHOPPING_SECTIONS[id].label}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
            <button type="button" onClick={save} style={{ ...s.btnSm(c.success), height: 40, flex: 1 }}>
              Zapisz
            </button>
            <button type="button" onClick={() => setPanel(null)} style={{ ...s.btnSm(c.textSecondary), height: 40, flex: 1 }}>
              Anuluj
            </button>
          </div>

          {/* The photo saves on its own, the moment it is picked — it is
              not part of the note/aisle draft above. No `capture`: phones
              then offer camera AND gallery in one chooser. */}
          <div style={{ display: "flex", gap: 8, flex: "1 1 100%", alignItems: "center" }}>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoPicked}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              style={{ ...s.btnSm(c.info), height: 40, flex: isMobile ? 1 : "0 0 auto", opacity: photoUploading ? 0.5 : 1 }}
            >
              {photoUploading ? "⏳ Wysyłanie…" : hasPhoto ? "📷 Zmień zdjęcie" : "📷 Dodaj zdjęcie"}
            </button>
            {hasPhoto && !photoUploading && (
              <button
                type="button"
                onClick={() => onRemovePhoto(item.id)}
                style={{ ...s.btnSm(c.danger), height: 40, flex: isMobile ? 1 : "0 0 auto" }}
              >
                Usuń zdjęcie
              </button>
            )}
            {!hasPhoto && !photoUploading && (
              <span style={{ fontSize: 11, color: c.textMuted }}>gdy opis nie wystarczy — np. „ten olej”</span>
            )}
          </div>
        </div>
      )}

      {photoOpen && hasPhoto && createPortal(
        <StoredFileModal
          // photoAt busts the browser cache — the proxy URL stays the same
          // when a photo is replaced.
          path={`/api/shopping/${item.id}/photo?v=${encodeURIComponent(item.photoAt ?? "")}`}
          title={`📷 ${item.name}`}
          onClose={() => setPhotoOpen(false)}
        />,
        document.body,
      )}

      {/* Shelf price — hangs off the item itself, so it is offered for
          anything on the list, including a product bought for the first
          time. Top to bottom in the order it is read off a shelf label. */}
      {panel === "price" && !resolved && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}`, maxWidth: isMobile ? undefined : 460 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.infoLight }}>💰 Cena na półce</span>
            <button type="button" onClick={() => setPanel(null)} aria-label="Zamknij"
              style={{ background: "transparent", border: "none", color: c.textMuted, fontSize: 14, cursor: "pointer", padding: 4 }}>
              ✕
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 8, marginTop: 6 }}>
            <div>
              <FieldLabel>Cena</FieldLabel>
              <div style={{ position: "relative" }}>
                <input
                  autoFocus
                  value={draftPrice}
                  onChange={e => setDraftPrice(e.target.value.replace(/[^\d.,]/g, ""))}
                  onKeyDown={e => { if (e.key === "Enter") noteSeenPrice(); if (e.key === "Escape") setPanel(null); }}
                  placeholder="22,99"
                  inputMode="decimal"
                  style={{ ...field, paddingRight: 30 }}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: c.textMuted, fontSize: 13, pointerEvents: "none" }}>zł</span>
              </div>
            </div>
            <div>
              <FieldLabel>Gramatura (opcjonalnie)</FieldLabel>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={draftSize}
                  onChange={e => setDraftSize(e.target.value.replace(/[^\d.,]/g, ""))}
                  onKeyDown={e => { if (e.key === "Enter") noteSeenPrice(); }}
                  placeholder="500"
                  inputMode="decimal"
                  style={{ ...field, flex: 1, minWidth: 0 }}
                />
                <select
                  value={draftSizeUnit}
                  onChange={e => setDraftSizeUnit(e.target.value as SizeEntry)}
                  aria-label="Jednostka"
                  style={{ ...field, width: 64, flex: "0 0 64px", padding: "8px 6px", cursor: "pointer" }}
                >
                  {SIZE_UNITS.map(u => <option key={u} value={u}>{UNIT_ENTRY_OPTIONS[u].label}</option>)}
                </select>
              </div>
              {livePerUnit != null && (
                <div style={{ fontSize: 11, color: c.textTertiary, marginTop: 3 }}>
                  = {money(livePerUnit)} {unitPriceLabel(baseUnit)}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <FieldLabel>
              Sklep
              {shopRemembered && draftShop && <span style={{ color: c.textMuted }}> · ostatnio użyty</span>}
            </FieldLabel>
            <MerchantInput
              value={draftShop}
              onChange={v => { setDraftShop(v); setShopRemembered(false); }}
              onEnter={noteSeenPrice}
              placeholder="w jakim sklepie?"
              style={field}
            />
          </div>

          {/* Folded away: most prices need nothing more, and an empty field
              on every note is a question nobody asked. */}
          {priceNoteOpen ? (
            <div style={{ marginTop: 8 }}>
              <FieldLabel>Dodatkowy komentarz</FieldLabel>
              <input
                autoFocus
                value={draftPriceNote}
                onChange={e => setDraftPriceNote(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") noteSeenPrice(); }}
                placeholder="np. przy zakupie 2, z aplikacją"
                maxLength={60}
                style={field}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPriceNoteOpen(true)}
              style={{ background: "transparent", border: "none", color: c.infoLight, fontSize: 12, padding: "8px 0 0", cursor: "pointer" }}
            >
              + dodatkowy komentarz
            </button>
          )}

          <button
            type="button"
            onClick={noteSeenPrice}
            disabled={!canNotePrice}
            style={{
              ...s.btn(c.info), marginTop: 10, height: 44, padding: 0,
              opacity: canNotePrice ? 1 : 0.4, cursor: canNotePrice ? "pointer" : "not-allowed",
            }}
          >
            Zanotuj
          </button>
          {missing && (draftPrice || draftShop) && (
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: "center" }}>{missing}</div>
          )}
        </div>
      )}
    </div>
  );
}
