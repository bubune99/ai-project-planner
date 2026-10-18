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
import { ASK_EVENT, QUOTE_EVENT, SHEET_EVENT, askStub, emit } from "@/lib/chatsdk/chat-events";

type MenuState = { x: number; y: number; el: Element; touch: boolean };

const LONG_PRESS_MS = 550;
const isEditable = (el: Element | null) =>
  !!el?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
const isOwnUi = (el: Element | null) => !!el?.closest("[data-fbw]");
const describe = (el: Element) => {
  const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36);
  return `${el.tagName.toLowerCase()}${t ? ` “${t}”` : ""}`;
};

type Phase = "idle" | "selecting" | "composing" | "sending" | "done" | "error";

interface FeedbackWidgetProps {
  /** App key stored on every item so one backend can serve many projects. */
  source?: string;
  /** Optional planner project id this app maps to. */
  projectId?: string | null;
}

export function FeedbackWidget({ source = "ai-project-planner", projectId = null }: FeedbackWidgetProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [target, setTarget] = useState<CapturedTarget | null>(null);
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
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
      if (!el || e.shiftKey || isOwnUi(el) || isEditable(el)) return;
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
    emit(location.pathname.startsWith("/chat") ? ASK_EVENT : SHEET_EVENT, text);
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
      target,
      env: captureEnv(),
    });
    if (res.ok) {
      setPhase("done");
      setComment("");
      setTitle("");
      setTarget(null);
      setTimeout(() => setPhase("idle"), 2200);
    } else {
      setErr(res.error || "Failed to send");
      setPhase("error");
    }
  }, [comment, title, target, source, projectId]);

  const reset = () => {
    ctrl.current?.stop();
    setTarget(null);
    setComment("");
    setTitle("");
    setErr("");
    setPhase("idle");
  };

  const accent = "#2563eb";
  const panel: React.CSSProperties = {
    position: "fixed",
    bottom: 16,
    right: 16,
    width: "min(320px, calc(100vw - 32px))",
    background: "#0b0f1a",
    color: "#e8eaf0",
    border: "1px solid #2a3142",
    borderRadius: 12,
    boxShadow: "0 12px 40px rgba(0,0,0,.5)",
    zIndex: 2147483646,
    padding: 16,
    font: "13px/1.5 system-ui, sans-serif",
  };
  const input: React.CSSProperties = {
    width: "100%",
    background: "#141a28",
    border: "1px solid #2a3142",
    borderRadius: 7,
    color: "#e8eaf0",
    padding: "8px 10px",
    font: "13px system-ui",
    boxSizing: "border-box",
  };
  const menuItem: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    color: "#e8eaf0",
    border: "none",
    borderRadius: 8,
    padding: "12px 12px",
    minHeight: 44,
    cursor: "pointer",
    font: "13px/1.3 system-ui",
  };
  const btn = (bg: string): React.CSSProperties => ({
    background: bg,
    color: bg === accent ? "#fff" : "#cfd6e6",
    border: bg === accent ? "none" : "1px solid #2a3142",
    borderRadius: 7,
    padding: "8px 12px",
    cursor: "pointer",
    font: "12px/1 system-ui",
    fontWeight: 600,
  });

  return (
    <div data-fbw="root">
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
            background: "#0b0f1a",
            color: "#e8eaf0",
            border: "1px solid #2a3142",
            boxShadow: "0 12px 40px rgba(0,0,0,.5)",
            zIndex: 2147483646,
            font: "13px/1.4 system-ui, sans-serif",
          }}
        >
          <button role="menuitem" data-fbw="menu-ask" onClick={() => askAbout(menu.el)} style={menuItem}>
            <span style={{ fontWeight: 600 }}>Ask JARVIS about this</span>
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
            <span style={{ display: "block", fontSize: 11, color: "#8b93a7", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {describe(menu.el)}
            </span>
          </button>
          <button role="menuitem" data-fbw="menu-general" onClick={feedbackGeneral} style={menuItem}>
            General feedback
          </button>
          {!menu.touch && (
            <div style={{ fontSize: 10.5, color: "#6b7388", padding: "4px 10px 2px" }}>
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
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0b0f1a",
            color: "#e8eaf0",
            border: "1px solid #2a3142",
            borderRadius: 999,
            padding: "9px 16px",
            zIndex: 2147483646,
            font: "12px system-ui",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          Tap or click the element you’re reporting · <b>Esc</b> to cancel ·{" "}
          <button onClick={skipTarget} style={{ ...btn("#141a28"), padding: "3px 8px", marginLeft: 6 }}>
            skip — comment only
          </button>
        </div>
      )}

      {(phase === "composing" || phase === "sending" || phase === "error") && (
        <div data-fbw="panel" style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>Send feedback</strong>
            <button onClick={reset} style={{ ...btn("#141a28"), padding: "2px 8px" }}>
              ✕
            </button>
          </div>

          {target ? (
            <div
              style={{
                fontSize: 11,
                color: "#8b93a7",
                marginBottom: 10,
                padding: "6px 8px",
                background: "#141a28",
                borderRadius: 6,
                wordBreak: "break-all",
              }}
            >
              🎯 <code>{target.snapshot.tag}</code>{" "}
              {target.snapshot.text ? `“${target.snapshot.text.slice(0, 40)}”` : ""}
              <div style={{ opacity: 0.7, marginTop: 2 }}>{target.selector}</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#8b93a7", marginBottom: 10 }}>
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
            placeholder="What’s wrong / what would you change?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            style={{ ...input, resize: "vertical", marginBottom: 10 }}
          />

          {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{err}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={beginSelect} style={btn("#141a28")}>
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
            background: "#0b1f14",
            color: "#7ee2a8",
            border: "1px solid #1f5236",
            borderRadius: 10,
            padding: "12px 16px",
            zIndex: 2147483646,
            font: "13px system-ui",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          ✓ Feedback sent — thank you
        </div>
      )}
    </div>
  );
}
