"use client";

/**
 * FeedbackWidget — React wrapper over lib/feedback/core (the extractable core).
 *
 * No floating button. Desktop: right-click anywhere (Shift+right-click keeps the
 * browser menu). Touch: long-press. Both open a small "Give feedback" menu that
 * already knows which element was pressed; the core captures a stable selector + rect + SVG screenshot + full environment
 * (viewport, dpr, device, color-scheme, brand/density, locale, tz), then a
 * panel collects the comment and POSTs to /api/feedback.
 *
 * All UI is marked data-fbw so the core's select mode never targets itself.
 * Inline styles only — works dropped into any app regardless of host CSS
 * (prep for the standalone package / <script> layer).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startSelect,
  captureElement,
  captureEnv,
  submitFeedback,
  type CapturedTarget,
  type SelectController,
} from "@/lib/feedback/core";
import { ASK_EVENT, QUOTE_EVENT, REPORT_EVENT, SHEET_EVENT, askStub, emit } from "@/lib/chat/events";

type MenuState = { x: number; y: number; el: Element; touch: boolean };

const LONG_PRESS_MS = 550;
const isEditable = (el: Element | null) =>
  !!el?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
const isOwnUi = (el: Element | null) => !!el?.closest("[data-fbw]");
const cardOf = (el: Element) => el.closest("[data-kanban-card]") as HTMLElement | null;
const cardActions = (el: Element) => cardOf(el)?.querySelector('button[aria-label^="Actions for"]') as HTMLElement | null;
/** Radix menus open on pointerdown, not click. */
const openRadix = (b: HTMLElement) => {
  const r = b.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerType: "mouse" } as PointerEventInit;
  b.dispatchEvent(new PointerEvent("pointerdown", o));
  b.dispatchEvent(new PointerEvent("pointerup", o));
};
/** What was pointed at, in words: the visible text and what kind of thing it is, never a code path. */
const pickedWords = (t: { snapshot: { tag: string; text?: string } }) => {
  const kinds: Record<string, string> = { button: "button", a: "link", input: "field", textarea: "text box", select: "list", img: "picture", h1: "heading", h2: "heading", p: "text", span: "text", li: "item", label: "label", h3: "heading", h4: "heading" }
  const what = kinds[String(t.snapshot.tag || "").toLowerCase()] || "part of the page"
  const text = String(t.snapshot.text || "").replace(/\s+/g, " ").trim().slice(0, 50)
  return text ? `the ${what} "${text}"` : `a ${what}`
}

/** What is under the pointer, in words ("the button “Save”"), never a tag name. */
const describe = (el: Element) => pickedWords({ snapshot: { tag: el.tagName, text: (el.textContent || "").slice(0, 60) } });

type Phase = "idle" | "selecting" | "composing" | "sending" | "done" | "error";

/** How much of the bottom of the window a phone's on-screen keyboard covers (0 when none), so fixed panels sit above it. */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) { setInset(0); return; }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [active]);
  return inset;
}

interface FeedbackWidgetProps {
  /** App key stored on every item so one backend can serve many projects. */
  source?: string;
  /** Optional planner project id this app maps to. */
  projectId?: string | null;
}

