"use client";

/**
 * Feedback inbox — admin triage view. Lists submitted feedback newest/open
 * first, shows the captured element + environment + screenshot, and lets you
 * check off fixes (status). This is the "admin notifications for feedback"
 * surface; planner/agent sync is a later phase.
 */

import { useCallback, useEffect, useState } from "react";
import { Figure } from "@/components/project/opx/shared"
import { toast } from "sonner";
import Link from "next/link";
import { DashboardLayout } from "@/components/navigation";

interface FeedbackItem {
  id: string;
  commitSha?: string | null;
  source: string;
  url: string;
  route: string | null;
  selector: string | null;
  title: string | null;
  comment: string;
  screenshot: string | null;
  env: Record<string, any>;
  status: string;
  priority: string;
  reporterName: string | null;
  reporterEmail: string | null;
  createdAt: string;
  annotations: any[];
  kind?: string | null;
  picked?: string | null;
  stepId?: string | null;
  projectId?: string | null;
}

const STATUSES = ["open", "in_progress", "fixed", "wont_fix", "duplicate"];
/** A report's name for its controls: its words, then where and when, so two reports with the same words are told apart. */
const nameOf = (it: Pick<FeedbackItem, "title" | "comment" | "route" | "url" | "createdAt">) =>
  `${(it.title || it.comment).slice(0, 60)} (${it.route || it.url || "no page"}, ${new Date(it.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})`;
// Every status has a word a person reads; the key is never printed.
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
};
const label = (s: string) => STATUS_LABEL[s] || s.replace(/_/g, " ");

export default function FeedbackInboxPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [meta, setMeta] = useState<{ openCount?: number; total?: number }>({});
  const [filter, setFilter] = useState<string>("");
  // ?mine=1 (from the inbox): only the reports this person sent.
  const [mine, setMine] = useState<boolean | null>(null);
  // Read once mounted: after an in-app link the address can change after the first render.
  useEffect(() => { setMine(new URLSearchParams(window.location.search).get("mine") === "1"); }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shot, setShot] = useState<string | null>(null);

  const load = useCallback(async (quiet?: boolean) => {
    if (mine === null) return;
    if (!quiet) setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filter) p.set("status", filter);
      if (mine) p.set("mine", "1");
      const qs = p.toString() ? `?${p}` : "";
      const r = await fetch(`/api/feedback${qs}`, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(j?.error?.message || "The feedback could not be loaded");
      setItems(j.data || []);
      setMeta(j.meta || {});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The feedback could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [filter, mine]);

  useEffect(() => {
    load();
  }, [load]);

  // The picture viewer closes with Esc as well as a press.
  useEffect(() => {
    if (!shot) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShot(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shot]);

  const setStatus = async (it: FeedbackItem, status: string) => {
    const was = it.status;
    if (status === was) return;
    setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, status } : i)));
    try {
      const r = await fetch(`/api/feedback/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("not saved");
      toast(`Marked ${label(status).toLowerCase()}`, { action: { label: "Undo", onClick: () => setStatus({ ...it, status }, was) } });
    } catch {
      // Put back what the screen showed before: a status that was not saved must not look saved.
      setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, status: was } : i)));
      toast.error("The status was not saved. Try again.");
    }
    load(true);
  };

  return (
    <DashboardLayout>
      <div className="opx-page" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{mine ? "My reports" : "Feedback"}</h1>
          <span className="opx-muted" style={{ fontSize: 13 }}>
            <Figure value={loading && meta.openCount === undefined ? null : meta.openCount ?? 0} /> open · <Figure value={loading && meta.total === undefined ? null : meta.total ?? items.length} /> total
          </span>
        </div>
        <p className="opx-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Comments made by pointing at a part of a screen, with the device and screen size they were made on. Set each one&apos;s status here.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <select className="opx-input opx-afilter" aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Status: all</option>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select className="opx-input opx-afilter" aria-label="Filter by who sent it" value={mine ? "me" : "anyone"} onChange={(e) => setMine(e.target.value === "me")}>
            <option value="anyone">Sent by: anyone</option>
            <option value="me">Sent by: me</option>
          </select>
          {filter && <button className="opx-btn sm" onClick={() => setFilter("")}>Show everything</button>}
          {filter && !loading && <span className="opx-muted" style={{ fontSize: 13 }}>{items.length} shown</span>}
        </div>

        {error ? (
          <p role="alert">{error}. <button className="opx-btn sm" onClick={() => load()}>Try again</button></p>
        ) : loading ? (
          <p className="opx-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="opx-muted">{filter ? `No feedback is ${label(filter).toLowerCase()}.` : "No feedback yet. Use the feedback button on any page to add some."}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((it) => (
              <div key={it.id} className="opx-sec opx-fbrow">
                {it.screenshot && (
                  <button type="button" className="opx-fbshot" onClick={() => setShot(it.screenshot)} aria-label={`Open the picture for: ${nameOf(it)}`}>
                    <img src={it.screenshot} alt="" />
                  </button>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14, overflowWrap: "anywhere", flex: "1 1 240px" }}>{it.title || it.comment}</strong>
                    <label className="opx-fbstatus">
                      <select className="opx-rowsel" aria-label={`Status of: ${nameOf(it)}`} value={it.status} onChange={(e) => setStatus(it, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                      </select>
                    </label>
                  </div>
                  {it.title && (
                    <p style={{ fontSize: 13, margin: "6px 0", overflowWrap: "anywhere" }}>{it.comment}</p>
                  )}
                  <div className="opx-muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.7, overflowWrap: "anywhere" }}>
                    <span>{it.route || it.url}</span>
                    {it.picked && <>{" · "}<span>{it.picked}</span></>}
                    {it.kind && <>{" · "}<span>{it.kind === "wish" ? "A wish" : "Something wrong"}</span></>}
                    {it.stepId && it.projectId && <>{" · "}<Link className="opx-link opx-fbcard" style={{ textDecoration: "underline" }} aria-label={`Open the card for: ${nameOf(it)}`} href={`/project/${it.projectId}?tab=tasks&step=${it.stepId}`}>Its card</Link></>}
                    <br />
                    {it.env?.deviceType} · {it.env?.viewport?.w}×{it.env?.viewport?.h} @{it.env?.devicePixelRatio}x
                    {it.env?.colorScheme ? ` · ${it.env.colorScheme}` : ""}
                    {it.env?.brand ? ` · brand:${it.env.brand}` : ""}
                    {it.env?.density ? `/${it.env.density}` : ""}
                    {" · "}
                    {new Date(it.createdAt).toLocaleString()}
                    {it.commitSha ? ` · ${String(it.commitSha).slice(0, 7)}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {shot && (
          <div role="dialog" aria-label="Picture" className="opx-fbview" onClick={() => setShot(null)}>
            <button type="button" className="opx-btn" onClick={() => setShot(null)} style={{ position: "absolute", top: 16, right: 16 }}>Close</button>
            <img src={shot} alt="The screen as it was when the comment was made" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
