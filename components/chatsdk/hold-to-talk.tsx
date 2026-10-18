"use client";

import { useEffect, useRef, useState } from "react";

type Rec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** Hold to dictate, release to put the words in the box (never auto-sends). Hidden where speech recognition is missing. */
export function HoldToTalk({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [live, setLive] = useState(false);
  const rec = useRef<Rec | null>(null);
  const heard = useRef("");

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => rec.current?.abort();
  }, []);

  if (!supported) return null;

  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor || live) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";
    heard.current = "";
    r.onresult = (e) => {
      heard.current = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ");
    };
    r.onend = () => {
      setLive(false);
      if (heard.current.trim()) onText(heard.current.trim());
    };
    r.onerror = () => setLive(false);
    rec.current = r;
    navigator.vibrate?.(10);
    setLive(true);
    r.start();
  };
  const stop = () => rec.current?.stop();

  return (
    <button
      type="button"
      data-ui="chat.mic"
      aria-label="Hold to talk"
      aria-pressed={live}
      disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); start(); }}
      onPointerUp={stop}
      onPointerLeave={() => live && stop()}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      title="Hold to talk"
      style={{
        width: 36, height: 36, borderRadius: 999, border: "1px solid var(--j-ring)", cursor: "pointer",
        background: live ? "var(--j-accent)" : "transparent", color: live ? "oklch(0.15 0 0)" : "oklch(0.78 0 0)",
        fontSize: 16, touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {live ? "●" : "🎙"}
    </button>
  );
}
