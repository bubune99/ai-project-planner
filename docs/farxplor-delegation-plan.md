# Farxplor Delegation Cloud — Consult Relay Platform

**Scoped:** 2026-07-03 · **Source of truth for prose.** State (work orders, todos, decisions) lives in the ai-project-planner DB; this doc is the reasoning and design. Joined by pointers.

> Planner project creation is currently blocked by bug F21 (`create_project` → `execution_history.user_id` NOT NULL). Work orders are stubbed here until that's fixed, then composed against the project.

---

## 0. The thesis (why this exists)

The human **demonstrates intent on the live surface**; the agent **compiles the demonstration into a durable artifact.** Two loops, one mechanic:

| Loop | Human demonstrates… | Captured as… | Agent compiles to… |
|---|---|---|---|
| **Design** | what it should look like (edit the running UI) | change-set (per-page, versioned) | source edits (via DOM→source map) |
| **Workflow** | what should happen (do the task once) | interaction trace | a generalized, reusable workflow |

This inverts the normal agent relationship: you don't *describe* the spec, you *perform* it on the actual thing. The relay is the demonstration-capture medium.

**Local-first is the product.** The terminal agent owns the source; the relay points at the user's own dev server; edits compile to source and HMR reloads — no cloud required. The hosted platform is optional convenience (cross-device presence, sharing, agent fleets, marketplace), never a gate.

---

## 1. Current-state map (from codebase discovery)

**Two orchestration substrates exist but are unconnected:**

- **`ws-relay`** (`joyride-web-extension/cli/ws-relay.mjs`, branch `consumer-local-agent`) — browser tab/window control; mature ownership/grant/presence handshake (`claim_tab`/`grant_tab`/`list_agents`/`tab_activity`, per-tab FIFO lanes, window-ownership inheritance). Supervised auto-start (scheduled task). **This is the real "route delegation into the relay" substrate.**
- **`agent-communication-mcp`** (`Truth-Seeker/agent-communication-mcp`) — job/agent/message bus (assign→claim→checkpoint→complete, registry/liveness, channels, shared KV). Local only: RAM + localhost TCP (port 47700) + optional file. Has a `src/http-bridge.ts` seedling. **This is the delegation backend, needs auth + tenancy to go networked.**

**`farxplor-web`** (`CascadeProjects/farxplor-web`) — Next.js 16 / WorkOS AuthKit / Neon / Stripe / Vercel AI Gateway. Today it is a **billing + auth + observability shell with NO execution wiring** — "agents" are metrics/session records, not running agents. The only extension bridge is token auth (`fxp_*` in `extension_tokens`, `/api/extension/verify`, `/api/ai/*`).

**Extension** — MV3, side panel ALREADY EXISTS (`src/sidepanel/`, incl. `AgentChat.tsx`). Pill toolbar (`toolbar.ts`, 4160 lines): ask/annotate/prototype/scan/spotlight/tasks. Prototype mode = DOM-only inline-style edits with in-memory undo/redo, **no persistence**. Annotations = `chrome.storage.local` per-domain, self-healing selectors. `operations/store.json` = a named-workflow store (macro-recorder seed). Fiber walker resolves DOM→React component.

**Productization gaps flagged:** no consumer/dev build split (eval ships at `relay-handler.ts:718` + `relay.ts:349` — CWS blocker); mocked `dashboard/connect` token page; drifting DB schema (lazy `CREATE TABLE`); `CORS: *`; hardcoded localhost/domain fallbacks.

---

## 2. The centerpiece: Consult Relay + Change-Set Engine

### 2.1 Consult protocol (on-page answers for terminal agents)

A terminal agent (no GUI) posts a **consult** bound to a page + element; the extension renders it as a spotlight + injected chip; the human's click returns a structured answer to the agent as a tool result.

