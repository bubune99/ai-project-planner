# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Project Planner is an intelligent, adaptive project management platform designed for AI-assisted web application development. The system maintains persistent project context across development phases, orchestrates multiple AI agents, and learns from each development cycle to improve future implementations.

**Key Concept**: This is a "Central Persistence Agent" that tracks business context, technical decisions, and project state across all development phases, with intelligent routing to different AI tools based on task requirements.

---

## ⚡ AGENT CONTRACT — How to interact with this planner via MCP

**This planner exposes 80 MCP tools at `app/mcp/route.ts`.** When you (an AI agent — Claude Code, v0, GPT, etc.) interact with it, **always start with `planner_agent_guide`**. It returns the workflow contract for the current session.

### The check-in loop (mandatory for work execution)

Every step you work on goes through this loop. Skipping any of these breaks the platform's learning feedback:

```
work_order_claim_step       → returns JIT instructions + next_actions[]
   ↓
work_order_check_in("progress", message)   ← call at each milestone
   ↓ (during work, on each event)
work_order_check_in("blocker", message)    ← returns prior_art[]
work_order_check_in("completion", outcome) ← auto-promotes ready downstream
work_order_check_in("failure", message)    ← MUST follow with record_attempt
   ↓
record_spec_outcome                        ← MANDATORY scoring after every step
record_attempt (on failure)                ← MANDATORY for failure capture
entity_link (when you discover cross-refs) ← enriches the knowledge graph
```

**Every workflow tool returns a `next_actions[]` array.** Read it — it tells you what to call next based on what just happened.

### Common discovery flows

| You want to… | Call |
|---|---|
| Start a session | `planner_agent_guide` then `get_active_project` |
| Find an applicable template | `library_search({ query, types: ["feature_template"] })` |
| See what's been tried before | `find_attempts({ entity_type, search })` |
| See what's connected to X | `find_related({ entity_type, entity_id, hops: 2 })` |
| Render the knowledge graph | `get_knowledge_graph` (or visit /graph in browser) |
| Inspect any envelope | `get_5wh({ entity_type, entity_id })` |
| Audit envelope coverage | `audit_5wh({ scope: "summary" })` |

### What "go back" looks like in practice

When you finish an operation, the response tells you the next step. For example:

- After `compose_work_order`: response.next_actions tells you which step IDs are 'ready' to claim
- After `work_order_check_in("completion")`: response.next_actions tells you to score the outcome AND call `record_spec_outcome`
- After `work_order_check_in("blocker")`: response.prior_art[] shows what other agents tried; response.next_actions tells you how to either release or fail

### The 5W+H envelope

Every entity (idea, todo, work_order_step, prompt, skill, etc.) has a `documentation_5wh` JSONB column with mandatory starred fields:

- `who.user_id` (auto-derived from your API key)
- `what.title`, `what.type`, `what.summary` (you supply title; type auto-derived; summary defaults to title)
- `when.created_at` (auto from now())
- `where.project_id` (auto from active project; optional for user-scoped entities like ideas/todos)
- `why.rationale` (**YOU MUST PROVIDE** on creates — legacy mode auto-stamps "Auto-derived: created via X API endpoint" but explicit rationale is the contract)

The tools derive the envelope themselves and **do not take `documentation_5wh` as a field**. Give the why in `rationale` where a tool has it (create_task does), otherwise in the description. Verified 2026-11-19: none of the 24 create tools accepted it, so every envelope sent that way was silently dropped; the MCP endpoint now refuses any field a tool does not take, naming the fields it does.

### Prod alias

Planner lives at **`v0-ai-project-planner-eight.vercel.app`** (NOT faridea.dev — see memory `planner-prod-url-correction`).

## Development Commands

