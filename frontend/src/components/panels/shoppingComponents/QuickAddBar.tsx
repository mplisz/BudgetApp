// ============================================================
// File: src/components/panels/shoppingComponents/QuickAddBar.tsx
// The "dopisz produkt" field — free text with suggestions from the
// family's own catalog.
//
// Shares its interaction with MerchantInput through useSuggestions; what
// is specific here is that the list opens UPWARDS (the bar is sticky at
// the bottom of the screen) and that submitting keeps the field FOCUSED:
// adding five things in a row is the normal case, and re-tapping the
// field between each would be the whole cost of using the list.
//
// 📷 attaches a photo to the item being written — the moment "ten olej"
// is thought of is when the bottle is in hand. It is held here until the
// item is added, then uploaded to it the same way as from the ✎ editor.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState, useRef, useCallback, useEffect } from "react";
import type { ChangeEvent } from "react";
import { theme as s } from "../../../styles/theme";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { useSuggestions } from "../../../hooks/useSuggestions";
import type { CatalogEntry } from "../../../hooks/useShoppingList";

interface QuickAddBarProps {
  catalog: CatalogEntry[];
  onAdd:   (name: string, unit: string | null, note: string, photo: File | null) => void;
}

const entryLabel = (e: CatalogEntry) => e.name;

const sideBtn = (active: boolean) => ({
  background: "transparent",
  border: `1px solid ${active ? c.infoLight : c.borderStrong}`,
  color: active ? c.infoLight : c.textSecondary,
  borderRadius: 10, padding: "0 14px", fontSize: 15, cursor: "pointer",
});

export function QuickAddBar({ catalog, onAdd }: QuickAddBarProps) {
  const [value, setValue] = useState("");
  // The comment is folded away by default. It matters ("bez soli, to dla
  // córki") but it is the exception, and a second always-visible field
  // would tax every ordinary add to serve the rare one.
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // On a phone the bottom navigation is fixed over the viewport edge, so
  // sticking to 0 would park this field underneath it.
  const isMobile = useIsMobile();

  // A thumbnail, so it is obvious WHICH photo waits to be attached.
  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function handlePhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";               // so the same file can be re-picked
    if (file) setPhoto(file);
    inputRef.current?.focus();         // the name is what is still missing
  }

  const submit = useCallback((name: string, unit: string | null) => {
    const clean = name.trim();
    if (!clean) return;
    onAdd(clean, unit, note.trim(), photo);
    setValue("");
    setNote("");
    setNoteOpen(false);          // the next item is a different thought
    setPhoto(null);
    inputRef.current?.focus();   // ready for the next item
  }, [onAdd, note, photo]);

  const sug = useSuggestions<CatalogEntry>({
    options: catalog,
    query: value,
    getLabel: entryLabel,
    onPick: useCallback((e: CatalogEntry) => submit(e.name, e.unit), [submit]),
    onEnterRaw: useCallback(() => submit(value, null), [submit, value]),
  });

  return (
    <div style={{
      position: "sticky", bottom: isMobile ? 62 : 0, zIndex: 20,
      background: c.bg, borderTop: `1px solid ${c.border}`,
      padding: "10px 0 6px", marginTop: 16,
    }}>
      <div style={{ position: "relative", display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder="Dopisz produkt…"
          autoComplete="off"
          onChange={e => { setValue(e.target.value); sug.handleInput(); }}
          onFocus={sug.handleFocus}
          // Enter must never submit a surrounding form, whichever branch
          // useSuggestions takes.
          onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); sug.handleKeyDown(e); }}
          onBlur={sug.handleBlur}
          style={{ ...s.input, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => submit(value, null)}
          disabled={!value.trim()}
          style={{
            background: value.trim() ? c.success : c.border,
            color: value.trim() ? c.white : c.textMuted,
            border: "none", borderRadius: 10, padding: "0 22px",
            fontSize: 20, fontWeight: 700,
            cursor: value.trim() ? "pointer" : "not-allowed",
          }}
          aria-label="Dodaj do listy"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen(o => !o)}
          title={noteOpen ? "Ukryj komentarz" : "Dodaj komentarz"}
          aria-expanded={noteOpen}
          style={sideBtn(noteOpen || !!note)}
        >
          📝
        </button>
        {/* No `capture`: phones then offer camera AND gallery in one chooser. */}
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
          title={photo ? "Zmień zdjęcie" : "Dodaj zdjęcie"}
          style={sideBtn(!!photo)}
        >
          📷
        </button>

        {sug.showList && (
          <ul
            role="listbox"
            style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0,
              margin: 0, padding: 4, listStyle: "none", zIndex: 50,
              background: c.surface, border: `1px solid ${c.border}`,
              borderRadius: 8, maxHeight: 220, overflowY: "auto",
              boxShadow: "0 -8px 24px rgba(0,0,0,.4)",
            }}
          >
            {sug.suggestions.map((e, i) => (
              <li
                key={e.key}
                role="option"
                aria-selected={i === sug.highlight}
                onMouseDown={ev => { ev.preventDefault(); sug.pick(e); }}
                onMouseEnter={() => sug.setHighlight(i)}
                style={{
                  padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                  fontSize: 14, color: c.text,
                  background: i === sug.highlight ? c.border : "transparent",
                }}
              >
                🧺 {e.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {noteOpen && (
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          // Enter here adds the item too — the comment is written with the
          // product in mind, so making the user reach back up to the name
          // field to submit would be busywork.
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); submit(value, null); }
            if (e.key === "Escape") setNoteOpen(false);
          }}
          placeholder="Komentarz, np. bez soli — dla córki"
          maxLength={300}
          style={{ ...s.input, marginTop: 8, fontSize: 13 }}
        />
      )}

      {photo && photoPreview && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginTop: 8,
          padding: "6px 8px", borderRadius: 10,
          background: alpha(c.info, "14"), border: `1px solid ${alpha(c.info, "44")}`,
        }}>
          <img src={photoPreview} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: c.infoLight, fontWeight: 600 }}>
            📷 zdjęcie dołączy się do dopisanej pozycji
          </span>
          <button
            type="button"
            onClick={() => setPhoto(null)}
            aria-label="Usuń zdjęcie"
            style={{ background: "transparent", border: "none", color: c.textMuted, fontSize: 16, cursor: "pointer", padding: "4px 6px" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
