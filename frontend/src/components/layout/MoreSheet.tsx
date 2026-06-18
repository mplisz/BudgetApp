// ============================================================
// File: src/components/layout/MoreSheet.tsx
//
// Mobile "Więcej" bottom sheet — opens above the MobileNav bar
// and lists every panel flagged `mobile: true` in PANEL_META,
// grouped by its Sidebar section. Single source of truth: flip
// the flag in panels.js and the panel appears here automatically.
//
// Behaviour:
//   - Rendered via portal (like ToastContainer) so it escapes
//     any layout/overflow wrappers.
//   - Closes on: overlay tap, item tap, Escape, route change
//     (route change is handled by MobileNav's useEffect).
//   - Locks body scroll while open.
//   - NavLink + useLinkWithMonth → ?m=YYYY-MM follows the user,
//     identical to Sidebar behaviour.
//   - z-index: nav is 300 → overlay 400, sheet 401.
// ============================================================

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { PANEL_META } from "../../data/constants";
import { PANEL_PATHS } from "../../data/routes";
import { useLinkWithMonth } from "../../hooks/useLinkWithMonth";

// ── Types ─────────────────────────────────────────────────────

interface PanelMetaEntry {
  icon:    string;
  label:   string;
  section: string;
  mobile?: boolean;
}

interface SheetItem {
  id:    string;
  icon:  string;
  label: string;
  path:  string;
}

interface SheetSection {
  section: string;
  items:   SheetItem[];
}

// ── Derived data (computed once at module load) ──────────────

// Sections preserve PANEL_META declaration order; panels without
// a registered route are silently skipped (same policy as Sidebar).
const SHEET_SECTIONS: SheetSection[] = (() => {
  const out: SheetSection[] = [];
  for (const [id, raw] of Object.entries(PANEL_META as Record<string, PanelMetaEntry>)) {
    if (!raw.mobile) continue;
    const path = PANEL_PATHS[id];
    if (!path) continue;
    let sec = out.find(s => s.section === raw.section);
    if (!sec) {
      sec = { section: raw.section, items: [] };
      out.push(sec);
    }
    sec.items.push({ id, icon: raw.icon, label: raw.label, path });
  }
  return out;
})();

// Exported so MobileNav can highlight the "Więcej" tab when the
// active panel lives inside the sheet.
export const MORE_SHEET_PANEL_IDS: string[] =
  SHEET_SECTIONS.flatMap(sec => sec.items.map(it => it.id));

// ── Component ─────────────────────────────────────────────────

interface MoreSheetProps {
  open:    boolean;
  onClose: () => void;
}

export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const linkWithMonth = useLinkWithMonth();

  // Escape-to-close + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Dim overlay — tap to close */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(2, 6, 18, 0.65)",
          zIndex: 400,
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Więcej paneli"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          zIndex: 401,
          background: "#0d1424",
          borderTop: "1px solid #1e293b",
          borderRadius: "16px 16px 0 0",
          padding: "10px 14px calc(16px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "70vh",
          overflowY: "auto",
          animation: "moresheet-up 0.18s ease-out",
        }}
      >
        {/* Grabber */}
        <div style={{
          width: 36, height: 4, borderRadius: 99,
          background: "#1e293b", margin: "0 auto 12px",
        }} />

        {SHEET_SECTIONS.map(sec => (
          <div key={sec.section} style={{ marginBottom: 14 }}>
            <div style={{
              padding: "0 2px 6px",
              fontSize: 10, color: "#334155",
              textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700,
            }}>
              {sec.section}
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}>
              {sec.items.map(item => (
                <NavLink
                  key={item.id}
                  to={linkWithMonth(item.path)}
                  end
                  onClick={onClose}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 12px",
                    borderRadius: 12,
                    textDecoration: "none",
                    background: isActive ? "#10b98122" : "#090e1b",
                    border:     `1px solid ${isActive ? "#10b98155" : "#1e293b"}`,
                    color:      isActive ? "#10b981"   : "#94a3b8",
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes moresheet-up {
          from { transform: translateY(24px); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
      `}</style>
    </>,
    document.body
  );
}
