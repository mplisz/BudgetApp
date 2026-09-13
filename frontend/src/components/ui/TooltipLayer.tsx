// ============================================================
// File: src/components/ui/TooltipLayer.tsx
//
// The app's tooltip — one styled bubble for every `title` attribute.
//
// There are 200+ `title=` across the panels, and the browser's native bubble
// is a slow, unstyled grey box that ignores the dark theme. Rather than
// rewriting every call site (and hoping the next one remembers a wrapper),
// this layer is mounted once at the root and takes over `title` itself:
//
//   - mouse hover (after a short delay) or keyboard focus: the element's
//     title is lifted off at once — so the native bubble never gets its
//     turn — shown in our bubble, and put back when the pointer / focus
//     leaves. The DOM React rendered is left as it was found.
//   - touch: TAPPING a non-interactive element with a title (a badge, a
//     pill) shows it; tapping elsewhere or scrolling hides it. Buttons and
//     links keep doing their job on tap.
//   - "\n" in a title is a line break, so explanations can be structured.
//   - while shown, the element points at the bubble (aria-describedby →
//     role="tooltip"), so assistive tech still reads what the title said.
//
// Placement: above the element, centred, flipped below when there's no room,
// kept inside the viewport.
// ============================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { c, alpha } from "../../styles/tokens";

const SHOW_DELAY_MS  = 350;
/** Moving straight from one tooltip to the next skips the delay. */
const WARM_WINDOW_MS = 400;
const GAP    = 8;
const MARGIN = 8;
const TIP_ID = "app-tooltip";
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], [contenteditable='true']";

interface Target {
  el:   Element;
  text: string;
}

function titledAncestor(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest("[title]");
  return el?.getAttribute("title")?.trim() ? el : null;
}

export function TooltipLayer() {
  const [shown, setShown] = useState<Target | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; arrow: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The element whose title we hold — waiting for the delay, or shown.
    let current: Target | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastHidden = 0;

    const release = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!current) return;
      const { el, text } = current;
      if (!el.hasAttribute("title")) el.setAttribute("title", text);   // unless React re-rendered one
      if (el.getAttribute("aria-describedby") === TIP_ID) el.removeAttribute("aria-describedby");
      current = null;
      lastHidden = Date.now();
      setShown(null);
      setPos(null);
    };

    // Hide the bubble but keep holding the title until the pointer leaves:
    // restoring it under a resting cursor would let the NATIVE bubble pop up
    // right after a click.
    const dismiss = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!current) return;
      if (current.el.getAttribute("aria-describedby") === TIP_ID) current.el.removeAttribute("aria-describedby");
      lastHidden = 0;   // a click is not "moving on to the next tooltip"
      setShown(null);
      setPos(null);
    };

    const hold = (el: Element, delay: number) => {
      if (current?.el === el) return;
      release();
      const text = el.getAttribute("title") ?? "";
      el.removeAttribute("title");
      const target = { el, text };
      current = target;
      const reveal = () => {
        timer = null;
        if (current !== target) return;
        if (!el.hasAttribute("aria-describedby")) el.setAttribute("aria-describedby", TIP_ID);
        setShown(target);
      };
      if (delay <= 0 || Date.now() - lastHidden < WARM_WINDOW_MS) reveal();
      else timer = setTimeout(reveal, delay);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = titledAncestor(e.target);
      if (el) hold(el, SHOW_DELAY_MS);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !current) return;
      if (e.relatedTarget instanceof Node && current.el.contains(e.relatedTarget)) return;
      release();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = titledAncestor(e.target);
      if (el && e.target instanceof Element && e.target.matches(":focus-visible")) hold(el, 0);
    };
    const onPointerDown = (e: PointerEvent) => { if (e.pointerType === "mouse") dismiss(); };
    const onTap = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const el = titledAncestor(e.target);
      const interactive = e.target instanceof Element && e.target.closest(INTERACTIVE);
      if (!el || interactive || current?.el === el) { release(); return; }
      hold(el, 0);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    // The element can disappear while shown (row deleted, panel switched).
    const sweep = setInterval(() => { if (current && !current.el.isConnected) release(); }, 500);

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onTap);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", release);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", release, true);
    window.addEventListener("resize", release);
    return () => {
      clearInterval(sweep);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onTap);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", release);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", release, true);
      window.removeEventListener("resize", release);
      release();
    };
  }, []);

  useLayoutEffect(() => {
    if (!shown || !bubbleRef.current) return;
    const r = shown.el.getBoundingClientRect();
    const b = bubbleRef.current.getBoundingClientRect();
    const centre = r.left + r.width / 2;
    const left   = Math.min(Math.max(centre - b.width / 2, MARGIN), window.innerWidth - b.width - MARGIN);
    const below  = r.top - GAP - b.height < MARGIN;
    const top    = below ? r.bottom + GAP : r.top - GAP - b.height;
    setPos({ left, top, below, arrow: Math.min(Math.max(centre - left, 12), b.width - 12) });
  }, [shown]);

  if (!shown) return null;

  return createPortal(
    <div
      id={TIP_ID}
      ref={bubbleRef}
      role="tooltip"
      style={{
        position: "fixed", zIndex: 10050, pointerEvents: "none",
        left: pos?.left ?? 0, top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
        maxWidth: "min(320px, calc(100vw - 16px))",
        padding: "8px 11px", borderRadius: 9,
        background: c.surface, color: c.text,
        border: `1px solid ${c.borderStrong}`,
        boxShadow: `0 10px 30px ${alpha("#000000", "73")}`,
        fontSize: 12, lineHeight: 1.5, fontWeight: 500, whiteSpace: "pre-line", textAlign: "left",
        animation: "app-tooltip-in 0.12s ease-out",
      }}
    >
      <style>{`@keyframes app-tooltip-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }`}</style>
      {shown.text}
      {pos && (
        <span aria-hidden style={{
          position: "absolute", left: pos.arrow - 5, width: 10, height: 10,
          background: c.surface, transform: "rotate(45deg)",
          ...(pos.below
            ? { top: -6, borderLeft: `1px solid ${c.borderStrong}`, borderTop: `1px solid ${c.borderStrong}` }
            : { bottom: -6, borderRight: `1px solid ${c.borderStrong}`, borderBottom: `1px solid ${c.borderStrong}` }),
        }} />
      )}
    </div>,
    document.body,
  );
}