```
Agent → relay:  consult.propose { session, page_pattern, selector,
                                  kind: approval|choice|preview|confirm,
                                  proposal, preview?: {change_records[]} }
Extension:      spotlight(selector) + inject chip [Approve] [Reject] [Tweak…]
                (preview kind live-applies the change_records for a real before/after)
Human click  →  relay → Agent (tool result): { decision, change_id, edits? }
```

Generalizes to: approvals, option-picking, "look at this" confirms — any blocking question gets answered *at the place it's about*, not in a terminal the human isn't watching.

### 2.2 Change-set engine (the caching model)

Every prototype edit becomes a structured **change record**, not a loose DOM mutation:

```
ChangeRecord {
  id, session_id, page_pattern,
  selector + selectorFallbacks[],        // reuse annotation self-healing
  source_loc?,                           // "Button.tsx:42:8" from dev-mode stamping
  change_type: style|text|layout|insert|delete,
  before, after,
  status: draft|proposed|approved|rejected|built,
  author, version, timestamp
}
```

- **Per-session, keyed by page.** Stored in `chrome.storage.local` (mirrored to relay/cloud when connected). Content script **re-applies a page's draft records on load** → walk the whole app sketching, nothing lost between pages. (Answers "can we cache changes to go back and forth per page in a session?" — yes, this is the mechanism.)
- **Versioned + toggleable** → instant per-element A/B; iterate back and forth.
- **Graduation:** approved records export as a build spec; the agent applies them to real files (see 2.3); HMR shows result; record → `built` when deployed DOM matches. Sketch → approve → build → verify, closed.

### 2.3 DOM→source round-trip (the hard, valuable part)

The bridge that turns a page builder into "edit ANY coded project":

- **Dev-mode source stamping** — a Vite/Babel/SWC plugin stamps `data-loc="file:line:col"` on elements (the click-to-component technique). Relay reads it → agent gets a precise source target per edit. Framework-agnostic in principle (every framework compiles to DOM; most have dev-mode source info).
- **Already half-built:** the fiber walker resolves DOM→React component today (one framework deep). Extend to a general `resolve_source(selector) → source_loc` relay verb backed by the stamp (framework-agnostic) with fiber-walk fallback (React).
- **Local-first loop:** running dev server ↔ relay (edit + selection) ↔ terminal agent (owns source, compiles change_records → file edits) ↔ HMR reload. No cloud in the loop.

### 2.4 Workflow-by-demonstration

- Record an interaction trace (relay already timestamps commands; `operations/store.json` is the macro seed).
- Agent **generalizes**: names steps, parameterizes varying inputs ("the 3rd row" → "the row for the current customer"), anchors selectors via the annotation layer.
- Output: a durable workflow in the planner library / operations store. LLM generalization is what makes it survive real UIs where literal macro-recording breaks.

---

## 3. Design intent (the surfaces)

Design brief to be written per `design-intent` (8 elements) before UI code. Arrival intents drive navigation, not tables.

**Surfaces & primary arrival intents:**

| Surface | Who arrives, when, wanting… | Notes |
|---|---|---|
| **Extension side panel** (exists) | "I'm on a page and an agent needs me / I'm sketching changes" | The persistent consult home: pending consults, change-set browser (per-page, toggle/approve), agent presence, session log. Reuse `AgentChat.tsx`. |
| **Action toolbar / pill** (exists) | "quick action on this page" | Keep: ask/annotate/prototype/spotlight. Add: "assign this tab/window to agent" (grant_tab). Migrate heavy/persistent state to the side panel. Consumer tier hides dev/relay tools. |
| **Platform web app** (farxplor-web) | "delegate work / review what agents did / manage billing" | Agent roster+presence, delegation console, session timelines (needs execution wiring), change-set review, billing. |

**Redesign tiers** (name before building): pill = *refresh*; side panel consult UX = *rethink*; farxplor-web dashboard = *rethink* (currently static mocks).

---

## 4. Architecture seam (making it a cloud tool)