export function FeedbackWidget({ source = "ai-project-planner", projectId = null }: FeedbackWidgetProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const keyboard = useKeyboardInset(phase !== "idle" && phase !== "done");
  const [target, setTarget] = useState<CapturedTarget | null>(null);
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"wrong" | "wish">("wrong");
  const [sentTo, setSentTo] = useState("");
  const [err, setErr] = useState("");
  const ctrl = useRef<SelectController | null>(null);

  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => () => ctrl.current?.stop(), []);

  // Right-click (desktop) and long-press (touch) open the menu on the element under the pointer.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let longPressed = false;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onContext = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (longPressed) {
        e.preventDefault(); // the long-press already opened our menu
        return;
      }
      // A part of the page that answers its own right-click (the process map's edit menu) has already claimed it.
      if (!el || e.shiftKey || e.defaultPrevented || isOwnUi(el) || isEditable(el)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return; // keep native copy menu
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, el, touch: false });
    };
    const onTouchStart = (e: TouchEvent) => {
      longPressed = false;
      const t = e.touches[0];
      const el = e.target instanceof Element ? e.target : null;
      if (e.touches.length !== 1 || !t || !el || isOwnUi(el) || isEditable(el)) return;
      start = { x: t.clientX, y: t.clientY };
      clear();
      timer = setTimeout(() => {
        longPressed = true;
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(12);
        setMenu({ x: start!.x, y: start!.y, el, touch: true });
      }, LONG_PRESS_MS);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) clear();
    };
    const onTouchEnd = () => {
      clear();
      setTimeout(() => (longPressed = false), 400);
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      clear();
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Close the menu on Escape, scroll, resize, or a press outside it.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const away = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-fbw="menu"]')) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const feedbackOnElement = useCallback(async (el: Element) => {
    setMenu(null);
    setErr("");
    setPhase("composing");
    setTarget(await captureElement(el));
  }, []);

  // "Ask JARVIS about this": on /chat it fills the composer, elsewhere it opens the pull-up sheet.
  const askAbout = useCallback((el: Element) => {
    setMenu(null);
    const text = askStub(el.textContent || "", location.pathname);
    emit(location.pathname.startsWith("/chat") || document.body.classList.contains("ade-open") ? ASK_EVENT : SHEET_EVENT, text);
  }, []);

  const messageOf = (el: Element) => el.closest("[data-role]") as HTMLElement | null;

  const copyMessage = useCallback(async (msg: HTMLElement) => {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(msg.innerText.trim());
    } catch {
      /* clipboard can be blocked; nothing to recover */
    }
  }, []);

  const feedbackGeneral = useCallback(() => {
    setMenu(null);
    setErr("");
    setTarget(null);
    setPhase("composing");
  }, []);

  const beginSelect = useCallback(() => {
    setErr("");
    setPhase("selecting");
    ctrl.current = startSelect(
      (t) => {
        setTarget(t);
        setPhase("composing");
      },
      () => setPhase("idle")
    );
  }, []);

  // The top bar's "Report a problem" starts here: pick a part of the page, then describe it.
  useEffect(() => {
    // After this press has finished, so the press on the button is not taken as the pick.
    const go = () => { setMenu(null); setTimeout(beginSelect, 0); };
    window.addEventListener(REPORT_EVENT, go);
    return () => window.removeEventListener(REPORT_EVENT, go);
  }, [beginSelect]);

  const skipTarget = useCallback(() => {
    ctrl.current?.stop();
    setTarget(null);
    setPhase("composing");
  }, []);

  const send = useCallback(async () => {
    if (!comment.trim()) {
      setErr("Add a comment first.");
      return;
    }
    setPhase("sending");
    const res = await submitFeedback({
      source,
      projectId,
      comment: comment.trim(),
      title: title.trim() || undefined,
      kind,
      picked: target ? pickedWords(target) : null,
      target,
      env: captureEnv(),
    });
    if (res.ok) {
      setSentTo(res.card ? `Sent. It is a card in ${res.card.column} on the planner's board.` : "Sent.");
      setKind("wrong");
      setPhase("done");
      setComment("");
      setTitle("");
      setTarget(null);
      setTimeout(() => setPhase("idle"), 2200);
    } else {
      setErr(res.error || "Failed to send");
      setPhase("error");
    }
  }, [comment, title, kind, target, source, projectId]);

  const reset = () => {
    ctrl.current?.stop();
    setTarget(null);
    setComment("");
    setTitle("");
    setErr("");
    setPhase("idle");
  };

  const accent = "var(--opx-accent, #2563eb)";
  const panel: React.CSSProperties = {
    position: "fixed",
    bottom: 16 + keyboard,
    right: 16,
    width: "min(320px, calc(100vw - 32px))",
    background: "var(--opx-card, #0b0f1a)",
    color: "var(--opx-ink, #e8eaf0)",
    border: "1px solid var(--opx-line, #2a3142)",
    borderRadius: 12,
    boxShadow: "0 12px 40px rgba(0,0,0,.5)",
    zIndex: 2147483646,
    padding: 16,
    fontSize: 13, lineHeight: 1.5, fontFamily: "inherit",
  };
  const input: React.CSSProperties = {
    width: "100%",
    background: "var(--opx-soft, #141a28)",
    border: "1px solid var(--opx-line, #2a3142)",
    borderRadius: 7,
    color: "var(--opx-ink, #e8eaf0)",
    padding: "8px 10px",
    fontSize: 13, fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const menuItem: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    color: "var(--opx-ink, #e8eaf0)",
    border: "none",
    borderRadius: 8,
    padding: "12px 12px",
    minHeight: 44,
    cursor: "pointer",
    fontSize: 13, lineHeight: 1.3, fontFamily: "inherit",
  };
  const btn = (bg: string): React.CSSProperties => ({
    background: bg,
    color: bg === accent ? "#fff" : "var(--opx-ink, #cfd6e6)",
    border: bg === accent ? "none" : "1px solid var(--opx-line, #2a3142)",
    borderRadius: 7,
    padding: "8px 14px",
    minHeight: 44,
    cursor: "pointer",
    fontSize: 12, lineHeight: 1, fontFamily: "inherit",
    fontWeight: 600,
  });

  return (
    // An open dialog turns presses off on everything outside it (pointer-events: none on body); the menu and the
    // form live outside every dialog, so they turn them back on, or a press inside an open card falls through them.
    <div data-fbw="root" style={{ pointerEvents: "auto" }}>
      {menu && (
        <div
          data-fbw="menu"
          role="menu"
          style={{
            position: "fixed",
            ...(menu.touch
              ? { left: 0, right: 0, bottom: 0, borderRadius: "16px 16px 0 0", padding: "8px 10px calc(14px + env(safe-area-inset-bottom))" }
              : {
                  left: Math.max(8, Math.min(menu.x, window.innerWidth - 240)),
                  top: Math.max(8, Math.min(menu.y, window.innerHeight - 260)),
                  width: 232,
                  borderRadius: 12,
                  padding: 6,
                }),
            background: "var(--opx-card, #0b0f1a)",
            color: "var(--opx-ink, #e8eaf0)",
            border: "1px solid var(--opx-line, #2a3142)",
            boxShadow: "0 12px 40px rgba(0,0,0,.5)",
            zIndex: 2147483646,
            fontSize: 13, lineHeight: 1.4, fontFamily: "inherit",
          }}
        >
          {/* Over a board card: its own actions come first (walk 2026-11-16: right-click on a card gave no way to them). */}
          {cardOf(menu.el) && (
            <>
              <button role="menuitem" data-fbw="menu-card-open" onClick={() => { const c = cardOf(menu.el)!; setMenu(null); (c.querySelector("p") as HTMLElement | null ?? c).click(); }} style={menuItem}>
                <span style={{ fontWeight: 600 }}>Open this card</span>
              </button>
              {cardActions(menu.el) && (
                <button role="menuitem" data-fbw="menu-card-actions" onClick={() => { const b = cardActions(menu.el)!; setMenu(null); setTimeout(() => openRadix(b), 0); }} style={menuItem}>
                  Card actions: copy, duplicate, delete
                </button>
              )}
            </>
          )}
          <button role="menuitem" data-fbw="menu-ask" onClick={() => askAbout(menu.el)} style={menuItem}>
            <span style={{ fontWeight: 600 }}>Ask the assistant about this</span>
          </button>
          {messageOf(menu.el) && (
            <>
              <button
                role="menuitem"
                data-fbw="menu-reply"
                onClick={() => {
                  const m = messageOf(menu.el)!;
                  setMenu(null);
                  emit(QUOTE_EVENT, m.innerText);
                }}
                style={menuItem}
              >
                Reply to this
              </button>
              <button role="menuitem" data-fbw="menu-copy" onClick={() => void copyMessage(messageOf(menu.el)!)} style={menuItem}>
                Copy message
              </button>
            </>
          )}
          <button
            role="menuitem"
            data-fbw="menu-element"
            onClick={() => void feedbackOnElement(menu.el)}
            style={menuItem}
          >
            <span style={{ fontWeight: 600 }}>Give feedback on this</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--opx-muted, #8b93a7)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {describe(menu.el)}
            </span>
          </button>
          <button role="menuitem" data-fbw="menu-general" onClick={feedbackGeneral} style={menuItem}>
            General feedback
          </button>
          {!menu.touch && (
            <div style={{ fontSize: 12, color: "var(--opx-muted, #8b93a7)", padding: "4px 10px 2px" }}>
              Shift + right-click for the browser menu
            </div>
          )}
        </div>
      )}

      {phase === "selecting" && (
        <div
          data-fbw="hint"
          style={{
            position: "fixed",
            bottom: 20 + keyboard,
            left: "50%",
            transform: "translateX(-50%)",
            width: "max-content",
            maxWidth: "calc(100vw - 32px)",
            boxSizing: "border-box",
            textAlign: "center",
            background: "var(--opx-card, #0b0f1a)",
            color: "var(--opx-ink, #e8eaf0)",
            border: "1px solid var(--opx-line, #2a3142)",
            borderRadius: 999,
            padding: "9px 16px",
            zIndex: 2147483646,
            fontSize: 12, fontFamily: "inherit",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          Tap or click the element you’re reporting{" "}
          <button onClick={skipTarget} style={{ ...btn("var(--opx-soft, #141a28)"), padding: "3px 8px", marginLeft: 6 }}>
            Skip, comment only
          </button>
          {/* A phone has no Esc key: cancelling must be something to press. */}
          <button onClick={reset} style={{ ...btn("var(--opx-soft, #141a28)"), padding: "3px 8px", marginLeft: 6 }}>
            Cancel
          </button>
        </div>
      )}

      {(phase === "composing" || phase === "sending" || phase === "error") && (
        <div data-fbw="panel" style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>Send feedback</strong>
            <button onClick={reset} style={{ ...btn("var(--opx-soft, #141a28)"), padding: "2px 8px" }}>
              Close
            </button>
          </div>
          <div role="radiogroup" aria-label="What kind of report" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {([["wrong", "Something is wrong"], ["wish", "I'd like this"]] as const).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={kind === k}
                data-fbw={`kind-${k}`}
                onClick={() => setKind(k)}
                style={{ ...btn(kind === k ? accent : "var(--opx-soft, #141a28)"), flex: 1, padding: "6px 8px" }}
              >
                {label}
              </button>
            ))}
          </div>

          {target ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--opx-muted, #8b93a7)",
                marginBottom: 10,
                padding: "6px 8px",
                background: "var(--opx-soft, #141a28)",
                borderRadius: 6,
                wordBreak: "break-all",
              }}
            >
              You pointed at {pickedWords(target)}
              {target.screenshot && (
                <img src={target.screenshot} alt={`What you pointed at: ${pickedWords(target)}`}
                  style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 120, borderRadius: 4, padding: 4, border: "1px solid var(--opx-line, #2a3142)",
                    // The page's own background, so the picture reads in both themes (white hid light text).
                    background: typeof document !== "undefined" ? getComputedStyle(document.body).backgroundColor : "#fff" }} />
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--opx-muted, #8b93a7)", marginBottom: 10 }}>
              No element attached (general feedback)
            </div>
          )}

          <input
            data-fbw="title"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ ...input, marginBottom: 8 }}
          />
          <textarea
            data-fbw="comment"
            placeholder={kind === "wish" ? "What would you like it to do?" : "What is wrong?"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            style={{ ...input, resize: "none", marginBottom: 10 }}
          />

          {err && <div style={{ color: "var(--opx-bad, #f87171)", fontSize: 12, marginBottom: 8 }}>{err}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={beginSelect} style={btn("var(--opx-soft, #141a28)")}>
              {target ? "Re-pick" : "Pick element"}
            </button>
            <button
              onClick={send}
              disabled={phase === "sending"}
              style={{ ...btn(accent), opacity: phase === "sending" ? 0.6 : 1 }}
            >
              {phase === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div
          data-fbw="toast"
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            background: "color-mix(in srgb, var(--opx-good, #307e59) 16%, var(--opx-card, #0b0f1a))",
            color: "var(--opx-ink, #7ee2a8)",
            border: "1px solid var(--opx-good, #1f5236)",
            borderRadius: 10,
            padding: "12px 16px",
            zIndex: 2147483646,
            fontSize: 13, fontFamily: "inherit",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          {sentTo || "Sent."}
        </div>
      )}
    </div>
  );
}
