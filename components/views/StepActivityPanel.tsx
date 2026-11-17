"use client"

/**
 * Comments + Activity tabs for the task detail panel, plus the time-tracking
 * widget. Backed by:
 *   GET/POST /api/projects/[id]/steps/[stepId]/comments
 *   GET      /api/projects/[id]/steps/[stepId]/activity
 *   GET/POST /api/projects/[id]/steps/[stepId]/time
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Bot, Loader2, MessageSquare, History, Play, Square } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

interface Comment {
  id: string
  parent_comment_id: string | null
  body: string
  user_id: string
  user_name: string | null
  author_label: string | null
  created_at: string
}

/** A message on the two-way channel about this card (work_messages; planner card f56c9ba0). */
interface ChannelMessage {
  id: string
  agent: string
  from_side: "session" | "platform" | "owner"
  kind: string
  body: string
  status: string
  created_at: string
}

/** Each kind of channel message in the words the owner reads. */
const CHANNEL_WORDS: Record<string, string> = {
  finished: "Said it is finished",
  accepted: "Accepted",
  sent_back: "Sent back",
  request: "Asked for",
  result: "Answered",
  assign: "Handed the next card",
  question: "Question for you",
}

interface ActivityEvent {
  id: string
  event_type: string
  description: string | null
  created_at: string
  user_name: string | null
}

export function StepActivityPanel({ projectId, stepId }: { projectId: string; stepId: string }) {
  const [tab, setTab] = useState<"comments" | "activity" | "agents">("comments")
  const [channel, setChannel] = useState<ChannelMessage[] | null>(null)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [draft, setDraft] = useState("")
  const [posting, setPosting] = useState(false)
  const base = `/api/projects/${projectId}/steps/${stepId}`

  const loadComments = useCallback(() => {
    fetch(`${base}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(Array.isArray(d.comments) ? d.comments : []))
      .catch(() => setComments([]))
  }, [base])

  useEffect(() => {
    setComments(null)
    setEvents(null)
    setChannel(null)
    loadComments()
  }, [loadComments])

  useEffect(() => {
    if (tab === "activity" && events === null) {
      fetch(`${base}/activity`)
        .then((r) => r.json())
        .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
        .catch(() => setEvents([]))
    }
  }, [tab, events, base])

  // What agents said about this card on the channel: loaded once, so the tab can say how many there are.
  useEffect(() => {
    if (channel !== null) return
    fetch(`${base}/channel`)
      .then((r) => r.json())
      .then((d) => setChannel(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => setChannel([]))
  }, [channel, base])

  const postComment = async () => {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const res = await fetch(`${base}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDraft("")
      loadComments()
    } catch {
      toast.error("Failed to post comment")
    } finally {
      setPosting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border mb-3">
        <button
          onClick={() => setTab("comments")}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b-2 -mb-px transition-colors ${
            tab === "comments" ? "border-blue-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}
        </button>
        <button
          onClick={() => setTab("activity")}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b-2 -mb-px transition-colors ${
            tab === "activity" ? "border-blue-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Activity
        </button>
        <button
          onClick={() => setTab("agents")}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b-2 -mb-px transition-colors ${
            tab === "agents" ? "border-blue-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          Agents{channel && channel.length > 0 ? ` (${channel.length})` : ""}
        </button>
      </div>

      {tab === "comments" ? (
        <div className="space-y-3">
          {comments === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-accent/40 px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold">
                    {c.author_label || c.user_name || "Unknown"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            ))
          )}
          {/* Owner, 2026-11-16: no Mac key symbols (he is not on a Mac), no send icon, no drag corner. */}
          <div className="space-y-2">
            <Textarea
              value={draft}
              rows={2}
              aria-label="Write a comment"
              placeholder="Write a comment"
              className="text-sm min-h-[64px] max-h-[40vh] resize-none"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment()
              }}
            />
            <div className="flex items-center justify-end gap-3">
              <span className="text-[12px] text-muted-foreground">Ctrl+Enter also sends</span>
              <Button className="h-9 px-4" onClick={postComment} disabled={posting || !draft.trim()}>
                {posting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {posting ? "Sending" : "Comment"}
              </Button>
            </div>
          </div>
        </div>
      ) : tab === "agents" ? (
        <div className="space-y-2">
          {channel === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : channel.length === 0 ? (
            <p className="text-xs text-muted-foreground">No agent has said anything about this card on the channel yet.</p>
          ) : (
            channel.map((m) => (
              <div key={m.id} className="rounded-lg bg-accent/40 px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-semibold">{CHANNEL_WORDS[m.kind] ?? m.kind}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {m.from_side === "platform" ? "the planner, to " : ""}{m.agent} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    {m.kind === "request" ? (m.status === "open" ? " · still owed" : " · answered") : ""}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {events === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity recorded.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-xs py-1">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-foreground/90">{e.description || e.event_type}</span>
                  <span className="text-muted-foreground ml-2">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    {e.user_name ? ` · ${e.user_name}` : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function StepTimer({ projectId, stepId }: { projectId: string; stepId: string }) {
  const [running, setRunning] = useState<{ id: string; step_id: string; started_at: string } | null>(null)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const base = `/api/projects/${projectId}/steps/${stepId}/time`

  const refresh = useCallback(() => {
    fetch(base)
      .then((r) => r.json())
      .then((d) => {
        setRunning(d.running && d.running.step_id === stepId ? d.running : null)
        setTotalSeconds(d.totalSeconds ?? 0)
      })
      .catch(() => {})
  }, [base, stepId])

  useEffect(() => refresh(), [refresh])

  useEffect(() => {
    if (tick.current) clearInterval(tick.current)
    if (running) {
      const started = new Date(running.started_at).getTime()
      const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)))
      update()
      tick.current = setInterval(update, 1000)
    } else {
      setElapsed(0)
    }
    return () => {
      if (tick.current) clearInterval(tick.current)
    }
  }, [running])

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: running ? "stop" : "start" }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      refresh()
    } catch {
      toast.error("Timer update failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">Tracked</span>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs tabular-nums ${running ? "text-green-500 font-semibold" : ""}`}>
          {running ? fmtDuration(elapsed) : fmtDuration(totalSeconds)}
        </span>
        <Button
          size="icon"
          variant={running ? "destructive" : "outline"}
          className="h-6 w-6"
          onClick={toggle}
          disabled={busy}
          title={running ? "Stop timer" : "Start timer"}
        >
          {running ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  )
}