\`\`\`bash
# Install dependencies (using pnpm)
pnpm install

# Development server
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint the codebase
pnpm lint
\`\`\`

## Verification — do NOT start a dev server

This repo lives on `/mnt/c`, reached through WSL's DrvFs bridge at **21.89 ms per
`stat`** (0.0008 ms on ext4). `next build` exceeded 560 s without finishing and a
whole-project `tsc --noEmit` takes 6+ minutes. `next dev` is therefore the most
expensive verification path available, and `localhost` has no Hexclave session to
sign in with.

Use, in order:

1. **The static suite** — `mcp__internal-code__*`, `mcp__ui-validation__*`,
   `mcp__truth-seeker__*`. Seconds. See `~/.claude/rules/common/validation-suite.md`
   for its **known defects** — it duplicate-reports 3×, mis-anchors line numbers,
   and `validate_function_behavior` is broken by this repo's pinned tsx 4.21.0.
2. **Execute the logic.** `lib/scheduling.ts` is the pattern: pure functions, no
   React, dependencies injected, 23 assertions that run in seconds.
   `components/views/kanban/adapt.ts` + `adapt.assert.ts` is the second. If a
   rule can't be executed without rendering, extract it.

   Run assertion harnesses with **`npx -y tsx@4.23.15`**, never the pinned
   `tsx` — 4.21.0 fails with a bogus "does not provide an export named X" for
   exports that are plainly there, and the error blames your code.
3. **The `staging` branch** — pushing it is **not enough**. Verified 2026-10-03:
   a push to `staging` produced no deployment at all, and the
   `…-git-staging-…` alias had been sitting on a hand-deployed build made
   *before* the commit under test — so the preview showed stale code while
   looking perfectly live. Deploy explicitly and move the alias:

   ```
   vercel deploy --scope team_03avQDMAwaw3MDbkDtyo6faG --yes
   vercel alias set <new-deployment-url> \
     v0-ai-project-planner-git-staging-far-grace.vercel.app \
     --scope team_03avQDMAwaw3MDbkDtyo6faG
   ```

   Then assert a DOM marker on the alias with `mcp__field-trip__browser`. A
   fresh `*-far-grace.vercel.app` preview URL has **no Hexclave session** —
   sessions are domain-scoped, so only the stable alias is signed in.
   `.github/workflows/security.yml` runs on `[main, staging]` independently of
   this.
4. **Production** (`v0-ai-project-planner-eight.vercel.app`) — only to confirm a
   shipped change.

A clean suite licenses you to proceed; it never proves the feature works. A Gantt
chart that fabricated dates for 414 of 477 rows passed every static check here.

**After applying a migration to staging, before production**, run the trigger smoke test: it fires every
table's triggers once (insert, update, delete) inside savepoints that are always rolled back, and fails on a
broken trigger (the `NEW.step_id` bug reached production because nothing did this):

```
SMOKE_DATABASE_URL=<staging branch connection string> npx -y tsx@4.23.15 scripts/db/trigger-smoke.ts
```

It reads only `SMOKE_DATABASE_URL`, never `.env`. The same SQL is in `scripts/db/trigger-smoke.sql` for a console.
Before writing to a table, read its triggers: `documents` saves the old file as a new version whenever
`blob_url` changes.

**Vercel/Neon MCP caveat:** both MCP tokens are scoped to a different team than
the one serving this project (`team_03avQDMAwaw3MDbkDtyo6faG`,
`prj_09LYJD7w176maoMmL1AFgaJkR5Eh`). `list_projects` returns nothing for it. Use
the Vercel CLI, and for the database use `scripts/migrate.ts`, which loads its own
env — never source `.env`.

## Checks, people and flows, process maps

The planner is the source of truth for what a screen must have and whether it
has been proved. How to work under it is in `~/.claude/rules/common/gates.md`;
this is where each part lives here. All of it is on main and in production
(migrations 063 to 068).

| Part | Rules (pure, with a check file) | Storage and routes | Screen |
|---|---|---|---|
| Page checklists, verdicts, screenshots | `lib/gates/gate-model.ts` | `lib/gates/store.ts`, `/api/projects/[id]/gates` | project tab "Checks" (`components/project/opx/ChecksTab.tsx`) |
| The plan and intent questions | `lib/gates/gate-model.ts` | `lib/gates/plan-store.ts`, `/api/projects/[id]/gates/plan` | in the Checks tab |
| Stack entries and statements | `lib/gates/guides.ts`, `default-guides.ts` | `lib/gates/guide-store.ts`, `/api/gates/guides` | in the Checks tab |
| People, personas, use cases, page comparison | `lib/people/people-model.ts` | `lib/people/store.ts`, `/api/projects/[id]/people` | project tab "People and flows" |
| Walks (an agent uses the product toward a goal; findings and the six scores) | `lib/walks/walk-model.ts` | `lib/walks/store.ts`, `/api/projects/[id]/gates/walks` | under each use case in "People and flows" |
| Changes shown before and after, with the owner's judgment | `lib/gates/change-model.ts` | `lib/gates/change-store.ts`, `/api/projects/[id]/gates/changes` | project tab "Changes" (`components/project/opx/ChangesTab.tsx`) |
| Process maps (a Library document type) | `lib/sops/process-map.ts` | the document's own text, `/api/sops` | `/sops`, drawn by `components/project/opx/ProcessMap.tsx` |
| Agent tools | `lib/mcp/gate-tools.ts` (classify every new tool in `lib/agents/risk.ts`) | | |

Rules that have each cost something:

- **`lib/flows/` is a different feature**: flow-first planning (screen-to-screen flows kept in documents as a fenced `flow` block, with frames, verification runs and the `flow_*` tools). People and flows lives in `lib/people/`. Do not write one over the other; use cases are not yet joined to those flows.
- **A process map is a fenced `process-map` JSON block in a document's text**, read and written only through `parseMapBlock` / `writeMapBlock`. Every edit is a pure function returning a new map; add a new kind of edit there, with a check, before wiring a button to it.
- **A step's state is read, never typed.** A use-case step points at a control by view, kind and label; `stepState` reads the Checks record.
- **Saves say who made them.** A browser session is the owner. An agent saving through the owner's signed-in tab sends `agent: true`, or its change is recorded as the owner's.
- **One right-click menu at a time.** The feedback menu (`components/feedback/FeedbackWidget.tsx`) stays out of the way when a page has handled the right-click itself.
- **Whole-document saves carry the version they started from** and are refused if it changed underneath (People and flows).

## One board — the owner sees everything agents do

Owner, 2026-11-16: "It feels like you and the agents have a separate task list that you abide by than the one that I
see in the UI and that is wrong." Since migration 071 (main d7019fe) the project board is the one list.

- **`project_steps` is the board.** Columns are its `status`: `requested` (Requests: nobody works on it yet), `pending`
  (Up next: in line for an agent now), `in-progress` (only while an agent holds it: `claimed_by_id`), `blocked`,
  `completed`. `work_kind` says what a card is: `task`, `initiative` (a campaign, phase or sprint holding tasks) or
  `upkeep` (an agent's maintenance). Rules: `lib/work/pipeline.ts`.
- **New cards wait in Requests** (`create_task` default). Up next only when the owner asked for it now.
- **The owner's moves send work**: a card he moves into Up next or In progress becomes an `agent_jobs` row
  (`input.kind = "work"`, `input.stepId`) that the far-gates hook hands to the project's session (`lib/work/send.ts`).
- **Take a card** with `update_task {status: "in-progress", claimedBy}` (or `gates queue start <id>`); finish with
  proof or put it back with a note. Never leave one in progress when you stop.
- **Features are proposed** with `propose_feature` (goal, what, deliverable, proof, why) into Requests; nothing is built
  before the owner approves it.
- **`todos` is the owner's own list**: only actions only he can do. Migrations 056–058 copied 432 to-dos into steps
  (`project_steps.source_todo_id`, `todos.step_id`); those copies are being taken off his list (card 5e494913).
- The `feature_requests` table (0 rows) is an older attempt and is not used by the board.

Note the Decisions tab reads `architecture_decisions` (ADRs, 8 rows) while
`create_decision` writes `mlp_why_decisions` (80 rows) — they are different
tables, which is why that tab looks unused.

## Architecture

Next.js 15 (App Router) and React 19 on Vercel, TypeScript strict, Postgres on
Neon through `lib/db/client.ts` (raw SQL, no ORM), Hexclave (Stack) auth,
Cloudflare R2 for files, pnpm.

```
app/<page>/page.tsx      one screen each; thin: layout, state, which view
app/api/**/route.ts      every read and write; auth first, envelope out
app/mcp/route.ts         the MCP server (tools in lib/mcp/)
app/globals.css          base + older j-* classes
app/opx-skin.css         the design system: --opx-* tokens, opx-* classes

