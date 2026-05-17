"use client";

/**
 * Feedback inbox — admin triage view. Lists submitted feedback newest/open
 * first, shows the captured element + environment + screenshot, and lets you
 * check off fixes (status). This is the "admin notifications for feedback"
 * surface; planner/agent sync is a later phase.
 */

import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/navigation";

interface FeedbackItem {
  id: string;
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
}

const STATUSES = ["open", "in_progress", "fixed", "wont_fix", "duplicate"];
const STATUS_COLOR: Record<string, string> = {
  open: "#f59e0b",
  in_progress: "#3b82f6",
  fixed: "#22c55e",
  wont_fix: "#6b7280",
  duplicate: "#6b7280",
};

export default function FeedbackInboxPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [meta, setMeta] = useState<{ openCount?: number; total?: number }>({});
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [shot, setShot] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    const r = await fetch(`/api/feedback${qs}`, { credentials: "include" });
    const j = await r.json();
    setItems(j?.data || []);
    setMeta(j?.meta || {});
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    load();
  };

  return (
    <DashboardLayout>
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Feedback</h1>
          <span style={{ fontSize: 13, color: "#8b93a7" }}>
            {meta.openCount ?? 0} open · {meta.total ?? items.length} total
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#8b93a7", marginBottom: 16 }}>
          In-app point-and-annotate reports, with captured environment. Check off fixes here.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {["", ...STATUSES].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              style={{
                background: filter === s ? "#2563eb" : "#141a28",
                color: filter === s ? "#fff" : "#cfd6e6",
                border: "1px solid #2a3142",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {s || "all"}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#8b93a7" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#8b93a7" }}>No feedback yet. Use the ✦ button on any page to add some.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  background: "#0e131f",
                  border: "1px solid #222b3d",
                  borderRadius: 10,
                  padding: 14,
                  display: "grid",
                  gridTemplateColumns: it.screenshot ? "120px 1fr" : "1fr",
                  gap: 14,
                }}
              >
                {it.screenshot && (
                  <img
                    src={it.screenshot}
                    alt="capture"
                    onClick={() => setShot(it.screenshot)}
                    style={{
                      width: 120,
                      height: 90,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid #222b3d",
                      cursor: "zoom-in",
                      background: "#fff",
                    }}
                  />
                )}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong style={{ fontSize: 14 }}>{it.title || it.comment.slice(0, 60)}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        color: STATUS_COLOR[it.status],
                        border: `1px solid ${STATUS_COLOR[it.status]}`,
                        borderRadius: 999,
                        padding: "1px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.status}
                    </span>
                  </div>
                  {it.title && (
                    <p style={{ fontSize: 13, color: "#cfd6e6", margin: "6px 0" }}>{it.comment}</p>
                  )}
                  <div style={{ fontSize: 11, color: "#8b93a7", marginTop: 6, lineHeight: 1.7 }}>
                    <span>{it.route || it.url}</span>
                    {it.selector && (
                      <>
                        {" · "}
                        <code style={{ color: "#9db4e8" }}>{it.selector}</code>
                      </>
                    )}
                    <br />
                    {it.env?.deviceType} · {it.env?.viewport?.w}×{it.env?.viewport?.h} @{it.env?.devicePixelRatio}x
                    {it.env?.colorScheme ? ` · ${it.env.colorScheme}` : ""}
                    {it.env?.brand ? ` · brand:${it.env.brand}` : ""}
                    {it.env?.density ? `/${it.env.density}` : ""}
                    {" · "}
                    {new Date(it.createdAt).toLocaleString()}
                    {it.commitSha ? ` · ${String(it.commitSha).slice(0, 7)}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(it.id, s)}
                        disabled={it.status === s}
                        style={{
                          background: it.status === s ? STATUS_COLOR[s] : "#141a28",
                          color: it.status === s ? "#06121f" : "#cfd6e6",
                          border: "1px solid #2a3142",
                          borderRadius: 6,
                          padding: "4px 9px",
                          fontSize: 11,
                          cursor: it.status === s ? "default" : "pointer",
                          fontWeight: it.status === s ? 700 : 400,
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {shot && (
          <div
            onClick={() => setShot(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.8)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 40,
              cursor: "zoom-out",
            }}
          >
            <img src={shot} alt="capture" style={{ maxWidth: "90%", maxHeight: "90%", background: "#fff", borderRadius: 8 }} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
