"use client";

/**
 * FeedbackWidget — React wrapper over lib/feedback/core (the extractable core).
 *
 * Renders a floating button; on activate the user points at any element, the
 * core captures a stable selector + rect + SVG screenshot + full environment
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
  captureEnv,
  submitFeedback,
  type CapturedTarget,
  type SelectController,
} from "@/lib/feedback/core";

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

  useEffect(() => () => ctrl.current?.stop(), []);

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
    bottom: 76,
    right: 20,
    width: 320,
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
      {/* Floating launcher */}
      {phase === "idle" && (
        <button
          data-fbw="fab"
          onClick={beginSelect}
          title="Send feedback"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: accent,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(37,99,235,.45)",
            zIndex: 2147483646,
            fontSize: 19,
          }}
        >
          ✦
        </button>
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
          Click the element you’re reporting · <b>Esc</b> to cancel ·{" "}
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
            bottom: 20,
            right: 20,
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