components/project/opx/  the project page: shared.tsx + one file per tab
components/work/         List and Calendar across all projects
components/views/kanban/ the board (forked KanbanBoard + adapt.ts)
components/navigation/   shell: menu, top bar (DashboardLayout)
components/chat/         the chat: useAssistantChat (stream) + display-only panel
components/ade/          the assistant panel beside a page (uses components/chat)
lib/chat/                chat rules: view model, request body, history groups
lib/project-views/       pure rules for the views, with asserts
lib/<domain>/            everything else, by domain (agents, auth, mcp, ...)
```

## The pattern: how a screen is built

Follow this for every new screen and when touching an old one. The project
page (`app/project/[id]/page.tsx` + `components/project/opx/`) is the
reference.

1. **Rules are pure.** Anything that decides something (what is overdue, what
   a date range is, how items group) goes in `lib/<domain>/*.ts`: no React, no
   DOM, no clock (`today` is passed in). A sibling `*.assert.ts` runs it:
   `npx -y tsx@4.23.15 path/to/file.assert.ts`. If a rule can't run without
   rendering, extract it.
2. **Data comes from an API route**, read with `useJson(url)` from
   `components/project/opx/shared.tsx`. Routes check auth first and answer
   with `successResponse` / `errorResponse` (`lib/api-utils.ts`). Writes go
   through the route that already owns the side effects (step PATCH, todo
   PATCH); never add a second write path for the same thing.
3. **One core, thin wrappers.** A view takes its data and its writes as props
   (`PlanCalendar`), and a wrapper per place supplies them (`TaskCalendar` for
   a project, `WorkCalendar` for all projects). Do not copy a view to reuse it.
4. **Use the shared pieces**: `Section`, `Seg`, `Priority`, `Md`, `Loading`,
   `Failed`, `fmtDate`, `ago`, `askAssistant` from `shared.tsx`; `opx-*`
   classes and `--opx-*` tokens from `opx-skin.css`. No inline hex colors, no
   `oklch(...)` literals, no new `j-*` classes.
5. **Every state is real**: loading, failed (with retry), empty, and the data.
   Never show a number that was not loaded; show "–".
6. **Small files.** A tab or view per file, 200-400 lines; split past 800.

Design rules (owner): Inter everywhere and no monospace; no emoji as icons
(lucide icons or text); no colored side-stripes; dark by default with light
kept working; US English; never invent dates or numbers.

## The chat

`components/chat/useAssistantChat.ts` is the only code that talks to
`/api/chat`. It returns a plain model; `ChatPanel`, `Composer`, `MessageView`
and `HistoryList` draw it and never fetch or stream. The panel beside a page
(`components/ade/AssistantDock.tsx`) and the full page (`/chat`) are the same
pieces. Model output is untrusted: render it only through `MessageView`,
which uses `lib/chat/safe-markdown.ts`. There is no chat template library in
this repo any more; do not add one.

## Keeping it clean

- Delete what a change replaces, in the same change. Nothing imports it:
  it goes.
- Before adding a package, check it is not already here; when the last import
  of one goes, remove it from `package.json`.
- Kept on purpose although nothing imports them yet: `components/ideas-canvas`
  (idea-incubator and flow mapping) and `lib/push/send.ts` (the service
  worker in `public/sw.js` is live; sending is not wired).
- `/impact` is hidden from the menu until the catalog scanner has run.
- `apps/idea-incubator` is a git submodule with its own `@/` alias; exclude
  it from any typecheck of this app.

## Build configuration

`next.config.mjs` ignores ESLint and TypeScript errors during builds, so a
green build does not mean the types are clean. Typecheck what you touched
with a scoped tsconfig (see Verification above).