```
farxplor-web (WorkOS session + Stripe tier + fxp_ tokens)
      │  issues scoped tokens, hosts observability + billing
      ▼
Delegation backend  =  agent-com StateServer/http-bridge, made:
      │  • networked (wss, not localhost TCP)
      │  • authenticated (accept fxp_ / WorkOS)
      │  • multi-tenant (per-user/org isolation)
      ▼
Relay + extension (already token-auth-capable via /api/extension/verify)
      + terminal agents (connect with scoped tokens)
```

The missing seam is literally: farxplor-web (auth/billing) → networked agent-com (jobs/presence) → relay (browser control). Each piece exists; none are connected.

---

## 5. Phasing

**P0 — Local-first design loop (no cloud, ship-first).** The product's soul.
1. Change-set engine: persist prototype edits as ChangeRecords in `chrome.storage.local`; re-apply per page on load; toggle/version. (extension)
2. DOM→source stamping plugin + `resolve_source` relay verb. (build tooling + relay)
3. Terminal-agent compile step: change_records → file edits, HMR verify. (agent skill + a relay `apply_changeset` handoff)
4. Consult protocol v1: `consult.propose` + injected Approve/Reject/Tweak chip + structured return. (relay + extension + MCP tool)

**P1 — Side panel consult console.** Pending consults, change-set browser, presence, session log. Reuse side panel + `AgentChat.tsx`. Pill sheds persistent state to the panel; add grant_tab "assign tab to agent".

**P2 — Workflow-by-demonstration.** Trace recording + LLM generalization → operations store / planner library.

**P3 — Cloud seam.** agent-com → networked+auth+multi-tenant; farxplor-web execution wiring (real agent sessions, not just metrics); wire mocked `dashboard/connect` to real token API; consolidate schema into migrations; lock down CORS + hardcoded fallbacks.

**P4 — CWS consumer build.** Excise eval at `relay-handler.ts:718` + `relay.ts:349`; consumer build variant; store assets. Gates public distribution.

**Cross-cutting:** every validated relay/consult behavior gets the three-layer treatment (relay enforces · skills teach · planner library makes durable), per the pattern established this week.

---

## 6. Decisions — RESOLVED by owner 2026-07-03

1. **Stamping: React-first.** Fiber walk now, `data-loc` generalization in P3. Owner extension of the idea: the fiber walk doesn't just *locate* components — it can *enumerate* them, so the project's own component library becomes an insertable **block palette** ("add a Button here" inserts the app's real `<Button>`, not a generic div). Editing becomes a block editor whose blocks are the codebase's actual components. Added to P0/P1 scope below.
2. **Graduation trust: BOTH models, user-selectable.** Auto-apply mode and human-in-the-loop per-edit mode ship together as a setting; default human-in-the-loop.
3. **Change-set storage: user-decided local vs cloud**, a settings toggle (Claude Code-style). Local = `chrome.storage.local`; cloud = the existing `/api/sync` path generalized beyond annotations.
4. **Positioning: two flavors of one core** (Cowork / Claude Code model). Developer flavor = "edit your own local app visually, agent compiles to source." Consumer flavor = "guide me / annotate / tour any site." Same engine, different default tiers + store listings. The consumer CWS build (P4) IS the consumer flavor's distribution.

**Owner additions:**
- **Block palette (P1):** enumerate the project's components via fiber walk → insertable blocks in prototype mode; insertions become `change_type: insert` records carrying the component name + props.
- **Site crawl for links/routing (P2+):** crawl the running app to map internal links/deep links; surface broken/missing routes as findings the agent can fix in source. Codebase-access-first (legally cleaner + more capable); DOM-only crawl as the fallback for sites the user doesn't own.
- **Annotation visibility (immediate + P1):** today an annotation, once placed, is invisible — the owner can't see what was annotated or what they said. Fix now in the extension (markers on annotated elements + hover reveal + a browse list); full annotation browser lands in the P1 side panel.
