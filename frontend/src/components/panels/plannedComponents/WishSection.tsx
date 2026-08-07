// ============================================================
// File: src/components/panels/plannedComponents/WishSection.tsx
// "Zachcianki" — ideas parked without a month or a committed price.
//
// Lives in the same container as real plans, but the backend filters wishes
// out of the default listing, so they never reach AppContext.planned. That is
// deliberate: the forecast, the Baza budżetu column, the safety net and the
// bell all sum over that list, and an amount-less doc would skew all of them.
// Consequence for this component — it owns its own slice of state, exactly
// like the archived section next to it.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import { theme as s } from "../../../styles/theme";
import { fmt } from "../../../utils/helpers";
import { SubcategorySelect } from "../../ui/SubcategorySelect";
import { TagMultiSelect } from "../../ui/TagMultiSelect";
import { PriorityPicker } from "../../ui/PriorityPicker";
import type { PlannedDoc, WishPostPayload } from "../../../hooks/usePlanned";

interface WishSectionProps {
  wishes:     PlannedDoc[] | null;      // null = not loaded yet
  isSaving:   boolean;
  onCreate:   (payload: WishPostPayload) => void;
  onPromote:  (wish: PlannedDoc) => void;
  onArchive:  (wish: PlannedDoc) => void;
}

const EMPTY = {
  description:           "",
  estimatedAmount:       "",
  targetCategoryId:      "",
  targetCategoryName:    "",
  targetSubcategoryId:   "",
  targetSubcategoryName: "",
  tags:                  [] as string[],
  priority:              2 as 1 | 2 | 3 | 4,
  url:                   "",
};

export function WishSection({ wishes, isSaving, onCreate, onPromote, onArchive }: WishSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  function set<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function submit() {
    const description = form.description.trim();
    if (!description) return;
    const amount = form.estimatedAmount.trim().replace(",", ".");
    onCreate({
      description,
      // Blank stays blank — a wish without a price is the normal case, and a
      // zero here would read as "free" rather than "not decided yet".
      estimatedAmount:       amount ? Number(amount) : null,
      targetCategoryId:      form.targetCategoryId,
      targetCategoryName:    form.targetCategoryName,
      targetSubcategoryId:   form.targetSubcategoryId,
      targetSubcategoryName: form.targetSubcategoryName,
      tags:                  form.tags,
      priority:              form.priority,
      url:                   form.url.trim(),
    });
    setForm(EMPTY);
    setShowForm(false);
  }

  const canSubmit = form.description.trim().length > 0 && !isSaving;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.textMuted }}>
          💭 Zachcianki {wishes !== null && `(${wishes.length})`}
        </span>
        <span style={{ fontSize: 11, color: c.textMuted }}>
          — pomysły bez ceny i bez terminu; nie liczą się do żadnej prognozy
        </span>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "none",
            background: showForm ? c.border : c.info, color: showForm ? c.textSecondary : c.white,
            fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}
        >
          {showForm ? "Anuluj" : "➕ Dodaj zachciankę"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{
          background: c.bgDeepest, border: `1px solid ${c.border}`,
          borderRadius: 12, padding: 14, marginBottom: 12,
        }}>
          <div style={{ marginBottom: 10 }}>
            <label style={s.label}>Co to za zachcianka?</label>
            <input
              autoFocus
              style={s.input}
              value={form.description}
              onChange={e => set("description", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canSubmit) submit(); }}
              placeholder="np. Rower gravelowy"
              maxLength={200}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={s.label}>Szacunkowa cena (opcjonalnie)</label>
              <input
                style={s.input}
                value={form.estimatedAmount}
                onChange={e => set("estimatedAmount", e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="—"
                inputMode="decimal"
              />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={s.label}>Link (opcjonalnie)</label>
              <input
                style={s.input}
                value={form.url}
                onChange={e => set("url", e.target.value)}
                placeholder="https://…"
                maxLength={500}
              />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={s.label}>Kategoria (opcjonalnie)</label>
            <SubcategorySelect
              value={form.targetSubcategoryId}
              allowedTypes={["EXPENSE", "SAVING"]}
              onChange={({ subcategoryId, subcategoryName, categoryId, categoryName }) => {
                set("targetSubcategoryId", subcategoryId);
                set("targetSubcategoryName", subcategoryName);
                set("targetCategoryId", categoryId);
                set("targetCategoryName", categoryName);
              }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={s.label}>Jak bardzo chcesz?</label>
            <PriorityPicker value={form.priority} onChange={p => set("priority", p as 1 | 2 | 3 | 4)} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>Tagi (opcjonalnie)</label>
            <TagMultiSelect value={form.tags} onChange={t => set("tags", t)} />
          </div>

          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{ ...s.btn(c.info), width: "auto", padding: "9px 18px", opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            {isSaving ? "Zapisuję…" : "✨ Zapisz zachciankę"}
          </button>
        </div>
      )}

      {/* List */}
      {wishes === null && (
        <div style={{ color: c.textMuted, fontSize: 13, padding: "12px 0" }}>Ładowanie…</div>
      )}
      {wishes !== null && wishes.length === 0 && !showForm && (
        <div style={{ color: c.borderStrong, fontSize: 13, padding: "12px 0" }}>
          Brak zachcianek. Wrzuć tu pomysł, zanim stanie się planem.
        </div>
      )}

      {(wishes ?? []).map(wish => (
        <div key={wish.id} style={{
          background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
          padding: "12px 16px", marginBottom: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>💭 {wish.description}</span>
                <span style={{ ...s.chip(c.info), fontSize: 10 }}>P{wish.priority}</span>
                {wish.url && (
                  <a href={wish.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: c.info, textDecoration: "none" }}>
                    🔗 link
                  </a>
                )}
              </div>
              {wish.targetSubcategoryName && (
                <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 3 }}>
                  {wish.targetCategoryName} › {wish.targetSubcategoryName}
                </div>
              )}
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: wish.estimatedAmount != null ? c.textTertiary : c.borderStrong }}>
                {wish.estimatedAmount != null ? `~ ${fmt(wish.estimatedAmount)}` : "bez ceny"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => onPromote(wish)}
              style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: c.success, color: c.white, cursor: "pointer", fontWeight: 700, fontSize: 12 }}
            >
              📅 Zaplanuj
            </button>
            <button
              onClick={() => onArchive(wish)}
              title="Usuń z zachcianek"
              style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${alpha(c.borderStrong, "88")}`, background: "transparent", color: c.textMuted, cursor: "pointer", fontSize: 12 }}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
